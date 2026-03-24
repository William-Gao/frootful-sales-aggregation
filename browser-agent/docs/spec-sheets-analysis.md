# Spec Sheets & Active Varieties Analysis

Generated: 2026-03-07

## Data Sources

### 1. Active Varieties (`browser-agent/data/current_active_varieties.csv`)
- 145 rows: PRODUCTO, COLOR, VARIEDAD
- Current year's available varieties — the constraint list for what can go into recipes
- Key products: Carnation (56 varieties), Minicarnation (34), Raffine (7), Solomio (13), plus smaller counts for Statice, Veronica, etc.

### 2. Spec Sheets (`browser-agent/data/Spec Sheets/*.pdf`)
- Customer-specific product spec sheets that define exactly what goes into each product
- Each spec defines: item code, pack size, box type, sub-mixes with color breakdowns, hardgoods (sleeves, UPC labels, food), farm instructions

---

## Spec Sheet Inventory

| PDF | Item Code | Customer | Product Name | Pack | Sub-Mixes | Construction |
|---|---|---|---|---|---|---|
| PDCS-13246_CBD01794 | CBD01794 | HEB | BLOOMS ASSTD CARNS SPRING | 140/box | 6 (A-F) | Simple |
| PDCS-13253_CBD01788 | CBD01788 | HEB | BLOOMS ASSTD MINI CARNS SPRING | 135/box | 6 (A-F) | Simple |
| PDCS-13431_CBD01792 | CBD01792 | HEB | BLOOMS RBW MINI CARNS SPRING | 135/box | 1 (A) | Spiral |
| PDCS-13451_CBD13451 | CBD13451 | HEB | BLOOMS WHITE CARNATIONS ED | 140/box | 1 (A) | Simple |
| PDCS-14479_CBD00487 | CBD00487 | WEGMANS | RAFFINES/SOLOMIOS 7ST | 12/box | 2 (A-B) | Simple |

---

## Detailed Spec Breakdown

### CBD01794 — BLOOMS ASSTD CARNS SPRING (Carnation fcy Mixed)

Maps to WebFlor empaque: **Carnation fcy Mixed** (IdEmpaque: 1028)

| Sub-Mix | Color | Bunches (Dry) | Bunches (Wet) | Stems/Bunch |
|---|---|---|---|---|
| A | Assorted (Mixed colors) | 50 | 5 | 5 |
| B | Red Solid | 10 | 1 | 5 |
| C | Hot Pink | 20 | 2 | 5 |
| D | Pink | 20 | 2 | 5 |
| E | Orange | 20 | 2 | 5 |
| F | Yellow | 20 | 2 | 5 |
| **Total** | | **140** | **14** | |

**Mix A Packing Instructions (detailed color breakdown, 5 stems/bunch):**
- 10 bunches Purple
- 10 bunches White
- 5 bunches Lavender
- 5 bunches Novelty Pink (Lege Pink, Merletto, Pink Antigua, Pink Creola, Komachi)
- 5 bunches Novelty Hot Pink (Zafiro, Tiepolo, Zeppelin)
- 5 bunches Novelty Purple (Kino, Nautilius, Tenderly, Metalica, Golem)
- 5 bunches Novelty Green (Lady Gurin, Prado Mint, Zumo, Marty, Country, Jungle)
- 5 bunches Novelty Burgundy (Zurigo, Tempo)
= 50 bunches total

**Hardgoods per sub-mix:**
- 1x Sleeve: SL009377 "CAPU TIPO CB 02" (35×10×50 14)
- 1x Supply: S0002026 "RETAIL UPC"

**How this maps to order 313773 item 2011826 (16 flower rows):**
The 16 flower rows in the actual order are the expanded version of Mix A's color breakdown. Each row = one variety with its ramo count:
- Sorriso (bicolor red) = 10 ramos
- Spritz (bicolor yellow) = 7
- Zenit (bicolor yellow) = 15
- etc.
Total = 140 ramos = RamosCaja

### CBD01788 — BLOOMS ASSTD MINI CARNS SPRING (Minicarnation sel Consumer)

Maps to WebFlor empaque: **Minicarnation sel Consumer** (IdEmpaque: 13081)

| Sub-Mix | Color | Bunches (Dry) | Bunches (Wet) | Stems/Bunch |
|---|---|---|---|---|
| A | Assorted (Mixed colors) | 55 | 7 | 6 |
| B | Red | 10 | 1 | 6 |
| C | Pink | 10 | 1 | 6 |
| D | Orange | 20 | 2 | 6 |
| E | Hot Pink | 20 | 2 | 6 |
| F | Yellow | 20 | 2 | 6 |
| **Total** | | **135** | **15** | |

**Mix A Packing Instructions (6 stems/bunch):**
- 10 bunches Mini Carnation Purple
- 5 bunches Mini Carnation Burgundy
- 10 bunches Mini Carnation White
- 5 bunches Mini Carnation Lavender
- 5 bunches Novelty Pink (Pink Skyline, Valentine)
- 5 bunches Novelty Hot Pink (Tessino, Pigeon, Lorenzo)
- 5 bunches Novelty Purple (Spectro, Atlantis, Epsilon)
- 5 bunches Novelty Green (Tuparro, Jade)
- 5 bunches Novelty Yellow (Gold Ludona, Xue, Xanthe)
= 55 bunches total

**How this maps to order 313773 item 2011827 (12 recipe containers):**
The 12 recipe containers map to the sub-mixes. Each container (e.g. "Mini Carnation - RD") corresponds to a color-specific sub-mix, with its own UPC barcode.

### CBD01792 — BLOOMS RBW MINI CARNS SPRING (Minicarnation sel Rainbow)

Maps to WebFlor empaque: **Minicarnation sel Rainbow** (IdEmpaque: 7025)

| Sub-Mix | Bunches (Dry) | Bunches (Wet) |
|---|---|---|
| A (Rainbow) | 135 | 15 |

**Flower composition (per bunch, spiral construction):**
- 1 stem Hot Pink
- 1 stem Orange
- 1 stem Pink
- 1 stem Purple
- 1 stem Red
- 1 stem Yellow
= 6 stems/bunch

Single recipe container in WebFlor: "RBW Mini Carnations" with UPC 841152050071.

### CBD13451 — BLOOMS WHITE CARNATIONS ED (Carnation fcy white Polar Route)

Maps to WebFlor empaque: **Carnation fcy white Polar Route** (IdEmpaque: 15380)

Single variety solid:
- 140 bunches/box, 5 stems/bunch
- White Carnation only

### CBD00487 — RAFFINES/SOLOMIOS 7ST (Wegmans)

Different customer (Wegmans), different product entirely:
- 12 bunches/box, 7 stems/bunch
- Mix A: 5 bunches Raffine Assorted
- Mix B: 7 bunches Solomio Assorted
- Box type: EB (Eighth box), not FB
- Different sleeves and UPC labels than HEB products

---

## Spec Sheet ↔ Active Varieties ↔ WebFlor Mapping

### Carnation Active Varieties by Color (for recipe construction)

| Spec Color | Active Varieties |
|---|---|
| Red | Don Luis, Grandsole, Virgilio, Winston |
| Hot Pink | Zeppelin |
| Pink / Light Pink | Bublicius, Doncel, Ilusion |
| Orange | Arno, Gobi, Orange Flame, Sunset, Tangelo |
| Yellow | Diletta, Emma, Golden Gate, Splendor |
| Purple | Metalica, Yukari Violet, Zafiro |
| White | Brisa, Cristallo, Moonlight, Navarro, Polar Route |
| Bicolor Red | Sorriso |
| Bicolor Yellow | Spritz, Zenit |
| Bicolor Burgundy | Bacarat, Perfect |
| Bicolor Pink | Spritz Bianco Rosa |
| Bicolor Purple | Damascus, Kino |
| Burgundy | Zurigo |
| Gold | Caroline Gold |
| Green | Jungle, Lady Gurin, Marty, Prado Mint, Zumo |
| Cream | Halo, Polimnia |
| Lavender | Clearwater, Farida |
| Peach | Apple Tea, Brut, Novia |
| Vintage | Antigua, Honey, Lege Marrone, Lege Pink, Marble, Merletto Crimson, Merletto Salmon |
| Special | Lucy, Merletto Purple, Nobbio Burgundy, Ocaso |

### Minicarnation Active Varieties by Color

| Spec Color | Active Varieties |
|---|---|
| Red | Aragon, Dracula |
| Hot Pink | Lorenzo, Pigeon |
| Pink / Light Pink | Academy, Pink Pigeon, Zagara |
| Orange | Kumquat, Lobster, Uchuva |
| Yellow | Caesar, Dino |
| Purple | Epsilon |
| White | Artic, Ibis, Nimbus, Whisper |
| Bicolor Red | Barullo, Payaso |
| Bicolor Yellow | Lava |
| Bicolor Pink | Cherry Tessino, Valentine |
| Bicolor Purple | Atlantis, Spectro |
| Burgundy | Chateau |
| Gold | K-541, Pasteur, Piñata Sundrops |
| Green | Tuparro |
| Lavender | Nenufar |
| Peach | Tune, Xue |
| Cream | Creme Intermezzo |
| Vintage | Mocha Sweet |

---

## Implications for Order Entry Automation

### Copy Order (Recurring) — Already Supported
For Gems Group weekly orders: copy previous order, adjust dates and quantities. All recipes, flower rows, materials, and UPCs carry over.

### New Order from Spec Sheet — Future Capability
To create a fully populated order from scratch, the agent would need:
1. Parse the spec sheet PDF to extract sub-mix structure
2. Map spec colors to active varieties
3. Create order header + items (we can do this)
4. Create recipe containers for multi-recipe items (need `guardarOrdenRec` or similar)
5. Add flower rows per container (need `guardarOrdenFlor` or similar)
6. Add materials per container (need `guardarOrdenMaterial` or similar)

Steps 4-6 require write endpoints we haven't discovered yet.

### Hybrid Approach — Most Practical
1. Copy a template order (`copiarPedido_Ajustes`)
2. Adjust quantities per item
3. Use spec sheet as validation: verify the copied recipe matches the spec
4. Use active varieties list to validate that flower rows use current varieties
