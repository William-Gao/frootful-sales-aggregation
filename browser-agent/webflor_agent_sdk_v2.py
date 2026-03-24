"""
Frootful WebFlor Agent V2 (Copy-first)

Simplified agent that assumes COPY strategy. Copies a reference order,
updates the header, and adjusts item quantities. No recipe/flower/material
handling — those are preserved from the copy.

Usage:
    cd browser-agent
    uv run webflor_agent_sdk_v2.py --order orders/instructions/PO029889.md
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

logger = logging.getLogger("webflor_agent_v2")
logger.setLevel(logging.DEBUG)

_console = logging.StreamHandler()
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_console)

_file_handler: logging.FileHandler | None = None


def _setup_file_logging(run_name: str = "agent") -> str:
    global _file_handler
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"enter_v2_{run_name}_{timestamp}.log")
    _file_handler = logging.FileHandler(log_path, encoding="utf-8")
    _file_handler.setLevel(logging.DEBUG)
    _file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(message)s"))
    logger.addHandler(_file_handler)
    logger.info(f"Log file: {log_path}")
    return log_path


def _friendly_tool_name(name: str) -> str:
    return name.replace("mcp__erp__", "") if name.startswith("mcp__erp__") else name


# ─── Config ────────────────────────────────────────────────────────────────

WEBFLOR_APP_URL = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")

ERP_TOOL_NAMES = [
    f"mcp__erp__{name}" for name in [
        # Session
        "refresh_session", "set_session",
        # Order CRUD (core)
        "copy_order", "update_order",
        "get_order", "get_order_items",
        "update_order_item", "delete_order_item",
        # UPC / Datos Adicionales
        "get_order_item_recipes",
        "get_item_datos_adicionales",
        "update_recipe_datos_adicionales",
    ]
]

# ─── Agent Prompt ──────────────────────────────────────────────────────

WEBFLOR_AGENT_PROMPT = f"""You are a WebFlor ERP agent for La Gaitana Farms.

WebFlor app URL: {WEBFLOR_APP_URL}
Audit user: "Elian" (ID: 6109)

RULES:
- Check "_status" and "_error" in every API response. If _status >= 400, the call FAILED.
- You MAY call MULTIPLE update_order_item and/or delete_order_item calls IN PARALLEL
  for different items. Each item has a unique IdDetalle so they don't conflict.

WORKFLOW:

STEP 1: Read the order file. Extract reference order ID, PO, comments, dates, and items table.
  Convert all dates to YYYY/MM/DD format (forward slashes).
  All dates use the consolidation date except Fecha Orden (entry date = today).

STEP 2: Copy the reference order.
  - Call copy_order with the reference order ID from the Strategy section.
  - Save the new order ID.

STEP 3: Update the order header.
  - Call update_order to set PO, Comentario, and all 4 dates on the new order.

STEP 4: Update item quantities.
  - Call get_order_items on the NEW (copied) order to get all item objects.
  - For each item, match to the Items table by empaque name (NomEmpaque).
  - Build ALL updates and deletes, then fire them ALL AT ONCE in parallel:
    - For items needing quantity/price changes:
      - Take the COMPLETE item object from get_order_items.
      - Change CantidadCaja and CajaConfirmada to the quantity from the Items table.
      - Also update CajaId and Precio if the Items table specifies them.
      - For SIMPLE items (Receta=0 or 1): also set PullDate in the same object
        (3-digit Julian day code from the Items table, e.g. "075").
        IMPORTANT: Keep UPC="" (empty string). The item-level UPC field shows as
        "P.O. Ítem" in the grid — real orders leave this blank.
      - Send the ENTIRE object (all fields) to update_order_item.
      - CRITICAL: Include ALL fields from the original object. The API resets any omitted
        field to its default value.
    - For items in the copied order but NOT in the Items table: delete via delete_order_item.
  - Issue ALL update_order_item and delete_order_item calls in a SINGLE parallel batch.

STEP 5: Update PullDate for recipe items (Receta=2).
  - For each item with Receta=2 in the Items table:
    a) Call get_order_item_recipes to get recipe containers.
    b) For each recipe container, call update_recipe_datos_adicionales with the
       full recipe container object, setting PullDate to the Julian day code.
    c) Fire all recipe updates in parallel.
  - Skip this step if no items have Receta=2, or if no PullDate is specified.

STEP 6: Verify.
  - Call get_order and get_order_items IN PARALLEL to confirm header and items.
  - Flag any mismatches.

STEP 7: Report.
  - Order ID, link (from "_link" field), item summary table.

Be concise. Execute all steps."""


# ─── Main ──────────────────────────────────────────────────────────────────

async def run_agent(initial_task: str | None = None, file_path: str | None = None):
    from claude_agent_sdk import query, ClaudeAgentOptions

    if file_path:
        abs_path = os.path.abspath(file_path)
        if not os.path.exists(abs_path):
            print(f"File not found: {abs_path}")
            return
        prompt = initial_task or f"Read the file at {abs_path} and process the order into WebFlor."
    elif initial_task:
        prompt = initial_task
    else:
        print("WebFlor Agent V2 — type your request, or 'quit' to exit.\n")
        try:
            prompt = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            return
        if not prompt or prompt.lower() in ("quit", "exit", "q"):
            return

    agent_cwd = os.path.dirname(os.path.abspath(__file__))
    mcp_server_script = os.path.join(agent_cwd, "webflor_mcp_server.py")

    options = ClaudeAgentOptions(
        model="claude-haiku-4-5",
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

    run_name = os.path.splitext(os.path.basename(file_path))[0] if file_path else "task"
    log_path = _setup_file_logging(run_name)

    logger.info(f"Prompt: {prompt[:200]}")
    logger.info(f"Agent CWD: {agent_cwd}")
    logger.info(f"Tools: {len(ERP_TOOL_NAMES)} ERP + Read/Glob/Grep")
    print(f"\nStarting agent V2 (copy-first)...")
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
    pending_tool_calls: dict[str, tuple[str, float]] = {}

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
                    logger.info(f"{prefix}[turn {turn_count}] #{tool_call_count}: {friendly}")
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

                        logger.info(f"{prefix}  → {tool_name} [{status}]{duration_str} {content_str[:150]}")
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
            logger.info(f"ENTER AGENT V2 COMPLETE")
            logger.info(f"  Result: {message.result}")
            logger.info(f"  Turns: {message.num_turns}")
            logger.info(f"  Tool calls: {tool_call_count} ({tool_errors} errors)")
            logger.info(f"  Wall time: {elapsed:.1f}s")
            if message.total_cost_usd is not None:
                logger.info(f"  Cost: ${message.total_cost_usd:.4f}")
            logger.info(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="WebFlor Agent V2 (copy-first)")
    parser.add_argument("--task", "-t", help="Initial task (omit for interactive prompt)")
    parser.add_argument("--file", "-f", help="File to process")
    parser.add_argument("--order", "-o", help="Order file from orders/ directory")
    args = parser.parse_args()

    file_path = args.file
    if args.order:
        file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "orders", args.order)

    asyncio.run(run_agent(initial_task=args.task, file_path=file_path))


if __name__ == "__main__":
    main()
