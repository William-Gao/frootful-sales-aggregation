#!/usr/bin/env python3
"""
Download all WebFlor reference/lookup data to browser-agent/data/.

Calls the same endpoints the WebFlor UI uses when loading the order detail page.
Paths verified from the WebFlor HTML source code.

Usage:
    cd browser-agent
    uv run download_reference_data.py
    uv run download_reference_data.py --all          # re-download everything
    uv run download_reference_data.py --only marcas_tipo_dimension
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

WEBFLOR_APP_URL = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")
_parsed = urlparse(WEBFLOR_APP_URL)
API_BASE_URL = f"{_parsed.scheme}://{_parsed.netloc}"

DATA_DIR = os.getenv("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

session_cookies: str = os.getenv("WEBFLOR_COOKIES", "")


async def ensure_session() -> str:
    global session_cookies
    if not session_cookies:
        import subprocess
        login_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "login.py")
        if os.path.exists(login_script):
            logger.info("No cookies — running login.py...")
            result = subprocess.run(
                [sys.executable, login_script],
                capture_output=True, text=True, timeout=120,
                cwd=os.path.dirname(login_script),
            )
            for line in result.stdout.splitlines():
                if "ASP.NET_SessionId" in line:
                    session_cookies = line.strip()
                    return session_cookies
            load_dotenv(override=True)
            session_cookies = os.getenv("WEBFLOR_COOKIES", "")
    return session_cookies


async def webflor_get(client: httpx.AsyncClient, path: str, params: dict | None = None) -> any:
    url = f"{API_BASE_URL}{path}"
    headers = {"Cookie": session_cookies, "Accept": "application/json"}
    logger.info(f"GET {path}" + (f" params={params}" if params else ""))
    resp = await client.get(url, headers=headers, params=params, follow_redirects=False)

    if 300 <= resp.status_code < 400:
        location = resp.headers.get("location", "")
        if "login" in location.lower():
            raise RuntimeError("Session expired — re-run login.py or set WEBFLOR_COOKIES")

    if resp.status_code == 404:
        raise RuntimeError(f"404 Not Found: {path}")

    data = json.loads(resp.text)
    count = len(data) if isinstance(data, list) else 1
    logger.info(f"  -> {resp.status_code} ({count} records, {len(resp.text)} bytes)")
    return data


def save_json(filename: str, data: any):
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    count = len(data) if isinstance(data, list) else 1
    logger.info(f"  Saved {filename} ({count} records)")


# ─── Dataset definitions ─────────────────────────────────────────────────
# Paths verified from WebFlor HTML source (Detalles de la Orden page)

DATASETS = {
    # Combined marca + box type + dimension — THE key lookup for box fields
    "marcas_tipo_dimension": {
        "file": "marcas_tipo_dimension.json",
        "path": "/WebFlorTablasBasicas/API/listarCajasMarcaTipoDimension",
        "params": {"iIdEstado": "true"},
        "description": "Combined marca/box-type/dimension mapping (68 records)",
    },
    # Box types (active)
    "tipo_caja": {
        "file": "tipo_caja.json",
        "path": "/WebFlorTablasBasicas/API/listarTipoCajaActivas",
        "description": "Active box types",
    },
    # Box dimensions
    "dimensiones_caja": {
        "file": "dimensiones_caja.json",
        "path": "/WebFlorTablasBasicas/API/listarDimensionCaja",
        "description": "Box dimensions",
    },
    # NOTE: empaques not included — listarEmpaquesActivos returns max 100 with empty filter.
    # Use packaging_webflor_items_list.csv instead (has full dataset with IdProducto).
    # Farms for orders — under WebFlorBasico
    "fincas": {
        "file": "fincas.json",
        "path": "/WebFlorBasico/API/listarFincasTipoBodegaOAmbasOrdenes",
        "params": {"iIdCompania": "1"},
        "description": "Farms (company 1)",
    },
    # Companies
    "companias": {
        "file": "companias.json",
        "path": "/WebFlorBasico/API/listarCompaniasActivasSinLogo",
        "description": "Active companies",
    },
}

# Picklists — master IDs from the WebFlor HTML source
# All use /WebFlorBasico/API/listarPickListActivosIHTTP
PICKLIST_MASTERS = {
    "tipoCorte": 27,           # includes ID 255 = "Corte 3"
    "tipoNegociacion": 38,
    "agenciasCarga": 42,
    "tipoPrecioItem": 59,      # 66=Ramos, 67=Tallos — Ramos/Tallos selector on order items
    "modulosBloqueo": 69,
    "busquedaPorFecha": 122,
    "tipoOrden": 130,
    "vendedores": 137,
}


async def download_picklists(client: httpx.AsyncClient):
    """Download all picklist categories and merge into one file."""
    logger.info("Downloading picklists...")
    all_picklists = {}
    for category, master_id in PICKLIST_MASTERS.items():
        try:
            data = await webflor_get(
                client,
                "/WebFlorBasico/API/listarPickListActivosIHTTP",
                params={"iIDPickListMaster": str(master_id)},
            )
            all_picklists[category] = data if isinstance(data, list) else []
            logger.info(f"  Picklist {category} (master={master_id}): {len(all_picklists[category])} items")
        except Exception as e:
            logger.error(f"  Failed to download picklist {category} (master={master_id}): {e}")
            all_picklists[category] = []
    save_json("picklists.json", all_picklists)


async def main():
    parser = argparse.ArgumentParser(description="Download WebFlor reference data")
    parser.add_argument("--all", action="store_true", help="Re-download everything (default: only missing files)")
    parser.add_argument("--only", help="Download only this dataset (e.g. 'marcas_tipo_dimension', 'picklists')")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)

    await ensure_session()
    if not session_cookies:
        logger.error("No session cookies available. Set WEBFLOR_COOKIES or run login.py first.")
        sys.exit(1)

    async with httpx.AsyncClient(timeout=60.0) as client:
        if args.only:
            if args.only == "picklists":
                await download_picklists(client)
                return
            if args.only not in DATASETS:
                logger.error(f"Unknown dataset: {args.only}. Available: {', '.join(DATASETS.keys())}, picklists")
                sys.exit(1)
            ds = DATASETS[args.only]
            logger.info(f"Downloading {args.only}: {ds['description']}...")
            data = await webflor_get(client, ds["path"], ds.get("params"))
            save_json(ds["file"], data)
            return

        # Download all datasets
        for name, ds in DATASETS.items():
            filepath = os.path.join(DATA_DIR, ds["file"])
            if not args.all and os.path.exists(filepath):
                logger.info(f"Skipping {name} — {ds['file']} already exists (use --all to refresh)")
                continue
            try:
                logger.info(f"Downloading {name}: {ds['description']}...")
                data = await webflor_get(client, ds["path"], ds.get("params"))
                save_json(ds["file"], data)
            except Exception as e:
                logger.error(f"Failed to download {name}: {e}")

        # Always refresh picklists (merges multiple endpoints)
        await download_picklists(client)

    logger.info("Done!")


if __name__ == "__main__":
    asyncio.run(main())
