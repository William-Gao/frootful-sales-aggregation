"""
Order Extraction Agent

Takes a customer PO (PDF/image) and produces a structured .md order file
that the WebFlor agent can execute. Handles:
- Parsing the PDF for header info and line items
- Mapping customer item codes/descriptions to WebFlor empaque names
- Looking up client_erp_id from customer code
- Determining PickTipoPrecio (Ramos/Tallos) based on empaque rules
- Filling in defaults (farm, marca, Tallos/Ramo) from cached data + ficha

Usage:
    cd browser-agent
    uv run order_extraction_agent.py --file ../public/demo/PO029889_Customer_1142.pdf
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
# Console: INFO level, concise
# File: DEBUG level, full details (tool inputs/outputs, timing)

logger = logging.getLogger("extraction_agent")
logger.setLevel(logging.DEBUG)

# Console handler — concise
_console = logging.StreamHandler()
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_console)

# File handler — detailed, created per-run in _setup_file_logging()
_file_handler: logging.FileHandler | None = None


def _setup_file_logging(po_name: str = "extraction") -> str:
    """Set up file logging for this run. Returns the log file path."""
    global _file_handler
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"{po_name}_{timestamp}.log")
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
        # Cached local lookups
        "search_empaques", "search_farms", "search_products",
        "search_picklists", "search_cached_file", "search_clients_csv",
        "search_box_marks", "search_box_types", "search_box_dimensions",
        "search_compositions", "search_varieties",
        # Live API lookups
        "lookup_client_product_ficha", "lookup_marca_box_info", "lookup_empaque_details",
        "resolve_delivery_date",
        # Reference order lookups
        "list_recent_orders", "get_order_with_items",
        # Recipe / flower / material details
        "get_order_item_recipes", "get_order_item_flowers", "get_order_item_materials",
        # Spec sheets & active varieties
        "search_active_varieties", "get_spec_sheet",
        # Customer-specific rules
        "search_customer_notes",
        # Item code → empaque mappings (historically observed, not exhaustive)
        "lookup_item_mappings",
    ]
]

# ─── Extraction Agent Prompt ─────────────────────────────────────────────

EXTRACTION_AGENT_PROMPT = f"""You are an order extraction agent for La Gaitana Farms (Colombian flower distributor).

Your job: read a customer PO (PDF) and produce a structured .md order file that the
WebFlor order-entry agent can execute directly. You must map the customer's item codes
and short descriptions to the correct WebFlor empaque names, AND find a suitable reference
order in WebFlor that the enter agent can copy from.

WEBFLOR RULES YOU MUST ENFORCE:
- PickManejaPrecio on empaque controls pricing mode:
  - 57 ("Por Item Flor") = composite products (bouquets, combos). Only 12 empaques have this.
    For these: Tipo Precio is locked to "Ramos". Price may be 0 (calculated from recipe).
  - 56 ("Por Item") = all other empaques. Tipo Precio can be "Ramos" or "Tallos".
    Determine using PRICE as the primary signal:
      - Price >= $0.50 → "Ramos" (per-bunch pricing)
      - Price < $0.50 → "Tallos" (per-stem pricing)
    Then cross-check against the ficha's PickTipoPrecio (66=Ramos, 67=Tallos).
    If price and ficha AGREE, use that value confidently.
    If they DISAGREE, use the price-based value but flag with "REVIEW:" in comments.
    Look up "Ramos"/"Tallos" picklist IDs via search_picklists(category="tipoPrecioItem").

WORKFLOW:

STEP 1: Read the PDF and identify the customer.
  - Read the PDF to find the customer code/number.
  - Call search_clients_csv with the customer code to look up in the local clientes.csv.
    This returns Codigo, IdCliente (WebFlor ID), and NomCliente (customer name).
  - Use IdCliente as client_erp_id in the .md output.
  - Use NomCliente as the customer name — not any retailer/banner name from the PDF.
  - The customer code from the PDF is the Codigo, NOT the WebFlor IdCliente.
  - If no match found, flag for manual review.
  - Call search_customer_notes with the customer code (Codigo).
    If notes exist, read them carefully — they contain customer-specific rules that may
    override how you interpret fields in the PDF (e.g. which field is the PO number,
    date handling, special instructions). Apply these rules throughout all remaining steps.

STEP 2: Extract order details from the PDF.
  Based on the PDF structure and any customer notes from STEP 1, extract:
  - PO number
  - Dates (ship/consolidation date, arrival date, etc.)
  - Line items: item codes, descriptions, quantities, pack size, price, UPC, pull date/date code

STEP 3: Map dates.
  WebFlor needs 4 dates:
  - Fecha Orden = today's date (when the order is being entered)
  - Fecha Elaboracion = the consolidation/ship date from the PDF
  - Fecha Entrega = same as Fecha Elaboracion
  - Fecha Llegada = same as Fecha Elaboracion (use the consolidation date, NOT the arrive date)
  All dates must be in MM/DD/YYYY format in the output .md file.

STEP 4: Search for reference orders in WebFlor.
  This is critical — the enter agent can COPY an existing order instead of creating from scratch.
  Copying preserves recipes, flower compositions, materials, UPCs, and all configuration.

  4a) Call list_recent_orders with a date range around the PO's ship date.
      Pass date_from and date_to parameters (YYYY-MM-DD format) to filter server-side.
      Use a window of about ±1 week around the PO's consolidation/ship date.
      Example: PO ships 2026-03-10 → date_from="2026-03-03", date_to="2026-03-17"
      Focus on orders with status "En proceso" or "Pendiente" — these are future/upcoming
      orders that may already match the new PO.


  4b) For the most promising orders (similar dates, same status), call get_order_with_items
      to see the full item breakdown. Compare items, quantities, and products with the new PO.

  4b-extra) For reference order items, fetch details for the Item Details section:
      - ManejaReceta=2: call get_order_item_recipes for recipe containers.
        IMPORTANT: Recipe container CantidadRamos values are NOT fixed per-box templates.
        They change per order and scale with the box count. The CantidadRamos across all
        containers must add up to the item's Ramos/Caja (e.g. 135). When outputting recipe
        containers for the NEW order, scale the reference values proportionally to fit the
        new box count, keeping the same total Ramos/Caja. Use your best judgment for the
        distribution — it does not need to be exact.
      - ManejaReceta=1 or 2: call get_order_item_flowers for the flower/variety breakdown.
        For ManejaReceta=2, call per recipe container. For ManejaReceta=1, use receta_id="0".
      - All items: call get_order_item_materials for packaging materials.
        For ManejaReceta=2, call per recipe container. For others, use receta_id="0".

  4c) Select the BEST reference order:
      - Ideal: an existing pending/en-proceso order with the SAME set of products (just different quantities).
        This means a simple copy + quantity adjustment.
      - Good: a recent confirmed order with the same product set. Copy and adjust dates + quantities.
      - If no good match, note this — the enter agent will need to create from scratch.

  4d) Determine a "diff" between the reference order and the new PO:
      - Items in BOTH (same empaque): note quantity changes (e.g. "was 14 boxes, now 20 boxes")
      - Items in PO but NOT in reference: these need to be ADDED after copying
      - Items in reference but NOT in PO: these need to be DELETED after copying
      IMPORTANT: A single PO line item may map to MULTIPLE empaques in the reference order.
      For example, a PO line "CARNATIONS WHITE 19 boxes" might correspond to 2 reference items:
      "Carnation sel white Polar Route (4 boxes)" + "Carnation sel cream Halo (5 boxes)".
      When this happens, KEEP the reference order's empaques (so long as they are all
      relevant to the PO line item) and just adjust quantities — do NOT delete them and
      replace with a single different empaque.

STEP 5: Map each line item to a WebFlor empaque.
  The PDF has customer item codes and short descriptions. You need to find the matching
  WebFlor empaque name.

  PREFERRED: If a reference order was found in STEP 4, use the empaques from the reference
  order to map items. Match by description similarity (e.g. "MINI CARNATIONS ASST" matches
  "Minicarnation sel Consumer"). The reference order's empaques are the most reliable source.
  CRITICAL: When a single PO item maps to multiple reference order empaques (e.g. the
  reference has 2 different white carnation varieties for one PO line), KEEP all of them
  so long as they are all relevant to the PO line item.
  These are acceptable variant substitutions — adjust quantities proportionally but preserve
  the reference order's empaque choices. Do NOT replace them with a single different empaque.

  ALSO: Call lookup_item_mappings with each item code (e.g. "CBD13451") to check for
  historically observed mappings. These show which empaques have been used for this item
  code in past orders. Note: these are not exhaustive and not always 1:1 — a single item
  code may be split across multiple empaques in different quantities depending on availability.
  Use these to validate the reference order mapping or as candidates when no reference exists.

  FALLBACK (no reference order, or items not in reference):
  a) Use search_empaques with keywords derived from the description to find candidates.
     Translate abbreviations to full flower names (e.g. "CARNS" → "Carnation",
     "RBW" → "Rainbow", "ASST" → "Mixed", "MINI CARNS" → "Minicarnation").
  b) Match by Pack size (Ramos/Caja) to disambiguate if multiple results.
  c) If unsure, flag the item for manual review with "REVIEW:" prefix.

  For each matched empaque, note:
  - IdEmpaque, NomEmpaque, IdProducto, PickManejaPrecio

STEP 6: Determine Tipo Precio for each item.
  - If empaque PickManejaPrecio == 57: Tipo Precio = "Ramos" (locked for composites).
  - If empaque PickManejaPrecio == 56: call lookup_client_product_ficha(client_id, product_id)
    to get the ficha's PickTipoPrecio. 66 = "Ramos", 67 = "Tallos".
    Cross-check with price: ~$0.10-0.20 = likely Tallos (per-stem), ~$1+ = likely Ramos (per-bunch).

STEP 7: Determine farm and marca.
  - Farm: default to "Gaitana" unless the PDF specifies otherwise.
  - Marca: call lookup_marca_box_info to get the marca name for this customer.
    Or use the ficha's default PickMarcaCaja → lookup_marca_box_info to get the full name.

STEP 8: Determine Tallos/Ramo.
  - Call lookup_client_product_ficha to get the ficha's TallosRamo default if available.
  - If no ficha data, flag for review.
  NOTE: The PDF "Pack" column = Ramos/Caja (bunches per box), NOT Tallos/Ramo.

STEP 9: Validate against spec sheets and active varieties.
  For each item, call get_spec_sheet with the empaque ID or name to check if we have a spec sheet.
  If a spec sheet exists:
  - Verify Ramos/Caja matches the spec (e.g. spec says 140/box, PO says 140)
  - If there's a mismatch, add a REVIEW note on the item
  - You do NOT need to list sub-mixes, flower compositions, or active varieties in the output.
    Just confirm the data is consistent and flag any issues.

STEP 10: Skip zero-quantity items.
  - If Cases = 0, skip the item (it's a placeholder/inactive line).

STEP 11: Output the .md file using the TEMPLATE below.

IMPORTANT OUTPUT RULES:
- Keep the output concise and actionable — no reasoning, no explanations
- Do NOT include spec sheet breakdowns, active variety lists, or Tipo Precio reasoning
- Only add "REVIEW:" notes for genuine issues that need human attention
- Ramos/Caja comes from the PDF's "Pack" column
- Precio comes from the PDF's "Price" column — keep as-is (per-unit price, not total)
- Pull Date / Date Code: extract from the PDF if present. Leave blank if not in the PDF.
- CajaId: The UPC label description/name. Get from reference order if available.
- Skip items with 0 cases
- Include ALL non-zero items from the PDF

===== OUTPUT TEMPLATE =====

{_load_template("order_output.md")}

===== END TEMPLATE =====

STEP 12: Write the .md file.
  - Write the output to the orders/instructions/ directory (relative to your working directory).
  - Filename: orders/instructions/<PO_number>.md (e.g. orders/instructions/PO029889.md)
  - Use the Write tool to create the file.

Be concise. Extract, map, find reference, output."""


async def main():
    parser = argparse.ArgumentParser(description="Extract order from PDF to .md")
    parser.add_argument("--file", required=True, help="Path to the PDF file")
    parser.add_argument("--output", help="Output .md file path (default: orders/instructions/<PO>.md)")
    args = parser.parse_args()

    pdf_path = os.path.abspath(args.file)
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    # Set up file logging using the PDF filename as prefix
    pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
    log_path = _setup_file_logging(pdf_basename)

    agent_cwd = os.path.dirname(os.path.abspath(__file__))
    mcp_server_script = os.path.join(agent_cwd, "webflor_mcp_server.py")

    # Lazy import — requires claude_agent_sdk
    from claude_agent_sdk import ClaudeAgentOptions, query

    output_hint = ""
    if args.output:
        output_hint = f" Write the output to: {os.path.abspath(args.output)}"
    prompt = f"Extract the order from this PDF and produce a .md order file: {pdf_path}{output_hint}"

    options = ClaudeAgentOptions(
        system_prompt=EXTRACTION_AGENT_PROMPT,
        allowed_tools=["Read", "Glob", "Grep", "Write"] + ERP_TOOL_NAMES,
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

    logger.info(f"PDF: {pdf_path}")
    logger.info(f"Agent CWD: {agent_cwd}")
    logger.info(f"MCP server: {mcp_server_script}")
    logger.info(f"Tools: {len(ERP_TOOL_NAMES)} ERP + Read/Glob/Grep/Write")
    print(f"\nExtracting order from: {pdf_path}")
    print(f"Log file: {log_path}")
    print(f"Starting extraction agent (standalone MCP server)...\n")

    from claude_agent_sdk import (
        AssistantMessage,
        UserMessage,
        SystemMessage,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
        ToolResultBlock,
    )

    run_start = time.time()
    tool_call_count = 0
    tool_errors = 0
    turn_count = 0
    pending_tool_calls: dict[str, tuple[str, float]] = {}  # id -> (name, start_time)

    result_text = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            turn_count += 1
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    tool_call_count += 1
                    input_str = json.dumps(block.input)
                    # Console: short summary
                    logger.info(f"[turn {turn_count}] Tool call #{tool_call_count}: {block.name}")
                    # File: full input
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

                        # Calculate duration if we tracked the call
                        duration_str = ""
                        tool_name = "?"
                        if block.tool_use_id in pending_tool_calls:
                            tool_name, call_start = pending_tool_calls.pop(block.tool_use_id)
                            duration = time.time() - call_start
                            duration_str = f" ({duration:.1f}s)"

                        # Console: short
                        logger.info(f"  → {tool_name} [{status}]{duration_str} {content_str[:150]}")
                        # File: full result
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

            # Log summary
            logger.info(f"{'='*60}")
            logger.info(f"EXTRACTION COMPLETE")
            logger.info(f"  PDF: {pdf_path}")
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
