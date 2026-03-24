"""
Chainlit chat app with WebFlor MCP tools.
Run: cd chat-app && uv run chainlit run chainlit_app.py -w
"""

import asyncio
import json
import os
import sys

from dotenv import load_dotenv
load_dotenv()

import anthropic
import chainlit as cl

# ─── Langfuse tracing (hybrid: Langfuse SDK root + OTel Anthropic child) ─────
from langfuse import get_client, propagate_attributes
from opentelemetry.instrumentation.anthropic import AnthropicInstrumentor

_lf_pub = os.getenv("LANGFUSE_PUBLIC_KEY", "")
_lf_sec = os.getenv("LANGFUSE_SECRET_KEY", "")
_lf_host = os.getenv("LANGFUSE_HOST") or os.getenv("LANGFUSE_BASE_URL") or "https://cloud.langfuse.com"

_langfuse = None
if _lf_pub and _lf_sec:
    # Langfuse SDK reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST from env
    # Ensure LANGFUSE_HOST is set (fallback from LANGFUSE_BASE_URL)
    if not os.getenv("LANGFUSE_HOST") and os.getenv("LANGFUSE_BASE_URL"):
        os.environ["LANGFUSE_HOST"] = os.getenv("LANGFUSE_BASE_URL")
    _langfuse = get_client()
    AnthropicInstrumentor().instrument()
    print(f"[langfuse] Hybrid tracing enabled (Langfuse SDK + AnthropicInstrumentor)")

from webflor_auth import ensure_session, webflor_fetch, _order_link

# ─── Tool definitions for Claude ──────────────────────────────────────────

TOOLS = [
    {
        "name": "get_current_time",
        "description": "Get the current date and time in Colombia (UTC-5). Call this whenever you need to know today's date, the current time, or day of the week.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "list_recent_orders",
        "description": "List recent orders for a customer. Returns order headers sorted newest first. Use date_from/date_to to filter by delivery date range.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "integer", "description": "WebFlor IdCliente"},
                "company_id": {"type": "integer", "description": "WebFlor company ID (default 1)", "default": 1},
                "max_results": {"type": "integer", "description": "Max orders to return", "default": 10},
                "date_from": {"type": "string", "description": "Start of delivery date range (YYYY-MM-DD). Optional."},
                "date_to": {"type": "string", "description": "End of delivery date range (YYYY-MM-DD). Optional."},
                "status_filter": {"type": "string", "description": "Filter by order status (e.g. 'En proceso', 'Pendiente', 'Confirmado'). Case-insensitive partial match. Optional."},
            },
            "required": ["client_id"],
        },
    },
    {
        "name": "search_customers",
        "description": "Search customers by name (case-insensitive substring match). Returns matching customers with IdCliente, NomCliente, Codigo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Customer name to search for"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_order_with_items",
        "description": "Get a complete order (header + all line items) in one call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "WebFlor order ID (IdPedido)"},
            },
            "required": ["order_id"],
        },
    },
    {
        "name": "get_order_link",
        "description": "Get a direct URL link to view an order in the WebFlor web interface.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "integer", "description": "WebFlor order ID"},
            },
            "required": ["order_id"],
        },
    },
    {
        "name": "copy_order",
        "description": "Copy an existing order to create a new one with different dates. All items, quantities, prices, recipes, marca, finca copy over. Date format: MM/DD/YYYY.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source_order_id": {"type": "integer"},
                "client_id": {"type": "integer"},
                "branch_id": {"type": "integer", "description": "IdClienteSucursal — use get_customer_branches to find it"},
                "order_date": {"type": "string", "description": "MM/DD/YYYY"},
                "delivery_date": {"type": "string", "description": "MM/DD/YYYY"},
                "arrival_date": {"type": "string", "description": "MM/DD/YYYY"},
                "company_id": {"type": "integer", "description": "WebFlor company ID (default 1)", "default": 1},
                "sale_type_id": {"type": "integer", "description": "Sale type ID (default 1)", "default": 1},
                "user_id": {"type": "string", "description": "WebFlor user ID for audit (default '6109')", "default": "6109"},
            },
            "required": ["source_order_id", "client_id", "branch_id", "order_date", "delivery_date", "arrival_date"],
        },
    },
    {
        "name": "search_orders",
        "description": "Search orders by PO number, optionally filtering by date range and/or customer. If no date range given, searches from today through the next 30 days. Returns matching order headers with IdPedido, PO, dates, status, boxes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "po_number": {"type": "string", "description": "PO number to search for (e.g. 'PO029916'). Case-insensitive partial match."},
                "client_id": {"type": "integer", "description": "Optional WebFlor IdCliente to narrow search to a specific customer. Use 0 or omit to search all customers."},
                "company_id": {"type": "integer", "description": "WebFlor company ID (default 1)", "default": 1},
                "date_from": {"type": "string", "description": "Optional start date (YYYY-MM-DD). Defaults to 30 days ago."},
                "date_to": {"type": "string", "description": "Optional end date (YYYY-MM-DD). Defaults to 30 days from today."},
            },
            "required": ["po_number"],
        },
    },
    {
        "name": "get_customer_branches",
        "description": "List branches (sucursales) for a customer. Returns branch IDs, names, and which is the default. Needed for copy_order (branch_id = IdClienteSucursal).",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "integer", "description": "WebFlor IdCliente"},
            },
            "required": ["client_id"],
        },
    },
    {
        "name": "update_order",
        "description": "Update an existing order header (dates, PO, comments, etc). First call get_order_with_items to get the full order object, modify the fields you need, then pass the whole header object here.",
        "input_schema": {
            "type": "object",
            "properties": {
                "body": {"type": "object", "description": "Full order header object with modifications. Must include IdPedido."},
            },
            "required": ["body"],
        },
    },
    {
        "name": "update_order_status",
        "description": "Update an order's status (e.g. 'En proceso', 'Pendiente', 'Confirmado').",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "integer", "description": "WebFlor order ID"},
                "status": {"type": "string", "description": "New status (e.g. 'En proceso', 'Pendiente', 'Confirmado')"},
                "user_id": {"type": "integer", "description": "Audit user ID (default 6109)", "default": 6109},
            },
            "required": ["order_id", "status"],
        },
    },
    {
        "name": "update_order_item",
        "description": "Update an existing order item in place. Get the item first via get_order_with_items, modify fields, then pass the whole item object here. Uses PUT V1/editarOrdenIt. WARNING: Do NOT use guardarOrdenIt — it creates duplicates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "body": {"type": "object", "description": "Full order item object with modifications. Must include IdPedidoItem."},
            },
            "required": ["body"],
        },
    },
    {
        "name": "update_order_flower",
        "description": "Update an existing flower recipe row. Get flowers first via get_order_item_flowers, modify fields, then pass the whole flower object here. Must include IdPedidoItemFlor (row PK).",
        "input_schema": {
            "type": "object",
            "properties": {
                "body": {"type": "object", "description": "Full flower row object with modifications. Must include IdPedidoItemFlor and IdPedidoItem."},
            },
            "required": ["body"],
        },
    },
    {
        "name": "update_order_recipe",
        "description": "Update an existing recipe container (for ManejaReceta=2 items). Get recipes first via get_order_item_recipes, modify fields, then pass the whole recipe object here.",
        "input_schema": {
            "type": "object",
            "properties": {
                "body": {"type": "object", "description": "Full recipe object with modifications. Must include IdPedidoItemReceta and IdPedidoItem."},
            },
            "required": ["body"],
        },
    },
    {
        "name": "delete_order_item",
        "description": "Delete an order item (line) from a WebFlor order.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_item_id": {"type": "integer", "description": "WebFlor IdPedidoItem"},
                "order_id": {"type": "integer", "description": "WebFlor IdPedido"},
                "user_id": {"type": "integer", "description": "Audit user ID (default 6109)", "default": 6109},
            },
            "required": ["order_item_id", "order_id"],
        },
    },
    {
        "name": "get_week",
        "description": "Look up the WebFlor week number for a date, or get the date range for a week number. The floral industry operates on week numbers (Semana). Input: a date (YYYY-MM-DD) or a week number (e.g. '12').",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_or_week": {"type": "string", "description": "A date (YYYY-MM-DD) or week number (e.g. '12')"},
            },
            "required": ["date_or_week"],
        },
    },
    {
        "name": "get_order_item_recipes",
        "description": "Get named recipe containers for a multi-recipe order item (ManejaReceta=2, e.g. bouquets). Returns IdPedidoItemReceta, NombreReceta, CantidadRamos, UPC, TotalFlor, PrecioRamo. Use with get_order_item_flowers to drill into each container.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_item_id": {"type": "string", "description": "WebFlor IdPedidoItem"},
            },
            "required": ["order_item_id"],
        },
    },
    {
        "name": "get_order_item_flowers",
        "description": "Get flower recipe rows for a specific order item. For simple recipes (ManejaReceta=1), use receta_id='0'. For multi-recipe (ManejaReceta=2), first call get_order_item_recipes then pass each IdPedidoItemReceta.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_item_id": {"type": "string", "description": "WebFlor IdPedidoItem"},
                "receta_id": {"type": "string", "description": "Recipe container ID (default '0' for simple)", "default": "0"},
            },
            "required": ["order_item_id"],
        },
    },
    {
        "name": "get_order_item_materials",
        "description": "Get packaging materials (sleeves, wraps, food) for an order item. Returns NomMaterial, TipoMaterial, Cantidad.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_item_id": {"type": "string", "description": "WebFlor IdPedidoItem"},
                "receta_id": {"type": "string", "description": "Recipe container ID (default '0')", "default": "0"},
            },
            "required": ["order_item_id"],
        },
    },
]


# ─── Tool execution ───────────────────────────────────────────────────────

async def execute_tool(name: str, args: dict) -> str:
    if name == "get_current_time":
        from datetime import datetime, timedelta, timezone as tz
        COT = tz(timedelta(hours=-5))
        now = datetime.now(COT)
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        cal = []
        for i in range(14):
            d = now + timedelta(days=i)
            dow = day_names[d.weekday()]
            label = " (TODAY)" if i == 0 else " (this week)" if i < 7 else " (next week)"
            cal.append(f"  {dow} {d.strftime('%Y-%m-%d')}{label}")
        return f"Current time: {day_names[now.weekday()]} {now.strftime('%Y-%m-%d %H:%M')} (Colombia Time, UTC-5)\n\nNext 14 days:\n" + "\n".join(cal)

    elif name == "list_recent_orders":
        client_id = args["client_id"]
        max_results = args.get("max_results", 10)
        date_from = args.get("date_from")
        date_to = args.get("date_to")
        if date_from and date_to:
            filtro_fecha = "15"
            fecha_inicial = date_from
            fecha_final = date_to
        else:
            filtro_fecha = "0"
            fecha_inicial = "1900-01-01"
            fecha_final = "3000-01-01"
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarOrdenes",
            params={
                "iIdCliente": str(client_id),
                "iIdCompania": str(args.get("company_id", 1)),
                "iIdConsolidador": "0",
                "iIdVendedor": "0",
                "iIdFiltroFecha": filtro_fecha,
                "fechaInicial": fecha_inicial,
                "fechaFinal": fecha_final,
                "pickModulo": "131",
                "ManejaInventario": "0",
                "iIdVariedad": "0",
            },
        )
        if isinstance(data, list):
            data.sort(key=lambda x: x.get("IdPedido", 0), reverse=True)
            status_filter = args.get("status_filter", "")
            if status_filter:
                sf = status_filter.lower()
                data = [o for o in data if sf in str(o.get("Estado", "")).lower()]
            data = data[:max_results]
        return json.dumps(data, indent=2)

    elif name == "search_customers":
        import csv
        query = args["query"].lower().strip()
        query_words = query.split()
        data_dir = os.getenv("DATA_DIR") or os.path.join(os.path.dirname(__file__), "data")
        filepath = os.path.join(data_dir, "clientes.csv")
        scored = []
        with open(filepath, "r", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                searchable = f"{row.get('Codigo', '')} {row.get('IdCliente', '')} {row.get('NomCliente', '')} {row.get('NIT', '')}".lower()
                # Score: exact match on code/id > all words match > partial
                codigo = row.get("Codigo", "").lower()
                id_cliente = row.get("IdCliente", "").lower()
                if query == codigo or query == id_cliente:
                    score = 3  # exact code/id match
                elif all(w in searchable for w in query_words):
                    score = 2  # all words match
                elif any(w in searchable for w in query_words):
                    score = 1  # partial match
                else:
                    continue
                scored.append((score, {
                    "IdCliente": row.get("IdCliente"),
                    "NomCliente": row.get("NomCliente"),
                    "Codigo": row.get("Codigo"),
                    "NIT": row.get("NIT"),
                    "Estado": row.get("Estado"),
                }))
        scored.sort(key=lambda x: -x[0])
        matches = [m for _, m in scored[:20]]
        return json.dumps(matches, indent=2) if matches else f"No customers matching '{args['query']}'."

    elif name == "search_orders":
        from datetime import datetime, timedelta
        po_query = args["po_number"].lower().strip()
        client_id = args.get("client_id", 0) or 0
        today = datetime.now()
        date_from = args.get("date_from") or (today - timedelta(days=30)).strftime("%Y-%m-%d")
        date_to = args.get("date_to") or (today + timedelta(days=30)).strftime("%Y-%m-%d")

        data = await webflor_fetch(
            "/WebFlorVenta/API/listarOrdenes",
            params={
                "iIdCliente": str(client_id),
                "iIdCompania": str(args.get("company_id", 1)),
                "iIdConsolidador": "0",
                "iIdVendedor": "0",
                "iIdFiltroFecha": "15",
                "fechaInicial": date_from,
                "fechaFinal": date_to,
                "pickModulo": "131",
                "ManejaInventario": "0",
                "iIdVariedad": "0",
            },
        )
        if not isinstance(data, list):
            return json.dumps(data, indent=2)

        # Filter by PO number (partial, case-insensitive) — no extra API calls needed
        matches = [o for o in data if po_query in o.get("PO", "").lower()][:10]
        return json.dumps(matches, indent=2) if matches else f"No orders matching PO '{args['po_number']}' between {date_from} and {date_to}."

    elif name == "get_order_with_items":
        order_id = args["order_id"]
        hdr = await webflor_fetch("/WebFlorVenta/API/listarOrdenById", params={"iIdPedido": order_id})
        items = await webflor_fetch("/WebFlorVenta/API/listarDetalleOrdenByIdPedido", params={"iIdPedido": order_id})
        h = hdr[0] if isinstance(hdr, list) and hdr else {}
        return json.dumps({
            "header": h,
            "items": items if isinstance(items, list) else [],
        }, indent=2)

    elif name == "get_order_link":
        return _order_link(args["order_id"])

    elif name == "copy_order":
        body = {
            "iIdPedido": args["source_order_id"],
            "iIdUsuario": args.get("user_id", "6109"),
            "ajustes": {
                "IdCompania": args.get("company_id", 1),
                "IdCliente": args["client_id"],
                "IdClienteSucursal": args["branch_id"],
                "IdTipoVenta": args.get("sale_type_id", 1),
                "FechaOrden": args["order_date"],
                "FechaEntrega": args["delivery_date"],
                "FechaLlegada": args["arrival_date"],
            },
        }
        data = await webflor_fetch("/WebFlorVenta/API/copiarPedido_Ajustes", method="POST", body=body)
        if isinstance(data, dict):
            if data.get("IdPedido"):
                data["link"] = _order_link(data["IdPedido"])
        return json.dumps(data, indent=2)

    elif name == "get_customer_branches":
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarClienteSucursalesById",
            params={"iIdCliente": str(args["client_id"])},
        )
        return json.dumps(data, indent=2)

    elif name == "update_order":
        body = args["body"]
        data = await webflor_fetch("/WebFlorVenta/API/actualizarOrden", method="PUT", body=body)
        return json.dumps(data, indent=2)

    elif name == "update_order_status":
        body = {
            "IdPedido": args["order_id"],
            "Estado": args["status"],
            "IdUsuarioAuditoria": args.get("user_id", 6109),
        }
        data = await webflor_fetch("/WebFlorVenta/API/actualizarEstadoPedido", method="PUT", body=body)
        return json.dumps(data, indent=2)

    elif name == "update_order_item":
        body = args["body"]
        # Auto-inject write-field aliases (API quirk — editarOrdenIt uses different field names)
        if "PickTipoPrecio" in body and "PickTipoPrecioItem" not in body:
            body["PickTipoPrecioItem"] = body["PickTipoPrecio"]
        if "PickTipoOrden" in body and "PickTipoOrdenPUC" not in body:
            body["PickTipoOrdenPUC"] = body["PickTipoOrden"]
        data = await webflor_fetch("/WebFlorVenta/API/V1/editarOrdenIt", method="PUT", body=body)
        return json.dumps(data, indent=2)

    elif name == "update_order_flower":
        body = args["body"]
        if "PedidoItemFlorColor" not in body:
            body["PedidoItemFlorColor"] = []
        data = await webflor_fetch("/WebFlorVenta/API/editarOrdenFlor", method="PUT", body=body)
        return json.dumps(data, indent=2)

    elif name == "update_order_recipe":
        body = args["body"]
        data = await webflor_fetch("/WebFlorVenta/API/editarOrdenRec", method="PUT", body=body)
        return json.dumps(data, indent=2)

    elif name == "delete_order_item":
        body = {
            "IdPedidoItem": args["order_item_id"],
            "IdPedido": args["order_id"],
            "IdUsuarioAuditoria": args.get("user_id", 6109),
        }
        data = await webflor_fetch("/WebFlorVenta/API/eliminarOrdenItem", method="DELETE", body=body)
        return json.dumps(data, indent=2)

    elif name == "get_week":
        data_dir = os.getenv("DATA_DIR") or os.path.join(os.path.dirname(__file__), "data")
        filepath = os.path.join(data_dir, "semanas_2026.json")
        with open(filepath, "r") as f:
            semanas = json.load(f)
        date_or_week = args["date_or_week"]
        # Try as week number first
        try:
            week_num = int(date_or_week)
            for s in semanas:
                if s["NumSemana"] == week_num:
                    return json.dumps(s, indent=2)
            return json.dumps({"error": f"Week {week_num} not found"})
        except ValueError:
            pass
        # Try as date
        from datetime import date as Date
        try:
            d = Date.fromisoformat(date_or_week)
        except ValueError:
            return json.dumps({"error": f"Could not parse '{date_or_week}' as date or week number"})
        for s in semanas:
            inicio = Date.fromisoformat(s["inicio"])
            fin = Date.fromisoformat(s["fin"])
            if inicio <= d <= fin:
                return json.dumps(s, indent=2)
        return json.dumps({"error": f"Date {date_or_week} not in any known week"})

    elif name == "get_order_item_recipes":
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarOrdenRecByIdPedidoItem",
            params={"IdPedidoItem": args["order_item_id"]},
        )
        return json.dumps(data, indent=2)

    elif name == "get_order_item_flowers":
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarOrdenFlorById",
            params={"iIdPedidoItem": args["order_item_id"], "IdPedidoItemReceta": args.get("receta_id", "0")},
        )
        return json.dumps(data, indent=2)

    elif name == "get_order_item_materials":
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarOrdenMaterialById",
            params={"iIdPedidoItem": args["order_item_id"], "IdPedidoItemReceta": args.get("receta_id", "0")},
        )
        return json.dumps(data, indent=2)

    return f"Unknown tool: {name}"


# ─── Chainlit handlers ────────────────────────────────────────────────────

client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """You are a helpful assistant for La Gaitana Farms, a flower distributor in Colombia.
You have access to WebFlor ERP tools to look up orders, customers, and manage order operations.
Be concise and helpful. When showing orders, format them clearly.

You have a get_current_time tool — use it whenever you need today's date or the current time.

Users will tend to put in customer codes (Codigo). When processing requests, double check if the request is related to a codigo (e.g. 1142)

If asked to search for a PO number (a lot of them start with "PO"), try to first find all orders around 2 weeks ahead using the tools available. In other words, do something first. If that doesn't work try a little further. If that
still doesn't work, try asking the user for more information about the customer

When displaying order information, ALWAYS include confirmed boxes (CajaConfirmada) alongside total boxes (Cajas/CantidadCaja). If showing order items, call get_order_with_items to get item-level detail including CajaConfirmada per line. Show confirmed vs total boxes clearly, e.g. "Confirmed: 10/12 boxes".
"""


@cl.set_starters
async def set_starters():
    return [
                cl.Starter(label="Recent orders for 1018 in Webflor", message="Show me recent orders for customer 1018"),
        cl.Starter(label="Look up customer", message="Search for customer 1142 in WebFlor"),
        cl.Starter(label="Look up a PO", message="Help me look up a PO in WebFlor"),
        cl.Starter(label="Copy an order", message="I need to copy an order in WebFlor"),
    ]


@cl.on_chat_start
async def start():
    await ensure_session()
    cl.user_session.set("history", [])
    # Store session/thread ID for Langfuse tracing
    cl.user_session.set("thread_id", cl.context.session.thread_id)

    # Read Supabase user info from environ HTTP_REFERER (contains iframe src URL with query params)
    from urllib.parse import parse_qs, urlparse

    environ = getattr(cl.context.session, 'environ', {}) or {}
    referer = environ.get("HTTP_REFERER", "")
    query_params = parse_qs(urlparse(referer).query) if referer else {}

    user_id = query_params.get("user_id", [None])[0] or "anonymous"
    user_email = query_params.get("user_email", [None])[0] or ""
    user_name = query_params.get("user_name", [None])[0] or ""

    cl.user_session.set("user_id", user_id)
    cl.user_session.set("user_email", user_email)
    cl.user_session.set("user_name", user_name)
    print(f"[session] user_id={user_id} email={user_email} name={user_name} thread={cl.context.session.thread_id}")


@cl.on_message
async def main(message: cl.Message):
    history = cl.user_session.get("history", [])
    history.append({"role": "user", "content": message.content})

    # Langfuse root span with session/user + propagate to child OTel spans
    session_id = cl.user_session.get("thread_id", "unknown")
    user_id = cl.user_session.get("user_id", "anonymous")
    _root_span = None
    _root_span_cm = None
    _propagate_cm = None

    if _langfuse:
        _root_span_cm = _langfuse.start_as_current_observation(
            as_type="span",
            name="chat_message",
            input=message.content,
            metadata={
                "user_name": cl.user_session.get("user_name", ""),
                "user_email": cl.user_session.get("user_email", ""),
                "source": "chainlit-widget",
            },
        )
        _root_span = _root_span_cm.__enter__()
        _propagate_cm = propagate_attributes(
            user_id=user_id,
            session_id=session_id,
            tags=["chainlit-widget"],
        )
        _propagate_cm.__enter__()

    # Claude API call with tool loop
    try:
        while True:
            # Stream the response
            msg = cl.Message(content="")
            stream_started = False
            tool_use_blocks = []
            current_tool = None
            input_json = ""

            # Retry with backoff on transient API errors (overloaded, rate limit)
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    async with client.messages.stream(
                        model="claude-opus-4-6",
                        max_tokens=4096,
                        system=SYSTEM_PROMPT,
                        tools=TOOLS,
                        messages=history,
                    ) as stream:
                        async for event in stream:
                            # Stream text tokens
                            if event.type == "content_block_delta":
                                if hasattr(event.delta, "text"):
                                    if not stream_started:
                                        await msg.send()
                                        stream_started = True
                                    await msg.stream_token(event.delta.text)
                                elif hasattr(event.delta, "partial_json"):
                                    input_json += event.delta.partial_json

                            # Track tool use blocks
                            elif event.type == "content_block_start":
                                if hasattr(event.content_block, "type") and event.content_block.type == "tool_use":
                                    current_tool = {
                                        "id": event.content_block.id,
                                        "name": event.content_block.name,
                                    }
                                    input_json = ""

                            elif event.type == "content_block_stop":
                                if current_tool:
                                    try:
                                        current_tool["input"] = json.loads(input_json) if input_json else {}
                                    except json.JSONDecodeError:
                                        current_tool["input"] = {}
                                    tool_use_blocks.append(current_tool)
                                    current_tool = None
                                    input_json = ""

                        # Get the final message for history
                        final_message = await stream.get_final_message()
                    break  # Success — exit retry loop
                except anthropic.APIStatusError as e:
                    if e.status_code in (429, 529) and attempt < max_retries - 1:
                        wait = 2 ** (attempt + 1)
                        if not stream_started:
                            await msg.send()
                            stream_started = True
                        await msg.stream_token(f"\n⏳ API busy, retrying in {wait}s...\n")
                        await asyncio.sleep(wait)
                        # Reset for retry
                        msg = cl.Message(content="")
                        stream_started = False
                        tool_use_blocks = []
                        current_tool = None
                        input_json = ""
                        continue
                    raise

            # If we streamed text, finalize the message
            if stream_started:
                await msg.update()

            # Check if we need to call tools
            if final_message.stop_reason == "tool_use":
                history.append({"role": "assistant", "content": final_message.content})

                tool_results = []
                for tool_block in tool_use_blocks:
                    async with cl.Step(name=tool_block["name"], type="tool") as step:
                        step.input = tool_block["input"]
                        result = await execute_tool(tool_block["name"], tool_block["input"])
                        step.output = result

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_block["id"],
                        "content": result,
                    })

                history.append({"role": "user", "content": tool_results})
                continue  # Loop back for Claude to process tool results

            # Done — save history and set output on root span
            history.append({"role": "assistant", "content": final_message.content})
            cl.user_session.set("history", history)
            output_text = "".join(
                b.text for b in final_message.content if hasattr(b, "text")
            )
            if _root_span:
                _root_span.update(output=output_text)
            break
    finally:
        if _propagate_cm:
            _propagate_cm.__exit__(None, None, None)
        if _root_span_cm:
            _root_span_cm.__exit__(None, None, None)
