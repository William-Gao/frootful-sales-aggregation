Order for (<customer_code>) - <customer_name>
client_erp_id: <webflor_id>

PO: <po_number>

Comments: Entered by Frootful

Fecha Orden: <MM/DD/YYYY>
Fecha Elaboracion: <MM/DD/YYYY>
Fecha Entrega: <MM/DD/YYYY>
Fecha Llegada: <MM/DD/YYYY>

## Strategy

**Action: COPY order <order_id> then adjust**
Reference Order: <order_id> (PO: <PO>, dated <date>, status: <status>)

### Changes from reference:

| Item | Reference Qty | New Qty | Action |
|---|---|---|---|
| <empaque_name> | <ref_boxes> boxes | <new_boxes> boxes | ADJUST qty |
| <empaque_name> | — | <new_boxes> boxes | ADD |
| <empaque_name> | <ref_boxes> boxes | — | DELETE |

<!-- If no good reference order exists: -->
**Action: CREATE from scratch**
No suitable reference order found. <Reason.>

## Items

| Empaque | IdEmpaque | Finca | Cajas | Tallos/Ramo | Ramos/Caja | Tipo Precio | Precio | Marca | UPC | Pull Date | CajaId |
|---|---|---|---|---|---|---|---|---|---|---|---|
| <empaque_name> | <id> | <farm> | <cases> | <tallos_ramo> | <ramos_caja> | Ramos | $<price> | <marca_name> | <upc> | <pull_date> | <caja_label> |

## Item Details

<!-- Only for ManejaReceta=2 items with a reference order: -->
<!-- NOTE: Recipe container Ramos/Caja values are PER-BOX templates — they do NOT change
     with box count. WebFlor multiplies by CantidadCaja automatically to compute totals.
     Copy the exact same Ramos/Caja values from the reference order. Do NOT scale them. -->
### <empaque_name>
#### Recipe Containers (for new order)

| Nro | Nombre Receta | Ramos/Caja | Tallos Ramo | Precio Ramo | UPC |
|---|---|---|---|---|---|
| <nro> | <nombre> | <ramos> | <tallos> | $<precio> | <upc> |

<!-- ManejaReceta=1 or 2: -->
#### Flowers

| Producto | Grado | Color | Variedad | Ramos |
|---|---|---|---|---|
| <producto> | <grado> | <color> | <variedad> | <ramos> |

#### Packaging Materials

| Material | Type | Qty per Box |
|---|---|---|
| <material_name> | <type> | <qty> |

<!-- REVIEW notes only if there are genuine issues needing human attention: -->
> REVIEW: <description of issue>
