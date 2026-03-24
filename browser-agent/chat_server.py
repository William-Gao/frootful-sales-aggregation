"""
Chat server for Fru Assistant.

Thin FastAPI wrapper around Claude API + WebFlor tools.
Run: cd browser-agent && uv run uvicorn chat_server:app --port 8000 --reload
"""

import csv
import json
import logging
import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import anthropic

load_dotenv()

# Make webflor_auth importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from webflor_auth import ensure_session, webflor_fetch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = os.getenv("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


# ─── Local data helpers ──────────────────────────────────────────────────

def load_cached_json(filename: str) -> list[dict]:
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r") as f:
        data = json.load(f)
        return data if isinstance(data, list) else [data]


def search_cached(filename: str, field: str, query: str, max_results: int = 20) -> list[dict]:
    data = load_cached_json(filename)
    q = query.lower()
    return [item for item in data if q in str(item.get(field, "")).lower()][:max_results]


def search_clients_csv(query: str) -> list[dict]:
    filepath = os.path.join(DATA_DIR, "clientes.csv")
    if not os.path.exists(filepath):
        return []
    q = query.strip().lower()
    results = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            searchable = " ".join(str(v) for v in row.values()).lower()
            if q in searchable:
                results.append({
                    "Codigo": row.get("Codigo", ""),
                    "IdCliente": row.get("IdCliente", ""),
                    "NomCliente": row.get("NomCliente", ""),
                    "Estado": row.get("Estado", ""),
                })
                if len(results) >= 30:
                    break
    return results


def search_empaques_csv(query: str) -> list[dict]:
    filepath = os.path.join(DATA_DIR, "packaging_webflor_items_list.csv")
    if not os.path.exists(filepath):
        return []
    keywords = query.lower().split()
    results = []
    with open(filepath, "r") as f:
        # Skip to header
        while True:
            pos = f.tell()
            line = f.readline()
            if not line:
                return []
            if line.startswith("IdEmpaque"):
                f.seek(pos)
                break
        for row in csv.DictReader(f):
            nom = (row.get("NomEmpaque") or "").lower()
            if all(kw in nom for kw in keywords):
                results.append({
                    "IdEmpaque": row.get("IdEmpaque"),
                    "NomEmpaque": row.get("NomEmpaque"),
                    "IdProducto": row.get("IdProducto"),
                    "NomProducto": row.get("NomProducto"),
                    "NomColor": row.get("NomColor"),
                    "NomVariedad": row.get("NomVariedad"),
                })
                if len(results) >= 20:
                    break
    return results


def search_customer_notes_csv(customer_code: str) -> list[dict]:
    filepath = os.path.join(DATA_DIR, "customer_notes.csv")
    if not os.path.exists(filepath):
        return []
    results = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("customer_code", "").strip() == customer_code.strip():
                results.append(row)
    return results


def lookup_item_mappings_csv(item_code: str) -> list[dict]:
    filepath = os.path.join(DATA_DIR, "item_mappings.csv")
    if not os.path.exists(filepath):
        return []
    results = []
    with open(filepath, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("item_code", "").strip().upper() == item_code.strip().upper():
                results.append(row)
    return results


def search_picklists_data(query: str, category: str = "") -> list[dict]:
    filepath = os.path.join(DATA_DIR, "picklists.json")
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r") as f:
        data = json.load(f)
    q = query.lower()
    results = []
    categories = [category] if category and category in data else list(data.keys())
    for cat in categories:
        for item in data.get(cat, []):
            val = str(item.get("NomPickList", "") or item.get("Nombre", "")).lower()
            if q in val:
                item_copy = {k: v for k, v in item.items() if k != "$id"}
                item_copy["_category"] = cat
                results.append(item_copy)
                if len(results) >= 20:
                    break
        if len(results) >= 20:
            break
    return results


_SEMANAS_CACHE: list[dict] | None = None

def load_semanas() -> list[dict]:
    global _SEMANAS_CACHE
    if _SEMANAS_CACHE is None:
        path = os.path.join(DATA_DIR, "semanas_2026.json")
        if os.path.exists(path):
            with open(path, "r") as f:
                _SEMANAS_CACHE = json.load(f)
        else:
            _SEMANAS_CACHE = []
    return _SEMANAS_CACHE


# ─── App setup ───────────────────────────────────────────────────────────

app = FastAPI(title="Fru Chat Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are Fru, a helpful assistant for La Gaitana Farms, a Colombian flower distributor.
You can look up orders, customers, products, varieties, farms, recipes, and more in their WebFlor ERP system.
You have access to both live WebFlor API data (orders) and local cached reference data (customers, products, varieties, farms, etc.).
Be concise and helpful. Answer in English unless the user writes in Spanish.
Format tables nicely when showing lists. Keep responses short."""

# ─── Tool definitions for Claude ─────────────────────────────────────────

TOOLS = [
    # --- Live WebFlor API tools ---
    {
        "name": "list_orders",
        "description": "List recent WebFlor orders. Optionally filter by customer ID (use search_customers first to find the ID). Returns up to 50 orders with ID, customer, PO, dates, status, boxes, bunches.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "WebFlor customer ID to filter by. Use 0 for all customers."},
                "max_results": {"type": "integer", "description": "Max orders to return (default 20, max 50)."},
            },
            "required": [],
        },
    },
    {
        "name": "get_order",
        "description": "Get full details of a specific WebFlor order by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "integer", "description": "The WebFlor order ID (iIdPedido)."},
            },
            "required": ["order_id"],
        },
    },
    {
        "name": "get_order_items",
        "description": "Get line items for a specific WebFlor order. Shows empaque, farm, boxes, stems/bunch, bunches/box, price, brand.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "integer", "description": "The WebFlor order ID."},
            },
            "required": ["order_id"],
        },
    },
    # --- Local cached data tools ---
    {
        "name": "search_customers",
        "description": "Search WebFlor customers by name, code, or ID from local cached data. Returns Codigo, IdCliente (WebFlor ID), NomCliente, Estado.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term (name, code, or ID)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_empaques",
        "description": "Search packaging/empaque types by name. Returns IdEmpaque, NomEmpaque, IdProducto, NomProducto, NomColor, NomVariedad. Empaque names look like 'Carnation fcy Mixed', 'Bouquet Unico Mixed'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Empaque/product name to search for (partial match, AND logic for multiple words)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_varieties",
        "description": "Search all flower varieties (2,649 records) by name. Returns IdVariedad, NomVariedad, NomProducto, NomColor.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Variety name to search for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_active_varieties",
        "description": "Search currently active/available flower varieties for this season (145 varieties). Returns PRODUCTO, COLOR, VARIEDAD. Use to check what's in stock.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Variety name to search for (or empty for all)."},
                "product": {"type": "string", "description": "Optional product type filter (e.g. 'Carnation', 'Rose')."},
                "color": {"type": "string", "description": "Optional color filter (e.g. 'Red', 'White')."},
            },
            "required": [],
        },
    },
    {
        "name": "search_farms",
        "description": "Search farms by name. Returns IdFinca, NomFinca.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Farm name to search for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_compositions",
        "description": "Search recipe/composition templates by name. Returns IdComposicion, NomComposicion.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Composition name to search for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_box_marks",
        "description": "Search box brand/mark data by name. Returns IdPickList (use as PickMarca), NomPickList (brand name).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Box brand/mark name to search for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_box_types",
        "description": "Search box type data by name or code. Common codes: QB, HB, HI, FB. Returns IdTipoCaja, NombreCaja, Codigo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Box type name or code to search for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_box_dimensions",
        "description": "Search box dimension data by name or code. Returns IdDimensionCaja, NombreDimension, Codigo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Box dimension name or code to search for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_picklists",
        "description": "Search picklist values. Categories: tipoNegociacion, tipoVenta, tipoCorte, tipoPrecio, tipoOrden, vendedores. Returns IdPickList, NomPickList.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Value to search for."},
                "category": {"type": "string", "description": "Optional category to filter (e.g. 'tipoPrecio')."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_customer_notes",
        "description": "Look up customer-specific rules/notes by customer code (e.g. '1142'). Returns special instructions for orders.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_code": {"type": "string", "description": "Customer code."},
            },
            "required": ["customer_code"],
        },
    },
    {
        "name": "lookup_item_mappings",
        "description": "Look up historically observed WebFlor empaque mappings for a customer item/CBD code (e.g. 'CBD13451'). Shows which empaques were used for that item in the past.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_code": {"type": "string", "description": "Customer item code (e.g. 'CBD13451')."},
            },
            "required": ["item_code"],
        },
    },
    {
        "name": "get_week",
        "description": "Look up the WebFlor week number for a date, or get the date range for a week number. The floral industry uses week numbers (Semana).",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_or_week": {"type": "string", "description": "A date (YYYY-MM-DD) or week number (e.g. '12')."},
            },
            "required": ["date_or_week"],
        },
    },
    {
        "name": "resolve_delivery_date",
        "description": "Resolve a relative date description (e.g. 'next Tuesday', 'this Friday') to a concrete date in ISO and WebFlor format.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_text": {"type": "string", "description": "Relative date text (e.g. 'next Tuesday')."},
            },
            "required": ["date_text"],
        },
    },
]


# ─── Tool execution ──────────────────────────────────────────────────────

async def execute_tool(name: str, args: dict) -> str:
    """Execute a tool and return JSON string result."""
    try:
        # --- Live API tools (need session) ---
        if name in ("list_orders", "get_order", "get_order_items"):
            await ensure_session()

        if name == "list_orders":
            cid = args.get("customer_id", 0)
            max_r = min(args.get("max_results", 20), 50)
            data = await webflor_fetch(
                "/WebFlorVenta/API/listarOrdenes",
                params={
                    "iIdCliente": str(cid),
                    "iIdCompania": "1",
                    "iIdConsolidador": "0",
                    "iIdVendedor": "0",
                    "iIdFiltroFecha": "0",
                    "fechaInicial": "1900-01-01",
                    "fechaFinal": "3000-01-01",
                    "pickModulo": "131",
                    "ManejaInventario": "0",
                    "iIdVariedad": "0",
                },
            )
            if isinstance(data, list):
                trimmed = []
                for o in data[:max_r]:
                    trimmed.append({
                        "IdPedido": o.get("IdPedido"),
                        "NomCliente": o.get("NomCliente"),
                        "PO": o.get("PO"),
                        "FechaEmbarque": o.get("FechaEmbarque"),
                        "FechaEntrega": o.get("FechaEntrega"),
                        "NomEstadoPedido": o.get("NomEstadoPedido"),
                        "CantCajas": o.get("CantCajas"),
                        "CantBunch": o.get("CantBunch"),
                    })
                return json.dumps(trimmed, default=str)
            return json.dumps(data, default=str)

        elif name == "get_order":
            oid = args["order_id"]
            data = await webflor_fetch(
                "/WebFlorVenta/API/listarOrdenById",
                params={"iIdPedido": str(oid)},
            )
            return json.dumps(data, default=str)

        elif name == "get_order_items":
            oid = args["order_id"]
            data = await webflor_fetch(
                "/WebFlorVenta/API/listarDetalleOrdenByIdPedido",
                params={"iIdPedido": str(oid)},
            )
            if isinstance(data, list):
                trimmed = []
                for it in data:
                    trimmed.append({
                        "IdPedidoItem": it.get("IdPedidoItem"),
                        "NomEmpaque": it.get("NomEmpaque"),
                        "NomFinca": it.get("NomFinca"),
                        "CantidadCaja": it.get("CantidadCaja"),
                        "TallosRamo": it.get("TallosRamo"),
                        "RamosCaja": it.get("RamosCaja"),
                        "Precio": it.get("Precio"),
                        "NomMarca": it.get("NomMarca"),
                    })
                return json.dumps(trimmed, default=str)
            return json.dumps(data, default=str)

        # --- Local cached data tools ---
        elif name == "search_customers":
            return json.dumps(search_clients_csv(args.get("query", "")), default=str)

        elif name == "search_empaques":
            return json.dumps(search_empaques_csv(args.get("query", "")), default=str)

        elif name == "search_varieties":
            return json.dumps(search_cached("variedades.json", "NomVariedad", args.get("query", "")), default=str)

        elif name == "search_farms":
            return json.dumps(search_cached("fincas.json", "NomFinca", args.get("query", "")), default=str)

        elif name == "search_active_varieties":
            filepath = os.path.join(DATA_DIR, "current_active_varieties.csv")
            if not os.path.exists(filepath):
                return json.dumps({"error": "current_active_varieties.csv not found"})
            q = args.get("query", "").lower()
            product_filter = args.get("product", "").lower()
            color_filter = args.get("color", "").lower()
            results = []
            with open(filepath, "r", encoding="utf-8-sig") as f:
                for row in csv.DictReader(f):
                    if q and q not in (row.get("VARIEDAD", "")).lower():
                        continue
                    if product_filter and product_filter not in (row.get("PRODUCTO", "")).lower():
                        continue
                    if color_filter and color_filter not in (row.get("COLOR", "")).lower():
                        continue
                    results.append(row)
                    if len(results) >= 30:
                        break
            return json.dumps(results, default=str)

        elif name == "search_compositions":
            return json.dumps(search_cached("composiciones.json", "NomComposicion", args.get("query", "")), default=str)

        elif name == "search_box_marks":
            return json.dumps(search_cached("marcas_caja.json", "NomPickList", args.get("query", "")), default=str)

        elif name == "search_box_types":
            results = search_cached("tipo_caja.json", "NombreCaja", args.get("query", ""))
            if not results:
                results = search_cached("tipo_caja.json", "Codigo", args.get("query", ""))
            return json.dumps(results, default=str)

        elif name == "search_box_dimensions":
            results = search_cached("dimensiones_caja.json", "NombreDimension", args.get("query", ""))
            if not results:
                results = search_cached("dimensiones_caja.json", "Codigo", args.get("query", ""))
            return json.dumps(results, default=str)

        elif name == "search_picklists":
            return json.dumps(search_picklists_data(args.get("query", ""), args.get("category", "")), default=str)

        elif name == "search_customer_notes":
            return json.dumps(search_customer_notes_csv(args.get("customer_code", "")), default=str)

        elif name == "lookup_item_mappings":
            return json.dumps(lookup_item_mappings_csv(args.get("item_code", "")), default=str)

        elif name == "get_week":
            semanas = load_semanas()
            val = args.get("date_or_week", "")
            # Try as week number
            try:
                week_num = int(val)
                for s in semanas:
                    if s["NumSemana"] == week_num:
                        return json.dumps(s, default=str)
                return json.dumps({"error": f"Week {week_num} not found"})
            except ValueError:
                pass
            # Try as date
            try:
                d = date.fromisoformat(val)
            except ValueError:
                return json.dumps({"error": f"Could not parse '{val}' as date or week number"})
            for s in semanas:
                inicio = date.fromisoformat(s["inicio"])
                fin = date.fromisoformat(s["fin"])
                if inicio <= d <= fin:
                    return json.dumps(s, default=str)
            return json.dumps({"error": f"No week found for {val}"})

        elif name == "resolve_delivery_date":
            text = args.get("date_text", "").strip().lower()
            today = date.today()
            days_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
            for day_name, day_num in days_map.items():
                if day_name in text:
                    days_ahead = day_num - today.weekday()
                    if days_ahead <= 0:
                        days_ahead += 7
                    target = today + timedelta(days=days_ahead)
                    return json.dumps({"input": text, "iso": target.isoformat(), "webflor": target.strftime("%Y/%m/%d"), "today": today.isoformat()})
            return json.dumps({"input": text, "note": "Could not parse relative date.", "today": today.isoformat()})

        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as e:
        logger.error(f"Tool {name} error: {e}")
        return json.dumps({"error": str(e)})


# ─── Chat endpoint ───────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@app.post("/api/chat")
async def chat(req: ChatRequest):
    # Build messages from history
    messages = []
    for msg in req.history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": req.message})

    # Phase 1: Non-streaming tool-use loop (resolve all tool calls first)
    for _ in range(5):
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if not tool_uses:
            break

        # Execute tools and feed results back
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for tu in tool_uses:
            result = await execute_tool(tu.name, tu.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": result,
            })
        messages.append({"role": "user", "content": tool_results})

    # Phase 2: Stream the final response
    async def generate():
        with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'token': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}


# ─── REST endpoints for CopilotKit actions (frontend calls these) ────────

@app.get("/api/webflor/orders")
async def api_list_orders(customer_id: int = 0, max_results: int = 20):
    result = await execute_tool("list_orders", {"customer_id": customer_id, "max_results": max_results})
    return json.loads(result)


@app.get("/api/webflor/order/{order_id}")
async def api_get_order(order_id: int):
    result = await execute_tool("get_order", {"order_id": order_id})
    return json.loads(result)


@app.get("/api/webflor/order/{order_id}/items")
async def api_get_order_items(order_id: int):
    result = await execute_tool("get_order_items", {"order_id": order_id})
    return json.loads(result)


@app.get("/api/webflor/customers")
async def api_search_customers(query: str = ""):
    result = await execute_tool("search_customers", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/empaques")
async def api_search_empaques(query: str = ""):
    result = await execute_tool("search_empaques", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/varieties")
async def api_search_varieties(query: str = ""):
    result = await execute_tool("search_varieties", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/farms")
async def api_search_farms(query: str = ""):
    result = await execute_tool("search_farms", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/active-varieties")
async def api_search_active_varieties(query: str = "", product: str = "", color: str = ""):
    result = await execute_tool("search_active_varieties", {"query": query, "product": product, "color": color})
    return json.loads(result)


@app.get("/api/webflor/compositions")
async def api_search_compositions(query: str = ""):
    result = await execute_tool("search_compositions", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/box-marks")
async def api_search_box_marks(query: str = ""):
    result = await execute_tool("search_box_marks", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/box-types")
async def api_search_box_types(query: str = ""):
    result = await execute_tool("search_box_types", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/box-dimensions")
async def api_search_box_dimensions(query: str = ""):
    result = await execute_tool("search_box_dimensions", {"query": query})
    return json.loads(result)


@app.get("/api/webflor/picklists")
async def api_search_picklists(query: str = "", category: str = ""):
    result = await execute_tool("search_picklists", {"query": query, "category": category})
    return json.loads(result)


@app.get("/api/webflor/customer-notes")
async def api_search_customer_notes(customer_code: str = ""):
    result = await execute_tool("search_customer_notes", {"customer_code": customer_code})
    return json.loads(result)


@app.get("/api/webflor/item-mappings")
async def api_lookup_item_mappings(item_code: str = ""):
    result = await execute_tool("lookup_item_mappings", {"item_code": item_code})
    return json.loads(result)


@app.get("/api/webflor/week")
async def api_get_week(date_or_week: str = ""):
    result = await execute_tool("get_week", {"date_or_week": date_or_week})
    return json.loads(result)


@app.get("/api/webflor/resolve-date")
async def api_resolve_date(date_text: str = ""):
    result = await execute_tool("resolve_delivery_date", {"date_text": date_text})
    return json.loads(result)
