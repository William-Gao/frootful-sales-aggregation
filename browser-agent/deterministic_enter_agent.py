"""
Deterministic Enter Agent

No LLM — pure Python script that reads a V2 .md order file and enters it into
WebFlor via the MCP server's API functions.

Usage:
    cd browser-agent
    uv run deterministic_enter_agent.py --order orders/instructions/POFrootfulTest-01.md
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import datetime

import mistune

from dotenv import load_dotenv

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────

_fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
_console = logging.StreamHandler()
_console.setLevel(logging.INFO)
_console.setFormatter(_fmt)

logger = logging.getLogger("deterministic_enter")
logger.setLevel(logging.DEBUG)
logger.propagate = False
logger.addHandler(_console)

# Ensure webflor_auth logs are also visible
_auth_logger = logging.getLogger("webflor_auth")
_auth_logger.setLevel(logging.DEBUG)
_auth_logger.propagate = False
_auth_logger.addHandler(_console)


def _setup_file_logging(run_name: str) -> str:
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"enter_det_{run_name}_{timestamp}.log")
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(message)s"))
    logger.addHandler(fh)
    _auth_logger.addHandler(fh)
    return log_path


# ─── WebFlor API ─────────────────────────────────────────────────────────

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from webflor_auth import ensure_session, webflor_fetch, _order_link


# ─── Parse .md order file ─────────────────────────────────────────────────

_md_parser = mistune.create_markdown(renderer=None, plugins=["table"])


def _extract_cell_text(cell: dict) -> str:
    """Extract plain text from a mistune table cell node."""
    parts = []
    for child in cell.get("children", []):
        if child.get("type") in ("text", "codespan"):
            parts.append(child.get("raw", ""))
    return " ".join(parts).strip()


def _parse_md_tables(text: str) -> list[list[dict]]:
    """Parse all markdown tables in text into lists of row-dicts keyed by header."""
    tokens = _md_parser(text)
    tables = []
    for token in tokens:
        if token["type"] != "table":
            continue
        # Extract headers from table_head
        head = token["children"][0]
        headers = [_extract_cell_text(cell) for cell in head["children"]]
        # Extract rows from table_body
        rows = []
        if len(token["children"]) > 1:
            body = token["children"][1]
            for row_node in body["children"]:
                cells = [_extract_cell_text(cell) for cell in row_node["children"]]
                rows.append({headers[i]: cells[i] for i in range(min(len(headers), len(cells)))})
        tables.append(rows)
    return tables


def _safe_int(val: str, field_name: str) -> int:
    """Convert string to int with a clear error message."""
    try:
        return int(val.strip())
    except (ValueError, AttributeError):
        raise ValueError(f"Cannot convert '{val}' to int for field '{field_name}'")


def _safe_float(val: str, field_name: str) -> float:
    """Convert string to float with a clear error message."""
    try:
        return float(val.strip().lstrip("$"))
    except (ValueError, AttributeError):
        raise ValueError(f"Cannot convert '{val}' to float for field '{field_name}'")


# Maps lowercase header field names → internal keys
_FIELD_MAP = {
    "customer": "customer_name",
    "customer code": "customer_code",
    "webflor customer id": "client_erp_id",
    "po": "po",
    "comments": "comments",
    "consolidation date": "consolidation_date",
    "fecha orden": "fecha_orden",
    "fecha elaboracion": "fecha_elaboracion",
    "fecha entrega": "fecha_entrega",
    "fecha llegada": "fecha_llegada",
    "reference order": "reference_order_id",
    "reference po": "reference_po",
    "reference date": "reference_date",
}


def parse_order_file(path: str) -> dict:
    """Parse a V2 .md order instruction file into structured data."""
    with open(path, "r") as f:
        text = f.read()

    tables = _parse_md_tables(text)
    if len(tables) < 2:
        raise ValueError(f"Expected at least 2 tables (Order Details + Items), found {len(tables)}")

    order = {}

    # First table: Order Details (2-column: Field | Value)
    for row in tables[0]:
        field = row.get("Field", "").strip().lower()
        value = row.get("Value", "").strip()
        if field in _FIELD_MAP and value:
            order[_FIELD_MAP[field]] = value

    # Convert types
    if "client_erp_id" in order:
        order["client_erp_id"] = _safe_int(order["client_erp_id"], "WebFlor Customer ID")
    if "reference_order_id" in order:
        order["reference_order_id"] = _safe_int(order["reference_order_id"], "Reference Order")

    # Validate required fields
    for required in ("po", "reference_order_id"):
        if required not in order:
            raise ValueError(f"Missing required field: {required}")

    # Second table: Items
    items = []
    for i, row in enumerate(tables[1]):
        empaque = row.get("Empaque", "").strip()
        if not empaque or empaque.startswith("<"):
            continue
        if "IdEmpaque" not in row or "Cajas" not in row:
            raise ValueError(f"Item row {i+1} missing IdEmpaque or Cajas: {row}")
        items.append({
            "empaque_name": empaque,
            "id_empaque": _safe_int(row["IdEmpaque"], f"IdEmpaque (row {i+1})"),
            "cajas": _safe_int(row["Cajas"], f"Cajas (row {i+1})"),
            "tipo_precio": row.get("Tipo Precio", "Ramos").strip(),
            "precio": _safe_float(row.get("Precio", "0"), f"Precio (row {i+1})"),
            "caja_id": row.get("CajaId", "").strip(),
            "pull_date": row.get("PullDate", "").strip(),
        })

    if not items:
        raise ValueError("No valid items found in Items table")
    order["items"] = items

    return order


# ─── API Helpers ──────────────────────────────────────────────────────────

async def api_copy_order(reference_id: int, user_id: int = 6109) -> int:
    """Copy an order via copiarPedido_Ajustes. Returns the new order ID."""
    body = {
        "iIdPedido": reference_id,
        "IdUsuarioAuditoria": user_id,
    }
    data = await webflor_fetch("/WebFlorVenta/API/copiarPedido_Ajustes", method="POST", body=body)
    if isinstance(data, dict) and data.get("_status", 200) >= 400:
        raise RuntimeError(f"copy_order failed: {data}")
    # Response is [{"IdPedido": N, ...}] or {"IdPedido": N, ...}
    if isinstance(data, list):
        data = data[0] if data else {}
    if isinstance(data, dict):
        order_id = data.get("IdPedido")
        if order_id:
            return int(order_id)
    raise RuntimeError(f"Copy failed — no IdPedido in response: {data}")


async def api_update_order(order_id: int, updates: dict) -> dict:
    """Update order header via actualizarOrden."""
    updates["IdPedido"] = order_id
    data = await webflor_fetch("/WebFlorVenta/API/actualizarOrden", method="PUT", body=updates)
    if isinstance(data, dict) and data.get("_status", 200) >= 400:
        raise RuntimeError(f"update_order failed: {data}")
    return data


async def api_get_order(order_id: int) -> dict:
    """Get order header."""
    data = await webflor_fetch(
        "/WebFlorVenta/API/listarOrdenById",
        params={"iIdPedido": str(order_id)},
    )
    if isinstance(data, list):
        return data[0] if data else {}
    return data


async def api_get_order_items(order_id: int) -> list[dict]:
    """Get all line items for an order."""
    data = await webflor_fetch(
        "/WebFlorVenta/API/listarDetalleOrdenByIdPedido",
        params={"iIdPedido": str(order_id)},
    )
    return data if isinstance(data, list) else []


async def api_update_order_item(body: dict) -> dict:
    """Update an order item via editarOrdenIt."""
    # Auto-inject write field names
    if "PickTipoPrecio" in body and "PickTipoPrecioItem" not in body:
        body["PickTipoPrecioItem"] = body["PickTipoPrecio"]
    if "PickTipoOrden" in body and "PickTipoOrdenPUC" not in body:
        body["PickTipoOrdenPUC"] = body["PickTipoOrden"]
    data = await webflor_fetch("/WebFlorVenta/API/V1/editarOrdenIt", method="PUT", body=body)
    if isinstance(data, dict) and data.get("_status", 200) >= 400:
        raise RuntimeError(f"update_order_item failed: {data}")
    return data


async def api_delete_order_item(item_id: int, order_id: int, user_id: int = 6109) -> dict:
    """Delete an order item."""
    body = {"IdPedidoItem": item_id, "IdPedido": order_id, "IdUsuarioAuditoria": user_id}
    data = await webflor_fetch("/WebFlorVenta/API/eliminarOrdenItem", method="DELETE", body=body)
    return data


async def api_get_order_item_recipes(item_id: int) -> list[dict]:
    """Get recipe containers for a Receta=2 item."""
    data = await webflor_fetch(
        "/WebFlorVenta/API/listarOrdenRecByIdPedidoItem",
        params={"IdPedidoItem": str(item_id)},
    )
    return data if isinstance(data, list) else []


async def api_get_datos_adicionales(item_id: int, recipe_id: int = 0) -> dict:
    """Get Datos Adicionales for an item (NombreUPC, NumeroUPC, PullDate, etc)."""
    data = await webflor_fetch(
        "/WebFlorVenta/API/seleccionarDatosAdicionales",
        params={"IdPedidoItem": str(item_id), "IdPedidoItemReceta": str(recipe_id)},
    )
    return data if isinstance(data, dict) else {}


async def api_update_recipe_datos_adicionales(body: dict) -> dict:
    """Update Datos Adicionales for a recipe container."""
    data = await webflor_fetch("/WebFlorVenta/API/editarDatosAdicionalesReceta", method="PUT", body=body)
    if isinstance(data, dict) and data.get("_status", 200) >= 400:
        raise RuntimeError(f"update_recipe_datos_adicionales failed: {data}")
    return data


def _to_api_date(date_str: str) -> str:
    """Convert common date formats to YYYY/MM/DD for WebFlor API."""
    date_str = date_str.strip()
    for fmt in ("%m/%d/%Y", "%Y/%m/%d", "%m-%d-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y/%m/%d")
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {date_str}")


# ─── Main Flow ────────────────────────────────────────────────────────────

async def enter_order(order_file: str) -> dict:
    """Execute the full deterministic enter flow."""
    run_start = time.time()

    # 0. Ensure WebFlor session
    logger.info("STEP 0: Authenticating to WebFlor...")
    await ensure_session()

    # 1. Parse the order file
    order = parse_order_file(order_file)
    logger.info(f"Parsed order: PO={order['po']}, ref={order['reference_order_id']}, {len(order['items'])} items")
    for item in order["items"]:
        pd = item.get("pull_date") or "n/a"
        logger.info(f"  {item['empaque_name']} (ID:{item['id_empaque']}) × {item['cajas']} @ ${item['precio']} PullDate={pd}")

    ref_id = order["reference_order_id"]
    items_table = {item["id_empaque"]: item for item in order["items"]}

    # 2. Copy the reference order
    logger.info(f"STEP 2: Copying reference order {ref_id}...")
    new_order_id = await api_copy_order(ref_id)
    logger.info(f"  → New order ID: {new_order_id}")

    # 3. Update order header
    logger.info("STEP 3: Updating order header...")

    # Use individual fecha fields if present, fall back to consolidation_date
    consol = order.get("consolidation_date", "")
    fecha_orden = order.get("fecha_orden") or datetime.now().strftime("%m/%d/%Y")
    fecha_elaboracion = order.get("fecha_elaboracion") or consol
    fecha_entrega = order.get("fecha_entrega") or consol
    fecha_llegada = order.get("fecha_llegada") or consol

    # GET full order first, then merge updates (actualizarOrden requires full object)
    full_order = await api_get_order(new_order_id)
    full_order["PO"] = order["po"]
    full_order["Comentario"] = order.get("comments", "Entered by Frootful")
    full_order["FechaOrden"] = _to_api_date(fecha_orden)
    full_order["FechaElaboracion"] = _to_api_date(fecha_elaboracion)
    full_order["FechaEntrega"] = _to_api_date(fecha_entrega)
    full_order["FechaLlegada"] = _to_api_date(fecha_llegada)
    await api_update_order(new_order_id, full_order)
    logger.info(f"  → Header updated: PO={order['po']}, Entrega={_to_api_date(fecha_entrega)}")

    # 4. Update item quantities
    logger.info(f"STEP 4: Updating items...")
    copied_items = await api_get_order_items(new_order_id)
    logger.info(f"  → {len(copied_items)} items in copied order")

    # Fetch datos adicionales for Receta=1 items to preserve NombreUPC/NumeroUPC
    # (editarOrdenIt wipes these fields if they're not included in the request body)
    simple_items = [ci for ci in copied_items if ci.get("Receta", 0) in (0, 1)]
    if simple_items:
        logger.info(f"  → Fetching datos adicionales for {len(simple_items)} simple items (UPC preservation)...")
        datos_results = await asyncio.gather(
            *[api_get_datos_adicionales(ci["IdPedidoItem"]) for ci in simple_items]
        )
        datos_by_item = {ci["IdPedidoItem"]: datos for ci, datos in zip(simple_items, datos_results)}
    else:
        datos_by_item = {}

    updates = []
    deletes = []
    recipe_items = []  # (item, pull_date) tuples for Receta=2

    for ci in copied_items:
        emp_id = ci["IdEmpaque"]
        item_id = ci["IdPedidoItem"]

        if emp_id in items_table:
            target = items_table[emp_id]
            # Build update — start with the complete copied item object
            update_body = dict(ci)
            # Remove read-only / display fields not accepted by editarOrdenIt
            for key in ["$id", "NomEmpaque", "NomCaja", "NomMarca", "NombreDimension",
                        "NomTipoCorte", "NomFinca", "NomTipoOrden", "TipoEmpaque",
                        "EsNoMulti", "CajasFullesConfirmadas", "RecetaCantidadRamos",
                        "TipoPrecioReceta", "PickTipoEmpaque", "ValorPick"]:
                update_body.pop(key, None)

            # Set target quantities
            update_body["CantidadCaja"] = target["cajas"]
            update_body["CajaConfirmada"] = target["cajas"]

            # Set CajaId if specified
            if target.get("caja_id"):
                update_body["CajaId"] = target["caja_id"]

            # PullDate for simple items (Receta=0 or 1)
            receta = ci.get("Receta", 0)
            if receta in (0, 1) and target.get("pull_date"):
                update_body["PullDate"] = target["pull_date"]

            # Keep UPC blank (P.O. Ítem field)
            update_body["UPC"] = update_body.get("UPC") or ""

            # Preserve NombreUPC/NumeroUPC for simple items (copied by copiarPedido_Ajustes
            # but wiped by editarOrdenIt if not included in the body)
            if receta in (0, 1) and item_id in datos_by_item:
                datos = datos_by_item[item_id]
                if datos.get("NombreUPC"):
                    update_body["NombreUPC"] = datos["NombreUPC"]
                if datos.get("NumeroUPC"):
                    update_body["NumeroUPC"] = datos["NumeroUPC"]

            updates.append((item_id, update_body, ci["NomEmpaque"]))

            # Track Receta=2 items for PullDate update in step 5
            if receta == 2 and target.get("pull_date"):
                recipe_items.append((item_id, target["pull_date"], ci["NomEmpaque"]))
        else:
            deletes.append((item_id, ci["NomEmpaque"]))

    # Fire all updates and deletes in parallel
    logger.info(f"  → {len(updates)} updates, {len(deletes)} deletes")

    tasks = []
    for item_id, body, name in updates:
        logger.info(f"    UPDATE {name}: {body['CantidadCaja']} boxes, PullDate={body.get('PullDate', 'n/a')}")
        tasks.append(api_update_order_item(body))
    for item_id, name in deletes:
        logger.info(f"    DELETE {name}")
        tasks.append(api_delete_order_item(item_id, new_order_id))

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            for e in errors:
                logger.error(f"  → Error: {e}")
            raise RuntimeError(f"{len(errors)} item update(s) failed")
        logger.info(f"  → All {len(tasks)} item operations completed")

    # 5. Update PullDate for recipe items (Receta=2)
    if recipe_items:
        logger.info(f"STEP 5: Updating PullDate for {len(recipe_items)} recipe items...")
        recipe_tasks = []
        for item_id, pull_date, name in recipe_items:
            containers = await api_get_order_item_recipes(item_id)
            logger.info(f"  → {name}: {len(containers)} recipe containers")
            for container in containers:
                container["PullDate"] = pull_date
                logger.debug(f"    Container {container['IdPedidoItemReceta']} ({container.get('NombreReceta', '?')}): PullDate={pull_date}")
                recipe_tasks.append(api_update_recipe_datos_adicionales(container))

        if recipe_tasks:
            results = await asyncio.gather(*recipe_tasks, return_exceptions=True)
            errors = [r for r in results if isinstance(r, Exception)]
            if errors:
                for e in errors:
                    logger.error(f"  → Recipe error: {e}")
            logger.info(f"  → {len(recipe_tasks)} recipe PullDate updates completed ({len(errors)} errors)")
    else:
        logger.info("STEP 5: No recipe items — skipping PullDate recipe update")

    # 6. Verify
    logger.info(f"STEP 6: Verifying...")
    final_order, final_items = await asyncio.gather(
        api_get_order(new_order_id),
        api_get_order_items(new_order_id),
    )

    logger.info(f"  → Order {new_order_id}: PO={final_order.get('PO')}")
    logger.info(f"  → {len(final_items)} items:")
    for fi in final_items:
        logger.info(f"    {fi['NomEmpaque']}: {fi['CantidadCaja']} boxes @ ${fi.get('PrecioRamo', '?')}")

    # Check for mismatches
    final_emp_ids = {fi["IdEmpaque"] for fi in final_items}
    expected_emp_ids = set(items_table.keys())
    extra = final_emp_ids - expected_emp_ids
    missing = expected_emp_ids - final_emp_ids
    if extra:
        logger.warning(f"  ⚠ Extra items not deleted: {extra}")
    if missing:
        logger.warning(f"  ⚠ Missing items: {missing}")

    for fi in final_items:
        emp_id = fi["IdEmpaque"]
        if emp_id in items_table:
            expected = items_table[emp_id]
            if fi["CantidadCaja"] != expected["cajas"]:
                logger.warning(f"  ⚠ {fi['NomEmpaque']}: expected {expected['cajas']} boxes, got {fi['CantidadCaja']}")

    elapsed = time.time() - run_start
    link = _order_link(new_order_id)

    # 7. Report
    print(f"\n{'='*60}")
    print(f"Order created: {new_order_id}")
    print(f"PO: {order['po']}")
    print(f"Link: {link}")
    print(f"Items: {len(final_items)}")
    print(f"Duration: {elapsed:.1f}s")
    if extra:
        print(f"WARNING: Extra items not deleted: {extra}")
    if missing:
        print(f"WARNING: Missing items: {missing}")
    print(f"{'='*60}")

    logger.info(f"DONE — Order {new_order_id} created in {elapsed:.1f}s")
    logger.info(f"Link: {link}")

    return {
        "order_id": new_order_id,
        "link": link,
        "items": len(final_items),
        "duration": elapsed,
    }


def main():
    parser = argparse.ArgumentParser(description="Deterministic Enter Agent (no LLM)")
    parser.add_argument("--order", "-o", required=True, help="Path to the .md order instruction file")
    args = parser.parse_args()

    order_path = args.order
    if not os.path.isabs(order_path):
        order_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), order_path)

    if not os.path.exists(order_path):
        print(f"File not found: {order_path}")
        sys.exit(1)

    run_name = os.path.splitext(os.path.basename(order_path))[0]
    log_path = _setup_file_logging(run_name)
    print(f"Log: {log_path}")

    asyncio.run(enter_order(order_path))


if __name__ == "__main__":
    main()
