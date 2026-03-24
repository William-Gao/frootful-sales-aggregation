"""
Shared WebFlor authentication and HTTP client.

Loads session cookies from: Supabase user_tokens → .env → login.py (fallback).
Provides webflor_fetch() for making authenticated API calls.
Used by both the MCP server and the deterministic enter agent.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
from typing import Any
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("webflor_auth")

WEBFLOR_APP_URL = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")
_parsed = urlparse(WEBFLOR_APP_URL)
API_BASE_URL = f"{_parsed.scheme}://{_parsed.netloc}"

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
ORGANIZATION_ID = os.getenv("ORGANIZATION_ID", "")

# ─── State ───────────────────────────────────────────────────────────────

_session_cookies: str = os.getenv("WEBFLOR_COOKIES", "")
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=600.0)
    return _http_client


# ─── Cookie Sources ──────────────────────────────────────────────────────

def load_cookies_from_supabase() -> str:
    """Load WebFlor cookies from Supabase user_tokens (provider='webflor')."""
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY or not ORGANIZATION_ID:
        return ""
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
        result = (
            sb.table("user_tokens")
            .select("encrypted_access_token")
            .eq("provider", "webflor")
            .eq("organization_id", ORGANIZATION_ID)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            cookies = result.data[0].get("encrypted_access_token", "")
            if cookies:
                logger.info("Loaded cookies from Supabase user_tokens")
                return cookies
    except Exception as e:
        logger.warning(f"Failed to load cookies from Supabase: {e}")
    return ""


def _run_login_script() -> str:
    """Run login.py to get fresh cookies (saves to both .env and Supabase)."""
    # login.py lives in browser-agent/ (sibling directory)
    login_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "browser-agent", "login.py")
    logger.info("Running login.py for fresh cookies...")
    result = subprocess.run(
        [sys.executable, login_script],
        capture_output=True, text=True, timeout=120,
        cwd=os.path.dirname(login_script),
    )
    if result.returncode != 0:
        logger.error(f"login.py failed (exit {result.returncode}): {result.stderr or result.stdout}")
        raise RuntimeError(f"login.py failed: {result.stderr or result.stdout}")
    for line in result.stdout.splitlines():
        if "ASP.NET_SessionId" in line:
            logger.info(f"Got fresh cookies: {line.strip()[:60]}...")
            return line.strip()
    logger.info("Cookies not found in stdout — re-reading from .env")
    load_dotenv(override=True)
    return os.getenv("WEBFLOR_COOKIES", "")


async def _run_login_async() -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_login_script)


# ─── Validation ──────────────────────────────────────────────────────────

async def _validate_cookies(cookies: str) -> bool:
    """Check if cookies are valid by hitting a lightweight WebFlor endpoint."""
    if not cookies:
        return False
    try:
        client = _get_http_client()
        url = f"{API_BASE_URL}/WebFlorBasico/API/listarCompaniasActivasSinLogo"
        resp = await client.get(url, headers={"Cookie": cookies, "Accept": "application/json"}, follow_redirects=False)
        if 300 <= resp.status_code < 400 or resp.status_code >= 400:
            return False
        json.loads(resp.text)
        return True
    except Exception:
        return False


# ─── Public API ──────────────────────────────────────────────────────────

async def ensure_session() -> str:
    """Ensure a valid WebFlor session. Tries: .env → Supabase → login.py."""
    global _session_cookies

    # 1. Try existing cookies from env
    if _session_cookies:
        if await _validate_cookies(_session_cookies):
            logger.info("Session valid (from env).")
            return _session_cookies

    # 2. Try Supabase
    logger.info("Checking Supabase for WebFlor cookies...")
    sb_cookies = load_cookies_from_supabase()
    if sb_cookies and await _validate_cookies(sb_cookies):
        _session_cookies = sb_cookies
        logger.info("Session valid (from Supabase).")
        return _session_cookies

    # 3. Fall back to login.py
    logger.info("No valid cookies — running login.py...")
    _session_cookies = await _run_login_async()
    logger.info("Session refreshed via login.py.")
    return _session_cookies


def get_session_cookies() -> str:
    """Get current session cookies (may be empty if ensure_session hasn't been called)."""
    return _session_cookies


def set_session_cookies(cookies: str):
    """Set session cookies directly (e.g. from MCP set_session tool)."""
    global _session_cookies
    _session_cookies = cookies


# ─── HTTP Client ─────────────────────────────────────────────────────────

def _order_link(order_id: int) -> str:
    """Build the WebFlor order detail URL for a given order ID."""
    return f"{WEBFLOR_APP_URL}/TablasBasicas/DetallesOrden?EsDesde=1&EsRepetitiva=0&iIdAccion=1&ManejaInventario=0&iIdPedido={order_id}"


async def webflor_fetch(
    path: str,
    method: str = "GET",
    params: dict[str, str] | None = None,
    body: dict | None = None,
    _retried: bool = False,
) -> Any:
    """Make an authenticated HTTP request to WebFlor. Auto-refreshes session on redirect."""
    global _session_cookies
    if not _session_cookies:
        await ensure_session()

    client = _get_http_client()
    url = f"{API_BASE_URL}{path}"
    headers = {"Cookie": _session_cookies, "Accept": "application/json"}
    if body and method != "GET":
        headers["Content-Type"] = "application/json"

    logger.info(f"WebFlor {method} {path}" + (f" params={params}" if params else "") + (f" body_keys={list(body.keys())}" if body else ""))

    try:
        resp = await client.request(
            method, url, headers=headers, params=params,
            content=json.dumps(body) if body else None,
            follow_redirects=False,
        )
    except Exception as e:
        logger.error(f"WebFlor HTTP error for {method} {path}: {e}")
        return {"_error": str(e), "_status": 0}

    logger.info(f"WebFlor response: {resp.status_code} ({len(resp.text)} bytes)")

    # Auto-refresh on redirect to login page
    if not _retried and 300 <= resp.status_code < 400:
        location = resp.headers.get("location", "")
        if "login" in location.lower() or "cerrarsesion" in location.lower():
            logger.warning("Session expired during API call — auto-refreshing...")
            _session_cookies = await _run_login_async()
            return await webflor_fetch(path, method, params, body, _retried=True)

    if resp.status_code >= 400:
        logger.error(f"HTTP {resp.status_code} from {path}: {resp.text[:500]}")
        return {"_error": f"HTTP {resp.status_code}", "_status": resp.status_code, "_raw": resp.text[:500]}

    try:
        return json.loads(resp.text)
    except json.JSONDecodeError:
        logger.warning(f"Non-JSON response from {path}: {resp.text[:200]}")
        return {"_raw": resp.text, "_status": resp.status_code}
