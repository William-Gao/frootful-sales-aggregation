-- Remove item_variants table and related objects since using flat structure
-- Each size variant is stored as a separate item instead

-- Drop RLS policies first
DROP POLICY IF EXISTS "Users can read variants from their organizations" ON item_variants;
DROP POLICY IF EXISTS "Admins can manage variants in their organizations" ON item_variants;
DROP POLICY IF EXISTS "Service role can manage all variants" ON item_variants;

-- Drop trigger
DROP TRIGGER IF EXISTS item_variants_updated_at ON item_variants;

-- Drop function
DROP FUNCTION IF EXISTS update_item_variants_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_item_variants_item_id;
DROP INDEX IF EXISTS idx_item_variants_active;
DROP INDEX IF EXISTS idx_item_variants_sort_order;

-- Drop table
DROP TABLE IF EXISTS item_variants;

-- Update comment on items table to reflect flat structure
COMMENT ON TABLE items IS 'Organization-specific product catalog with each size/variant as a separate item';
COMMENT ON COLUMN items.base_price IS 'Price for this specific item (includes size-specific pricing)';
