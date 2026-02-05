-- Drop price columns from items and item_variants
-- Pricing will be handled separately later

-- Drop base_price from items (if exists)
ALTER TABLE items DROP COLUMN IF EXISTS base_price;

-- Drop price from item_variants (if exists)
ALTER TABLE item_variants DROP COLUMN IF EXISTS price;
