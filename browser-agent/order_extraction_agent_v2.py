"""
Order Extraction Agent V2

Copy-first approach: finds the best reference order to copy from and outputs
a minimal diff. No recipe/flower/material details — those come from the copy.

Usage:
    cd browser-agent
    uv run order_extraction_agent_v2.py --file ../public/demo/PO029889_Customer_1142.pdf
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

# ─── Logging Setup ────────────────────────────────────────────────────────

logger = logging.getLogger("extraction_agent_v2")
logger.setLevel(logging.DEBUG)

_console = logging.StreamHandler()
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_console)

_file_handler: logging.FileHandler | None = None


def _setup_file_logging(po_name: str = "extraction") -> str:
    global _file_handler
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"{po_name}_v2_{timestamp}.log")
    _file_handler = logging.FileHandler(log_path, encoding="utf-8")
    _file_handler.setLevel(logging.DEBUG)
    _file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(message)s"))
    logger.addHandler(_file_handler)
    logger.info(f"Log file: {log_path}")
    return log_path


WEBFLOR_APP_URL = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")

_TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")


def _load_template(filename: str) -> str:
    with open(os.path.join(_TEMPLATES_DIR, filename), "r") as f:
        return f.read()


# Tool names exposed by the standalone MCP server (prefixed with mcp__erp__)
ERP_TOOL_NAMES = [
    f"mcp__erp__{name}" for name in [
        # Session
        "refresh_session", "set_session",
        # Customer identification
        "search_clients_csv",
        "search_customer_notes",
        # Week lookup
        "get_week",
        # Reference order lookups
        "list_recent_orders", "get_order_with_items",
        # Item mapping
        "lookup_item_mappings",
        # Tipo Precio
        "lookup_client_product_ficha",
        # # Fallback: only needed if item not in any reference order
        # "search_empaques", "lookup_empaque_details",
    ]
]

# ─── Extraction Agent V2 Prompt ──────────────────────────────────────────

EXTRACTION_AGENT_PROMPT = f"""You are an order extraction agent for La Gaitana Farms (Colombian flower distributor).

Your job: read a customer PO (PDF) and produce a minimal .md order file for the enter agent.
The enter agent will COPY a reference order and adjust quantities — so you do NOT need recipe,
flower, or material details. Just identify the right reference order and the quantities to write.

AVAILABLE TOOLS (use ONLY these — do NOT attempt any other tools):
- Read, Glob, Grep, Write, Bash — standard file tools
- search_clients_csv — find customer by name or code
- search_customer_notes — get customer-specific rules
- get_week — look up WebFlor week number for a date
- list_recent_orders — find recent orders for a customer
- get_order_with_items — get full details of a reference order
- lookup_item_mappings — validate item codes
- lookup_client_product_ficha — check pricing rules

WORKFLOW:

STEP 1: Read the PDF. Identify the customer.
  - Find the customer code in the PDF.
  - Call search_clients_csv to get IdCliente (WebFlor Customer ID) and NomCliente (Customer name).
  - Call search_customer_notes for any customer-specific rules that affect how you read the PDF
    (e.g. which field is the PO number, date handling, special instructions).

STEP 2: Extract order details from the PDF.
  - PO number, consolidation/ship date, line items (item codes, descriptions, quantities, price).

STEP 3: Map dates and PullDate.
  All dates use the consolidation/ship date from the PDF, except Fecha Orden = today's date.
  - Fecha Orden = today (see DATE REFERENCE in the user message for today's exact date)
  - Fecha Elaboracion = Fecha Entrega = Fecha Llegada = consolidation date
  - All in MM/DD/YYYY format.
  - PullDate: Extract from the PDF's "Date Code" column (per line item). It is a 3-digit Julian day
    code (e.g. 062, 075). Use the value as-is from the PDF. Do NOT compute or calculate PullDate.
    If the PDF does not have a Date Code field, leave PullDate empty in the output.

STEP 4: Find the best reference order to copy.

  4a) Call get_week with the consolidation date to get the WebFlor
      week number and date range (inicio/fin).

  4b) Call list_recent_orders with the week's inicio/fin as date_from/date_to.
      Look for orders with a FechaEntrega matching the consolidation date.
      Prefer: Estimado orders (PO contains "Estimado") or recent confirmed orders with items.

  4c) If no good match in the target week, search the previous week(s) for confirmed orders
      with similar items.

  4d) Call get_order_with_items on the best candidate(s) to see the item breakdown.
      Best match: same set of empaques, just different quantities.

STEP 5: Map PO line items to reference order items and determine quantities.
  - Match PO lines to reference order empaques by description similarity.
  - Call lookup_item_mappings with each item code for validation.
  - IMPORTANT: Use lookup_item_mappings to check how many empaques an item code maps to.
    - If the item code maps to ONE empaque → use that empaque directly with the full PO quantity.
      Do NOT split it, even if the reference order has multiple similar-looking items.
      Example: CBD01794 maps to only "Carnation fcy Mixed" (1028) → always 1 row, full quantity.
    - If the item code maps to MULTIPLE empaques → the PO quantity must be SPLIT across them.
      Distribute proportionally based on the reference order ratios.
      Example: CBD13451 maps to 6 empaques (Polar Route, Halo, Rodas in fcy/sel variants).
      If the reference had 6 Polar Route + 4 Rodas, split the PO quantity in that 6:4 ratio.
  - Fallback (item not in reference): search_empaques to find the empaque.

STEP 6: Determine Tipo Precio for each item.
  - If empaque PickManejaPrecio == 57: "Ramos" (locked).
  - Otherwise: price >= $0.50 → "Ramos", price < $0.50 → "Tallos".
    Cross-check with lookup_client_product_ficha. Flag disagreements with REVIEW.

STEP 7: Output the .md file.

OUTPUT RULES:
- No reasoning or explanations in the output
- Only add REVIEW notes for genuine issues
- Price from PDF as-is (per-unit, not total)
- Skip items with 0 cases
- The Items table should list the FINAL quantities to write (not a diff from reference)
- The Strategy section identifies which reference order to copy and summarizes changes

===== OUTPUT TEMPLATE =====

{_load_template("order_output_v2.md")}

===== END TEMPLATE =====

STEP 8: Write to orders/instructions/<PO_number>.md

Be concise. Extract, find reference, output."""


async def main():
    parser = argparse.ArgumentParser(description="Extract order from PDF to .md (V2 — copy-first)")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", action="append", help="Path to a PDF or image file (can be specified multiple times)")
    group.add_argument("--folder", help="Path to a folder containing PDF/image files")
    parser.add_argument("--output", help="Output .md file path (default: orders/instructions/<PO>.md)")
    args = parser.parse_args()

    if args.folder:
        folder = os.path.abspath(args.folder)
        if not os.path.isdir(folder):
            print(f"Folder not found: {folder}")
            sys.exit(1)
    else:
        # --file mode: validate all files exist
        for f in args.file:
            if not os.path.exists(os.path.abspath(f)):
                print(f"File not found: {os.path.abspath(f)}")
                sys.exit(1)
        folder = None

    log_name = os.path.basename(folder) if folder else os.path.splitext(os.path.basename(args.file[0]))[0]
    log_path = _setup_file_logging(log_name)

    agent_cwd = os.path.dirname(os.path.abspath(__file__))
    mcp_server_script = os.path.join(agent_cwd, "webflor_mcp_server.py")

    from claude_agent_sdk import ClaudeAgentOptions, query

    # Build date context in Colombia timezone (UTC-5) since La Gaitana is based there
    COT = timezone(timedelta(hours=-5))  # Colombia Time
    now = datetime.now(COT)
    today_str = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%H:%M")
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    today_dow = day_names[now.weekday()]
    calendar_lines = []
    for i in range(14):
        d = now + timedelta(days=i)
        date_str = d.strftime("%Y-%m-%d")
        dow = day_names[d.weekday()]
        label = " (TODAY)" if i == 0 else " (this week)" if i < 7 else " (next week)"
        calendar_lines.append(f"  {dow} {date_str}{label}")
    date_context = "\n".join([
        "DATE REFERENCE (use this as a lookup — do NOT calculate dates yourself):",
        f"Today: {today_dow} {today_str} {current_time} (Colombia Time, UTC-5)",
        "",
        "Day-to-date mapping:",
        *calendar_lines,
    ])

    output_hint = ""
    if args.output:
        output_hint = f"\nWrite the output to: {os.path.abspath(args.output)}"
    if folder:
        prompt = f"Extract the order from the files in this folder and produce a .md order file. Read ALL files — some may be the PO, others may be spec sheets or supporting images. List the folder first to see what's there:\n  {folder}{output_hint}\n\n{date_context}"
    else:
        files_list = "\n".join(f"  - {os.path.abspath(f)}" for f in args.file)
        prompt = f"Extract the order from these files and produce a .md order file. Read ALL files — some may be the PO, others may be spec sheets or supporting images:\n{files_list}{output_hint}\n\n{date_context}"

    options = ClaudeAgentOptions(
        system_prompt=EXTRACTION_AGENT_PROMPT,
        allowed_tools=["Read", "Glob", "Grep", "Write", "Bash"] + ERP_TOOL_NAMES,
        permission_mode="acceptEdits",
        cwd=agent_cwd,
        mcp_servers={
            "erp": {
                "type": "stdio",
                "command": sys.executable,
                "args": [mcp_server_script],
                "env": {
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

    source = folder or ", ".join(os.path.abspath(f) for f in args.file)
    logger.info(f"Source: {source}")
    logger.info(f"Agent CWD: {agent_cwd}")
    logger.info(f"MCP server: {mcp_server_script}")
    logger.info(f"Tools: {len(ERP_TOOL_NAMES)} ERP + Read/Glob/Grep/Write")
    print(f"\nExtracting order from: {source}")
    print(f"Log file: {log_path}")
    print(f"Starting extraction agent V2 (copy-first)...\n")

    from claude_agent_sdk import (
        AssistantMessage, UserMessage, SystemMessage, ResultMessage,
        TextBlock, ToolUseBlock, ToolResultBlock,
    )

    run_start = time.time()
    tool_call_count = 0
    tool_errors = 0
    turn_count = 0
    pending_tool_calls: dict[str, tuple[str, float]] = {}

    result_text = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            turn_count += 1
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    tool_call_count += 1
                    input_str = json.dumps(block.input)
                    logger.info(f"[turn {turn_count}] Tool call #{tool_call_count}: {block.name}")
                    logger.debug(f"  Tool input: {input_str}")
                    pending_tool_calls[block.id] = (block.name, time.time())
                elif isinstance(block, TextBlock) and block.text.strip():
                    print(block.text)
                    logger.debug(f"  Agent text: {block.text[:500]}")

        elif isinstance(message, UserMessage):
            if isinstance(message.content, list):
                for block in message.content:
                    if isinstance(block, ToolResultBlock):
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

                        logger.info(f"  → {tool_name} [{status}]{duration_str} {content_str[:150]}")
                        logger.debug(f"  Tool result [{status}]{duration_str}: {content_str}")

        elif isinstance(message, ResultMessage):
            result_text = message.result
            elapsed = time.time() - run_start
            print(f"\n{'='*60}")
            print(f"Result: {result_text}")
            if message.total_cost_usd is not None:
                print(f"Cost: ${message.total_cost_usd:.4f}")
            print(f"Turns: {message.num_turns} | Duration: {message.duration_ms/1000:.1f}s")
            print(f"Tool calls: {tool_call_count} ({tool_errors} errors)")
            print(f"Log: {log_path}")
            print(f"{'='*60}")

            logger.info(f"{'='*60}")
            logger.info(f"EXTRACTION V2 COMPLETE")
            logger.info(f"  Source: {source}")
            logger.info(f"  Result: {result_text}")
            logger.info(f"  Turns: {message.num_turns}")
            logger.info(f"  Tool calls: {tool_call_count} ({tool_errors} errors)")
            logger.info(f"  Wall time: {elapsed:.1f}s")
            if message.total_cost_usd is not None:
                logger.info(f"  Cost: ${message.total_cost_usd:.4f}")
            logger.info(f"{'='*60}")

        elif isinstance(message, SystemMessage):
            logger.debug(f"System: {message.subtype} — {str(message)[:500]}")



if __name__ == "__main__":
    asyncio.run(main())
