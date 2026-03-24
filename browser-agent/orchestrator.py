"""
Frootful Orchestrator — Cloud Run HTTP server

Exposes two webhook endpoints for the La Gaitana order processing pipeline:
  POST /extract  — PO PDF → extraction agent → structured .md stored in proposal metadata
  POST /enter    — .md from proposal → entry agent → order created in WebFlor ERP

Both endpoints return immediately and process in background tasks.
Status updates are written to Supabase (proposal tags + ai_analysis_logs + order_events).

Usage (local):
    cd browser-agent
    uv run uvicorn orchestrator:app --host 0.0.0.0 --port 8080
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
logger = logging.getLogger("orchestrator")

# ─── Config ───────────────────────────────────────────────────────────────

_env = os.getenv("APP_ENV", "staging")
if _env == "production":
    SUPABASE_URL = "https://zkglvdfppodwlgzhfgqs.supabase.co"
    SUPABASE_SECRET_KEY = os.getenv("SUPABASE_PROD_SECRET_KEY", "")
else:
    SUPABASE_URL = "https://laxhubapvubwwoafrewk.supabase.co"
    SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
ORGANIZATION_ID = os.getenv("ORGANIZATION_ID", "81cf0716-45ee-4fe8-895f-d9af962f5fab")
STORAGE_BUCKET = "intake-files"

# Paths relative to this file
AGENT_DIR = Path(__file__).parent.resolve()
LOGIN_SCRIPT = AGENT_DIR / "login.py"
EXTRACTION_SCRIPT = AGENT_DIR / "order_extraction_agent_v2.py"
ENTRY_SCRIPT = AGENT_DIR / "deterministic_enter_agent.py"
INSTRUCTIONS_DIR = AGENT_DIR / "orders" / "instructions"

# ─── Supabase Client ─────────────────────────────────────────────────────

from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# ─── FastAPI App ──────────────────────────────────────────────────────────

app = FastAPI(title="Frootful Orchestrator", version="0.1.0")

# ─── Session Cache ────────────────────────────────────────────────────────

import threading

LOGIN_REFRESH_INTERVAL = 600  # 10 minutes
_last_login_at: float = 0.0  # timestamp of last successful login
_login_lock = threading.Lock()


class ExtractRequest(BaseModel):
    intake_event_id: str
    user_id: str = ""


class EnterRequest(BaseModel):
    proposal_id: str
    order_id: str = ""
    user_id: str = ""


# ─── Health ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    age = time.time() - _last_login_at if _last_login_at else None
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_age_seconds": int(age) if age else None,
        "session_fresh": age is not None and age < LOGIN_REFRESH_INTERVAL,
    }


# ─── Login Endpoint (for Cloud Scheduler) ────────────────────────────────

@app.post("/login")
async def login_endpoint(background_tasks: BackgroundTasks):
    """Refresh WebFlor session. Called by Cloud Scheduler every 10 min."""
    background_tasks.add_task(_run_login_cached, force=True)
    return {"status": "queued", "message": "Login refresh queued"}


# ─── Extract Endpoint ────────────────────────────────────────────────────

@app.post("/extract")
async def extract(req: ExtractRequest, background_tasks: BackgroundTasks):
    logger.info(f"POST /extract: intake_event_id={req.intake_event_id}")
    background_tasks.add_task(_run_extraction, req.intake_event_id, req.user_id)
    return {"status": "queued", "intake_event_id": req.intake_event_id}


# ─── Enter Endpoint ──────────────────────────────────────────────────────

@app.post("/enter")
async def enter(req: EnterRequest, background_tasks: BackgroundTasks):
    logger.info(f"POST /enter: proposal_id={req.proposal_id}")

    # Mark as in_progress immediately
    _update_proposal_tags(req.proposal_id, {
        "erp_sync_status": "in_progress",
        "erp_started_at": _now_iso(),
    })

    background_tasks.add_task(_run_entry, req.proposal_id, req.user_id, req.order_id)
    return {"status": "queued", "proposal_id": req.proposal_id}


# ─── Background Tasks ────────────────────────────────────────────────────

async def _run_extraction(intake_event_id: str, user_id: str = ""):
    """Background: download PO PDF → run extraction agent → store .md in proposal metadata."""
    start_time = time.time()
    intake_dir = None
    logger.info(f"[extract] Starting for intake_event_id={intake_event_id}")

    try:
        # 1. Fetch intake event
        event = supabase.table("intake_events").select("*").eq(
            "id", intake_event_id
        ).single().execute()
        if not event.data:
            raise ValueError(f"Intake event {intake_event_id} not found")

        org_id = event.data.get("organization_id", "")

        # 2. Fetch associated files (PDFs)
        files = supabase.table("intake_files").select("*").eq(
            "intake_event_id", intake_event_id
        ).execute()
        if not files.data:
            raise ValueError(f"No files found for intake event {intake_event_id}")

        # 3. Download ALL files into a dedicated folder
        supported_exts = {"pdf", "jpg", "jpeg", "png", "gif", "webp"}
        intake_dir = AGENT_DIR / "tmp" / intake_event_id
        intake_dir.mkdir(parents=True, exist_ok=True)
        downloaded_files: list[str] = []
        for f in files.data:
            ext = (f.get("extension", "") or "").lower().lstrip(".")
            if ext not in supported_exts:
                logger.info(f"[extract] Skipping unsupported file: {f.get('filename')} ({ext})")
                continue
            storage_path = f["storage_path"]
            filename = f.get("filename", f["id"])
            logger.info(f"[extract] Downloading: {filename} ({storage_path})")
            file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
            file_path = intake_dir / filename
            file_path.write_bytes(file_bytes)
            downloaded_files.append(filename)
            logger.info(f"[extract] Saved to: {file_path}")
        if not downloaded_files:
            raise ValueError(f"No supported files (PDF/image) found for intake event {intake_event_id}")
        logger.info(f"[extract] Downloaded {len(downloaded_files)} file(s) to {intake_dir}")

        # 4. Create proposal early so we can write status updates to it
        existing = supabase.table("order_change_proposals").select("id, metadata, tags").eq(
            "intake_event_id", intake_event_id
        ).limit(1).execute()

        if existing.data:
            proposal_id = existing.data[0]["id"]
        else:
            new_proposal = supabase.table("order_change_proposals").insert({
                "organization_id": org_id,
                "order_id": None,
                "intake_event_id": intake_event_id,
                "status": "pending",
                "type": "new_order",
                "tags": {"source": "orchestrator", "agent_version": "v2", "erp": "webflor",
                         "extraction_status": "starting"},
                "metadata": {},
            }).execute()
            proposal_id = new_proposal.data[0]["id"]
            logger.info(f"[extract] Created proposal {proposal_id}")

        def _update_status(message: str):
            """Push a status update to the proposal tags."""
            _update_proposal_tags(proposal_id, {
                "extraction_status": message,
                "extraction_updated_at": _now_iso(),
            })

        _update_status("Downloading files...")

        # 5. Login to WebFlor (uses cached session from Supabase if available)
        _ensure_login()
        _update_status("Analyzing order...")

        # 6. Run extraction agent with explicit --output path
        md_tmpfile = tempfile.NamedTemporaryFile(
            suffix=".md", prefix="order_", dir=str(intake_dir),
            delete=False
        )
        md_output_path = md_tmpfile.name
        md_tmpfile.close()
        logger.info(f"[extract] .md output path: {md_output_path}")

        logger.info("[extract] Running extraction agent...")
        agent_env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
        result = _run_agent_streaming(
            [sys.executable, str(EXTRACTION_SCRIPT), "--folder", str(intake_dir), "--output", md_output_path],
            tag="extract", cwd=str(AGENT_DIR), env=agent_env, timeout=600,
            on_status=_update_status,
        )
        elapsed = time.time() - start_time
        logger.info(f"[extract] Agent exited with code {result.returncode} in {elapsed:.1f}s")

        # 7. Read the .md content from the output file
        md_content = None
        if os.path.exists(md_output_path) and os.path.getsize(md_output_path) > 0:
            with open(md_output_path) as f:
                md_content = f.read().strip()
            logger.info(f"[extract] Read .md from {md_output_path} ({len(md_content)} chars)")
            try:
                os.unlink(md_output_path)
            except OSError:
                pass

        if not md_content and result.returncode != 0:
            raise RuntimeError(f"Extraction agent failed (exit {result.returncode})")
        if not md_content:
            raise RuntimeError("Extraction agent completed but no .md output found")

        # 8. Parse key fields from the .md
        parsed_fields = _parse_md_fields(md_content)
        logger.info(f"[extract] Parsed fields: {parsed_fields}")

        proposal_metadata = {
            "webflor_order_md": md_content,
            "original_md": md_content,
            **parsed_fields,
        }

        # 9. Update proposal with .md + parsed fields
        _update_status("Extraction complete")
        existing_proposal = supabase.table("order_change_proposals").select("metadata").eq(
            "id", proposal_id
        ).single().execute()
        old_metadata = (existing_proposal.data or {}).get("metadata") or {}
        old_metadata.update(proposal_metadata)
        supabase.table("order_change_proposals").update({
            "metadata": old_metadata,
        }).eq("id", proposal_id).execute()
        logger.info(f"[extract] Updated proposal {proposal_id} with .md")

        # 9. Log to ai_analysis_logs
        _log_agent_run(
            source_id=intake_event_id,
            user_id=user_id,
            success=True,
            processing_time_ms=int(elapsed * 1000),
            raw_request={"intake_event_id": intake_event_id, "files": downloaded_files, "file_count": len(downloaded_files), "stage": "extraction"},
            parsed_result={"success": True, "md_length": len(md_content)},
        )

        # 10. Clean up temp folder
        import shutil
        try:
            shutil.rmtree(intake_dir)
        except OSError:
            pass

        logger.info(f"[extract] Complete for {intake_event_id} ({elapsed:.1f}s)")

    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[extract] Failed for {intake_event_id}: {e}", exc_info=True)

        # Mark proposal as failed
        error_str = str(e)[:500]
        try:
            existing = supabase.table("order_change_proposals").select("id, tags").eq(
                "intake_event_id", intake_event_id
            ).limit(1).execute()

            if existing.data:
                pid = existing.data[0]["id"]
                old_tags = existing.data[0].get("tags") or {}
                supabase.table("order_change_proposals").update({
                    "status": "failed",
                    "tags": {**old_tags,
                             "extraction_status": f"Failed: {error_str[:100]}",
                             "extraction_error": error_str,
                             "extraction_failed_at": _now_iso()},
                }).eq("id", pid).execute()
                logger.info(f"[extract] Marked proposal {pid} as failed")
            else:
                # Proposal wasn't created yet (early failure) — create a failed one
                event_data = supabase.table("intake_events").select("organization_id").eq(
                    "id", intake_event_id
                ).single().execute()
                oid = event_data.data.get("organization_id", "") if event_data.data else ""
                supabase.table("order_change_proposals").insert({
                    "organization_id": oid,
                    "order_id": None,
                    "intake_event_id": intake_event_id,
                    "status": "failed",
                    "type": "new_order",
                    "tags": {"source": "orchestrator",
                             "extraction_status": f"Failed: {error_str[:100]}",
                             "extraction_error": error_str,
                             "extraction_failed_at": _now_iso()},
                    "metadata": {},
                }).execute()
                logger.info(f"[extract] Created failed proposal for {intake_event_id}")
        except Exception as tag_err:
            logger.error(f"[extract] Failed to update proposal status: {tag_err}")

        _log_agent_run(
            source_id=intake_event_id,
            user_id=user_id,
            success=False,
            processing_time_ms=int(elapsed * 1000),
            raw_request={"intake_event_id": intake_event_id, "stage": "extraction"},
            parsed_result={"success": False, "error": str(e)},
        )

        # Clean up temp files on failure
        try:
            import shutil
            if intake_dir and intake_dir.exists():
                shutil.rmtree(intake_dir)
            if 'md_output_path' in dir() and os.path.exists(md_output_path):
                os.unlink(md_output_path)
        except Exception:
            pass


async def _run_entry(proposal_id: str, user_id: str = "", req_order_id: str = ""):
    """Background: read .md from proposal → run entry agent → create order in WebFlor."""
    start_time = time.time()
    logger.info(f"[enter] Starting for proposal_id={proposal_id}")

    order_id = None  # will be resolved below

    try:
        # 1. Fetch proposal
        proposal = supabase.table("order_change_proposals").select(
            "id, organization_id, metadata, tags, intake_event_id, order_id"
        ).eq("id", proposal_id).single().execute()
        if not proposal.data:
            raise ValueError(f"Proposal {proposal_id} not found")

        org_id = proposal.data.get("organization_id", "")

        metadata = proposal.data.get("metadata") or {}
        md_content = metadata.get("webflor_order_md")
        if not md_content:
            raise ValueError(f"Proposal {proposal_id} has no webflor_order_md in metadata")

        # Resolve order_id: prefer request param, fall back to proposal's order_id
        order_id = req_order_id or proposal.data.get("order_id")

        # 2. Login to WebFlor (uses cached session if fresh)
        _ensure_login()

        # 3. Write .md to temp file
        tmp_dir = AGENT_DIR / "tmp"
        tmp_dir.mkdir(exist_ok=True)
        md_path = tmp_dir / f"proposal_{proposal_id}.md"
        md_path.write_text(md_content)
        logger.info(f"[enter] Wrote .md to {md_path} ({len(md_content)} chars)")

        # 4. Run entry agent (streams output to Cloud Run logs)
        logger.info(f"[enter] Running entry agent...")
        agent_env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
        result = _run_agent_streaming(
            [sys.executable, str(ENTRY_SCRIPT), "--order", str(md_path)],
            tag="enter", cwd=str(AGENT_DIR), env=agent_env, timeout=600,
        )
        elapsed = time.time() - start_time
        logger.info(f"[enter] Agent exited with code {result.returncode} in {elapsed:.1f}s")

        # 5. Parse result for WebFlor order ID/link
        webflor_order_id = _parse_webflor_order_id(result.stdout, result.stderr)

        if result.returncode != 0:
            raise RuntimeError(f"Entry agent failed (exit {result.returncode})")

        # 6. Update proposal tags: completed
        _update_proposal_tags(proposal_id, {
            "erp_sync_status": "completed",
            "erp_completed_at": _now_iso(),
            "webflor_order_id": webflor_order_id,
        })

        # 7. Update order status to pushed_to_erp + store WebFlor ID/link
        if order_id:
            webflor_link = None
            if webflor_order_id:
                webflor_link = (
                    f"http://190.146.143.55:5522/WebFlorExt/TablasBasicas/DetallesOrden"
                    f"?EsDesde=1&EsRepetitiva=0&iIdAccion=1&ManejaInventario=0&iIdPedido={webflor_order_id}"
                )
            _update_order_status(order_id, "pushed_to_erp", metadata_updates={
                "webflor_order_id": webflor_order_id,
                "webflor_order_link": webflor_link,
            })

        # 8. Insert order_event: completed
        if order_id:
            supabase.table("order_events").insert({
                "order_id": order_id,
                "type": "erp_exported",
                "metadata": {
                    "proposal_id": proposal_id,
                    "stage": "completed",
                    "destination": "WebFlor",
                    "webflor_order_id": webflor_order_id,
                },
            }).execute()

        # 9. Log to ai_analysis_logs
        _log_agent_run(
            source_id=proposal_id,
            user_id=user_id,
            success=True,
            processing_time_ms=int(elapsed * 1000),
            raw_request={"proposal_id": proposal_id, "order_id": order_id, "stage": "entry"},
            parsed_result={
                "success": True,
                "webflor_order_id": webflor_order_id,
            },
            raw_response=result.stdout[-5000:] if result.stdout else None,
        )

        # 10. Clean up temp file
        try:
            md_path.unlink()
        except OSError:
            pass

        logger.info(f"[enter] Complete for {proposal_id} — WebFlor order: {webflor_order_id} ({elapsed:.1f}s)")

    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[enter] Failed for {proposal_id}: {e}", exc_info=True)

        # Update proposal tags: failed
        _update_proposal_tags(proposal_id, {
            "erp_sync_status": "failed",
            "erp_completed_at": _now_iso(),
            "erp_error": str(e)[:500],
        })

        # Update order status on failure
        if order_id:
            _update_order_status(order_id, "export_failed")

        # Insert failure order_event
        if order_id:
            supabase.table("order_events").insert({
                "order_id": order_id,
                "type": "erp_exported",
                "metadata": {
                    "proposal_id": proposal_id,
                    "stage": "failed",
                    "destination": "WebFlor",
                    "error": str(e)[:500],
                },
            }).execute()

        # Log failure
        _log_agent_run(
            source_id=proposal_id,
            user_id=user_id,
            success=False,
            processing_time_ms=int(elapsed * 1000),
            raw_request={"proposal_id": proposal_id, "order_id": order_id, "stage": "entry"},
            parsed_result={"success": False, "error": str(e)},
        )


# ─── Helpers ──────────────────────────────────────────────────────────────


def _run_agent_streaming(cmd: list, tag: str, cwd: str, env: dict, timeout: int = 600,
                         on_status=None):
    """Run a subprocess while streaming output line-by-line to the logger.

    Args:
        on_status: Optional callback(message: str) called when a status-worthy line is detected.

    Returns a subprocess.CompletedProcess-like object with stdout/stderr captured.
    """
    import threading
    import re

    # Map tool names to user-friendly status messages
    TOOL_STATUS_MAP = {
        "Read": "Reading files...",
        "Glob": "Scanning folder...",
        "Bash": "Running command...",
        "Write": "Writing order file...",
        "search_clients_csv": "Identifying customer...",
        "search_customer_notes": "Checking customer rules...",
        "get_week": "Looking up delivery week...",
        "list_recent_orders": "Finding reference orders...",
        "get_order_with_items": "Reviewing reference order details...",
        "lookup_item_mappings": "Mapping line items...",
        "lookup_client_product_ficha": "Checking pricing rules...",
    }

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=cwd, env=env,
    )

    def _read_stream(stream, lines: list, level: str):
        for line in stream:
            line = line.rstrip("\n")
            lines.append(line)
            if level == "stderr":
                logger.info(f"[{tag}:stderr] {line}")
                # Detect tool calls and emit status updates
                if on_status:
                    tool_match = re.search(r'Tool call #\d+: (\S+)', line)
                    if tool_match:
                        tool_name = tool_match.group(1)
                        # Strip mcp__erp__ prefix for matching
                        clean_name = re.sub(r'^mcp__erp__', '', tool_name)
                        status_msg = TOOL_STATUS_MAP.get(clean_name) or TOOL_STATUS_MAP.get(tool_name)
                        if status_msg:
                            try:
                                on_status(status_msg)
                            except Exception as e:
                                logger.warning(f"[{tag}] Status callback failed: {e}")
            else:
                logger.info(f"[{tag}] {line}")

    t_out = threading.Thread(target=_read_stream, args=(proc.stdout, stdout_lines, "stdout"))
    t_err = threading.Thread(target=_read_stream, args=(proc.stderr, stderr_lines, "stderr"))
    t_out.start()
    t_err.start()

    proc.wait(timeout=timeout)
    t_out.join()
    t_err.join()

    return subprocess.CompletedProcess(
        args=cmd,
        returncode=proc.returncode,
        stdout="\n".join(stdout_lines),
        stderr="\n".join(stderr_lines),
    )


def _get_webflor_cookies() -> str | None:
    """Read WebFlor cookies from Supabase user_tokens. Returns None if missing or expired."""
    try:
        result = supabase.table("user_tokens").select(
            "encrypted_access_token, token_expires_at, updated_at"
        ).eq("provider", "webflor").eq(
            "organization_id", ORGANIZATION_ID
        ).limit(1).execute()

        if not result.data:
            logger.info("[login] No webflor token found in Supabase")
            return None

        row = result.data[0]
        token = row.get("encrypted_access_token")
        updated_at = row.get("updated_at")

        if not token:
            logger.info("[login] Token row exists but encrypted_access_token is empty")
            return None

        logger.info(f"[login] Token found in Supabase (last updated: {updated_at})")

        # Validate the session is still alive by hitting WebFlor
        if not _validate_webflor_session(token):
            logger.warning("[login] Token found but session is dead on WebFlor server")
            return None

        return token
    except Exception as e:
        logger.warning(f"[login] Failed to read cookies from Supabase: {e}")
    return None


def _validate_webflor_session(cookie_str: str) -> bool:
    """Hit a lightweight WebFlor endpoint to check if the session cookie is still valid.

    WebFlor redirects to a login page (3xx) when the session is expired.
    """
    import httpx

    from urllib.parse import urlparse
    base_url = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")
    parsed = urlparse(base_url)
    host_url = f"{parsed.scheme}://{parsed.netloc}"
    test_url = f"{host_url}/WebFlorBasico/API/listarCompaniasActivasSinLogo"

    try:
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            resp = client.get(test_url, headers={"Cookie": cookie_str, "Accept": "application/json"})

        if 300 <= resp.status_code < 400:
            location = resp.headers.get("location", "")
            logger.info(f"[login] WebFlor returned {resp.status_code} redirect to: {location}")
            return False  # redirected to login = session dead

        if resp.status_code == 200:
            logger.info("[login] WebFlor session is valid (200 OK)")
            return True

        # Other status codes — treat as potentially valid but log it
        logger.info(f"[login] WebFlor returned {resp.status_code} — assuming session is valid")
        return True
    except Exception as e:
        logger.warning(f"[login] Could not reach WebFlor to validate session: {e}")
        # Can't reach WebFlor at all — return the cached token anyway,
        # the agent will fail later with a clearer error
        return True


def _run_login():
    """Run login.py to get fresh WebFlor session cookies."""
    global _last_login_at
    logger.info("[login] Running login.py...")
    result = subprocess.run(
        [sys.executable, str(LOGIN_SCRIPT)],
        capture_output=True, text=True, timeout=120,
        cwd=str(AGENT_DIR),
        env={**os.environ},
    )
    if result.returncode != 0:
        logger.error(f"[login] Failed: {result.stderr or result.stdout}")
        raise RuntimeError(f"WebFlor login failed: {result.stderr or result.stdout}")

    # Pull cookies from Supabase (login.py saves them there)
    cookies = _get_webflor_cookies()
    if cookies:
        os.environ["WEBFLOR_COOKIES"] = cookies
        logger.info("[login] Loaded cookies from Supabase")
    else:
        # Fall back to .env
        load_dotenv(override=True)
        logger.info("[login] Fell back to .env for cookies")

    _last_login_at = time.time()
    logger.info("[login] Session established")


def _run_login_cached(force: bool = False):
    """Run login only if cookie is stale or force=True. Thread-safe."""
    global _last_login_at
    age = time.time() - _last_login_at
    if not force and _last_login_at and age < LOGIN_REFRESH_INTERVAL:
        logger.info(f"[login] Session still fresh ({int(age)}s old), skipping login")
        return
    with _login_lock:
        # Double-check after acquiring lock
        age = time.time() - _last_login_at
        if not force and _last_login_at and age < LOGIN_REFRESH_INTERVAL:
            return
        _run_login()


def _ensure_login():
    """Ensure a valid session exists.

    Checks Supabase for cached cookies first. Falls back to Playwright login
    if no token found or token is expired.
    """
    logger.info("[login] Checking Supabase for cached WebFlor session...")
    cookies = _get_webflor_cookies()
    if cookies:
        os.environ["WEBFLOR_COOKIES"] = cookies
        logger.info("[login] Using cached cookies from Supabase (skipping Playwright)")
        return

    # No valid cookies in Supabase — do a full Playwright login
    logger.info("[login] No valid cached session — falling back to Playwright login")
    _run_login_cached(force=True)


def _update_order_status(order_id: str, status: str, metadata_updates: dict | None = None):
    """Update order status and optionally merge metadata updates."""
    try:
        update_data: dict = {"status": status}
        if metadata_updates:
            existing = supabase.table("orders").select("metadata").eq(
                "id", order_id
            ).single().execute()
            order_metadata = (existing.data or {}).get("metadata") or {}
            order_metadata.update(metadata_updates)
            update_data["metadata"] = order_metadata
        supabase.table("orders").update(update_data).eq("id", order_id).execute()
        logger.info(f"Updated order {order_id} status to '{status}'")
    except Exception as e:
        logger.error(f"Failed to update order status: {e}")


def _update_proposal_tags(proposal_id: str, updates: dict):
    """Merge updates into proposal's tags JSONB field."""
    try:
        existing = supabase.table("order_change_proposals").select("tags").eq(
            "id", proposal_id
        ).single().execute()
        tags = (existing.data or {}).get("tags") or {}
        tags.update(updates)
        supabase.table("order_change_proposals").update({"tags": tags}).eq(
            "id", proposal_id
        ).execute()
    except Exception as e:
        logger.error(f"Failed to update proposal tags: {e}")


def _log_agent_run(
    source_id: str,
    user_id: str,
    success: bool,
    processing_time_ms: int,
    raw_request: dict | None = None,
    parsed_result: dict | None = None,
    raw_response: str | None = None,
):
    """Insert a row into ai_analysis_logs (analysis_type='email' since orders come via email intake)."""
    if not user_id:
        logger.warning("Skipping ai_analysis_logs insert — no user_id available")
        return
    try:
        supabase.table("ai_analysis_logs").insert({
            "user_id": user_id,
            "analysis_type": "email",
            "source_id": source_id,
            "model_used": "claude-agent-sdk",
            "raw_request": raw_request or {},
            "raw_response": raw_response,
            "parsed_result": parsed_result or {},
            "processing_time_ms": processing_time_ms,
            "tokens_used": 0,  # Not easily parsed from subprocess output
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log agent run: {e}")


def _parse_md_fields(md_content: str) -> dict:
    """Extract key fields from the .md order file's Order Details table."""
    import re
    fields = {}
    for line in md_content.splitlines():
        # Match "| Field | Value |" rows
        m = re.match(r'\|\s*(.+?)\s*\|\s*(.+?)\s*\|', line)
        if m:
            key, val = m.group(1).strip(), m.group(2).strip()
            if key == "Customer":
                fields["customer_name"] = val
            elif key == "PO":
                fields["po_number"] = val
            elif key == "Consolidation Date":
                fields["delivery_date"] = val
            elif key == "Customer Code":
                fields["customer_code"] = val
    return fields


def _parse_webflor_order_id(stdout: str, stderr: str = "") -> str | None:
    """Try to extract WebFlor order ID from agent output."""
    import re
    combined = stdout + "\n" + stderr
    for line in combined.splitlines():
        # Match JSON-style: "IdPedido": 314631
        if "IdPedido" in line:
            match = re.search(r'"?IdPedido"?\s*[:=]\s*(\d+)', line)
            if match:
                return match.group(1)
        # Match natural language: "Order created with ID 314631"
        if "order" in line.lower() and "id" in line.lower():
            match = re.search(r'(?:order|ID)\s+(\d{5,})', line)
            if match:
                return match.group(1)
    return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Startup ──────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    logger.info("=" * 60)
    logger.info("Frootful Orchestrator starting")
    logger.info(f"  Supabase: {SUPABASE_URL}")
    logger.info(f"  Agent dir: {AGENT_DIR}")
    logger.info("=" * 60)

    # Ensure tmp directory exists
    (AGENT_DIR / "tmp").mkdir(exist_ok=True)
    INSTRUCTIONS_DIR.mkdir(parents=True, exist_ok=True)

    # Pre-warm WebFlor session on startup (checks Supabase first, falls back to Playwright)
    try:
        _ensure_login()
        logger.info("[startup] WebFlor session ready")
    except Exception as e:
        logger.warning(f"[startup] Initial login failed (will retry on first request): {e}")
