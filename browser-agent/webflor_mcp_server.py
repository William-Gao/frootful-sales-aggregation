#!/usr/bin/env python3
"""
Standalone WebFlor MCP Server

Runs as a separate process communicating via stdio with the Claude Agent SDK.
This avoids the in-process pipe race condition that causes "Stream closed" errors
when using create_sdk_mcp_server().

Usage (standalone test):
    uv run webflor_mcp_server.py

Used by webflor_agent_sdk.py as a subprocess MCP server.
"""

import asyncio
import csv
import json
import logging
import os
import sys

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from supabase import create_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ─── Shared auth & HTTP client from webflor_auth ─────────────────────────

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from webflor_auth import (
    ensure_session,
    get_session_cookies,
    set_session_cookies,
    webflor_fetch,
    _order_link,
    _run_login_async,
)

# ─── Config ────────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
ORGANIZATION_ID = os.getenv("ORGANIZATION_ID", "")

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY) if SUPABASE_URL and SUPABASE_SECRET_KEY else None

# ─── Cached Data ──────────────────────────────────────────────────────────

DATA_DIR = os.getenv("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def load_cached_json(filename: str) -> list[dict]:
    """Load a cached JSON/JSONL data file from the data directory."""
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r") as f:
        try:
            data = json.load(f)
            return data if isinstance(data, list) else [data]
        except json.JSONDecodeError:
            f.seek(0)
            first_line = f.readline()
            data = json.loads(first_line)
            return data if isinstance(data, list) else [data]


def search_cached_data(filename: str, search_field: str, query: str, max_results: int = 20) -> list[dict]:
    """Search a cached data file by a field value (case-insensitive substring match)."""
    data = load_cached_json(filename)
    query_lower = query.lower()
    results = []
    for item in data:
        val = str(item.get(search_field, "")).lower()
        if query_lower in val:
            results.append(item)
            if len(results) >= max_results:
                break
    return results




# ─── Supabase ──────────────────────────────────────────────────────────────

def load_customers() -> list[dict]:
    if not supabase or not ORGANIZATION_ID:
        return []
    result = (
        supabase.table("customers")
        .select("id, name, email, phone, notes, client_erp_id")
        .eq("active", True)
        .eq("organization_id", ORGANIZATION_ID)
        .order("name")
        .execute()
    )
    return result.data




# ─── WebFlor API Endpoint Translations ────────────────────────────────────
# Spanish endpoint name              → English meaning
# ──────────────────────────────────────────────────────────────────────────
# guardarOrden                       → save order (create order header)
# actualizarOrden                    → update order
# guardarOrdenIt                     → save order item (add line item)
# eliminarOrdenItem                  → delete order item
# listarOrdenById                    → list/get order by ID
# listarDetalleOrdenByIdPedido       → list order detail (line items) by order ID
# listarOrdenFlorById                → list order flower by item ID
# listarItemDetalleOrdenByIdPedidoItem → list item detail by item ID
# listarCliente                      → list customers
# listarClienteById                  → list customer by ID
# listarClientePorIdCliente          → list customer by client ID
# listarClienteSucursalesById        → list customer branches by ID
# listarClienteSucursaleDefectoByIdCliente → list default branch by client ID
# listarFichaClientePorIdClienteIdProducto → list client-product card (defaults per client+product)
# listarEmpaquesActivos              → list active packaging types
# listarEmpaqueByIdEmpaqueSinImagen  → list packaging by ID (without image)
# listarComposicionesByEmpaque       → list compositions/recipes by packaging
# listarCajasMarcaTipoDimension      → list boxes by brand+type+dimension (combined lookup)
# listarCajaPorIdMarcaIdTipoIdDimensionSP → list box by brand+type+dimension (specific resolver)
# listarTipoCajaActivas              → list active box types
# listarDimensionCaja                → list box dimensions
# listarFincasTipoBodegaOAmbasOrdenes → list farms (warehouse type or both) for orders
# listarCompaniasActivasSinLogo      → list active companies (without logo)
# listarPickListActivosIHTTP         → list active picklist values
# actualizarFlujoOrden               → update order workflow
# actualizarEstadoPedido             → update order status
# ObtieneCupoClienteById            → get client credit limit by ID
# ConsultarTipoEmpaqueMultiONoMulti  → check packaging type multi or non-multi
# ValidarProcesoBouquetera           → validate bouquet process
# CopiaItemsOrdenes                  → copy items between orders
# TrasladarItemsOrdenes              → transfer items between orders
# guardarArchivoAdjunto              → save file attachment
# listarArchivosAdjuntos             → list file attachments
# EliminarArchivoAdjunto             → delete file attachment
# obtenerUsuario                     → get user
# CerrarSesion                       → close session (logout)

# ─── MCP Server ───────────────────────────────────────────────────────────

mcp = FastMCP("erp", log_level="WARNING")


# -- Session tools --

@mcp.tool()
async def refresh_session() -> str:
    """Refresh the WebFlor session by running automated login. Use if an API call fails due to expired session."""
    logger.info("[tool] refresh_session called")
    try:
        new_cookies = await _run_login_async()
        set_session_cookies(new_cookies)
        result = await webflor_fetch("/WebFlorBasico/API/listarCompaniasActivasSinLogo")
        companies = result if isinstance(result, list) else []
        names = [c.get("NomCompania", "?") for c in companies]
        logger.info(f"[tool] refresh_session success: {len(companies)} companies")
        return f"Session refreshed. {len(companies)} companies: {', '.join(names)}"
    except Exception as e:
        logger.error(f"[tool] refresh_session failed: {e}")
        set_session_cookies("")
        return f"Session refresh failed: {e}"


@mcp.tool()
async def set_session(cookies: str) -> str:
    """Set WebFlor session cookies manually. Use grab_cookies instead if possible."""
    logger.info(f"[tool] set_session: cookies={cookies[:40]}...")
    set_session_cookies(cookies)
    try:
        result = await webflor_fetch("/WebFlorBasico/API/listarCompaniasActivasSinLogo")
        companies = result if isinstance(result, list) else []
        names = [c.get("NomCompania", "?") for c in companies]
        return f"Session active. {len(companies)} companies: {', '.join(names)}"
    except Exception as e:
        set_session_cookies("")
        return f"Session verification failed: {e}"


# -- Cached local lookup tools --

@mcp.tool()
async def search_products(query: str) -> str:
    """Search cached product types by name. Returns IdProducto, NomProducto, Codigo.
    These are base product types (e.g. 'Carnation', 'Minicarnation', 'Bouquet').
    Use IdProducto as IdEmpaque when adding order items."""
    logger.info(f"[tool] search_products: query={query!r}")
    results = search_cached_data("productos.json", "NomProducto", query)
    logger.info(f"[tool] search_products: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_farms(query: str) -> str:
    """Search cached farm data by name. Returns IdFinca, NomFinca."""
    logger.info(f"[tool] search_farms: query={query!r}")
    results = search_cached_data("fincas.json", "NomFinca", query)
    logger.info(f"[tool] search_farms: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_box_marks(query: str) -> str:
    """Search cached box brand/mark data by name. Returns IdPickList (use as PickMarca), NomPickList (brand name)."""
    logger.info(f"[tool] search_box_marks: query={query!r}")
    results = search_cached_data("marcas_caja.json", "NomPickList", query)
    logger.info(f"[tool] search_box_marks: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_box_types(query: str) -> str:
    """Search cached box type data by name or code. Returns IdTipoCaja, NombreCaja, Codigo.
    Common codes: QB, HB, HI, FB. Search by code or name."""
    logger.info(f"[tool] search_box_types: query={query!r}")
    results = search_cached_data("tipo_caja.json", "NombreCaja", query)
    if not results:
        results = search_cached_data("tipo_caja.json", "Codigo", query)
    logger.info(f"[tool] search_box_types: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_box_dimensions(query: str) -> str:
    """Search cached box dimension data by name or code. Returns IdDimensionCaja, NombreDimension, Codigo."""
    logger.info(f"[tool] search_box_dimensions: query={query!r}")
    results = search_cached_data("dimensiones_caja.json", "NombreDimension", query)
    if not results:
        results = search_cached_data("dimensiones_caja.json", "Codigo", query)
    logger.info(f"[tool] search_box_dimensions: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_compositions(query: str) -> str:
    """Search cached composition/recipe templates by name. Returns IdComposicion, NomComposicion."""
    logger.info(f"[tool] search_compositions: query={query!r}")
    results = search_cached_data("composiciones.json", "NomComposicion", query)
    logger.info(f"[tool] search_compositions: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_varieties(query: str) -> str:
    """Search cached variety data (2,649 records) by name. Returns IdVariedad, NomVariedad, NomProducto, NomColor."""
    logger.info(f"[tool] search_varieties: query={query!r}")
    results = search_cached_data("variedades.json", "NomVariedad", query)
    logger.info(f"[tool] search_varieties: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_picklists(query: str, category: str = "") -> str:
    """Search cached picklist values. Categories: tipoNegociacion, tipoVenta, tipoCorte, tipoPrecio, tipoOrden, vendedores.
    Returns IdPickList, NomPickList. If no category given, searches all."""
    logger.info(f"[tool] search_picklists: query={query!r} category={category or 'all'}")
    filepath = os.path.join(DATA_DIR, "picklists.json")
    if not os.path.exists(filepath):
        return "picklists.json not found."
    with open(filepath, "r") as f:
        data = json.load(f)
    query_lower = query.lower()
    results = []
    categories = [category] if category and category in data else list(data.keys())
    for cat in categories:
        for item in data.get(cat, []):
            val = str(item.get("NomPickList", "") or item.get("Nombre", "")).lower()
            if query_lower in val:
                item_copy = {k: v for k, v in item.items() if k != "$id"}
                item_copy["_category"] = cat
                results.append(item_copy)
                if len(results) >= 20:
                    break
        if len(results) >= 20:
            break
    logger.info(f"[tool] search_picklists: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_cached_file(filename: str, field: str, query: str, max_results: int = 20) -> str:
    """Generic search across any cached data file.
    Files: colores.json, variedades.json, grados.json, productos.json, composiciones.json,
    picklists.json, fincas.json, tipo_caja.json, dimensiones_caja.json, marcas_caja.json"""
    logger.info(f"[tool] search_cached_file: file={filename} field={field} query={query!r}")
    results = search_cached_data(filename, field, query, max_results=int(max_results))
    logger.info(f"[tool] search_cached_file: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_active_varieties(query: str, product: str = "", color: str = "") -> str:
    """Search currently active flower varieties from current_active_varieties.csv (145 rows).
    These are the varieties available THIS season — use to validate recipes and flower assignments.
    Search by variety name (query), and optionally filter by product type and/or color.
    Examples: search_active_varieties('Polar') → finds 'Polar Route' carnation.
    search_active_varieties('', product='Carnation', color='Red') → all active red carnations.
    Returns PRODUCTO, COLOR, VARIEDAD for each match."""
    logger.info(f"[tool] search_active_varieties: query={query!r} product={product!r} color={color!r}")
    filepath = os.path.join(DATA_DIR, "current_active_varieties.csv")
    if not os.path.exists(filepath):
        return "current_active_varieties.csv not found."
    query_lower = query.lower()
    product_lower = product.lower()
    color_lower = color.lower()
    results = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            prod = row.get("PRODUCTO", "")
            col = row.get("COLOR", "")
            var = row.get("VARIEDAD", "")
            if product_lower and product_lower not in prod.lower():
                continue
            if color_lower and color_lower not in col.lower():
                continue
            if query_lower and query_lower not in var.lower():
                continue
            results.append({"PRODUCTO": prod, "COLOR": col, "VARIEDAD": var})
            if len(results) >= 50:
                break
    logger.info(f"[tool] search_active_varieties: {len(results)} results")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def search_customer_notes(customer_code: str) -> str:
    """Look up customer-specific rules/notes by customer code (e.g. '1142').
    Returns special instructions for order entry such as PO field rules, date handling, etc.
    Call this after identifying the customer to check for any overrides."""
    logger.info(f"[tool] search_customer_notes: customer_code={customer_code!r}")
    filepath = os.path.join(DATA_DIR, "customer_notes.csv")
    if not os.path.exists(filepath):
        return "No customer notes file found."
    results = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("customer_code", "").strip() == customer_code.strip():
                results.append(row)
    if not results:
        return f"No notes found for customer {customer_code}."
    logger.info(f"[tool] search_customer_notes: {len(results)} notes found")
    return json.dumps(results, indent=2)


@mcp.tool()
async def lookup_item_mappings(item_code: str) -> str:
    """Look up historically observed WebFlor empaque mappings for a customer item/CBD code (e.g. 'CBD13451').

    Returns empaque IDs and names previously seen for that item code.
    IMPORTANT:
    - These mappings are NOT exhaustive — new varieties or empaques may exist beyond this list.
    - Mappings are not always 1:1. A single item code on the PO may be split across
      multiple empaques in different quantities depending on availability (e.g. a
      'white carnations' line may become 2 separate order items: some boxes of
      Polar Route + some boxes of Halo).
    - Use these as a helpful starting point. Check recent orders or the active
      empaques list if the specific empaque needed isn't found here."""
    logger.info(f"[tool] lookup_item_mappings: item_code={item_code!r}")
    filepath = os.path.join(DATA_DIR, "item_mappings.csv")
    if not os.path.exists(filepath):
        return "No item mappings file found."
    results = []
    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("item_code", "").strip().upper() == item_code.strip().upper():
                results.append(row)
    if not results:
        return (
            f"No known mappings for item code '{item_code}'. "
            "This doesn't mean there are none — check recent orders or active empaques."
        )
    disclaimer = (
        f"Found {len(results)} historically observed mapping(s) for '{item_code}'. "
        "Not exhaustive — new empaques may exist. Also note: a single item code "
        "may be split across multiple empaques in different quantities depending "
        "on availability (not always a 1:1 mapping).\n\n"
    )
    return disclaimer + json.dumps(results, indent=2)


@mcp.tool()
async def get_spec_sheet(query: str) -> str:
    """Look up product spec sheet details by item code (e.g. 'CBD01794'), product name (e.g. 'Carnation fcy Mixed'),
    or empaque ID (e.g. '1028'). Spec sheets define the exact sub-mix structure, color breakdowns,
    stems/bunch, bunches/box, hardgoods, and UPC info for each customer product.

    Available spec sheets:
    - CBD01794 / IdEmpaque 1028: BLOOMS ASSTD CARNS SPRING (Carnation fcy Mixed) — 6 sub-mixes, 140 bunches/box
    - CBD01788 / IdEmpaque 13081: BLOOMS ASSTD MINI CARNS SPRING (Minicarnation sel Consumer) — 6 sub-mixes, 135 bunches/box
    - CBD01792 / IdEmpaque 7025: BLOOMS RBW MINI CARNS SPRING (Minicarnation sel Rainbow) — 1 sub-mix spiral, 135 bunches/box
    - CBD13451 / IdEmpaque 15380: BLOOMS WHITE CARNATIONS ED (Carnation fcy white Polar Route) — solid white, 140 bunches/box
    - CBD00487 / IdEmpaque 13037: RAFFINES/SOLOMIOS 7ST (Combo Raffine/Solomio/Sel) — 2 sub-mixes, 12 bunches/box"""
    logger.info(f"[tool] get_spec_sheet: query={query!r}")
    # Load the spec sheet analysis markdown
    spec_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "spec-sheets-analysis.md")
    if not os.path.exists(spec_file):
        return "spec-sheets-analysis.md not found in browser-agent/docs/."
    with open(spec_file, "r") as f:
        content = f.read()
    # Search by query in the content — return relevant section
    query_lower = query.lower()
    # Map common lookups to section headers
    section_map = {
        "cbd01794": "### CBD01794",
        "1028": "### CBD01794",
        "carnation fcy mixed": "### CBD01794",
        "asstd carns": "### CBD01794",
        "cbd01788": "### CBD01788",
        "13081": "### CBD01788",
        "minicarnation sel consumer": "### CBD01788",
        "mini carns spring": "### CBD01788",
        "cbd01792": "### CBD01792",
        "7025": "### CBD01792",
        "minicarnation sel rainbow": "### CBD01792",
        "rbw mini": "### CBD01792",
        "rainbow": "### CBD01792",
        "cbd13451": "### CBD13451",
        "15380": "### CBD13451",
        "carnation fcy white": "### CBD13451",
        "white carnation": "### CBD13451",
        "polar route": "### CBD13451",
        "cbd00487": "### CBD00487",
        "13037": "### CBD00487",
        "raffine": "### CBD00487",
        "solomio": "### CBD00487",
        "combo": "### CBD00487",
    }
    # Find matching section
    target_header = None
    for key, header in section_map.items():
        if key in query_lower:
            target_header = header
            break
    if target_header:
        # Extract from the header to the next ### or ---
        start = content.find(target_header)
        if start >= 0:
            # Find end: next ### at same level or ---
            rest = content[start + len(target_header):]
            end = len(content)
            for marker in ["\n### ", "\n---"]:
                idx = rest.find(marker)
                if idx >= 0 and (start + len(target_header) + idx) < end:
                    end = start + len(target_header) + idx
            section = content[start:end].strip()
            return section
    # Fallback: return the inventory table and all section headers
    if "all" in query_lower or "list" in query_lower or not query_lower:
        # Return the inventory table
        table_start = content.find("## Spec Sheet Inventory")
        table_end = content.find("## Detailed Spec Breakdown")
        if table_start >= 0 and table_end >= 0:
            return content[table_start:table_end].strip()
    return f"No spec sheet found matching '{query}'. Available: CBD01794 (1028), CBD01788 (13081), CBD01792 (7025), CBD13451 (15380), CBD00487 (13037)."


@mcp.tool()
async def lookup_marca_box_info(marca_query: str = "") -> str:
    """Look up marca/box-type/dimension combinations from WebFlor's live API.
    Returns IdCaja, IdTipoCaja, IdDimensionCaja, PickMarcaCaja, NomMarcaCaja, NombreCaja, NombreDimension.
    This is the authoritative source for IdTipoCaja and IdDimensionCaja given a marca.
    If marca_query is provided, filters results by marca name (case-insensitive substring match).
    Use this instead of separate search_box_types + search_box_dimensions calls."""
    logger.info(f"[tool] lookup_marca_box_info: marca_query={marca_query!r}")
    try:
        data = await webflor_fetch(
            "/WebFlorTablasBasicas/API/listarCajasMarcaTipoDimension",
            params={"iIdEstado": "true"},
        )
        if not isinstance(data, list):
            return json.dumps(data, indent=2)
        if marca_query:
            q = marca_query.lower()
            data = [item for item in data if q in str(item.get("NomMarcaCaja", "")).lower()]
        # Limit results to avoid huge output
        if len(data) > 50:
            data = data[:50]
            return json.dumps(data, indent=2) + f"\n... (showing 50 of many results, refine your search)"
        logger.info(f"[tool] lookup_marca_box_info: {len(data)} results")
        return json.dumps(data, indent=2) if data else "No matches."
    except Exception as e:
        logger.error(f"[tool] lookup_marca_box_info failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def search_empaques(query: str) -> str:
    """Search cached empaque/packaging data by name. Returns IdEmpaque, NomEmpaque, IdProducto, PickManejaPrecio, etc.
    Use to find IdEmpaque for order items. Empaque names look like 'Carnation fcy Mixed', 'Bouquet Unico Mixed'.
    Search with partial names (e.g. 'Carnation fcy Mixed') for best results.
    IdProducto: needed for lookup_client_product_ficha to get PickTipoCorte and PickTipoPrecio.
    PickManejaPrecio: 56=Ramos pricing, 57=Tallos pricing (empaque's pricing mode)."""
    logger.info(f"[tool] search_empaques: query={query!r}")
    filepath = os.path.join(DATA_DIR, "packaging_webflor_items_list.csv")
    logger.info(f"[tool] search_empaques: CSV path={filepath} exists={os.path.exists(filepath)}")
    if not os.path.exists(filepath):
        return f"packaging_webflor_items_list.csv not found at {filepath}"
    query_lower = query.lower()
    # Split into keywords — all must match (AND logic) for multi-word queries
    keywords = query_lower.split()
    results = []
    total_rows = 0
    with open(filepath, "r") as f:
        # Skip any non-header lines at the start of the file
        while True:
            pos = f.tell()
            line = f.readline()
            if not line:
                return "CSV file is empty."
            if line.startswith("IdEmpaque"):
                f.seek(pos)
                break
        reader = csv.DictReader(f)
        logger.info(f"[tool] search_empaques: fieldnames={reader.fieldnames}")
        for row in reader:
            total_rows += 1
            nom = row.get("NomEmpaque", "")
            nom_lower = nom.lower()
            if all(kw in nom_lower for kw in keywords):
                results.append({
                    "IdEmpaque": row.get("IdEmpaque"),
                    "NomEmpaque": nom,
                    "IdProducto": row.get("IdProducto"),
                    "NomProducto": row.get("NomProducto"),
                    "NomColor": row.get("NomColor"),
                    "NomGrado": row.get("NomGrado"),
                    "NomVariedad": row.get("NomVariedad"),
                    "PickManejaPrecio": row.get("PickManejaPrecio"),
                })
                if len(results) >= 20:
                    break
    logger.info(f"[tool] search_empaques: {len(results)} results from {total_rows} rows")
    return json.dumps(results, indent=2) if results else "No matches."


@mcp.tool()
async def lookup_empaque_details(empaque_id: str) -> str:
    """Get full empaque details from WebFlor by IdEmpaque.
    Returns ManejaReceta (0=no recipe, 1=simple, 2=multi), IdComposicion, PickTipoEmpaque, IdProducto, PickManejaPrecio, etc.
    Use after search_empaques to get fields not in the CSV (like ManejaReceta)."""
    logger.info(f"[tool] lookup_empaque_details: empaque_id={empaque_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarEmpaqueByIdEmpaqueSinImagen",
            params={"IdEmpaque": str(empaque_id)},
        )
        if isinstance(data, list) and data:
            emp = data[0]
            logger.info(f"[tool] empaque details: NomEmpaque={emp.get('NomEmpaque')} ManejaReceta={emp.get('ManejaReceta')} IdProducto={emp.get('IdProducto')} PickManejaPrecio={emp.get('PickManejaPrecio')}")
            return json.dumps(emp, indent=2)
        return json.dumps(data, indent=2) if data else "Empaque not found."
    except Exception as e:
        logger.error(f"[tool] lookup_empaque_details failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def lookup_client_product_ficha(client_id: int, product_id: int) -> str:
    """Look up client-product defaults from WebFlor's ficha endpoint.
    Returns PickTipoCorte, PickTipoPrecio (66=Ramos, 67=Tallos), PickMarcaCaja, and other defaults.
    Call this per client+product to get the correct PickTipoCorte and PickTipoPrecio values.
    The product_id comes from the empaque's IdProducto field."""
    logger.info(f"[tool] lookup_client_product_ficha: client_id={client_id} product_id={product_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarFichaClientePorIdClienteIdProducto",
            params={"iIdCliente": str(client_id), "iIdProducto": str(product_id)},
        )
        if isinstance(data, list) and data:
            ficha = data[0]
            logger.info(f"[tool] ficha result: PickTipoCorte={ficha.get('PickTipoCorte')} PickTipoPrecio={ficha.get('PickTipoPrecio')} PickMarcaCaja={ficha.get('PickMarcaCaja')}")
            return json.dumps(ficha, indent=2)
        return json.dumps(data, indent=2) if data else "No ficha found for this client+product."
    except Exception as e:
        logger.error(f"[tool] lookup_client_product_ficha failed: {e}")
        return f"ERROR: {e}"


# -- Order tools --

@mcp.tool()
async def get_order(order_id: str) -> str:
    """Get an order header by its pedido ID."""
    logger.info(f"[tool] get_order: order_id={order_id} — VERIFYING order header...")
    try:
        data = await webflor_fetch("/WebFlorVenta/API/listarOrdenById", params={"iIdPedido": order_id})
        if isinstance(data, dict):
            logger.info(f"[tool] get_order result: IdPedido={data.get('IdPedido')} IdCliente={data.get('IdCliente')} PO={data.get('PO')} FechaOrden={data.get('FechaOrden')} FechaEntrega={data.get('FechaEntrega')}")
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_order failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_order_items(order_id: str) -> str:
    """Get all line items (detail rows) for an order by its pedido ID."""
    logger.info(f"[tool] get_order_items: order_id={order_id} — VERIFYING order line items...")
    try:
        data = await webflor_fetch("/WebFlorVenta/API/listarDetalleOrdenByIdPedido", params={"iIdPedido": order_id})
        if isinstance(data, list):
            logger.info(f"[tool] get_order_items: {len(data)} items returned")
            for item in data:
                logger.info(f"[tool]   item {item.get('IdPedidoItem')}: IdEmpaque={item.get('IdEmpaque')} Cajas={item.get('CantidadCaja')} TallosRamo={item.get('TallosRamo')} RamosCaja={item.get('RamosCaja')} Precio={item.get('Precio')} PickTipoPrecio={item.get('PickTipoPrecio')}")
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_order_items failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_order_item_flowers(order_item_id: str, receta_id: str = "0") -> str:
    """Get flower recipe rows for a specific order item.
    For ManejaReceta=1 (simple recipe), use receta_id='0' to get all flower rows.
    For ManejaReceta=2 (multi/bouquet), first call get_order_item_recipes to get
    container IDs, then call this with each container's IdPedidoItemReceta."""
    logger.info(f"[tool] get_order_item_flowers: order_item_id={order_item_id} receta_id={receta_id}")
    data = await webflor_fetch(
        "/WebFlorVenta/API/listarOrdenFlorById",
        params={"iIdPedidoItem": order_item_id, "IdPedidoItemReceta": receta_id},
    )
    return json.dumps(data, indent=2)


@mcp.tool()
async def get_order_item_recipes(order_item_id: str) -> str:
    """Get named recipe containers for a multi-recipe order item (ManejaReceta=2, e.g. bouquets).
    Returns IdPedidoItemReceta, NombreReceta, CantidadRamos, UPC, TotalFlor, PrecioRamo.
    Use the IdPedidoItemReceta values with get_order_item_flowers to get flower rows per container."""
    logger.info(f"[tool] get_order_item_recipes: order_item_id={order_item_id}")
    data = await webflor_fetch(
        "/WebFlorVenta/API/listarOrdenRecByIdPedidoItem",
        params={"IdPedidoItem": order_item_id},
    )
    return json.dumps(data, indent=2)


@mcp.tool()
async def get_order_item_materials(order_item_id: str, receta_id: str = "0") -> str:
    """Get packaging materials (sleeves, wraps, food) for an order item.
    Returns NomMaterial, TipoMaterial, Cantidad."""
    logger.info(f"[tool] get_order_item_materials: order_item_id={order_item_id} receta_id={receta_id}")
    data = await webflor_fetch(
        "/WebFlorVenta/API/listarOrdenMaterialById",
        params={"iIdPedidoItem": order_item_id, "IdPedidoItemReceta": receta_id},
    )
    return json.dumps(data, indent=2)


@mcp.tool()
async def create_order(
    IdCliente: int,
    FechaOrden: str,
    FechaElaboracion: str,
    FechaEntrega: str,
    FechaLlegada: str,
    PO: str = "",
    Comentario: str = "",
    Marcacion: str = "",
) -> str:
    """Create a new order header in WebFlor. Automatically fetches client defaults
    (branch, vendor, freight agency, negotiation type) from WebFlor before creating.
    Returns the new order ID (iIdPedido)."""
    logger.info(f"[tool] create_order: IdCliente={IdCliente} PO={PO} dates={FechaOrden}/{FechaEntrega}")
    try:
        branches_data = await webflor_fetch(
            "/WebFlorVenta/API/listarClienteSucursalesById",
            params={"iIdCliente": str(IdCliente)},
        )
        client_data = await webflor_fetch(
            "/WebFlorVenta/API/listarClientePorIdCliente",
            params={"iIdCliente": str(IdCliente)},
        )

        sucursal_id = 0
        if isinstance(branches_data, list):
            for b in branches_data:
                if b.get("SucursalDefecto"):
                    sucursal_id = b.get("IdClienteSucursal", 0)
                    break
            if not sucursal_id and branches_data:
                sucursal_id = branches_data[0].get("IdClienteSucursal", 0)

        client_record = client_data[0] if isinstance(client_data, list) and client_data else {}
        pick_vendedor = client_record.get("PickVendedor", 0)
        pick_agencia = client_record.get("PickAgenciaCarga", 0)
        pick_negociacion = client_record.get("PickTipoNegociacion", 0)
        id_tipo_venta = client_record.get("IdTipoVenta", 1)

        if not sucursal_id:
            return f"ERROR: No branches found for IdCliente={IdCliente}. Check if the client ID is correct."

        body = {
            "IdPedido": 0,
            "EsRepetitiva": 0,
            "IdCliente": IdCliente,
            "IdClienteSucursal": sucursal_id,
            "IdCompania": 1,
            "IdConfigFlujo": 39,
            "FechaOrden": FechaOrden,
            "FechaElaboracion": FechaElaboracion,
            "FechaEntrega": FechaEntrega,
            "FechaLlegada": FechaLlegada,
            "PickTipoNegociacion": pick_negociacion,
            "IdTipoVenta": id_tipo_venta,
            "PickTipoOrden": 53,
            "PickVendedor": pick_vendedor,
            "PickAgenciaCarga": pick_agencia,
            "Marcacion": Marcacion,
            "PO": PO,
            "Comentario": Comentario,
            "IdUsuarioAuditoria": 6109,
            "ManejaInventario": 0,
        }
        logger.info(f"[tool] create_order payload: {json.dumps(body)}")
        data = await webflor_fetch("/WebFlorVenta/API/guardarOrden", method="POST", body=body)
        if isinstance(data, dict) and data.get("iIdPedido"):
            data["_link"] = _order_link(data["iIdPedido"])
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] create_order failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def add_order_item(
    IdPedido: int,
    IdFinca: int,
    IdEmpaque: str,
    IdTipoCaja: str,
    PickMarca: int,
    IdDimensionCaja: str,
    PickTipoCorte: str,
    CantidadCaja: int,
    CajaConfirmada: int,
    TallosRamo: int,
    RamosCaja: int,
    Precio: float,
    IdUsuarioAuditoria: str,
    NomMarca: str = "",
    Comentario: str = "",
    UPC: str = "",
    PullDate: str = "",
    CajaId: str = "",
    IdComposicion: str = "",
    PickTipoPrecio: str = "",
) -> str:
    """Add a new item (line) to an existing WebFlor order.
    PickTipoPrecio: price type pick ID (e.g. '67' for Tallos/per-stem). Must be provided.
    PullDate: date code for UPC sticker (e.g. '062', '066'). Optional.
    CajaId: UPC label name (e.g. 'Carnations Asstd'). Optional."""
    logger.info(f"[tool] add_order_item: IdPedido={IdPedido} IdEmpaque={IdEmpaque} Cajas={CantidadCaja} TallosRamo={TallosRamo} RamosCaja={RamosCaja} Precio={Precio} PickTipoPrecio={PickTipoPrecio}")
    precio_val = float(Precio)

    body = {
        "IdPedidoItem": "",
        "IdPedido": IdPedido,
        "IdFinca": IdFinca,
        "IdEmpaque": str(IdEmpaque),
        "IdTipoCaja": str(IdTipoCaja),
        "PickMarca": PickMarca,
        "NomMarca": NomMarca,
        "IdDimensionCaja": str(IdDimensionCaja),
        "PickTipoCorte": str(PickTipoCorte),
        "Comentario": Comentario,
        "CantidadCaja": int(CantidadCaja),
        "CajaConfirmada": int(CajaConfirmada),
        "TallosRamo": int(TallosRamo),
        "RamosCaja": int(RamosCaja),
        "Precio": precio_val,
        "PickTipoPrecio": str(PickTipoPrecio),
        "inpPrecio": precio_val,
        "PrecioDecimal": precio_val,
        "IdComposicion": str(IdComposicion),
        "IdUsuarioAuditoria": str(IdUsuarioAuditoria),
        "ValorPick": 0,
        "PickTipoMarca": 0,
        "PickTipoOrden": 0,
        "CajaId": CajaId,
        "UPC": UPC,
        "PullDate": PullDate,
    }
    logger.info(f"[tool] add_order_item payload: {json.dumps(body)}")
    try:
        data = await webflor_fetch("/WebFlorVenta/API/guardarOrdenIt", method="POST", body=body)
        if isinstance(data, dict):
            logger.info(f"[tool] add_order_item response: IdPedidoItem={data.get('IdPedidoItem')} Precio={data.get('Precio')} RamosCaja={data.get('RamosCaja')} TallosRamo={data.get('TallosRamo')}")
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] add_order_item failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_order_item(body: dict) -> str:
    """Update an existing order item in place. Uses PUT V1/editarOrdenIt (the Actualizar button).
    Get the item first via get_order_items, modify the fields you need, then pass the whole object here.
    WARNING: Do NOT use guardarOrdenIt for updates — it always creates duplicates."""
    logger.info(f"[tool] update_order_item: IdPedidoItem={body.get('IdPedidoItem', '?')}")

    # editarOrdenIt ignores some read-field names — it requires different write-field names.
    # Auto-inject so callers don't need to know about these API quirks.
    if "PickTipoPrecio" in body and "PickTipoPrecioItem" not in body:
        body["PickTipoPrecioItem"] = body["PickTipoPrecio"]
    if "PickTipoOrden" in body and "PickTipoOrdenPUC" not in body:
        body["PickTipoOrdenPUC"] = body["PickTipoOrden"]

    try:
        data = await webflor_fetch("/WebFlorVenta/API/V1/editarOrdenIt", method="PUT", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] update_order_item failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def add_order_flower(
    IdPedidoItem: int,
    IdProducto: str,
    IdGrado: str,
    IdColor: str,
    IdVariedad: str,
    PickTipoPrecio: str,
    CantidadRamos: int,
    CantidadTallos: int,
    TotalTallos: int,
    PrecioRamo: float,
    PrecioTallo: float,
    Total: float,
    IdPedidoItemReceta: int | None = None,
    IdUsuarioAuditoria: str = "6109",
    PickProceso: str = "",
    PickTecnica: str = "",
) -> str:
    """Add a flower recipe row to an order item. Uses POST guardarOrdenFlor.
    IdPedidoItemReceta: None for ManejaReceta=1, container ID for ManejaReceta=2.
    TotalTallos = CantidadRamos × CantidadTallos."""
    logger.info(f"[tool] add_order_flower: IdPedidoItem={IdPedidoItem} Variedad={IdVariedad} Ramos={CantidadRamos}")
    body = {
        "IdPedidoItem": IdPedidoItem,
        "IdPedidoItemReceta": IdPedidoItemReceta,
        "IdProducto": IdProducto,
        "IdGrado": IdGrado,
        "IdColor": IdColor,
        "IdVariedad": IdVariedad,
        "PickTipoPrecio": PickTipoPrecio,
        "CantidadRamos": CantidadRamos,
        "CantidadTallos": CantidadTallos,
        "TotalTallos": TotalTallos,
        "IdUsuarioAuditoria": IdUsuarioAuditoria,
        "PrecioRamo": PrecioRamo,
        "PrecioTallo": PrecioTallo,
        "Total": Total,
        "PickProceso": PickProceso,
        "PickTecnica": PickTecnica,
        "PedidoItemFlorColor": [],
    }
    try:
        data = await webflor_fetch("/WebFlorVenta/API/guardarOrdenFlor", method="POST", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] add_order_flower failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_order_flower(
    IdPedidoItemFlor: int,
    IdPedidoItem: int,
    IdProducto: str,
    IdGrado: str,
    IdColor: str,
    IdVariedad: str,
    PickTipoPrecio: str,
    CantidadRamos: int,
    CantidadTallos: int,
    TotalTallos: int,
    PrecioRamo: float,
    PrecioTallo: float,
    Total: float,
    IdPedidoItemReceta: int | None = None,
    IdUsuarioAuditoria: str = "6109",
    PickProceso: str = "",
    PickTecnica: str = "",
) -> str:
    """Update an existing flower recipe row. Uses PUT editarOrdenFlor.
    Same as add_order_flower but includes IdPedidoItemFlor (the row's primary key)."""
    logger.info(f"[tool] update_order_flower: IdPedidoItemFlor={IdPedidoItemFlor} Ramos={CantidadRamos}")
    body = {
        "IdPedidoItemFlor": IdPedidoItemFlor,
        "IdPedidoItem": IdPedidoItem,
        "IdPedidoItemReceta": IdPedidoItemReceta,
        "IdProducto": IdProducto,
        "IdGrado": IdGrado,
        "IdColor": IdColor,
        "IdVariedad": IdVariedad,
        "CantidadRamos": CantidadRamos,
        "CantidadTallos": CantidadTallos,
        "IdUsuarioAuditoria": IdUsuarioAuditoria,
        "Total": Total,
        "PrecioRamo": PrecioRamo,
        "PrecioTallo": PrecioTallo,
        "TotalTallos": TotalTallos,
        "PickTipoPrecio": PickTipoPrecio,
        "PickProceso": PickProceso,
        "PickTecnica": PickTecnica,
        "PedidoItemFlorColor": [],
    }
    try:
        data = await webflor_fetch("/WebFlorVenta/API/editarOrdenFlor", method="PUT", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] update_order_flower failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def add_order_recipe(
    IdPedidoItem: int,
    NroReceta: int,
    NombreReceta: str,
    CantidadRamos: int,
    CantidadTallos: int,
    PrecioRecetaRamo: float,
    IdComposicion: str | None = None,
    IdUsuarioAuditoria: str = "6109",
    UPC: str = "",
) -> str:
    """Create a named recipe container for a ManejaReceta=2 item. Uses POST guardarOrdenRec.
    After creating, add flower rows with IdPedidoItemReceta set to the returned container ID."""
    logger.info(f"[tool] add_order_recipe: IdPedidoItem={IdPedidoItem} NombreReceta={NombreReceta} Ramos={CantidadRamos}")
    body = {
        "IdPedidoItem": IdPedidoItem,
        "NroReceta": NroReceta,
        "NombreReceta": NombreReceta,
        "CantidadRamos": CantidadRamos,
        "CantidadTallos": CantidadTallos,
        "PrecioRecetaRamo": PrecioRecetaRamo,
        "IdComposicion": IdComposicion,
        "IdUsuarioAuditoria": IdUsuarioAuditoria,
        "UPC": UPC,
        "TotalFlor": 0,
        "TotalMaterial": 0,
        "PrecioRamo": PrecioRecetaRamo,
        "PrecioTallo": 0,
        "PrecioRamoFlor": 0,
        "PrecioRamoMaterial": 0,
        "TotalReceta": 0,
        "TotalRamos": 0,
        "TotalTallos": 0,
    }
    try:
        data = await webflor_fetch("/WebFlorVenta/API/guardarOrdenRec", method="POST", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] add_order_recipe failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_order_recipe(
    IdPedidoItemReceta: int,
    IdPedidoItem: int,
    NroReceta: int,
    NombreReceta: str,
    CantidadRamos: int,
    CantidadTallos: int,
    PrecioRecetaRamo: float,
    IdComposicion: str | None = None,
    IdUsuarioAuditoria: str = "6109",
    UPC: str = "",
) -> str:
    """Update an existing named recipe container. Uses PUT editarOrdenRec."""
    logger.info(f"[tool] update_order_recipe: IdPedidoItemReceta={IdPedidoItemReceta} NombreReceta={NombreReceta}")
    body = {
        "IdPedidoItemReceta": IdPedidoItemReceta,
        "IdPedidoItem": IdPedidoItem,
        "NroReceta": NroReceta,
        "NombreReceta": NombreReceta,
        "CantidadRamos": CantidadRamos,
        "CantidadTallos": CantidadTallos,
        "PrecioRecetaRamo": PrecioRecetaRamo,
        "IdComposicion": IdComposicion,
        "IdUsuarioAuditoria": IdUsuarioAuditoria,
        "UPC": UPC,
    }
    try:
        data = await webflor_fetch("/WebFlorVenta/API/editarOrdenRec", method="PUT", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] update_order_recipe failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_item_datos_adicionales(
    IdPedidoItem: int,
    IdPedidoItemReceta: int = 0,
) -> str:
    """Read the 'Datos Adicionales' (UPC/PullDate) for an order item or recipe container.
    For simple items (Receta=0/1): pass IdPedidoItemReceta=0 (default).
    For recipe items (Receta=2): pass the specific IdPedidoItemReceta from get_order_item_recipes.
    Returns PullDate, NombreUPC, NumeroUPC, CajaId, Codigo, PickTipoOrdenPUC, etc."""
    logger.info(f"[tool] get_item_datos_adicionales: IdPedidoItem={IdPedidoItem} IdPedidoItemReceta={IdPedidoItemReceta}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/seleccionarDatosAdicionales",
            params={"IdPedidoItem": str(IdPedidoItem), "IdPedidoItemReceta": str(IdPedidoItemReceta)},
        )
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_item_datos_adicionales failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_recipe_datos_adicionales(body: dict) -> str:
    """Update the 'Datos Adicionales' (UPC/PullDate) for a RECIPE container (Receta=2 items).
    Uses PUT editarDatosAdicionalesReceta.
    Get the recipe container first via get_order_item_recipes, then pass the full object
    with updated PullDate/NumeroUPC/NombreUPC/CajaId fields.
    For simple items (Receta=0/1), use update_order_item instead — PullDate goes in editarOrdenIt."""
    logger.info(f"[tool] update_recipe_datos_adicionales: IdPedidoItemReceta={body.get('IdPedidoItemReceta', '?')}")
    try:
        data = await webflor_fetch("/WebFlorVenta/API/editarDatosAdicionalesReceta", method="PUT", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] update_recipe_datos_adicionales failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def delete_order_item(
    order_item_id: int,
    order_id: int,
    user_id: int = 6109,
) -> str:
    """Delete an order item (line) from a WebFlor order.
    Uses DELETE /eliminarOrdenItem. Returns the deleted item echoed back."""
    logger.info(f"[tool] delete_order_item: IdPedidoItem={order_item_id} IdPedido={order_id}")
    try:
        body = {
            "IdPedidoItem": order_item_id,
            "IdPedido": order_id,
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/eliminarOrdenItem", method="DELETE", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] delete_order_item failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_order(body: dict) -> str:
    """Update an existing order header in WebFlor. Pass the full order object with modifications."""
    logger.info(f"[tool] update_order: IdPedido={body.get('IdPedido', '?')}")
    data = await webflor_fetch("/WebFlorVenta/API/actualizarOrden", method="PUT", body=body)
    return json.dumps(data, indent=2)


@mcp.tool()
async def copy_order(
    source_order_id: int,
    client_id: int,
    branch_id: int,
    order_date: str,
    delivery_date: str,
    arrival_date: str,
    company_id: int = 1,
    sale_type_id: int = 1,
    user_id: str = "6109",
) -> str:
    """Copy an existing WebFlor order to create a new order with different dates.
    All items, quantities, prices, recipes, marca, finca copy over from the source.
    Date format is MM/DD/YYYY (with slashes). Use this for forecast/standing orders
    or when a customer wants the same order repeated for a future date.
    Optionally change client/branch on the copy."""
    logger.info(f"[tool] copy_order: source={source_order_id} client={client_id} dates={order_date}/{delivery_date}/{arrival_date}")
    try:
        body = {
            "iIdPedido": source_order_id,
            "iIdUsuario": user_id,
            "ajustes": {
                "IdCompania": company_id,
                "IdCliente": client_id,
                "IdClienteSucursal": branch_id,
                "IdTipoVenta": sale_type_id,
                "FechaOrden": order_date,
                "FechaEntrega": delivery_date,
                "FechaLlegada": arrival_date,
            },
        }
        logger.info(f"[tool] copy_order payload: {json.dumps(body)}")
        data = await webflor_fetch("/WebFlorVenta/API/copiarPedido_Ajustes", method="POST", body=body)
        if isinstance(data, dict):
            logger.info(f"[tool] copy_order result: Resultado={data.get('Resultado')} IdPedido={data.get('IdPedido')} Mensaje={data.get('Mensaje')}")
            if data.get("IdPedido"):
                data["_link"] = _order_link(data["IdPedido"])
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] copy_order failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_order_status(
    order_id: int,
    status: str,
    user_id: int = 6109,
) -> str:
    """Update an order's status (e.g. 'En proceso', 'Pendiente', 'Confirmado').
    Uses PUT actualizarEstadoPedido."""
    logger.info(f"[tool] update_order_status: order_id={order_id} status={status}")
    try:
        body = {
            "IdPedido": order_id,
            "Estado": status,
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/actualizarEstadoPedido", method="PUT", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] update_order_status failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def update_order_flow(
    order_id: int,
    user_id: int = 6109,
) -> str:
    """Advance an order through its workflow (e.g. from 'En proceso' to next state).
    Uses PUT actualizarFlujoOrden."""
    logger.info(f"[tool] update_order_flow: order_id={order_id}")
    try:
        body = {
            "IdPedido": order_id,
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/actualizarFlujoOrden", method="PUT", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] update_order_flow failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def delete_order_flower(
    flower_row_id: int,
    order_item_id: int,
    user_id: int = 6109,
) -> str:
    """Delete a flower recipe row from an order item.
    flower_row_id is the IdPedidoItemFlor from get_order_item_flowers."""
    logger.info(f"[tool] delete_order_flower: IdPedidoItemFlor={flower_row_id} IdPedidoItem={order_item_id}")
    try:
        body = {
            "IdPedidoItemFlor": flower_row_id,
            "IdPedidoItem": order_item_id,
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/eliminarOrdenFlor", method="DELETE", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] delete_order_flower failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def delete_order_recipe(
    recipe_id: int,
    order_item_id: int,
    user_id: int = 6109,
) -> str:
    """Delete a named recipe container from an order item (ManejaReceta=2).
    recipe_id is the IdPedidoItemReceta from get_order_item_recipes.
    This also deletes all flower rows inside the container."""
    logger.info(f"[tool] delete_order_recipe: IdPedidoItemReceta={recipe_id} IdPedidoItem={order_item_id}")
    try:
        body = {
            "IdPedidoItemReceta": recipe_id,
            "IdPedidoItem": order_item_id,
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/eliminarOrdenRec", method="DELETE", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] delete_order_recipe failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_item_detail(order_item_id: int) -> str:
    """Get full detail for a single order item including computed fields, prices, recipe mode, etc.
    Uses listarItemDetalleOrdenByIdPedidoItem. Note the lowercase 'i' prefix on the parameter."""
    logger.info(f"[tool] get_item_detail: order_item_id={order_item_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarItemDetalleOrdenByIdPedidoItem",
            params={"iIdPedidoItem": str(order_item_id)},
        )
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_item_detail failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def copy_items_between_orders(
    source_order_id: int,
    target_order_id: int,
    item_ids: list[int],
    user_id: int = 6109,
) -> str:
    """Copy specific items from one order to another. Uses POST CopiaItemsOrdenes.
    item_ids: list of IdPedidoItem values to copy."""
    logger.info(f"[tool] copy_items_between_orders: source={source_order_id} target={target_order_id} items={item_ids}")
    try:
        body = {
            "IdPedidoOrigen": source_order_id,
            "IdPedidoDestino": target_order_id,
            "Items": [{"IdPedidoItem": iid} for iid in item_ids],
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/CopiaItemsOrdenes", method="POST", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] copy_items_between_orders failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def transfer_items_between_orders(
    source_order_id: int,
    target_order_id: int,
    item_ids: list[int],
    user_id: int = 6109,
) -> str:
    """Transfer (move) specific items from one order to another. Uses POST TrasladarItemsOrdenes.
    Items are removed from the source order and added to the target."""
    logger.info(f"[tool] transfer_items_between_orders: source={source_order_id} target={target_order_id} items={item_ids}")
    try:
        body = {
            "IdPedidoOrigen": source_order_id,
            "IdPedidoDestino": target_order_id,
            "Items": [{"IdPedidoItem": iid} for iid in item_ids],
            "IdUsuarioAuditoria": user_id,
        }
        data = await webflor_fetch("/WebFlorVenta/API/TrasladarItemsOrdenes", method="POST", body=body)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] transfer_items_between_orders failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_customer_branches(client_id: int) -> str:
    """List branches (sucursales) for a customer. Returns branch IDs, names, and which is the default.
    Useful before creating/copying orders — you need IdClienteSucursal."""
    logger.info(f"[tool] get_customer_branches: client_id={client_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarClienteSucursalesById",
            params={"iIdCliente": str(client_id)},
        )
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_customer_branches failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_client_product_ficha(client_id: int, product_id: int) -> str:
    """Get the client-product card (ficha) with pricing defaults, cut type, price type, etc.
    product_id: WebFlor product ID (e.g. 71=Carnation, 69=Gems).
    Returns PickTipoPrecio, PickTipoCorte, pricing defaults for this client+product combination."""
    logger.info(f"[tool] get_client_product_ficha: client_id={client_id} product_id={product_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarFichaClientePorIdClienteIdProducto",
            params={"iIdCliente": str(client_id), "iIdProducto": str(product_id)},
        )
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_client_product_ficha failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_packaging_detail(empaque_id: int) -> str:
    """Get full detail for a packaging type (empaque) by ID, including ManejaReceta mode,
    PickTipoEmpaque, composition info, etc. Uses listarEmpaqueByIdEmpaqueSinImagen."""
    logger.info(f"[tool] get_packaging_detail: empaque_id={empaque_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarEmpaqueByIdEmpaqueSinImagen",
            params={"iIdEmpaque": str(empaque_id)},
        )
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_packaging_detail failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_order_workflow(order_id: int) -> str:
    """Get the current workflow state for an order. Returns flow stages and current position.
    Uses listarFlujoById."""
    logger.info(f"[tool] get_order_workflow: order_id={order_id}")
    try:
        data = await webflor_fetch(
            "/WebFlorVenta/API/listarFlujoById",
            params={"iIdPedido": str(order_id)},
        )
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_order_workflow failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def list_sale_types() -> str:
    """List available sale types (tipo de venta) from WebFlor.
    Returns IdTipoVenta and NomTipoVenta."""
    logger.info("[tool] list_sale_types")
    try:
        data = await webflor_fetch("/WebFlorVenta/API/listarTipoVenta")
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"[tool] list_sale_types failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_order_link(order_id: int) -> str:
    """Get a direct URL link to view an order in the WebFlor web interface.
    Returns a clickable link to the order detail page."""
    logger.info(f"[tool] get_order_link: order_id={order_id}")
    return _order_link(order_id)


@mcp.tool()
async def webflor_api_call(path: str, method: str = "GET", params: dict | None = None, body: dict | None = None) -> str:
    """Make a generic API call to any WebFlor endpoint not covered by other tools."""
    logger.info(f"[tool] webflor_api_call: {method} {path}")
    data = await webflor_fetch(path, method=method, params=params, body=body)
    text = json.dumps(data, indent=2)
    if len(text) > 80_000:
        text = text[:80_000] + "\n... [TRUNCATED]"
    return text


@mcp.tool()
async def list_recent_orders(
    client_id: int,
    company_id: int = 1,
    status_filter: str = "",
    max_results: int = 10,
    date_from: str = "",
    date_to: str = "",
) -> str:
    """List recent orders for a customer from WebFlor.
    client_id: WebFlor IdCliente (e.g. 69 for Gems Group, NOT customer code 1142).
    status_filter: optional, filter by NomEstado (e.g. 'En proceso', 'Pendiente', 'Confirmado').
    date_from, date_to: optional date range filter (YYYY-MM-DD format). When provided,
      uses iIdFiltroFecha=15 to filter orders by date range server-side.
      Use this to search for orders around a specific ship/delivery date window.
    Returns order headers sorted newest first: IdPedido, PO, dates, status, total boxes/stems/value."""
    logger.info(f"[tool] list_recent_orders: client_id={client_id} status_filter={status_filter!r} dates={date_from}..{date_to}")
    try:
        # Use date filter if both dates provided, otherwise fetch all
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
                "iIdCompania": str(company_id),
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
        if not isinstance(data, list):
            return json.dumps(data, indent=2)

        # Sort by IdPedido descending (newest first)
        data.sort(key=lambda x: x.get("IdPedido", 0), reverse=True)

        # Filter by status if requested
        if status_filter:
            sf = status_filter.lower()
            data = [o for o in data if sf in str(o.get("NomEstado", "")).lower()]

        # Limit results
        data = data[:int(max_results)]

        # Extract key fields per order — fetch headers for detail
        results = []
        for order_summary in data:
            order_id = order_summary.get("IdPedido")
            # Fetch full header for each order
            header_data = await webflor_fetch(
                "/WebFlorVenta/API/listarOrdenById",
                params={"iIdPedido": str(order_id)},
            )
            header = header_data[0] if isinstance(header_data, list) and header_data else {}
            results.append({
                "IdPedido": order_id,
                "PO": header.get("PO", ""),
                "FechaOrden": header.get("FechaOrden", ""),
                "FechaEntrega": header.get("FechaEntrega", ""),
                "FechaLlegada": header.get("FechaLlegada", ""),
                "NomEstado": header.get("NomEstado", ""),
                "Cajas": header.get("Cajas", 0),
                "TotalUnidades": header.get("TotalUnidades"),
                "Comentario": header.get("Comentario", ""),
            })
        logger.info(f"[tool] list_recent_orders: {len(results)} orders")
        return json.dumps(results, indent=2)
    except Exception as e:
        logger.error(f"[tool] list_recent_orders failed: {e}")
        return f"ERROR: {e}"


@mcp.tool()
async def get_order_with_items(order_id: str) -> str:
    """Get a complete order (header + all line items) in one call.
    Returns the order header and all items with their quantities, prices, empaque, marca, box info, etc.
    Use this to inspect a reference order that could be copied for a new order."""
    logger.info(f"[tool] get_order_with_items: order_id={order_id}")
    try:
        header_data = await webflor_fetch(
            "/WebFlorVenta/API/listarOrdenById",
            params={"iIdPedido": order_id},
        )
        items_data = await webflor_fetch(
            "/WebFlorVenta/API/listarDetalleOrdenByIdPedido",
            params={"iIdPedido": order_id},
        )
        header = header_data[0] if isinstance(header_data, list) and header_data else {}
        items = items_data if isinstance(items_data, list) else []
        result = {
            "header": {
                "IdPedido": header.get("IdPedido"),
                "PO": header.get("PO"),
                "NomCliente": header.get("NomCliente"),
                "FechaOrden": header.get("FechaOrden"),
                "FechaEntrega": header.get("FechaEntrega"),
                "FechaLlegada": header.get("FechaLlegada"),
                "FechaElaboracion": header.get("FechaElaboracion"),
                "NomEstado": header.get("NomEstado"),
                "Cajas": header.get("Cajas"),
                "TotalUnidades": header.get("TotalUnidades"),
                "Comentario": header.get("Comentario"),
                "IdClienteSucursal": header.get("IdClienteSucursal"),
            },
            "items": [
                {
                    "IdPedidoItem": it.get("IdPedidoItem"),
                    "NomEmpaque": it.get("NomEmpaque"),
                    "IdEmpaque": it.get("IdEmpaque"),
                    "CantidadCaja": it.get("CantidadCaja"),
                    "TallosRamo": it.get("TallosRamo"),
                    "RamoXCaja": it.get("RamoXCaja"),
                    "PrecioRamo": it.get("PrecioRamo"),
                    "PickTipoPrecio": it.get("PickTipoPrecio"),
                    "NomCaja": it.get("NomCaja"),
                    "NomMarca": it.get("NomMarca"),
                    "NombreDimension": it.get("NombreDimension"),
                    "NomFinca": it.get("NomFinca"),
                    "PickTipoCorte": it.get("PickTipoCorte"),
                    "NomTipoCorte": it.get("NomTipoCorte"),
                    "TotalTallos": it.get("TotalTallos"),
                    "ValorTotal": it.get("ValorTotal"),
                    "CajaId": it.get("CajaId"),
                    "UPC": it.get("UPC"),
                    "TipoEmpaque": it.get("TipoEmpaque"),
                    "NomTipoOrden": it.get("NomTipoOrden"),
                }
                for it in items
            ],
        }
        logger.info(f"[tool] get_order_with_items: header + {len(items)} items")
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.error(f"[tool] get_order_with_items failed: {e}")
        return f"ERROR: {e}"


# -- Client lookup from cached CSV --

@mcp.tool()
async def search_clients_csv(query: str) -> str:
    """Search the local clientes.csv for customers matching the query.
    Searches across all fields: Codigo, IdCliente, NomCliente, NIT, Telefono.
    Returns matching rows with Codigo, IdCliente (WebFlor ID), NomCliente, NIT, Telefono, Estado.
    Use this to find customer info — e.g. map a customer code to a WebFlor IdCliente."""
    logger.info(f"[tool] search_clients_csv: query={query!r}")
    filepath = os.path.join(DATA_DIR, "clientes.csv")
    if not os.path.exists(filepath):
        alt = os.path.join(os.path.dirname(__file__), "clientes.csv")
        if os.path.exists(alt):
            filepath = alt
        else:
            return "clientes.csv not found."
    import csv
    search = query.strip().lower()
    exact_codigo = []
    name_matches = []
    other_matches = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            codigo = row.get("Codigo", "")
            nombre = row.get("NomCliente", "")
            base = {
                "Codigo": codigo,
                "IdCliente": row.get("IdCliente", ""),
                "NomCliente": nombre,
                "NIT": row.get("NIT", ""),
                "Telefono": row.get("Telefono", ""),
                "Estado": row.get("Estado", ""),
            }
            # Priority 1: exact Codigo match
            if search == codigo.lower():
                exact_codigo.append(base)
            # Priority 2: name contains search
            elif search in nombre.lower():
                name_matches.append(base)
            # Priority 3: any field contains search
            else:
                searchable = " ".join(str(v) for v in row.values()).lower()
                if search in searchable:
                    other_matches.append(base)
    # Return in priority order
    matches = exact_codigo + name_matches + other_matches
    if not matches:
        return f"No clients matching '{query}'."
    return json.dumps(matches[:10], indent=2)


# -- Supabase customer tools --

@mcp.tool()
async def search_customers(query: str) -> str:
    """Search customers by name (fuzzy). Returns matching customers with their Supabase ID, WebFlor ID (client_erp_id), email, phone, and notes."""
    logger.info(f"[tool] search_customers: query={query!r}")
    if not supabase or not ORGANIZATION_ID:
        return "Supabase not configured."
    search = query.strip().lower()
    result = (
        supabase.table("customers")
        .select("id, name, email, phone, notes, client_erp_id")
        .eq("active", True)
        .eq("organization_id", ORGANIZATION_ID)
        .ilike("name", f"%{search}%")
        .order("name")
        .limit(20)
        .execute()
    )
    if not result.data:
        return f"No customers matching '{query}'."
    return json.dumps(result.data, indent=2)


@mcp.tool()
async def list_all_customers() -> str:
    """List all active customers for this organization. Returns name, Supabase ID, WebFlor ID (client_erp_id), email, phone, notes."""
    logger.info("[tool] list_all_customers")
    if not supabase or not ORGANIZATION_ID:
        return "Supabase not configured."
    result = (
        supabase.table("customers")
        .select("id, name, email, phone, notes, client_erp_id")
        .eq("active", True)
        .eq("organization_id", ORGANIZATION_ID)
        .order("name")
        .execute()
    )
    lines = []
    for c in result.data:
        erp_id = c.get("client_erp_id", "?")
        line = f"{c['name']} | webflor_id: {erp_id} | supabase_id: {c['id']}"
        if c.get("email"):
            line += f" | {c['email']}"
        if c.get("notes"):
            line += f" | {c['notes']}"
        lines.append(line)
    return "\n".join(lines) if lines else "(no customers found)"


@mcp.tool()
async def get_customer_details(supabase_id: str = "", webflor_id: str = "") -> str:
    """Get full details for a specific customer by Supabase ID or WebFlor ID (client_erp_id)."""
    logger.info(f"[tool] get_customer_details: supabase_id={supabase_id} webflor_id={webflor_id}")
    if not supabase or not ORGANIZATION_ID:
        return "Supabase not configured."
    query_builder = (
        supabase.table("customers")
        .select("id, name, email, phone, notes, client_erp_id")
        .eq("organization_id", ORGANIZATION_ID)
    )
    if supabase_id:
        query_builder = query_builder.eq("id", supabase_id)
    elif webflor_id:
        query_builder = query_builder.eq("client_erp_id", webflor_id)
    else:
        return "Provide either supabase_id or webflor_id."
    result = query_builder.execute()
    if not result.data:
        return "Customer not found."
    return json.dumps(result.data[0], indent=2)


@mcp.tool()
async def resolve_delivery_date(date_text: str) -> str:
    """Resolve a relative date description (e.g. 'next Tuesday', 'March 15', 'this Friday') to a concrete date.
    Returns both ISO format (YYYY-MM-DD) and WebFlor format (YYYY/MM/DD)."""
    logger.info(f"[tool] resolve_delivery_date: {date_text!r}")
    from datetime import date, timedelta
    today = date.today()
    text = date_text.strip().lower()

    days = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}

    for day_name, day_num in days.items():
        if day_name in text:
            days_ahead = day_num - today.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            target = today + timedelta(days=days_ahead)
            return json.dumps({
                "input": date_text,
                "iso": target.isoformat(),
                "webflor": target.strftime("%Y/%m/%d"),
                "today": today.isoformat(),
            })

    return json.dumps({
        "input": date_text,
        "note": "Could not parse relative date. Use the date as provided or ask the user.",
        "today": today.isoformat(),
    })


# -- Week lookup --

_SEMANAS_CACHE: list[dict] | None = None

def _load_semanas() -> list[dict]:
    global _SEMANAS_CACHE
    if _SEMANAS_CACHE is None:
        semanas_path = os.path.join(DATA_DIR, "semanas_2026.json")
        with open(semanas_path, "r") as f:
            _SEMANAS_CACHE = json.load(f)
    return _SEMANAS_CACHE


@mcp.tool()
async def get_week(date_or_week: str) -> str:
    """Look up the WebFlor week number for a date, or get the date range for a week number.
    The floral industry operates on week numbers (Semana). Weeks run Monday–Sunday.
    Input: a date (YYYY-MM-DD) or a week number (e.g. '12').
    Returns: week number, start date (inicio), end date (fin)."""
    logger.info(f"[tool] get_week: {date_or_week!r}")
    semanas = _load_semanas()

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


# ─── Main ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys as _sys
    # Ensure session before accepting tool calls
    asyncio.get_event_loop().run_until_complete(ensure_session())
    if "--sse" in _sys.argv:
        from mcp.server.transport_security import TransportSecuritySettings
        port = int(os.getenv("MCP_SSE_PORT", "8000"))
        logger.info(f"Starting MCP server with SSE transport on port {port}")
        mcp.settings.port = port
        # Disable DNS rebinding protection so ngrok/tunnel hosts are accepted
        mcp.settings.transport_security = TransportSecuritySettings(
            enable_dns_rebinding_protection=False
        )
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")
