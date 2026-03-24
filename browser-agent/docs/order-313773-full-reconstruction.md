# Order 313773 — Full Programmatic Reconstruction

Generated: 2026-03-07
All data pulled via fixed MCP tools (`listarOrdenFlorById` now takes `IdPedidoItemReceta` param).

---

## 1. Order Header (`listarOrdenById`)

| Field | Value |
|---|---|
| IdPedido | 313773 |
| IdCliente | 69 (Gems Group, Codigo: 1142) |
| PO | PO029889 |
| Comentario | MQ2.26.26 |
| FechaOrden | 2026/02/26 |
| FechaElaboracion | 2026/03/02 |
| FechaEntrega | 2026/03/02 |
| FechaLlegada | 2026/03/02 |
| IdCompania | 1 |
| IdConfigFlujo | 40 |
| IdClienteSucursal | 1519 |
| PickTipoNegociacion | 1370 |
| IdTipoVenta | 1 |
| PickVendedor | 7650 |
| PickAgenciaCarga | 3186 |
| NomEstado | Confirmado |
| Cajas | 74 |
| TotalUnidades | 56,530 |

---

## 2. Items Summary (`listarDetalleOrdenByIdPedido`)

| # | IdPedidoItem | Empaque | IdEmpaque | Receta | PickTipoEmpaque | Cajas | TallosRamo | RamosCaja | PrecioRamo | Farm | PickTipoPrecio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2011826 | Carnation fcy Mixed | 1028 | 1 (simple) | 7 (Surtido "M") | 20 | 5 | 140 | 0.925 | ARB (0) | 66 (Ramos) |
| 2 | 2011829 | Carnation fcy white Polar Route | 15380 | 1 (simple) | 6 (Sólido) | 11 | 5 | 140 | 0.925 | ARB (0) | 66 (Ramos) |
| 3 | 2011827 | Minicarnation sel Consumer | 13081 | 2 (multi) | 2 (Bouquet) | 17 | 6 | 135 | 1.11 | GFM (3) | 66 (Ramos) |
| 4 | 2011828 | Minicarnation sel Rainbow | 7025 | 2 (multi) | 4 (Rainbow) | 26 | 1 | 135 | 1.20 | GFM (3) | 66 (Ramos) |

All items share:
- PickMarca: 1297, NomMarca: "Base FB Gems (C15318B1-0)"
- IdTipoCaja: 3 (FB), IdDimensionCaja: 230 (Tapa FB Gems)
- PickTipoCorte: 255 (Corte 3)

---

## 3. Item 1: Carnation fcy Mixed (Receta=1, simple)

### Flower Rows (`listarOrdenFlorById?...&IdPedidoItemReceta=0`)
16 rows — one per color/variety. All are Carnation fcy, 5 tallos/ramo, priced at $0.925/ramo.

| # | Color | Variety | CantidadRamos | TotalTallos | Total ($) |
|---|---|---|---|---|---|
| 1 | bicolor red | Sorriso | 10 | 1,000 | 185.00 |
| 2 | bicolor yellow | Spritz | 7 | 700 | 129.50 |
| 3 | bicolor yellow | Zenit | 15 | 1,500 | 277.50 |
| 4 | gold | Caroline Gold | 10 | 1,000 | 185.00 |
| 5 | hot pink | Bizet | 8 | 800 | 148.00 |
| 6 | light pink | Jodie | 5 | 500 | 92.50 |
| 7 | orange | Tangelo | 12 | 1,200 | 222.00 |
| 8 | peach | Novia | 5 | 500 | 92.50 |
| 9 | red | Don Pedro | 12 | 1,200 | 222.00 |
| 10 | light brown | Honey | 7 | 700 | 129.50 |
| 11 | purple | Metalica | 10 | 1,000 | 185.00 |
| 12 | yellow | Golden Gate | 12 | 1,200 | 222.00 |
| 13 | bicolor burgundy | Perfect | 7 | 700 | 129.50 |
| 14 | Vintage | Merletto Crimson | 5 | 500 | 92.50 |
| 15 | bicolor pink | Lege Pink | 10 | 1,000 | 185.00 |
| 16 | Vintage | Antigua | 5 | 500 | 92.50 |
| **TOTAL** | | | **140** | **14,000** | **$2,590.00** |

Observations:
- 140 ramos total = RamosCaja (140) × 1 box worth of recipe, scaled across 20 boxes
- All flower rows have PickTipoPrecio=66 (Ramos) except variety-level which tracks per-ramo
- No PickProceso or PickTecnica set
- PullDate: "062" (from item detail)

### Materials
| Material | Type | Qty |
|---|---|---|
| SL- Bio liso mini (31*9*38) | Capuchón (sleeve) | 140 |
| Food - chrysal Heb Blooms 5 g | Comidas (food) | 140 |

---

## 4. Item 2: Carnation fcy white Polar Route (Receta=1, simple)

### Flower Rows
Only 1 row — it's a "Sólido Por Variedad" (single variety/color).

| Color | Variety | CantidadRamos | TotalTallos | Total ($) |
|---|---|---|---|---|
| white | Polar Route | 140 | 7,700 | 1,424.50 |

Observations:
- CantidadRamos=140 = full RamosCaja for one box of recipe
- PickTipoPrecio=67 (Tallos) at the flower row level — even though item-level is 66 (Ramos)
- PickProceso=125 (Natural)
- PullDate: "062"

### Materials
| Material | Type | Qty |
|---|---|---|
| SL- Bio liso mini (31*9*38) | Capuchón | 140 |
| Food - chrysal Heb Blooms 5 g | Comidas | 140 |

---

## 5. Item 3: Minicarnation sel Consumer (Receta=2, multi/bouquet)

### Recipe Containers (`listarOrdenRecByIdPedidoItem`)
12 named containers — each represents a different color variant of mini carnation consumer pack.

| # | IdReceta | NombreReceta | Ramos | UPC Name | UPC Number | PullDate |
|---|---|---|---|---|---|---|
| 1 | 429383 | Mini Carnation - Yl | 4 | Mini Carnation - BL | 841152020201 | 062 |
| 2 | 429384 | Mini Carnation - RD | 18 | Mini Carnation - RD | 841152010201 | 062 |
| 3 | 429385 | Mini Carnation - BL | 7 | Mini Carnation - BL | 841152030201 | 062 |
| 4 | 429386 | Mini Carnation - BL | 8 | Mini Carnation - BL | 841152030201 | 062 |
| 5 | 429387 | Mini Carnation - RD | 15 | Mini Carnation - RD | 841152010201 | 062 |
| 6 | 429388 | Mini carnation - RD. | 10 | Mini Carnation - RD | 841152010201 | 062 |
| 7 | 429389 | Mini carnation - Yl | 15 | Mini Carnation - YL | 841152020201 | 062 |
| 8 | 429390 | Mini carnation - Wh | 8 | Mini Carnation - WH | 841152040201 | 062 |
| 9 | 429391 | Mini carnation - Yl* | 14 | Mini Carnation - YL | 841152020201 | 062 |
| 10 | 429392 | Mini carnation - Rd.* | 4 | Mini Carnation - RD | 841152010201 | 062 |
| 11 | 429393 | Mini carnation - Yl.. | 22 | Mini Carnation - YL | 841152020201 | 062 |
| 12 | 429394 | Mini carnation - Wh | 10 | Mini Carnation - WH | 841152040201 | 062 |

**Key discovery**: Each recipe container has its OWN UPC info:
- `NombreUPC` — UPC label name (e.g. "Mini Carnation - RD")
- `NumeroUPC` — barcode number (e.g. "841152010201")
- `PullDate` — date code ("062")
- `CajaId` — box label ("Mini Carns Assorted - Cliente 1001")
- `Codigo` — "Product of Colombia"
- `PickTipoOrdenPUC` — 11 (Adicional)

UPC numbers by color:
- RD (Red): 841152010201
- YL (Yellow): 841152020201
- BL (Blue?): 841152030201
- WH (White): 841152040201

### Materials
13 material rows — one capuchón (sleeve) per recipe container, plus one food packet for the first container only.

All sleeves: "SL- Bio liso mini (31*9*38)", Qty 135 each.

---

## 6. Item 4: Minicarnation sel Rainbow (Receta=2, multi/bouquet)

### Recipe Containers
Only 1 container — Rainbow is a single recipe.

| IdReceta | NombreReceta | Ramos | UPC Name | UPC Number | PullDate |
|---|---|---|---|---|---|
| 429395 | RBW Mini Carnations | 135 | RBW Mini Carnations | 841152050071 | 062 |

- PickTipoOrdenPUC: 10 (Regular)
- CajaId: "RBW Mini Carnations - Cliente 1001"
- PullDate: "062"

### Materials
| Material | Type | Qty |
|---|---|---|
| SL- Bio liso mini (31*9*38) | Capuchón | 135 |
| Food - chrysal Heb Blooms 5 g | Comidas | 135 |

---

## Key Findings

### 1. UPC Info Lives at the RECIPE CONTAINER Level (not item level)

For ManejaReceta=2 items, the UPC info (NombreUPC, NumeroUPC, PullDate, CajaId, Codigo, Precio) is on each **recipe container** (`listarOrdenRecByIdPedidoItem`), NOT on the item itself.

This means:
- A single order item can have MULTIPLE UPCs (one per recipe container)
- Each color variant of a mini carnation consumer pack gets its own UPC
- The `UPC` and `PullDate` fields we pass in `guardarOrdenIt` may only apply to simple items

### 2. Recipe Containers Are Pre-Configured (Copied from Previous Orders)

Each container has `IdPedItemRecetCopia` — a reference to the source recipe container it was copied from. This confirms that **recipe containers are not entered manually** — they're copied from a previous order using the copy order function.

### 3. Materials Are Auto-Populated Per Recipe Container

For ManejaReceta=2 items, each recipe container gets its own set of materials (sleeve, food). The material `IdPedidoItemReceta` field links to the container.

Material pattern:
- Carnation items: 140 sleeves + 140 food packets (= RamosCaja)
- Minicarnation items: 135 sleeves per container (= RamosCaja)

### 4. Simple vs Multi Recipe Flower Row Structure

**Simple (Receta=1)**:
- `IdPedidoItemReceta = null` on all flower rows
- Carnation Mixed: 16 rows (one per color/variety), ramos distributed across varieties
- Carnation Polar Route: 1 row (single variety solid)

**Multi (Receta=2)**:
- Flower rows are organized into named containers
- Each container has its own CantidadRamos, UPC, PullDate
- Within each container, flower rows detail the specific varieties/colors

### 5. The Copy Order Pattern

For recurring orders (like Gems Group weekly), the workflow is:
1. Find a previous similar order → `listarOrdenesCopiarOTrasladar`
2. Copy it with new dates → `copiarPedido_Ajustes`
3. Adjust quantities if needed → `actualizarOrden` / modify items

This copies ALL recipe containers, flower rows, materials, and UPC info. This is far more efficient than creating from scratch.

### 6. PullDate Summary

| Context | PullDate | Source |
|---|---|---|
| Item detail (simple) | "062" | `listarItemDetalleOrdenByIdPedidoItem` |
| Recipe container (multi) | "062" | `listarOrdenRecByIdPedidoItem` |
| Item list endpoint | NOT returned | `listarDetalleOrdenByIdPedido` |

All items in this order have PullDate "062" (Julian day 62 = March 3, 2026).

### 7. Complete Data Model

```
Order (listarOrdenById)
├── Item 1: Carnation fcy Mixed (Receta=1)
│   ├── 16 flower rows (listarOrdenFlorById, recetaId=0)
│   └── 2 materials: sleeve + food
├── Item 2: Carnation fcy white Polar Route (Receta=1)
│   ├── 1 flower row (single variety)
│   └── 2 materials: sleeve + food
├── Item 3: Minicarnation sel Consumer (Receta=2)
│   ├── Recipe Container 1: "Mini Carnation - Yl" (429383)
│   │   ├── flower rows (color-specific)
│   │   └── materials: sleeve
│   ├── Recipe Container 2: "Mini Carnation - RD" (429384)
│   │   ├── flower rows
│   │   └── materials: sleeve
│   └── ... (12 containers total, each with own UPC/PullDate)
└── Item 4: Minicarnation sel Rainbow (Receta=2)
    └── Recipe Container 1: "RBW Mini Carnations" (429395)
        ├── flower rows
        └── materials: sleeve + food
```

---

## Implications for Order Entry

### For New Orders (no previous order to copy):
1. Create header → `guardarOrden`
2. Add items → `guardarOrdenIt` (pass PullDate, UPC, CajaId for simple items)
3. Recipe containers + flower rows + materials are NOT created by us at order entry time
4. They get populated later by production staff, OR by copying from a template order

### For Recurring Orders (preferred approach):
1. Find previous order for same client → search by IdCliente + recent date
2. Copy it → `copiarPedido_Ajustes` with new dates
3. This copies ALL recipes, flowers, materials, UPC info automatically
4. Only adjust quantities/prices if changed

### The `webflor_copy_order` Tool
Already added to the Node MCP server. This is the key tool for recurring Gems Group orders — it preserves all the recipe complexity that would be impossible to enter manually via API.
