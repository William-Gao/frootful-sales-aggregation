"""
Frootful WebFlor Agent (Agent SDK version)

Uses the Claude Agent SDK with a standalone MCP server (webflor_mcp_server.py)
that runs as a separate subprocess. This avoids the in-process pipe race
condition that causes "Stream closed" errors with create_sdk_mcp_server().

Usage:
    cd browser-agent
    uv run webflor_agent_sdk.py
    uv run webflor_agent_sdk.py --task "Create an order for Gems Group"
    uv run webflor_agent_sdk.py --file order.pdf
    uv run webflor_agent_sdk.py --order test.md
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

# ─── Logging Setup ────────────────────────────────────────────────────────

logger = logging.getLogger("webflor_agent")
logger.setLevel(logging.DEBUG)

_console = logging.StreamHandler()
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_console)

_file_handler: logging.FileHandler | None = None


def _setup_file_logging(run_name: str = "agent") -> str:
    """Set up file logging for this run. Returns the log file path."""
    global _file_handler
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"enter_{run_name}_{timestamp}.log")
    _file_handler = logging.FileHandler(log_path, encoding="utf-8")
    _file_handler.setLevel(logging.DEBUG)
    _file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(message)s"))
    logger.addHandler(_file_handler)
    logger.info(f"Log file: {log_path}")
    return log_path


def _friendly_tool_name(name: str) -> str:
    """Strip mcp__erp__ prefix for readability."""
    return name.replace("mcp__erp__", "") if name.startswith("mcp__erp__") else name

# ─── Config ────────────────────────────────────────────────────────────────

WEBFLOR_APP_URL = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")

# Tool names exposed by the standalone MCP server (prefixed with mcp__erp__)
ERP_TOOL_NAMES = [
    f"mcp__erp__{name}" for name in [
        # Session
        "refresh_session", "set_session",
        # Order CRUD (API calls)
        "create_order", "add_order_item", "update_order_item", "delete_order_item",
        "get_order", "get_order_items", "get_order_item_flowers",
        "update_order", "copy_order", "webflor_api_call",
        # Flower/recipe CRUD
        "add_order_flower", "update_order_flower",
        "get_order_item_recipes", "get_order_item_materials",
        "add_order_recipe", "update_order_recipe",
        # Reference order lookups
        "list_recent_orders", "get_order_with_items",
        # Live API lookups (returns authoritative data)
        "lookup_marca_box_info", "lookup_client_product_ficha", "lookup_empaque_details",
        # Cached local lookups (no API calls)
        "search_empaques", "search_farms", "search_box_marks", "search_box_types",
        "search_box_dimensions", "search_compositions", "search_varieties",
        "search_products", "search_picklists", "search_cached_file",
        # Spec sheets & active varieties
        "search_active_varieties", "get_spec_sheet",
        # Supabase customer lookups
        "search_customers", "list_all_customers", "get_customer_details",
        "resolve_delivery_date",
    ]
]

# ─── Subagent Prompt ──────────────────────────────────────────────────────

WEBFLOR_AGENT_PROMPT = f"""You are a WebFlor ERP agent for La Gaitana Farms (Colombian flower distributor).

WebFlor app URL: {WEBFLOR_APP_URL}
Audit user: "Elian" (ID: 6109)

CRITICAL RULES:
- NEVER call write tools (create_order, add_order_item, update_order_item, delete_order_item, add_order_flower, update_order_flower, add_order_recipe, update_order_recipe) in parallel. These API write calls MUST be sequential (one at a time). Parallel calls WILL crash the MCP connection. Search/lookup tools CAN be called in parallel.
- ALWAYS check "_status" and "_error" in API responses. If _status >= 400 or _error is present, the call FAILED — do NOT proceed as if it succeeded. Report the error and investigate.

WORKFLOW — you MUST complete ALL steps:

STEP 1: Read the order file.
STEP 2: Extract client_erp_id (the WebFlor IdCliente), PO, comments, and all 4 dates.
   - The number in parentheses like (1142) is a customer code, NOT the IdCliente.
   - Look for "client_erp_id:" in the file — that is the real WebFlor IdCliente.
   - Convert all dates to YYYY/MM/DD format (forward slashes, not dashes).

STEP 3: Check the Strategy section to decide CREATE vs COPY.

=== COPY FLOW (Strategy says "COPY order <id> then adjust") ===

STEP 3-COPY: Copy the reference order.
   - Call copy_order with the reference order ID from the Strategy section.
   - Save the returned new order ID.

STEP 4-COPY: Update the order header.
   - Call update_order to set PO, Comentario, and all 4 dates on the new order.

STEP 5-COPY: Adjust items based on the "Changes from reference" table.
   - First, call get_order_items on the NEW order to get the full item objects.
   - Match each copied item to the order file items by empaque name (NomEmpaque).

   For ADJUST items (quantity changed):
   - Take the COMPLETE item object from get_order_items.
   - Modify ONLY CantidadCaja and CajaConfirmada to the new quantity.
   - Also update UPC, PullDate, CajaId if the order file specifies them.
   - Send the ENTIRE object (all fields) to update_order_item.
   - CRITICAL: You MUST include ALL fields from the original item object. The API
     resets any omitted field to its default. This means PickTipoPrecio, PickTipoOrden,
     PickTipoCorte, PickMarca, Precio, etc. will all be wiped if you send a partial object.

   For DELETE items (in reference but not in new order):
   - Call delete_order_item with the item's IdPedidoItem.

   For ADD items (in new order but not in reference):
   - Follow the same process as the CREATE flow's STEP 5 below (look up IDs, call add_order_item).

   IMPORTANT: Process items ONE AT A TIME, sequentially.

=== CREATE FLOW (Strategy says "CREATE from scratch") ===

STEP 3-CREATE: Create the order header.
   - Call create_order with IdCliente=client_erp_id, all 4 dates, PO, and Comentario.
   - Save the returned iIdPedido — you need it for every item.

STEP 4-CREATE: Look up IDs needed for items.

   4a) From cached data (no API calls):
   - search_farms: find IdFinca by farm name from the order (e.g. "Gaitana").
   - search_empaques: find each item's empaque by name (e.g. "Carnation fcy Mixed").
     Returns IdEmpaque and IdProducto. IdProducto is needed for the ficha call in 4b.

   4b) Look up picklist IDs:
   - search_picklists with category "tipoPrecioItem" to get the IDs for "Ramos" and "Tallos".
     Use these IDs when setting PickTipoPrecio (do NOT hardcode the numbers).

   4c) Live API lookups (2 calls, reuse results across items with same product/marca):
   1. lookup_client_product_ficha(client_id, product_id):
      - Call once per unique IdProducto (from search_empaques).
      - Returns: PickTipoCorte, PickTipoPrecio, default PickMarcaCaja.
      - This is the ONLY source for PickTipoCorte — NEVER hardcode it.
      - PickTipoPrecio from the ficha is only a DEFAULT. If the order file specifies
        "Tipo Precio" (Ramos or Tallos), use the order file's value instead.
   2. lookup_marca_box_info(marca_query):
      - Call once per unique marca/brand name (e.g. "Base FB Gems").
      - Returns: PickMarcaCaja, IdTipoCaja, IdDimensionCaja (all from one row).
      - This is the ONLY source for box type/dimension IDs — do NOT use separate search_box_types/dimensions.

   Do all lookups upfront, then reuse the IDs for all items with the same product/marca.

STEP 5-CREATE: Add EACH line item from the Items table.
   For each row, call add_order_item with:
   - IdPedido: the order ID from step 3
   - IdFinca: from search_farms result
   - IdEmpaque: from search_empaques result (match exact empaque name)
   - IdTipoCaja: from lookup_marca_box_info result (same row as PickMarca)
   - PickMarca: from lookup_marca_box_info result (PickMarcaCaja field)
   - NomMarca: the brand name string from the order
   - IdDimensionCaja: from lookup_marca_box_info result (same row)
   - PickTipoCorte: from lookup_client_product_ficha result
   - CantidadCaja: "Cajas" column value
   - CajaConfirmada: same as CantidadCaja
   - TallosRamo: "Tallos/Ramo" column value
   - RamosCaja: "Ramos/Caja" column value
   - Precio: price value (numeric, no $ sign)
   - PickTipoPrecio: if order file has "Tipo Precio" column, map the name ("Ramos"/"Tallos")
     to the picklist ID from step 4b. Otherwise fall back to ficha's PickTipoPrecio.
   - IdUsuarioAuditoria: "6109"
   - UPC: from the UPC column if present
   - PullDate: from the "Pull Date" column if present (date code like "062", "066")
   - CajaId: UPC label name if available (e.g. "Carnations Asstd")

   IMPORTANT: Do NOT skip items. Add ALL items from the table.
   IMPORTANT: Add items ONE AT A TIME, sequentially. Do NOT call add_order_item in parallel — the MCP connection will break. Wait for each item to complete before adding the next one.

=== COMMON STEPS (both flows) ===

STEP 6: If an API call fails due to session expiry, call refresh_session then retry. (Session is also auto-refreshed, so this is a fallback.)

STEP 7: Verify the order by pulling it back from WebFlor.
   - Call get_order with the order ID to confirm the header is correct.
   - Call get_order_items with the order ID to confirm ALL line items were saved correctly.
   - Check each item's Precio, TallosRamo, RamosCaja, CantidadCaja, PickTipoPrecio against the original order file.
   - If any values are wrong (e.g. Precio is 0, PickTipoPrecio is 0), flag the discrepancy.

STEP 8: Report results.
   - List order ID and each item added/updated (with its IdPedidoItem).
   - Show a comparison table: expected vs actual for key fields (Precio, TallosRamo, RamosCaja, CantidadCaja, PickTipoPrecio).
   - Flag any mismatches.
   - Link: use the "_link" field returned by create_order or copy_order. Do NOT construct the URL yourself.

Be concise. Execute ALL steps and report."""


# ─── Main ──────────────────────────────────────────────────────────────────

async def run_agent(initial_task: str | None = None, file_path: str | None = None):
    from claude_agent_sdk import query, ClaudeAgentOptions

    # Build the prompt
    if file_path:
        abs_path = os.path.abspath(file_path)
        if not os.path.exists(abs_path):
            print(f"File not found: {abs_path}")
            return
        prompt = initial_task or f"Read the file at {abs_path} and process the order into WebFlor."
    elif initial_task:
        prompt = initial_task
    else:
        print("WebFlor Agent (SDK) — type your request, or 'quit' to exit.\n")
        try:
            prompt = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            return
        if not prompt or prompt.lower() in ("quit", "exit", "q"):
            return

    # Use browser-agent dir as cwd
    agent_cwd = os.path.dirname(os.path.abspath(__file__))

    # Path to the standalone MCP server
    mcp_server_script = os.path.join(agent_cwd, "webflor_mcp_server.py")

    options = ClaudeAgentOptions(
        system_prompt=WEBFLOR_AGENT_PROMPT,
        allowed_tools=["Read", "Glob", "Grep"] + ERP_TOOL_NAMES,
        permission_mode="acceptEdits",
        cwd=agent_cwd,
        mcp_servers={
            "erp": {
                "type": "stdio",
                "command": sys.executable,
                "args": [mcp_server_script],
                "env": {
                    # Pass through relevant env vars to the subprocess
                    "WEBFLOR_BASE_URL": os.getenv("WEBFLOR_BASE_URL", ""),
                    "WEBFLOR_COOKIES": os.getenv("WEBFLOR_COOKIES", ""),
                    "SUPABASE_URL": os.getenv("SUPABASE_URL", ""),
                    "SUPABASE_SECRET_KEY": os.getenv("SUPABASE_SECRET_KEY", ""),
                    "ORGANIZATION_ID": os.getenv("ORGANIZATION_ID", ""),
                    "DATA_DIR": os.getenv("DATA_DIR", ""),
                    "PATH": os.getenv("PATH", ""),
                },
            }
        },
    )

    # Set up file logging
    run_name = os.path.splitext(os.path.basename(file_path))[0] if file_path else "task"
    log_path = _setup_file_logging(run_name)

    logger.info(f"Prompt: {prompt[:200]}")
    logger.info(f"Agent CWD: {agent_cwd}")
    logger.info(f"Tools: {len(ERP_TOOL_NAMES)} ERP + Read/Glob/Grep")
    print(f"\nStarting agent (standalone MCP server)...")
    print(f"Log file: {log_path}\n")

    from claude_agent_sdk import (
        AssistantMessage as _AM, UserMessage as _UM, SystemMessage as _SM,
        ResultMessage as _RM, TextBlock as _TB, ToolUseBlock as _TU,
        ToolResultBlock as _TR, TaskStartedMessage, TaskProgressMessage,
        TaskNotificationMessage,
    )

    run_start = time.time()
    tool_call_count = 0
    tool_errors = 0
    turn_count = 0
    pending_tool_calls: dict[str, tuple[str, float]] = {}  # id -> (name, start_time)

    async for message in query(prompt=prompt, options=options):
        is_subagent = getattr(message, "parent_tool_use_id", None) is not None
        prefix = "  [sub] " if is_subagent else ""

        if isinstance(message, _AM):
            turn_count += 1
            for block in message.content:
                if isinstance(block, _TU):
                    tool_call_count += 1
                    friendly = _friendly_tool_name(block.name)
                    input_str = json.dumps(block.input)
                    # Console: friendly name + key params
                    logger.info(f"{prefix}[turn {turn_count}] #{tool_call_count}: {friendly}")
                    # File: full input
                    logger.debug(f"{prefix}  Tool input: {input_str}")
                    pending_tool_calls[block.id] = (friendly, time.time())
                elif isinstance(block, _TB) and block.text.strip():
                    print(f"{prefix}{block.text}")
                    logger.debug(f"{prefix}  Agent text: {block.text[:500]}")

        elif isinstance(message, _UM):
            if isinstance(message.content, list):
                for block in message.content:
                    if isinstance(block, _TR):
                        content_str = str(block.content) if block.content else "(empty)"
                        status = "ERROR" if block.is_error else "ok"
                        if block.is_error:
                            tool_errors += 1

                        duration_str = ""
                        tool_name = "?"
                        if block.tool_use_id in pending_tool_calls:
                            tool_name, call_start = pending_tool_calls.pop(block.tool_use_id)
                            duration = time.time() - call_start
                            duration_str = f" ({duration:.1f}s)"

                        # Console: short
                        logger.info(f"{prefix}  → {tool_name} [{status}]{duration_str} {content_str[:150]}")
                        # File: full result
                        logger.debug(f"{prefix}  Tool result [{status}]{duration_str}: {content_str}")
            elif isinstance(message.content, str) and message.content.strip():
                logger.debug(f"{prefix}User: {message.content[:200]}")

        elif isinstance(message, TaskStartedMessage):
            logger.info(f"Task started: {message.description} (id={message.task_id})")

        elif isinstance(message, TaskProgressMessage):
            tool = _friendly_tool_name(message.last_tool_name or "?")
            logger.info(f"Task progress: {message.description} | last_tool={tool} | tokens={message.usage.get('total_tokens', '?')}")

        elif isinstance(message, TaskNotificationMessage):
            logger.info(f"Task {message.status}: {message.summary[:300]}")

        elif isinstance(message, _SM):
            logger.debug(f"System: {message.subtype} — {json.dumps(message.data)[:200]}")

        elif isinstance(message, _RM):
            elapsed = time.time() - run_start
            print(f"\n{'='*60}")
            print(f"Result: {message.result}")
            if message.total_cost_usd is not None:
                print(f"Cost: ${message.total_cost_usd:.4f}")
            print(f"Turns: {message.num_turns} | Duration: {message.duration_ms/1000:.1f}s")
            print(f"Tool calls: {tool_call_count} ({tool_errors} errors)")
            print(f"Log: {log_path}")
            print(f"{'='*60}")

            logger.info(f"{'='*60}")
            logger.info(f"ENTER AGENT COMPLETE")
            logger.info(f"  Result: {message.result}")
            logger.info(f"  Turns: {message.num_turns}")
            logger.info(f"  Tool calls: {tool_call_count} ({tool_errors} errors)")
            logger.info(f"  Wall time: {elapsed:.1f}s")
            if message.total_cost_usd is not None:
                logger.info(f"  Cost: ${message.total_cost_usd:.4f}")
            logger.info(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="WebFlor Agent (SDK) — Claude Agent SDK powered")
    parser.add_argument("--task", "-t", help="Initial task (omit for interactive prompt)")
    parser.add_argument("--file", "-f", help="File to process (PDF, image, Excel, CSV, text)")
    parser.add_argument("--order", "-o", help="Order file from the orders/ directory (e.g. test.md)")
    args = parser.parse_args()

    file_path = args.file
    if args.order:
        file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "orders", args.order)

    asyncio.run(run_agent(initial_task=args.task, file_path=file_path))


if __name__ == "__main__":
    main()
