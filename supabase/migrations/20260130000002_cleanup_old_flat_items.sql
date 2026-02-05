-- Cleanup: Remove old flat item rows that have size suffixes in their SKU.
-- These have been replaced by base items + item_variants.
-- Only affects orgs that follow the Boston Microgreens pattern.

BEGIN;

-- Delete old flat items with size-suffixed SKUs from the production org
DELETE FROM items
WHERE organization_id = 'e047b512-0012-4287-bb74-dc6d4f7e673f'
  AND (sku LIKE '%-SM' OR sku LIKE '%-LG' OR sku LIKE '%-PLT');

-- Also insert the base products + variants for the production org
-- if they don't already exist (they were only created for ac3dd72d and demo)

-- Insert base products for production org
INSERT INTO items (organization_id, sku, name, description, active)
SELECT
  'e047b512-0012-4287-bb74-dc6d4f7e673f'::uuid,
  sku, name, description, active
FROM items
WHERE organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'
ON CONFLICT (organization_id, sku) DO NOTHING;

-- Copy variants for production org
INSERT INTO item_variants (item_id, variant_code, variant_name, price, active, sort_order)
SELECT
  prod_items.id,
  src_variants.variant_code,
  src_variants.variant_name,
  src_variants.price,
  src_variants.active,
  src_variants.sort_order
FROM item_variants src_variants
JOIN items src_items ON src_items.id = src_variants.item_id
  AND src_items.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'
JOIN items prod_items ON prod_items.sku = src_items.sku
  AND prod_items.organization_id = 'e047b512-0012-4287-bb74-dc6d4f7e673f'
ON CONFLICT (item_id, variant_name) DO NOTHING;

COMMIT;
