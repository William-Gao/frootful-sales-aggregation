#!/usr/bin/env node
/**
 * WebFlor MCP Server
 *
 * Exposes WebFlor ERP operations as MCP tools for Claude Code.
 * Auth: session cookies grabbed from an active browser session via
 * the companion grab_webflor_session tool (uses browser-use to read cookies).
 *
 * Usage:
 *   1. Log into WebFlor manually in the browser
 *   2. Call `grab_webflor_session` — it hits a known endpoint to confirm the session is live
 *   3. Use any of the order/catalog tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import http from "node:http";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const execFileAsync = promisify(execFile);

const BASE_URL =
  process.env.WEBFLOR_BASE_URL || "http://190.146.143.55:5522";

// Path to login.py in the browser-agent directory
const LOGIN_SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../browser-agent/login.py"
);

// Session state — cookies extracted from browser or login script
let sessionCookies: string = "";

/**
 * Run login.py to get fresh WebFlor session cookies.
 * Returns the cookie string on success.
 */
async function runLoginScript(): Promise<string> {
  // Find Python — prefer the browser-agent venv
  const venvPython = resolve(dirname(LOGIN_SCRIPT), ".venv/bin/python");
  const python = await import("node:fs").then((fs) =>
    fs.existsSync(venvPython) ? venvPython : "python3"
  );

  const { stdout, stderr } = await execFileAsync(python, [LOGIN_SCRIPT], {
    cwd: dirname(LOGIN_SCRIPT),
    timeout: 120_000,
    env: { ...process.env },
  });

  if (stderr) {
    console.error("[login] stderr:", stderr);
  }

  // login.py prints "Cookies:\n<cookie_string>" at the end
  const lines = stdout.split("\n");
  for (const line of lines) {
    if (line.includes("ASP.NET_SessionId")) {
      return line.trim();
    }
  }

  throw new Error(
    `login.py did not return cookies. stdout: ${stdout.slice(0, 500)}`
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function webflorFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
  _retried = false
): Promise<unknown> {
  // Auto-login if no session
  if (!sessionCookies) {
    console.error("[webflorFetch] No session — running login.py...");
    try {
      sessionCookies = await runLoginScript();
    } catch (e: any) {
      throw new Error(`Auto-login failed: ${e.message}`);
    }
  }

  const method = options.method || "GET";
  const url = new URL(path, BASE_URL);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Cookie: sessionCookies,
    Accept: "application/json",
  };

  const fetchOpts: RequestInit = { method, headers, redirect: "manual" };

  if (options.body && method !== "GET") {
    headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(options.body);
  }

  const res = await fetch(url.toString(), fetchOpts);

  // If redirected to login, session expired — auto-refresh once
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "";
    if (
      location.toLowerCase().includes("login") ||
      location.toLowerCase().includes("cerrarsesion")
    ) {
      if (!_retried) {
        console.error("[webflorFetch] Session expired — auto-refreshing...");
        try {
          sessionCookies = await runLoginScript();
          return await webflorFetch(path, options, true);
        } catch (e: any) {
          throw new Error(`Session refresh failed: ${e.message}`);
        }
      }
      sessionCookies = "";
      throw new Error(
        "WebFlor session expired after retry. Check credentials."
      );
    }
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: res.status };
  }
}

// ─── MCP Server ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "webflor",
  version: "0.1.0",
});

// ── Tool: set session cookies ──────────────────────────────────────────────

server.tool(
  "set_webflor_session",
  "Set WebFlor session cookies for API access. After logging into WebFlor in the browser, use browser-use to extract cookies (document.cookie) and pass them here. The server will verify the session is active.",
  { cookies: z.string().describe("The cookie string from the browser (document.cookie value)") },
  async ({ cookies }) => {
    sessionCookies = cookies;

    // Verify session by hitting a lightweight endpoint
    try {
      const result = await webflorFetch(
        "/WebFlorBasico/API/listarCompaniasActivasSinLogo"
      );
      const companies = Array.isArray(result) ? result : [];
      return {
        content: [
          {
            type: "text" as const,
            text: `Session active. Found ${companies.length} companies: ${companies.map((c: any) => c.NomCompania).join(", ")}`,
          },
        ],
      };
    } catch (e: any) {
      sessionCookies = "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Session verification failed: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: auto-login via login.py ─────────────────────────────────────────

server.tool(
  "webflor_login",
  "Log into WebFlor automatically using saved credentials (WEBFLOR_USER/WEBFLOR_PASS in browser-agent/.env). Runs login.py via Playwright to get fresh session cookies. Use this if the session is expired or not set.",
  {},
  async () => {
    try {
      sessionCookies = await runLoginScript();

      // Verify the session works
      const result = await webflorFetch(
        "/WebFlorBasico/API/listarCompaniasActivasSinLogo"
      );
      const companies = Array.isArray(result) ? result : [];
      return {
        content: [
          {
            type: "text" as const,
            text: `Login successful. Session active. Found ${companies.length} companies: ${companies.map((c: any) => c.NomCompania).join(", ")}`,
          },
        ],
      };
    } catch (e: any) {
      sessionCookies = "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Login failed: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: list customers ───────────────────────────────────────────────────

server.tool(
  "webflor_list_customers",
  "List all active customers in WebFlor.",
  {},
  async () => {
    const data = await webflorFetch("/WebFlorVenta/API/listarCliente");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get customer by ID ───────────────────────────────────────────────

server.tool(
  "webflor_get_customer",
  "Get a specific customer's details by their client ID.",
  { clientId: z.string().describe("The WebFlor client ID (e.g. '1142')") },
  async ({ clientId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarClienteById`,
      { params: { IdCliente: clientId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list active packaging/products ───────────────────────────────────

server.tool(
  "webflor_list_products",
  "List all active empaques (packaging/product types) in WebFlor.",
  {},
  async () => {
    const data = await webflorFetch("/WebFlorVenta/API/listarEmpaquesActivos");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list orders ────────────────────────────────────────────────────────

server.tool(
  "webflor_list_orders",
  "List orders for a client, optionally filtered by date range. Returns order headers sorted newest first.",
  {
    clientId: z.number().describe("Client ID (e.g. 69)"),
    companyId: z.number().default(1).describe("Company ID (default 1)"),
    dateFrom: z.string().optional().describe("Start date filter (YYYY-MM-DD). If omitted, returns all orders."),
    dateTo: z.string().optional().describe("End date filter (YYYY-MM-DD). If omitted, returns all orders."),
    limit: z.number().optional().describe("Max number of orders to return (default: all)"),
  },
  async ({ clientId, companyId, dateFrom, dateTo, limit }) => {
    const filtroFecha = dateFrom && dateTo ? "15" : "0";
    const fechaInicial = dateFrom || "1900-01-01";
    const fechaFinal = dateTo || "3000-01-01";

    const data = await webflorFetch("/WebFlorVenta/API/listarOrdenes", {
      params: {
        iIdCliente: String(clientId),
        iIdCompania: String(companyId),
        iIdConsolidador: "0",
        iIdVendedor: "0",
        iIdFiltroFecha: filtroFecha,
        fechaInicial,
        fechaFinal,
        pickModulo: "131",
        ManejaInventario: "0",
        iIdVariedad: "0",
      },
    });

    if (!Array.isArray(data)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }

    // Sort newest first
    data.sort((a: any, b: any) => (b.IdPedido || 0) - (a.IdPedido || 0));

    const result = limit ? data.slice(0, limit) : data;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: get order by ID ──────────────────────────────────────────────────

server.tool(
  "webflor_get_order",
  "Get an order header by its pedido ID.",
  { orderId: z.string().describe("The WebFlor order/pedido ID (e.g. '314331')") },
  async ({ orderId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarOrdenById`,
      { params: { iIdPedido: orderId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get order line items ─────────────────────────────────────────────

server.tool(
  "webflor_get_order_items",
  "Get all line items (detail rows) for an order by its pedido ID.",
  { orderId: z.string().describe("The WebFlor order/pedido ID") },
  async ({ orderId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarDetalleOrdenByIdPedido`,
      { params: { iIdPedido: orderId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get order item flower detail ─────────────────────────────────────

server.tool(
  "webflor_get_order_item_flowers",
  "Get flower recipe rows for a specific order item. For ManejaReceta=1 (simple), use recetaId='0'. For ManejaReceta=2 (multi/bouquet), first call webflor_get_order_item_recipes to get container IDs, then call this with each container's IdPedidoItemReceta.",
  {
    orderItemId: z.string().describe("The WebFlor order item ID (IdPedidoItem)"),
    recetaId: z.string().default("0").describe("Recipe container ID. Use '0' for simple recipes (ManejaReceta=1), or a specific IdPedidoItemReceta for multi recipes (ManejaReceta=2)"),
  },
  async ({ orderItemId, recetaId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarOrdenFlorById`,
      { params: { iIdPedidoItem: orderItemId, IdPedidoItemReceta: recetaId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get order item recipe containers (ManejaReceta=2 only) ─────────

server.tool(
  "webflor_get_order_item_recipes",
  "Get named recipe containers for a multi-recipe order item (ManejaReceta=2, e.g. bouquets). Returns IdPedidoItemReceta, NombreReceta, CantidadRamos, UPC, TotalFlor, PrecioRamo. Use the IdPedidoItemReceta values with webflor_get_order_item_flowers to get flower rows per container.",
  { orderItemId: z.string().describe("The WebFlor order item ID (IdPedidoItem)") },
  async ({ orderItemId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarOrdenRecByIdPedidoItem`,
      { params: { IdPedidoItem: orderItemId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get order item materials ───────────────────────────────────────

server.tool(
  "webflor_get_order_item_materials",
  "Get packaging materials (sleeves, wraps, food) for an order item. Returns NomMaterial, TipoMaterial, Cantidad.",
  {
    orderItemId: z.string().describe("The WebFlor order item ID (IdPedidoItem)"),
    recetaId: z.string().default("0").describe("Recipe container ID (use '0' for all)"),
  },
  async ({ orderItemId, recetaId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarOrdenMaterialById`,
      { params: { iIdPedidoItem: orderItemId, IdPedidoItemReceta: recetaId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: add item to order ────────────────────────────────────────────────

server.tool(
  "webflor_add_order_item",
  "Add a new item (line) to an existing WebFlor order. This calls guardarOrdenIt (POST).",
  {
    IdPedido: z.number().describe("The order/pedido ID to add the item to"),
    IdFinca: z.number().describe("Farm ID (e.g. 3 for GFM)"),
    IdEmpaque: z.string().describe("Empaque/packaging ID"),
    IdTipoCaja: z.string().describe("Box type ID"),
    PickMarca: z.number().describe("Brand pick ID"),
    NomMarca: z.string().describe("Brand name/code"),
    IdDimensionCaja: z.string().describe("Box dimension ID"),
    PickTipoCorte: z.string().describe("Cut type pick ID"),
    CantidadCaja: z.number().describe("Number of boxes"),
    CajaConfirmada: z.number().describe("Confirmed boxes (usually same as CantidadCaja)"),
    TallosRamo: z.number().describe("Stems per bunch"),
    RamosCaja: z.number().describe("Bunches per box"),
    Precio: z.number().describe("Price per stem"),
    PickTipoPrecio: z.string().describe("Price type pick ID (e.g. '67')"),
    IdUsuarioAuditoria: z.string().describe("Audit user ID (e.g. '6109')"),
    Comentario: z.string().optional().describe("Optional comment"),
    UPC: z.string().optional().describe("UPC barcode number (e.g. '841152000137')"),
    PullDate: z.string().optional().describe("Pull date / date code (e.g. '062', '066')"),
    CajaId: z.string().optional().describe("Caja Id / UPC label name (e.g. 'Carnations Asstd')"),
  },
  async (input) => {
    const body = {
      IdPedidoItem: "",
      IdPedido: input.IdPedido,
      IdFinca: input.IdFinca,
      IdEmpaque: input.IdEmpaque,
      IdTipoCaja: input.IdTipoCaja,
      PickMarca: input.PickMarca,
      NomMarca: input.NomMarca,
      IdDimensionCaja: input.IdDimensionCaja,
      PickTipoCorte: input.PickTipoCorte,
      Comentario: input.Comentario || "",
      CantidadCaja: input.CantidadCaja,
      CajaConfirmada: input.CajaConfirmada,
      TallosRamo: input.TallosRamo,
      RamosCaja: input.RamosCaja,
      Precio: input.Precio,
      PickTipoPrecio: input.PickTipoPrecio,
      inpPrecio: input.Precio,
      PrecioDecimal: input.Precio,
      IdComposicion: "",
      IdUsuarioAuditoria: input.IdUsuarioAuditoria,
      ValorPick: 0,
      PickTipoMarca: 0,
      PickTipoOrden: 0,
      CajaId: input.CajaId || "",
      UPC: input.UPC || "",
      PullDate: input.PullDate || "",
    };

    const data = await webflorFetch("/WebFlorVenta/API/guardarOrdenIt", {
      method: "POST",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: create order header ──────────────────────────────────────────────

server.tool(
  "webflor_create_order",
  "Create a new order header in WebFlor (guardarOrden). Returns the new order ID.",
  {
    IdCliente: z.number().describe("Client ID"),
    IdSucursal: z.number().describe("Client branch/sucursal ID"),
    FechaOrden: z.string().describe("Order date (YYYY/MM/DD)"),
    FechaEntrega: z.string().describe("Delivery date (YYYY/MM/DD)"),
    FechaLlegada: z.string().describe("Arrival date (YYYY/MM/DD)"),
    IdAgenteComercial: z.number().optional().describe("Sales agent ID"),
    Comentario: z.string().optional().describe("Order comment"),
    PO: z.string().optional().describe("PO number"),
  },
  async (input) => {
    const body = {
      IdCliente: input.IdCliente,
      IdSucursal: input.IdSucursal,
      FechaOrden: input.FechaOrden,
      FechaEntrega: input.FechaEntrega,
      FechaLlegada: input.FechaLlegada,
      IdAgenteComercial: input.IdAgenteComercial || 0,
      Comentario: input.Comentario || "",
      PO: input.PO || "",
    };

    const data = await webflorFetch("/WebFlorVenta/API/guardarOrden", {
      method: "POST",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: update order header ──────────────────────────────────────────────

server.tool(
  "webflor_update_order",
  "Update an existing order header in WebFlor (actualizarOrden PUT).",
  {
    body: z
      .record(z.string(), z.unknown())
      .describe(
        "The full order object to PUT (include IdPedido and all fields). Get it first via webflor_get_order, modify fields, then pass here."
      ),
  },
  async ({ body }) => {
    const data = await webflorFetch("/WebFlorVenta/API/actualizarOrden", {
      method: "PUT",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: update order item ───────────────────────────────────────────────
// IMPORTANT: guardarOrdenIt ALWAYS creates a new item even with existing IdPedidoItem.
// To update in place, use PUT V1/editarOrdenIt (the "Actualizar" button endpoint).

server.tool(
  "webflor_update_order_item",
  "Update an existing order item in place. Uses PUT V1/editarOrdenIt. Get the item first via webflor_get_order_items, then pass the full object with modifications. WARNING: Do NOT use guardarOrdenIt for updates — it always creates duplicates.",
  {
    body: z
      .record(z.string(), z.unknown())
      .describe(
        "The full item object to PUT. Must include IdPedidoItem and all fields from the original item. Get via webflor_get_order_items, modify the fields you need, then pass the whole object here."
      ),
  },
  async ({ body }) => {
    // editarOrdenIt ignores some read-field names — it requires different write-field names.
    // Auto-inject so callers don't need to know about these API quirks.
    if ("PickTipoPrecio" in body && !("PickTipoPrecioItem" in body)) {
      body.PickTipoPrecioItem = body.PickTipoPrecio;
    }
    if ("PickTipoOrden" in body && !("PickTipoOrdenPUC" in body)) {
      body.PickTipoOrdenPUC = body.PickTipoOrden;
    }

    const data = await webflorFetch("/WebFlorVenta/API/V1/editarOrdenIt", {
      method: "PUT",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list box types ───────────────────────────────────────────────────

server.tool(
  "webflor_list_box_types",
  "List active box types (TipoCaja) in WebFlor.",
  {},
  async () => {
    const data = await webflorFetch(
      "/WebFlorTablasBasicas/API/listarTipoCajaActivas"
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list box dimensions ──────────────────────────────────────────────

server.tool(
  "webflor_list_box_dimensions",
  "List box dimensions available in WebFlor.",
  {},
  async () => {
    const data = await webflorFetch(
      "/WebFlorTablasBasicas/API/listarDimensionCaja"
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list box marks by type/dimension ─────────────────────────────────

server.tool(
  "webflor_list_box_marks",
  "List box brand/mark combinations filtered by mark, type, and dimension.",
  {},
  async () => {
    const data = await webflorFetch(
      "/WebFlorTablasBasicas/API/listarCajasMarcaTipoDimension"
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list farms ───────────────────────────────────────────────────────

server.tool(
  "webflor_list_farms",
  "List farms (fincas) available for orders, given a company ID.",
  { companyId: z.string().describe("The company ID (IdCompania)") },
  async ({ companyId }) => {
    const data = await webflorFetch(
      "/WebFlorBasico/API/listarFincasTipoBodegaOAmbasOrdenes",
      { params: { iIdCompania: companyId } }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get product compositions ─────────────────────────────────────────

server.tool(
  "webflor_get_compositions",
  "Get flower compositions for a given empaque (packaging) ID.",
  { empaqueId: z.string().describe("The Empaque ID") },
  async ({ empaqueId }) => {
    const data = await webflorFetch(
      `/WebFlorVenta/API/listarComposicionesByEmpaque/${empaqueId}`
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: delete order item ──────────────────────────────────────────────

server.tool(
  "webflor_delete_order_item",
  "Delete an order item (line) from a WebFlor order. Uses DELETE /eliminarOrdenItem.",
  {
    IdPedidoItem: z.number().describe("The order item ID to delete"),
    IdPedido: z.number().describe("The parent order ID"),
    IdUsuarioAuditoria: z.number().default(6109).describe("Audit user ID (default 6109)"),
  },
  async (input) => {
    const body = {
      IdPedidoItem: input.IdPedidoItem,
      IdPedido: input.IdPedido,
      IdUsuarioAuditoria: input.IdUsuarioAuditoria,
    };

    const data = await webflorFetch("/WebFlorVenta/API/eliminarOrdenItem", {
      method: "DELETE",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: add flower recipe row ──────────────────────────────────────────

server.tool(
  "webflor_add_order_flower",
  "Add a flower recipe row to an order item. Uses POST guardarOrdenFlor.",
  {
    IdPedidoItem: z.number().describe("The order item ID this flower row belongs to"),
    IdPedidoItemReceta: z.number().nullable().default(null).describe("Recipe container ID (null for ManejaReceta=1, container ID for ManejaReceta=2)"),
    IdProducto: z.string().describe("Product ID (e.g. '71' for Carnation)"),
    IdGrado: z.string().describe("Grade ID (e.g. '105' for sel)"),
    IdColor: z.string().describe("Color ID (e.g. '9' for bicolor pink)"),
    IdVariedad: z.string().describe("Variety ID (e.g. '63')"),
    PickTipoPrecio: z.string().describe("Price type pick ID (66=Ramos, 67=Tallos)"),
    CantidadRamos: z.number().describe("Number of bunches"),
    CantidadTallos: z.number().describe("Stems per bunch"),
    TotalTallos: z.number().describe("Total stems (CantidadRamos × CantidadTallos)"),
    PrecioRamo: z.number().describe("Price per bunch"),
    PrecioTallo: z.number().describe("Price per stem"),
    Total: z.number().describe("Total value"),
    IdUsuarioAuditoria: z.string().default("6109").describe("Audit user ID"),
    PickProceso: z.string().optional().describe("Process pick ID"),
    PickTecnica: z.string().optional().describe("Technique pick ID"),
  },
  async (input) => {
    const body = {
      IdPedidoItem: input.IdPedidoItem,
      IdPedidoItemReceta: input.IdPedidoItemReceta,
      IdProducto: input.IdProducto,
      IdGrado: input.IdGrado,
      IdColor: input.IdColor,
      IdVariedad: input.IdVariedad,
      PickTipoPrecio: input.PickTipoPrecio,
      CantidadRamos: input.CantidadRamos,
      CantidadTallos: input.CantidadTallos,
      TotalTallos: input.TotalTallos,
      IdUsuarioAuditoria: input.IdUsuarioAuditoria,
      PrecioRamo: input.PrecioRamo,
      PrecioTallo: input.PrecioTallo,
      Total: input.Total,
      PickProceso: input.PickProceso || "",
      PickTecnica: input.PickTecnica || "",
      PedidoItemFlorColor: [],
    };

    const data = await webflorFetch("/WebFlorVenta/API/guardarOrdenFlor", {
      method: "POST",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: update flower recipe row ──────────────────────────────────────

server.tool(
  "webflor_update_order_flower",
  "Update an existing flower recipe row. Uses PUT editarOrdenFlor. Same as add but includes IdPedidoItemFlor.",
  {
    IdPedidoItemFlor: z.number().describe("The flower row's primary key (from listarOrdenFlorById)"),
    IdPedidoItem: z.number().describe("The order item ID"),
    IdPedidoItemReceta: z.number().nullable().default(null).describe("Recipe container ID (null for ManejaReceta=1)"),
    IdProducto: z.string().describe("Product ID"),
    IdGrado: z.string().describe("Grade ID"),
    IdColor: z.string().describe("Color ID"),
    IdVariedad: z.string().describe("Variety ID"),
    PickTipoPrecio: z.string().describe("Price type pick ID (66=Ramos, 67=Tallos)"),
    CantidadRamos: z.number().describe("Number of bunches"),
    CantidadTallos: z.number().describe("Stems per bunch"),
    TotalTallos: z.number().describe("Total stems"),
    PrecioRamo: z.number().describe("Price per bunch"),
    PrecioTallo: z.number().describe("Price per stem"),
    Total: z.number().describe("Total value"),
    IdUsuarioAuditoria: z.string().default("6109").describe("Audit user ID"),
    PickProceso: z.string().optional(),
    PickTecnica: z.string().optional(),
  },
  async (input) => {
    const body = {
      IdPedidoItemFlor: input.IdPedidoItemFlor,
      IdPedidoItem: input.IdPedidoItem,
      IdPedidoItemReceta: input.IdPedidoItemReceta,
      IdProducto: input.IdProducto,
      IdGrado: input.IdGrado,
      IdColor: input.IdColor,
      IdVariedad: input.IdVariedad,
      CantidadRamos: input.CantidadRamos,
      CantidadTallos: input.CantidadTallos,
      IdUsuarioAuditoria: input.IdUsuarioAuditoria,
      Total: input.Total,
      PrecioRamo: input.PrecioRamo,
      PrecioTallo: input.PrecioTallo,
      TotalTallos: input.TotalTallos,
      PickTipoPrecio: input.PickTipoPrecio,
      PickProceso: input.PickProceso || "",
      PickTecnica: input.PickTecnica || "",
      PedidoItemFlorColor: [],
    };

    const data = await webflorFetch("/WebFlorVenta/API/editarOrdenFlor", {
      method: "PUT",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: add named recipe container ────────────────────────────────────

server.tool(
  "webflor_add_order_recipe",
  "Create a named recipe container for a ManejaReceta=2 item. Uses POST guardarOrdenRec. After creating, add flower rows with IdPedidoItemReceta set to the returned container ID.",
  {
    IdPedidoItem: z.number().describe("The order item ID"),
    NroReceta: z.number().describe("Recipe number (sequential: 1, 2, 3...)"),
    NombreReceta: z.string().describe("Recipe name (e.g. 'Mini Carnation - RD')"),
    CantidadRamos: z.number().describe("Total ramos for this sub-recipe container"),
    CantidadTallos: z.number().describe("Stems per bouquet"),
    PrecioRecetaRamo: z.number().describe("Price per ramo"),
    IdComposicion: z.string().nullable().default(null).describe("Optional composition template ID"),
    IdUsuarioAuditoria: z.string().default("6109").describe("Audit user ID"),
    UPC: z.string().optional().describe("UPC barcode for this recipe container"),
  },
  async (input) => {
    const body = {
      IdPedidoItem: input.IdPedidoItem,
      NroReceta: input.NroReceta,
      NombreReceta: input.NombreReceta,
      CantidadRamos: input.CantidadRamos,
      CantidadTallos: input.CantidadTallos,
      PrecioRecetaRamo: input.PrecioRecetaRamo,
      IdComposicion: input.IdComposicion,
      IdUsuarioAuditoria: input.IdUsuarioAuditoria,
      UPC: input.UPC || "",
      TotalFlor: 0,
      TotalMaterial: 0,
      PrecioRamo: input.PrecioRecetaRamo,
      PrecioTallo: 0,
      PrecioRamoFlor: 0,
      PrecioRamoMaterial: 0,
      TotalReceta: 0,
      TotalRamos: 0,
      TotalTallos: 0,
    };

    const data = await webflorFetch("/WebFlorVenta/API/guardarOrdenRec", {
      method: "POST",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: update named recipe container ─────────────────────────────────

server.tool(
  "webflor_update_order_recipe",
  "Update an existing named recipe container. Uses PUT editarOrdenRec.",
  {
    IdPedidoItemReceta: z.number().describe("The recipe container's primary key"),
    IdPedidoItem: z.number().describe("The order item ID"),
    NroReceta: z.number().describe("Recipe number"),
    NombreReceta: z.string().describe("Recipe name"),
    CantidadRamos: z.number().describe("Total ramos for this container"),
    CantidadTallos: z.number().describe("Stems per bouquet"),
    PrecioRecetaRamo: z.number().describe("Price per ramo"),
    IdComposicion: z.string().nullable().default(null).describe("Composition template ID"),
    IdUsuarioAuditoria: z.string().default("6109").describe("Audit user ID"),
    UPC: z.string().optional().describe("UPC barcode"),
  },
  async (input) => {
    const body = {
      IdPedidoItemReceta: input.IdPedidoItemReceta,
      IdPedidoItem: input.IdPedidoItem,
      NroReceta: input.NroReceta,
      NombreReceta: input.NombreReceta,
      CantidadRamos: input.CantidadRamos,
      CantidadTallos: input.CantidadTallos,
      PrecioRecetaRamo: input.PrecioRecetaRamo,
      IdComposicion: input.IdComposicion,
      IdUsuarioAuditoria: input.IdUsuarioAuditoria,
      UPC: input.UPC || "",
    };

    const data = await webflorFetch("/WebFlorVenta/API/editarOrdenRec", {
      method: "PUT",
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: copy order ─────────────────────────────────────────────────────

server.tool(
  "webflor_copy_order",
  "Copy an existing WebFlor order (all items, quantities, prices, recipes) to create a new order with different dates. Optionally change the client/branch. Uses copiarPedido_Ajustes. Date format is MM/DD/YYYY.",
  {
    sourceOrderId: z.number().describe("The source order/pedido ID to copy FROM"),
    userId: z.string().describe("Logged-in user ID (e.g. '6109')"),
    companyId: z.number().default(1).describe("Company ID (default 1)"),
    clientId: z.number().describe("Client ID for the new order (can be same or different from source)"),
    branchId: z.number().describe("Client branch/sucursal ID for the new order"),
    saleTypeId: z.number().default(1).describe("Sale type ID (default 1)"),
    orderDate: z.string().describe("Order date in MM/DD/YYYY format"),
    deliveryDate: z.string().describe("Delivery date in MM/DD/YYYY format"),
    arrivalDate: z.string().describe("Arrival date in MM/DD/YYYY format"),
  },
  async (input) => {
    const body = {
      iIdPedido: input.sourceOrderId,
      iIdUsuario: input.userId,
      ajustes: {
        IdCompania: input.companyId,
        IdCliente: input.clientId,
        IdClienteSucursal: input.branchId,
        IdTipoVenta: input.saleTypeId,
        FechaOrden: input.orderDate,
        FechaEntrega: input.deliveryDate,
        FechaLlegada: input.arrivalDate,
      },
    };

    const data = await webflorFetch("/WebFlorVenta/API/copiarPedido_Ajustes", {
      method: "POST",
      body,
    }) as Record<string, unknown>;

    // Build order URL for the new order
    const newOrderId = data?.IdPedido;
    const orderUrl = newOrderId
      ? `${BASE_URL}/WebFlorExt/TablasBasicas/DetallesOrden?EsDesde=1&EsRepetitiva=0&iIdAccion=1&ManejaInventario=0&iIdPedido=${newOrderId}`
      : null;

    const result = { ...data, orderUrl };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: generic WebFlor API call ─────────────────────────────────────────

server.tool(
  "webflor_api_call",
  "Make a generic API call to any WebFlor endpoint. Use this for endpoints not covered by other tools.",
  {
    path: z
      .string()
      .describe(
        "The API path (e.g. '/WebFlorVenta/API/listarOrdenById')"
      ),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
    params: z
      .record(z.string(), z.string())
      .optional()
      .describe("Query parameters as key-value pairs"),
    body: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Request body for POST/PUT"),
  },
  async ({ path, method, params, body }) => {
    const data = await webflorFetch(path, { method, params: params as Record<string, string> | undefined, body });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────

const useSSE = process.argv.includes("--sse");
const ssePort = parseInt(process.env.MCP_SSE_PORT || "8000", 10);

async function main() {
  if (useSSE) {
    let sseTransport: SSEServerTransport | null = null;

    const httpServer = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === "/sse" && req.method === "GET") {
        sseTransport = new SSEServerTransport("/messages", res);
        await server.connect(sseTransport);
        return;
      }

      if (req.url === "/messages" && req.method === "POST") {
        if (!sseTransport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No SSE connection established" }));
          return;
        }
        await sseTransport.handlePostMessage(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(ssePort, () => {
      console.error(`WebFlor MCP server running on SSE at http://localhost:${ssePort}/sse`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("WebFlor MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
