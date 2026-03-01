"""
Frootful Google Sheets Order Agent

Pulls orders from the Boston Microgreens Google Sheets ORDERS tab
for all harvest days (Tuesday/Wednesday/Friday) within a date window
(default: today + 7 days) and creates orders directly in Supabase.

Usage:
    python sheets_agent.py                     # All days, next 7 days, STAGING
    python sheets_agent.py --prod              # All days, next 7 days, PRODUCTION
    python sheets_agent.py --days 14           # All days, next 14 days
    python sheets_agent.py --day friday        # Just Friday, next 7 days
    python sheets_agent.py --day tuesday --days 14 --prod
"""

import json
import sys
import os
import asyncio
from datetime import date, datetime, timedelta

import anthropic
from dotenv import load_dotenv
from supabase import create_client
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ─── Environment configs ────────────────────────────────────────────────────
# Boston Microgreens org ID is the same in both environments
ORGANIZATION_ID = "e047b512-0012-4287-bb74-dc6d4f7e673f"

ENV_CONFIGS = {
    "staging": {
        "supabase_url": "https://laxhubapvubwwoafrewk.supabase.co",
        "secret_key_env": "SUPABASE_SECRET_KEY",
    },
    "prod": {
        "supabase_url": "https://zkglvdfppodwlgzhfgqs.supabase.co",
        "secret_key_env": "SUPABASE_PROD_SECRET_KEY",
    },
}

IS_PROD = "--prod" in sys.argv
ENV_NAME = "prod" if IS_PROD else "staging"
env_config = ENV_CONFIGS[ENV_NAME]

SUPABASE_URL = env_config["supabase_url"]
SUPABASE_SECRET_KEY = os.environ[env_config["secret_key_env"]]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
COMPOSIO_MCP_URL = os.environ["COMPOSIO_MCP_URL"]
COMPOSIO_API_KEY = os.environ["COMPOSIO_API_KEY"]
SPREADSHEET_ID = os.environ["SPREADSHEET_ID"]

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

SHEET_NAME = "ORDERS"

# ─── Lookup tables ──────────────────────────────────────────────────────────

CUSTOMERS_BY_ID: dict[str, dict] = {}
CUSTOMERS_BY_NAME: dict[str, dict] = {}  # lowercase name → customer dict
ITEMS_BY_ID: dict[str, dict] = {}
VARIANTS_BY_ID: dict[str, dict] = {}


# ─── Catalog Loading ────────────────────────────────────────────────────────


def load_customers() -> list[dict]:
    result = (
        supabase.table("customers")
        .select("id, name, email, phone, notes")
        .eq("active", True)
        .eq("organization_id", ORGANIZATION_ID)
        .order("name")
        .execute()
    )
    for c in result.data:
        CUSTOMERS_BY_ID[c["id"]] = c
        CUSTOMERS_BY_NAME[c["name"].lower().strip()] = c
    return result.data


def load_items() -> list[dict]:
    result = (
        supabase.table("items")
        .select("id, sku, name, description, item_variants(id, variant_code, variant_name, notes)")
        .eq("active", True)
        .eq("organization_id", ORGANIZATION_ID)
        .order("name")
        .execute()
    )
    for item in result.data:
        ITEMS_BY_ID[item["id"]] = item
        for v in item.get("item_variants", []):
            VARIANTS_BY_ID[v["id"]] = {**v, "item_id": item["id"], "item_name": item["name"]}
    return result.data


def load_customer_item_notes() -> dict[str, list[dict]]:
    result = (
        supabase.table("customer_item_notes")
        .select("customer_id, item_name, note")
        .execute()
    )
    notes_by_customer: dict[str, list[dict]] = {}
    for n in result.data:
        notes_by_customer.setdefault(n["customer_id"], []).append(
            {"item_name": n["item_name"], "note": n["note"]}
        )
    return notes_by_customer


def get_customers_with_orders(delivery_date: str) -> set[str]:
    """Return set of customer_ids that already have a non-cancelled order for this date."""
    data = (
        supabase.table("orders")
        .select("customer_id")
        .eq("organization_id", ORGANIZATION_ID)
        .eq("delivery_date", delivery_date)
        .neq("status", "cancelled")
        .execute()
    ).data
    return {row["customer_id"] for row in data}


def filter_section_rows(section: dict) -> tuple[list[list], list[dict]]:
    """
    Pre-filter a section's rows to remove customers that already have orders.
    Returns (filtered_rows, pre_skipped) where pre_skipped is a list of
    {customer_name, delivery_date, existing} for the summary report.
    """
    delivery_date = section["iso_date"]
    existing_customer_ids = get_customers_with_orders(delivery_date)

    # Build set of customer names that already have orders
    existing_names: set[str] = set()
    for cid in existing_customer_ids:
        c = CUSTOMERS_BY_ID.get(cid)
        if c:
            existing_names.add(c["name"].lower().strip())

    filtered_rows = []
    pre_skipped: list[dict] = []
    skipped_names_seen: set[str] = set()

    for row in section["rows"]:
        customer_name = (row[0] if row else "").strip()
        customer_lower = customer_name.lower()

        # Check if this customer already has an order
        if customer_lower in existing_names:
            if customer_lower not in skipped_names_seen:
                skipped_names_seen.add(customer_lower)
                pre_skipped.append({
                    "customer_name": customer_name,
                    "delivery_date": delivery_date,
                    "reason": "existing_order",
                })
            continue

        filtered_rows.append(row)

    return filtered_rows, pre_skipped


# ─── Google Sheets via Composio MCP ─────────────────────────────────────────


def parse_date_string(date_str: str) -> str | None:
    """Parse 'Friday, August 15, 2025' → '2025-08-15'."""
    import re
    # Strip leading day name
    cleaned = re.sub(r"^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*", "", date_str, flags=re.IGNORECASE)
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(cleaned.strip(), fmt)
            return d.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


async def read_sheet_for_day(session: ClientSession, spreadsheet_id: str, target_day: str, window_days: int = 7) -> list[dict]:
    """
    Read the ORDERS tab and extract order rows for dates within the window
    (today .. today + window_days) for the given day (tuesday/wednesday/friday).

    Returns: list of {date: str, iso_date: str, rows: [[customer, product, size, qty], ...]}
    """
    day_label = f"{target_day.capitalize()} Harvests"
    today = date.today().isoformat()

    print(f'  Looking for "{day_label}" section...')

    # Pass 1: Scan in chunks to find the day section header and boundaries.
    # The sheet has 27k+ rows so we read in 10k-row chunks to avoid huge payloads.
    CHUNK_SIZE = 10000
    section_start = -1
    section_end = -1
    header_rows: list[list] = []
    chunk_offset = 0

    while True:
        range_start = chunk_offset + 1
        range_end = chunk_offset + CHUNK_SIZE
        range_str = f"{SHEET_NAME}!C{range_start}:E{range_end}"

        result = await session.call_tool(
            "GOOGLESHEETS_BATCH_GET",
            arguments={
                "spreadsheet_id": spreadsheet_id,
                "ranges": [range_str],
            },
        )

        chunk_rows = _parse_mcp_result(result)
        if not chunk_rows:
            break

        # Scan this chunk for section boundaries
        for i, row in enumerate(chunk_rows):
            global_i = chunk_offset + i
            row_text = " ".join(str(c or "").strip() for c in row)

            if section_start == -1:
                if day_label.lower() in row_text.lower():
                    section_start = global_i
            else:
                if "harvests" in row_text.lower() and target_day.lower() not in row_text.lower():
                    section_end = global_i
                    break

        header_rows.extend(chunk_rows)
        chunk_offset += len(chunk_rows)

        # If we found both boundaries, or we've found the start and hit end of data, stop
        if section_end >= 0:
            break
        # If we got fewer rows than the chunk size, we've hit the end of the sheet
        if len(chunk_rows) < CHUNK_SIZE:
            break

        print(f"  Scanned {chunk_offset} rows so far...")

    if section_start == -1:
        raise RuntimeError(f'Section "{day_label}" not found in spreadsheet')

    if section_end == -1:
        section_end = len(header_rows)

    print(f"  Read {len(header_rows)} header rows")
    print(f'  Found "{day_label}" at rows {section_start + 1}–{section_end}')

    # Parse date sections within the day section
    date_sections: list[dict] = []

    for i in range(section_start + 1, section_end):
        row = header_rows[i] if i < len(header_rows) else []
        cells = [str(c or "").strip() for c in row]
        combined = " ".join(cells).strip()

        iso_date = (
            parse_date_string(combined)
            or parse_date_string(cells[1] if len(cells) > 1 else "")
            or parse_date_string(cells[2] if len(cells) > 2 else "")
        )
        if iso_date:
            date_sections.append({"date": combined, "iso_date": iso_date, "row_index": i})

    print(f"  Found {len(date_sections)} date sections")

    if not date_sections:
        raise RuntimeError(f'No date sections found within "{day_label}"')

    # Find dates within the window (today .. today+window_days)
    end_date = (date.today() + timedelta(days=window_days)).isoformat()
    in_window = [s for s in date_sections if today <= s["iso_date"] <= end_date]
    if not in_window:
        print(f"  No dates found in window {today} to {end_date}. Using most recent date.")
        in_window = [date_sections[-1]]

    print(f"  Dates in window: {', '.join(s['iso_date'] for s in in_window)}")

    # Read order data for each date in the window
    results = []
    for target in in_window:
        target_idx = date_sections.index(target)
        data_start_row = target["row_index"] + 1
        if target_idx + 1 < len(date_sections):
            data_end_row = date_sections[target_idx + 1]["row_index"]
        else:
            data_end_row = section_end

        sheet_start = data_start_row + 1
        sheet_end = data_end_row + 1

        print(f"  Reading {target['iso_date']} from rows {sheet_start}–{sheet_end}...")

        data_result = await session.call_tool(
            "GOOGLESHEETS_BATCH_GET",
            arguments={
                "spreadsheet_id": spreadsheet_id,
                "ranges": [f"{SHEET_NAME}!D{sheet_start}:G{sheet_end}"],
            },
        )

        data_rows = _parse_mcp_result(data_result)

        # Filter out empty rows, header rows, and section labels
        order_rows = []
        for row in data_rows:
            if not row or len(row) < 2:
                continue
            first = str(row[0] or "").strip().lower()
            if not first or first == "customer" or first == "one-time orders":
                continue
            order_rows.append([str(c or "").strip() for c in row])

        print(f"  {target['iso_date']}: {len(order_rows)} order rows")
        if order_rows:
            print(f"    First customer: {order_rows[0][0]}")
            print(f"    Last customer:  {order_rows[-1][0]}")

        results.append({
            "date": target["date"],
            "iso_date": target["iso_date"],
            "rows": order_rows,
        })

    return results


def _parse_mcp_result(result) -> list[list]:
    """Extract 2D array from MCP tool result."""
    for block in result.content:
        if hasattr(block, "text") and block.text:
            try:
                parsed = json.loads(block.text)
                if isinstance(parsed, list):
                    return parsed
                if isinstance(parsed, dict):
                    if "values" in parsed:
                        return parsed["values"]
                    if "valueRanges" in parsed:
                        ranges = parsed["valueRanges"]
                        return ranges[0].get("values", []) if ranges else []
                    if "data" in parsed and isinstance(parsed["data"], dict):
                        if "values" in parsed["data"]:
                            return parsed["data"]["values"]
                        if "valueRanges" in parsed["data"]:
                            ranges = parsed["data"]["valueRanges"]
                            return ranges[0].get("values", []) if ranges else []
                    # Log unexpected structure
                    print(f"  [debug] Unexpected MCP result: {json.dumps(parsed)[:500]}")
            except json.JSONDecodeError:
                # Tab-separated text fallback
                return [line.split("\t") for line in block.text.split("\n")]
    return []


# ─── Tool Definitions ───────────────────────────────────────────────────────

ORDER_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "item_id": {"type": "string", "description": "Item UUID from the catalog"},
        "variant_id": {"type": "string", "description": "Variant UUID from the catalog"},
        "quantity": {"type": "number"},
    },
    "required": ["item_id", "variant_id", "quantity"],
}

TOOLS = [
    {
        "name": "get_existing_orders",
        "description": (
            "Check if a customer already has an order for a specific delivery date. "
            "If an order already exists, SKIP that customer — do not create a duplicate."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string", "description": "The customer UUID"},
                "delivery_date": {
                    "type": "string",
                    "description": "The delivery date to check (YYYY-MM-DD)",
                },
            },
            "required": ["customer_id", "delivery_date"],
        },
    },
    {
        "name": "create_order",
        "description": (
            "Create a new order directly in the system. Only call this if "
            "get_existing_orders returned NO existing order for this customer + date."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string"},
                "delivery_date": {"type": "string", "description": "YYYY-MM-DD"},
                "items": {"type": "array", "items": ORDER_ITEM_SCHEMA},
            },
            "required": ["customer_id", "delivery_date", "items"],
        },
    },
]


# ─── System Prompt ──────────────────────────────────────────────────────────


def build_system_prompt(
    customers: list[dict],
    items: list[dict],
    notes_by_customer: dict[str, list[dict]],
) -> str:
    customer_lines = []
    for c in customers:
        line = f"  {c['name']} (id: {c['id']})"
        if c.get("email"):
            line += f" email: {c['email']}"
        if c.get("phone"):
            line += f" phone: {c['phone']}"
        if c.get("notes"):
            line += f" -- {c['notes']}"
        notes = notes_by_customer.get(c["id"], [])
        if notes:
            notes_str = "; ".join(f"{n['item_name']}: {n['note']}" for n in notes)
            line += f"\n    Item notes: {notes_str}"
        customer_lines.append(line)

    item_lines = []
    for item in items:
        variants = item.get("item_variants", [])
        variant_str = ", ".join(
            f"{v['variant_code']}={v['variant_name']} (id:{v['id']})"
            for v in sorted(variants, key=lambda v: v["variant_code"])
        )
        item_lines.append(
            f"  {item['name']} [SKU: {item['sku']}] (id: {item['id']}) -> variants: {variant_str}"
        )

    return f"""You are Frootful's order processing agent for Boston Microgreens.
You are processing orders from the Google Sheets ERP spreadsheet. The data contains rows with Customer, Product, Size, and Qty columns.

These are AUTHORITATIVE orders from the ERP — create them directly (not as proposals).

CUSTOMERS:
{chr(10).join(customer_lines)}

ITEMS & VARIANTS:
{chr(10).join(item_lines)}

YOUR WORKFLOW:
1. Read ALL the spreadsheet rows provided
2. Group rows by customer — each customer's items for this delivery date form ONE order
3. For each customer:
   a. Match the customer name to the CUSTOMERS list above (fuzzy match is OK)
   b. Match each product to the ITEMS list above — use exact item IDs and variant IDs
   c. Map the Size column to variant: S = Small, L = Large, T20 = Tray 20
   d. Call get_existing_orders to check if an order already exists for this customer + delivery date
   e. If an order ALREADY EXISTS → SKIP this customer (do not create a duplicate)
   f. If NO existing order → call create_order with ALL items for this customer
4. Continue until ALL customers have been processed

RULES:
- Variants: S = Small, L = Large, T20 = Tray 20
  "small" or "S" → S variant, "large" or "L" → L variant, "tray" or "T20" → T20 variant
- If no size/variant specified, default to S (Small)
- The delivery date is provided in the data header — use it as-is (already in YYYY-MM-DD format)
- Process EVERY customer in the data. Do not skip any (unless they already have an order).
- If a customer name doesn't exactly match the list, use your best judgment to match it
- If a product doesn't exactly match, use your best judgment — look at the item name and SKU
- Today's date is {date.today().isoformat()}

Be concise. Match, check existing orders, create ALL new orders."""


# ─── Tool Execution ─────────────────────────────────────────────────────────


def _resolve_customer(customer_id: str) -> str:
    c = CUSTOMERS_BY_ID.get(customer_id)
    return c["name"] if c else "Unknown"


def _resolve_item(item_id: str, variant_id: str) -> tuple[str, str]:
    item = ITEMS_BY_ID.get(item_id)
    variant = VARIANTS_BY_ID.get(variant_id)
    return (item["name"] if item else "Unknown", variant["variant_code"] if variant else "?")


def execute_tool(name: str, tool_input: dict) -> dict:
    if name == "get_existing_orders":
        if not tool_input.get("customer_id") or not tool_input.get("delivery_date"):
            return {"error": "Missing required fields: customer_id and delivery_date are required"}
        return _exec_get_existing_orders(tool_input)
    elif name == "create_order":
        if not tool_input.get("customer_id"):
            return {"error": "Missing required field: customer_id. Please provide the customer UUID."}
        if not tool_input.get("delivery_date"):
            return {"error": "Missing required field: delivery_date. Please provide YYYY-MM-DD."}
        if not tool_input.get("items"):
            return {"error": "Missing required field: items. Please provide the list of items."}
        return _exec_create_order(tool_input)
    else:
        return {"error": f"Unknown tool: {name}"}


def _exec_get_existing_orders(params: dict) -> list:
    customer_name = _resolve_customer(params["customer_id"])
    print(f"    [get_existing_orders] customer={customer_name}, date={params['delivery_date']}")

    data = (
        supabase.table("orders")
        .select("id, delivery_date, status, order_lines(id, item_id, quantity, item_variant_id)")
        .eq("customer_id", params["customer_id"])
        .eq("organization_id", ORGANIZATION_ID)
        .eq("delivery_date", params["delivery_date"])
        .neq("status", "cancelled")
        .execute()
    ).data

    print(f"    Found {len(data)} existing orders")
    return data


def _exec_create_order(params: dict) -> dict:
    customer_id = params["customer_id"]
    customer_name = _resolve_customer(customer_id)
    items_list = params.get("items", [])
    delivery_date = params["delivery_date"]
    print(f"    [create_order] customer={customer_name}, date={delivery_date}, items={len(items_list)}")

    # Insert order
    order = (
        supabase.table("orders")
        .insert({
            "organization_id": ORGANIZATION_ID,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "delivery_date": delivery_date,
            "status": "ready",
            "source_channel": "erp",
        })
        .execute()
    ).data[0]
    order_id = order["id"]

    # Insert order lines
    for i, item in enumerate(items_list):
        item_name, variant_code = _resolve_item(item["item_id"], item["variant_id"])
        supabase.table("order_lines").insert({
            "order_id": order_id,
            "line_number": i + 1,
            "item_id": item["item_id"],
            "item_variant_id": item["variant_id"],
            "product_name": item_name,
            "quantity": item["quantity"],
        }).execute()

    # Insert order event
    supabase.table("order_events").insert({
        "order_id": order_id,
        "type": "created",
        "metadata": {"source": "sheets_agent", "source_channel": "erp"},
    }).execute()

    return {
        "order_id": order_id,
        "customer_name": customer_name,
        "delivery_date": delivery_date,
        "lines_created": len(items_list),
    }


# ─── Agent Loop ─────────────────────────────────────────────────────────────


def format_sheet_data(section: dict) -> str:
    output = f"DELIVERY DATE: {section['date']} ({section['iso_date']})\n\n"
    output += "Customer | Product | Size | Qty\n"
    output += "─" * 60 + "\n"
    for row in section["rows"]:
        customer = row[0] if len(row) > 0 else ""
        product = row[1] if len(row) > 1 else ""
        size = row[2] if len(row) > 2 else ""
        qty = row[3] if len(row) > 3 else ""
        output += f"{customer} | {product} | {size} | {qty}\n"
    return output


def run_agent_loop(system_prompt: str, user_message: str) -> dict:
    messages = [{"role": "user", "content": user_message}]
    max_turns = 100

    created: list[dict] = []    # successful create_order results
    skipped: list[dict] = []    # customers with existing orders
    errors: list[dict] = []     # failed tool calls

    for turn in range(1, max_turns + 1):
        print(f"\n  Turn {turn}")

        response = claude.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=8192,
            system=system_prompt,
            tools=TOOLS,
            messages=messages,
        )

        messages.append({"role": "assistant", "content": response.content})

        for block in response.content:
            if block.type == "text" and block.text.strip():
                print(f"  Claude: {block.text[:300]}")

        if response.stop_reason == "end_turn":
            print(f"\n  Agent finished in {turn} turns")
            print(f"  Input tokens: {response.usage.input_tokens}")
            print(f"  Output tokens: {response.usage.output_tokens}")
            return {"success": True, "turns": turn, "created": created, "skipped": skipped, "errors": errors}

        # Execute tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                print(f"  Tool: {block.name}({json.dumps(block.input)[:150]})")

                try:
                    result = execute_tool(block.name, block.input)
                    result_str = json.dumps(result, default=str)
                    display = result_str[:200] + "..." if len(result_str) > 200 else result_str
                    print(f"  Result: {display}")

                    if block.name == "create_order":
                        if "error" in result:
                            customer_name = _resolve_customer(block.input.get("customer_id", "")) if block.input.get("customer_id") else "Unknown"
                            errors.append({"tool": block.name, "customer_name": customer_name, "input": block.input, "error": result["error"]})
                        else:
                            created.append(result)
                    elif block.name == "get_existing_orders" and isinstance(result, list) and len(result) > 0:
                        customer_name = _resolve_customer(block.input.get("customer_id", ""))
                        skipped.append({"customer_name": customer_name, "delivery_date": block.input.get("delivery_date"), "existing_order_id": result[0]["id"]})
                except Exception as e:
                    result_str = json.dumps({"error": str(e)})
                    print(f"  Error: {e}")
                    customer_name = _resolve_customer(block.input.get("customer_id", "")) if block.input.get("customer_id") else "Unknown"
                    errors.append({"tool": block.name, "customer_name": customer_name, "input": block.input, "error": str(e)})

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result_str,
                })

        messages.append({"role": "user", "content": tool_results})

    return {"success": False, "turns": max_turns, "created": created, "skipped": skipped, "errors": errors, "error": "max_turns_reached"}


# ─── Main ───────────────────────────────────────────────────────────────────


async def main():
    HARVEST_DAYS = ("tuesday", "wednesday", "friday")

    # Parse CLI args
    window_days = 7
    if "--days" in sys.argv:
        idx = sys.argv.index("--days")
        if idx + 1 < len(sys.argv):
            window_days = int(sys.argv[idx + 1])

    # Optional: filter to specific day(s)
    selected_days = list(HARVEST_DAYS)
    if "--day" in sys.argv:
        idx = sys.argv.index("--day")
        if idx + 1 < len(sys.argv):
            day = sys.argv[idx + 1].lower()
            if day not in HARVEST_DAYS:
                print(f"Day must be one of: {', '.join(HARVEST_DAYS)}")
                sys.exit(1)
            selected_days = [day]

    today = date.today()
    end_date = today + timedelta(days=window_days)

    print("=" * 60)
    print("FROOTFUL SHEETS ORDER AGENT")
    print("=" * 60)
    env_label = "PRODUCTION" if IS_PROD else "STAGING"
    print(f"\nEnvironment: {env_label} ({SUPABASE_URL})")
    print(f"Date window: {today.isoformat()} to {end_date.isoformat()} ({window_days} days)")
    print(f"Harvest days: {', '.join(d.capitalize() for d in selected_days)}")

    # Step 1: Connect to Composio MCP and read sheet data for all days
    print("\n1. Connecting to Google Sheets via Composio MCP...")

    all_sections: list[tuple[str, dict]] = []  # (day, section)

    async with streamablehttp_client(
        url=COMPOSIO_MCP_URL,
        headers={"x-api-key": COMPOSIO_API_KEY},
    ) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools = await session.list_tools()
            print(f"   Connected. {len(tools.tools)} tools available.")

            for day in selected_days:
                print(f"\n2. Reading ORDERS tab for {day.capitalize()}...")
                sections = await read_sheet_for_day(session, SPREADSHEET_ID, day, window_days)
                for section in sections:
                    if section["rows"]:
                        all_sections.append((day, section))

    if not all_sections:
        print("\n   No orders found in the date window. Nothing to process.")
        sys.exit(0)

    # Print all results
    total_rows = 0
    for day, section in all_sections:
        formatted_data = format_sheet_data(section)
        print(f"\n{'─' * 60}")
        print(f"  {day.capitalize()} Harvest")
        print(f"{'─' * 60}")
        print(formatted_data)
        total_rows += len(section["rows"])

    # Step 2: Load catalogs
    print("\n3. Loading catalogs from Supabase...")
    customers = load_customers()
    items = load_items()
    notes_by_customer = load_customer_item_notes()
    print(f"   {len(customers)} customers, {len(items)} items")

    # Step 3: Pre-filter — remove customers that already have orders
    print("\n4. Pre-filtering customers with existing orders...")
    all_created: list[dict] = []
    all_skipped: list[dict] = []
    all_errors: list[dict] = []
    section_results: list[dict] = []

    filtered_sections: list[tuple[str, dict]] = []
    for day, section in all_sections:
        filtered_rows, pre_skipped = filter_section_rows(section)
        all_skipped.extend(pre_skipped)

        if pre_skipped:
            print(f"   {day.capitalize()} {section['iso_date']}: {len(pre_skipped)} customers already have orders (pre-skipped)")

        if filtered_rows:
            # Replace section rows with filtered rows
            filtered_section = {**section, "rows": filtered_rows}
            filtered_sections.append((day, filtered_section))

            # Show unique customer names that need orders
            unique_customers = sorted(set(row[0].strip() for row in filtered_rows if row))
            print(f"   {day.capitalize()} {section['iso_date']}: {len(unique_customers)} customers need orders: {', '.join(unique_customers)}")
        else:
            print(f"   {day.capitalize()} {section['iso_date']}: all customers already have orders — nothing to do")
            section_results.append({
                "day": day,
                "date": section["iso_date"],
                "rows": len(section["rows"]),
                "created": 0,
                "skipped": len(pre_skipped),
                "errors": 0,
                "success": True,
                "turns": 0,
            })

    if not filtered_sections:
        print("\n   All customers already have orders. Nothing to process.")
    else:
        # Step 4: Run agent loop only for sections with unprocessed customers
        system_prompt = build_system_prompt(customers, items, notes_by_customer)

        for day, section in filtered_sections:
            print(f"\n5. Running agent for {day.capitalize()} {section['iso_date']} ({len(section['rows'])} rows)...")
            user_message = (
                f"Process ALL orders from this spreadsheet data. Create one order per customer.\n\n"
                f"{format_sheet_data(section)}\n\n"
                f"Instructions:\n"
                f"- The delivery date for all orders is: {section['iso_date']}\n"
                f"- Process EVERY customer row. Do not skip any.\n"
                f"- For each customer, call create_order with ALL items for that customer.\n"
                f"- Group all items for the same customer into a single create_order call.\n"
                f"- These customers have been pre-verified to NOT have existing orders, so you can create orders directly without checking first."
            )
            result = run_agent_loop(system_prompt, user_message)

            created = result.get("created", [])
            skipped_list = result.get("skipped", [])
            error_list = result.get("errors", [])

            all_created.extend(created)
            all_skipped.extend(skipped_list)
            all_errors.extend(error_list)
            section_results.append({
                "day": day,
                "date": section["iso_date"],
                "rows": len(section["rows"]),
                "created": len(created),
                "skipped": len(skipped_list),
                "errors": len(error_list),
                "success": result.get("success", False),
                "turns": result.get("turns", 0),
            })

            if not result["success"]:
                print(f"  FAILED for {day} {section['iso_date']}: {result.get('error')}")

    # ─── Summary Report ──────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  SUMMARY REPORT")
    print("=" * 60)

    # Per-section breakdown
    for sr in section_results:
        status = "OK" if sr["success"] else "FAILED"
        print(f"\n  {sr['day'].capitalize()} {sr['date']} [{status}]")
        print(f"    Sheet rows: {sr['rows']} | Orders created: {sr['created']} | Skipped (existing): {sr['skipped']} | Errors: {sr['errors']} | Turns: {sr['turns']}")

    # Created orders detail
    if all_created:
        print(f"\n  ORDERS CREATED ({len(all_created)}):")
        for o in all_created:
            print(f"    {o['customer_name']:30s} | {o['delivery_date']} | {o['lines_created']} items | order_id: {o['order_id']}")

    # Skipped (existing orders)
    if all_skipped:
        print(f"\n  SKIPPED — EXISTING ORDER ({len(all_skipped)}):")
        for s in all_skipped:
            print(f"    {s['customer_name']:30s} | {s['delivery_date']}")

    # Errors
    if all_errors:
        print(f"\n  ERRORS ({len(all_errors)}):")
        for e in all_errors:
            customer = e.get("customer_name", "Unknown")
            delivery = e.get("input", {}).get("delivery_date", "?")
            print(f"    {customer:30s} | {delivery} | {e['tool']}: {e['error']}")

    # Totals
    print(f"\n  {'─' * 56}")
    print(f"  Total: {len(all_created)} created, {len(all_skipped)} skipped, {len(all_errors)} errors")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
