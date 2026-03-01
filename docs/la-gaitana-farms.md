# La Gaitana Farms — Client Knowledge Base

## Company Overview

- **Name**: La Gaitana Farms SAS
- **NIT**: 860518356-1
- **Location**: Km3 via Siberia Tenjo, Colombia
- **Phone**: (57) 601 8418458
- **Email**: invoices@lagaitanacol.com
- **Website**: www.lagaitanafarms.com
- **Organization ID**: `81cf0716-45ee-4fe8-895f-d9af962f5fab`

### Farms
- **Farm 1**: 100% carnations
- **Farm 2**: ~50% carnations, ~45% spray carnations (mini carnations), ~5% other

### Key Contacts
- **Diego** — General Manager (formerly Commercial Manager). High-level oversight, CC on communications.
- **Elian Duran** (eduran@...) — IT / primary point of contact for trial. Handles software, Power BI, SQL, system environments.
- **Marcela Quintero** — Sales Person (appears on Webflor orders)

---

## Trial Setup

- **Test customer**: Customer 1142 (an importer that sells to supermarkets, specifically HEB)
- **Order volume**: ~15 orders/week (3 shipping dates × 5 orders/day)
- **Order format**: PDFs sent via email
- **Intake method**: Email forwarding (La Gaitana forwards importer PDFs to Frootful inbox)
- **ERP system**: Webflor (provided by external supplier; La Gaitana depends on vendor for test environment)

---

## Order Domain Knowledge (from Diego)

### Required Fields in Every US Mass Market Order
1. **Number of boxes** (cases)
2. **Product** (e.g. Carnation fcy, Minicarnation sel)
3. **Grade**: "fancy" or "select" (carnation-specific grading)
4. **Bunches per box**
5. **Stems per bunch**
6. **Price** — can be per-stem or per-bunch:
   - Per stem: $0.15–$0.25 range
   - Per bunch: $1.00–$5.00 range
7. **Box type**: Eighth box, Quarter box (QB), Half box (HB), Full box (FB)
   - US orders: ~80% quarter box
8. **Box brand** — client/importer-specific branding (e.g. "FB Gems")
9. **Hard goods**:
   - Sleeve (e.g. "SL-HEB tear away (4×16×12)", clear sleeve, deco sleeve)
   - Flower food (e.g. "chrysal Heb Blooms 5g")
   - Picks (decorative inserts — uncommon but possible)
10. **UPC info** (required for US mass market / supermarket orders):
    - UPC number (barcode number)
    - UPC name (product label, e.g. "Carnations Asstd", "Mini carnation - RD.")
    - Retail price
    - Pull date / Date code (can be number, date, or Julian date letters)
11. **Dates**:
    - Order date
    - Consolidation date
    - Arrive date
    - Farm date / Truck date

### European Wholesale Orders (different, simpler)
- 100% goes to wholesalers
- Always 25 stems per bunch
- Always quarter box
- No UPC required
- Ships in La Gaitana's own brand sleeve (~90% of the time)
- Repeat customers often send minimal info ("white 2, red 5") because the farm already knows the standard configuration
- First order from a new client always has full details

### Market Split
- ~90% US supermarket / mass market
- ~10% wholesalers (mostly Europe)

### Client Types
- **Direct to supermarket**: Walmart, Harris Teeter, Albertsons, etc.
- **Importer → supermarket**: Customer 1142 is this type (importer Operflor → HEB)

---

## PO → Webflor Mapping (from sample PO029889)

### What the Importer PO Contains (simplified)
| Item Code | Description | Cases | Pack | Price | UPC |
|-----------|-------------|-------|------|-------|-----|
| CBD01792 | RBW MINI CARNS | 26 | 135 | 1.20 | 841152050071 |
| CBD01788 | MINI CARNATIONS ASST | 17 | 135 | 1.11 | (varies by color) |
| CBD01788 | MINI CARNATIONS ASST - BL | 0 | 135 | 0.00 | 841152030201 |
| CBD01788 | MINI CARNATIONS ASST - WH | 0 | 135 | 0.00 | 841152040201 |
| CBD01788 | MINI CARNATIONS ASST - YL | 0 | 135 | 0.00 | 841152020201 |
| CBD01794 | CARNATION ASST | 20 | 140 | 0.925 | 841152000137 |
| CBD13451 | CARNATIONS WHITE | 11 | 140 | 0.925 | 841152040200 |

PO also includes: PO number (PO029889), Sell-to Cust No (106), Cust PO (94X720766), Sales Order (SO411191), Cust Banner (HEB), Consolidation Location (MBOGOTA), Consolidation Date, Arrive Date, Truck Date, Location Code, Shipment Method (PASSION).

### What Webflor Expands Into

Each PO line item gets broken down into **specific varieties with bunch-level detail**:

**CARNATION ASST (CBD01794) — 20 FB boxes:**
- Box ID: "Carnations Asstd - Cliente 1001"
- 140 bunches/box, 5 stems/bunch, 700 stems/box
- Variety breakdown (bunches): Sorriso 10, Spritz 7, Zenit 15, Caroline Gold 10, Bizet 8, Jodie 5, Tangelo 12, Novia 5, Don Pedro 12, Honey 7, Metalica 10, Golden Gate 12, Perfect 7, Merletto Crimson 5, Lege Pink 10, Antigua 5
- Total: 140 bunches × 20 boxes = 2,800 bunches = 14,000 stems
- Price: $0.925/stem = $2,590.00

**CARNATIONS WHITE (CBD13451) — 11 FB boxes:**
- Box ID: "Carnations White - Cliente 1001"
- 140 bunches/box, 5 stems/bunch, 700 stems/box
- Single variety: Polar Route
- Total: 1,540 bunches = 7,700 stems
- Price: $0.925/stem = $1,424.50

**MINI CARNATIONS ASST (CBD01788) — 17 FB boxes:**
- Box ID: "Mini Carns Assorted - Cliente 1001"
- 135 bunches/box, 1 stem(bunch)/box, 810 stems/box
- Consumer pack: SL-HEB tear away (4×16×12)
- Variety breakdown (bunches per caja): Payaso 10, Chateau 4, Creme Intermezzo 15, Tuparro 8, Lorenzo 18, Nenufar 8, Kumquat 22, Xue 4, Epsilon 7, Aragon 15, Nimbus 10, Caesar 14
- UPC varies by color group: RD (841152010201), BL (841152030201), WH (841152040201), YL (841152020201)
- Total: 2,295 bunches = 13,770 stems
- Price: $1.11/stem = $2,547.45

**RBW MINI CARNATIONS (CBD01792) — 26 FB boxes:**
- Box ID: "RBW Mini Carnations - Cliente 1001"
- 135 bunches/box, 1 stem(bunch)/box, 810 stems/box
- Consumer pack: SL-HEB tear away (4×16×12)
- Variety breakdown: Tuparro 135, Lorenzo 135, Kumquat 135, Payaso 135, Dracula 135, Creme Intermezzo 135
- Total: 3,510 bunches = 21,060 stems
- Price: $1.20/stem = $4,212.00

**Order totals**: 74 boxes, 10,145 bunches, 56,530 stems, US $10,773.95

### Key Insight
The variety breakdown within each assortment is **farm-side knowledge** — the importer doesn't specify which varieties go into "CARNATION ASST". La Gaitana decides the mix and enters it into Webflor. This is Phase 2 territory (recipe/composition expansion).

---

## Agent Implementation Plan

### Phase 1 — Trial (Current)
Parse incoming PO PDFs and extract structured line items at the **top level** (CBD-coded items with cases, pack, price, UPC, dates, box type). Capture PO metadata.

**What the agent needs to extract:**
- PO number, Customer number, Sell-to, Cust PO, Sales Order, Banner
- All dates (consolidation, arrive, truck)
- Shipment method, location code
- Line items: item code, description, cases, pack size, price, UPC
- Totals for verification

**Changes needed:**
1. Richer order/proposal metadata (PO number, customer PO, sales order ref, box type, sleeve, etc.)
2. Richer line item data (pack size, stems/bunch, price/unit, UPC, date code per line)
3. La Gaitana agent prompt with domain vocabulary

### Phase 2 — Webflor CUA (Computer Use Agent)
The end goal is full end-to-end automation: **PO PDF → agent extracts data → CUA enters it into Webflor**.

Webflor is La Gaitana's ERP and does not have an API — data entry is done through a web UI. A computer-use agent (CUA) would navigate the Webflor interface and fill in the order data that Phase 1 extracted.

**CUA workflow:**
1. Agent extracts structured order data from PO PDF (Phase 1)
2. CUA logs into Webflor test environment (La Gaitana providing access)
3. CUA creates new order in Webflor with:
   - Customer, PO number, dates (farm/truck/consolidation/arrive)
   - Top-level line items (product, boxes, pack, price, UPC)
   - Hard goods (sleeve type, flower food, box brand)
   - Shipping/logistics info (shipment method, consolidation location)
4. La Gaitana staff review and add the variety breakdown (farm-side knowledge)

**Webflor access**: La Gaitana is setting up a test environment via their Webflor vendor. Elian (IT contact) is coordinating. Access link to be provided.

**Key consideration**: Webflor is vendor-managed software — La Gaitana depends on the vendor for test environments and likely can't customize the UI. The CUA needs to work with whatever the standard Webflor interface provides.

### Phase 3 — Future Enhancements
- Variety expansion / recipe system (assortment → specific varieties, automating what La Gaitana staff currently do manually)
- Auto-fill standard configurations for repeat customers
- European order handling (minimal info → full spec from learned customer preferences)
- Direct intake from client systems (configure Frootful inbox as notification recipient instead of email forwarding)

---

## Order Systems
- La Gaitana receives orders from **12+ different client systems**
- Some systems send email notifications with order data (can add Frootful inbox as recipient)
- For the trial: PDFs via email forwarding
- Future: configure Frootful inbox as notification recipient directly in client systems (avoids manual forwarding)

## Glossary
| Term | Meaning |
|------|---------|
| FB | Full Box |
| HB | Half Box |
| QB | Quarter Box |
| EB | Eighth Box |
| Fancy (fcy) | Higher grade carnation |
| Select (sel) | Standard grade carnation (also used for mini carnations) |
| Consumer | Consumer-pack / retail-ready product |
| UPC | Universal Product Code — barcode sticker for retail |
| Pull date | Sell-by/expiration date on UPC sticker (number, date, or Julian code) |
| Date code | Same as pull date |
| Bch/Box | Bunches per box |
| St/Bch | Stems per bunch |
| St/Box | Stems per box |
| Bqt/Caja | Bouquets per box (same as Bch/Box) |
| Bqt/Prod | Bouquets per product line (total across all boxes) |
| Picks | Decorative inserts placed in bunches |
| Hard goods | Non-flower items: box, sleeve, flower food, picks |
| Mass market | Supermarket / retail channel |
| Wholesaler | Bulk flower distributor (mainly European clients) |
| Webflor | La Gaitana's ERP system |
| MBOGOTA | Consolidation location in Bogota |
| FCA Bogota | Shipping terms (Free Carrier, Bogota) |
