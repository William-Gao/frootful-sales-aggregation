# Order 313773 (PO029889) — Full Analysis

Analysis date: 2026-03-07
Purpose: Reverse-engineer how orders are structured in WebFlor to inform our order entry agent.

## Order Header

| Field | Value |
|---|---|
| IdPedido | 313773 |
| Client | Gems Group (IdCliente: 69, Codigo: 1142) |
| PO | PO029889 |
| Comentario | MQ2.26.26 |
| FechaOrden | 2026/02/26 |
| FechaElaboracion | 2026/03/02 |
| FechaEntrega | 2026/03/02 |
| FechaLlegada | 2026/03/02 |
| Sucursal | 1519 |
| IdConfigFlujo | 40 |
| PickVendedor | 7650 |
| PickAgenciaCarga | 3186 |
| PickTipoNegociacion | 1370 |
| IdTipoVenta | 1 |
| Total boxes | 74 |
| Total units | 56,530 |

## Items

| # | Empaque | IdEmpaque | Cajas | TallosRamo | RamosCaja | PrecioRamo | Farm | PullDate | Receta | PickTipoEmpaque | CajaId | UPC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Carnation fcy Mixed | 1028 | 20 | 5 | 140 | 0.925 | ARB (0) | 062 | 1 | 7 (Surtido "M") | Carnations Asstd - Cliente 1001 | "" |
| 2 | Carnation fcy white Polar Route | 15380 | 11 | 5 | 140 | 0.925 | ARB (0) | 062 | 1 | 6 (Sólido Por Variedad) | Carnations White - Cliente 1001 | null |
| 3 | Minicarnation sel Consumer | 13081 | 17 | 6 | 135 | 1.11 | GFM (3) | 306 | 2 | 2 (Bouquet) | Blooms Mini Carns Assorted - Cliente 1001 | null |
| 4 | Minicarnation sel Rainbow | 7025 | 26 | 1 | 135 | 1.20 | GFM (3) | 306 | 2 | 4 (Rainbow) | Blooms RBW Mini Carnations - Cliente 1001 | null |

## Empaque Details

| IdEmpaque | NomEmpaque | PickTipoEmpaque | IdProducto | PickManejaPrecio | ManejaReceta | IdComposicion | IdColor | IdVariedad |
|---|---|---|---|---|---|---|---|---|
| 1028 | Carnation fcy Mixed | 7 (Surtido "M") | 71 | 56 | 1 (simple) | null | null | null |
| 15380 | Carnation fcy white Polar Route | 6 (Sólido Por Variedad) | 71 | 56 | 1 (simple) | 38 | 4246 | null |
| 13081 | Minicarnation sel Consumer | 2 (Bouquet) | 65 | 56 | 2 (multi) | null | null | null |
| 7025 | Minicarnation sel Rainbow | 4 (Rainbow) | 65 | 56 | 2 (multi) | null | null | null |

## Client-Product Ficha Defaults (Client 69)

| | Carnation (prod 71) | Minicarnation (prod 65) |
|---|---|---|
| PickMarcaCaja | 1297 | 1297 |
| PickTipoCorte | 255 (Corte 3) | 255 (Corte 3) |
| PickTipoPrecio | 67 (Tallos) | 67 (Tallos) |
| IdTipoCaja | 6 | 5 |
| IdDimensionCaja | 202 | 192 |
| PickTipoRamoValor | 5 | 1 |
| PickCapuchon | 1308 | 1308 |

## Key Findings

### 1. Ficha vs Actual Order — Defaults Are Overridden

The ficha provides defaults that are NOT always used in the actual order:

- **PickTipoPrecio**: Ficha says 67 (Tallos), actual order uses 66 (Ramos) with PickTipoPrecioItem=66
  - Our price-based heuristic ($0.925 >= $0.50 → Ramos) is correct here
- **IdTipoCaja/IdDimensionCaja**: Ficha says 6/202 and 5/192, actual order uses 3(FB)/230
  - The marca (1297 = "Base FB Gems") determines actual box type/dimension via `listarCajasMarcaTipoDimension`
  - **Rule**: marca → box type/dimension, NOT ficha → box type/dimension

### 2. PullDate Varies by Product Type

- Carnations → PullDate "062" (Julian day 62 ≈ March 3)
- Minicarnations → PullDate "306" (Julian day 306 ≈ November 2)
- Appears to be a shelf-life/expiry code, possibly product-specific rather than order-specific
- Accessible via `listarItemDetalleOrdenByIdPedidoItem` (NOT on the list items endpoint)

### 3. Farm Assignment Is Product-Specific

- Carnations → IdFinca: 0 (NomFinca: "ARB" = Arabella)
- Minicarnations → IdFinca: 3 (NomFinca: "GFM" = Gaitana)
- Not from the ficha — must be determined by product type or specified in PO

### 4. Recipe/Composition Is NOT Entered by Us

- `Receta` field on order items is read-only, derived from empaque's `PickTipoEmpaque`
- All empaques have `EmpaqueComposicion: []` — recipe isn't pre-configured on the empaque
- Recipe flower rows are populated during production/processing, not at order entry time
- `IdComposicion: null` on all order items

### 5. CajaId Is Pre-Populated

- Each item has a CajaId like "Carnations Asstd - Cliente 1001"
- This appears to be auto-generated from empaque name + client, or set during order entry
- Visible in the "Información UPC" section of the WebFlor UI

### 6. PickTipoEmpaque Types

| PickTipoEmpaque | Name | Description |
|---|---|---|
| 2 | Bouquet | Multi-flower bouquet |
| 4 | Rainbow | Rainbow mix |
| 6 | Sólido Por Variedad | Single variety/color |
| 7 | Surtido "M" | Assorted/mixed colors |

## Recipe Read API Pattern

### Full Read Pattern for a Complete Order

```
1. listarOrdenById → order header
2. listarDetalleOrdenByIdPedido → all items
3. For each item, check ManejaReceta:
   - ManejaReceta=0: no recipe rows
   - ManejaReceta=1: listarOrdenFlorById?iIdPedidoItem={id}&IdPedidoItemReceta=0
     → returns all flower rows (one per color/variety combo)
   - ManejaReceta=2:
     a. listarOrdenRecByIdPedidoItem?IdPedidoItem={id} → named containers
     b. For each container: listarOrdenFlorById?iIdPedidoItem={id}&IdPedidoItemReceta={containerId}
4. listarOrdenMaterialById?iIdPedidoItem={id}&IdPedidoItemReceta=0 → materials (optional)
```

### listarOrdenFlorById Response Fields

For ManejaReceta=1 (simple recipe, e.g. Carnation fcy Mixed item 2011826):
- Returns 16 rows — one per color/variety combination
- Fields: IdPedidoItemFlor, NomProducto, NomGrado, NomColor, NomVariedad, CantidadRamos, CantidadTallos, TotalTallos, PrecioRamo, NomTipoPrecio, PickProceso, PickTecnica

For ManejaReceta=2 (multi/bouquet recipe):
- Returns flower rows within a named container
- The `IdPedidoItemReceta` field on each row identifies which container it belongs to
- Example: Bouquet "Sunny Blossoms" had containers "Sunny Breeze" (431123) and "Bloomsom" (431124)
  - Each container had ~8 flower types (Hydrangea, Hypericum, Ruscus, Rose, Carnation, etc.)

### listarOrdenRecByIdPedidoItem Response Fields

- Only for ManejaReceta=2 items
- Returns: IdPedidoItemReceta, NombreReceta, CantidadRamos, UPC, TotalFlor, TotalMaterial, PrecioRamo

### listarOrdenMaterialById Response Fields

- Returns sleeve/wrap/food materials
- Fields: NomMaterial, TipoMaterial, Cantidad
- Types: ruanas, capuchones, comidas (chrysal food), ruanas adicionales

## Implications for Order Entry Agent

1. **PullDate CAN be passed in `guardarOrdenIt`** — values like "062" or "306" come from the PO
2. **Ficha is a starting point, not gospel** — marca-based box lookup overrides ficha box defaults
3. **PickTipoPrecio overridden** — ficha says Tallos(67), actual uses Ramos(66). Price heuristic works.
4. **Recipe is NOT entered at order time** — no need to worry about flower rows or compositions
5. **Farm must be specified per item** — not a single default for the whole order
6. **listarOrdenFlorById requires TWO params** — `iIdPedidoItem` AND `IdPedidoItemReceta` (use 0 for simple recipes)
