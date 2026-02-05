-- Migration: Restructure Boston Microgreens catalog to use items + item_variants
-- This re-creates the item_variants table (previously dropped in 20251121220000)
-- and splits the flat items rows into base products + size variants.
--
-- Affected organizations:
--   ac3dd72d-373d-4424-8085-55b3b1844459 (Boston Microgreens / Test)
--   00000000-0000-0000-0000-000000000001 (Demo - copies from Boston Microgreens)
--
-- A Plus Vegetable (de975939-...) is NOT affected - different item structure.

BEGIN;

-- ============================================================
-- Step 1: Re-create item_variants table
-- ============================================================

CREATE TABLE IF NOT EXISTS item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  variant_name text NOT NULL,
  variant_code text,
  price decimal(10, 2) NOT NULL,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(item_id, variant_name)
);

CREATE INDEX idx_item_variants_item_id ON item_variants(item_id);
CREATE INDEX idx_item_variants_active ON item_variants(active) WHERE active = true;
CREATE INDEX idx_item_variants_sort_order ON item_variants(sort_order);

-- RLS
ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read variants from their organizations"
  ON item_variants FOR SELECT
  USING (
    item_id IN (
      SELECT items.id FROM items
      INNER JOIN user_organizations ON user_organizations.organization_id = items.organization_id
      WHERE user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage variants in their organizations"
  ON item_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM items
      INNER JOIN user_organizations ON user_organizations.organization_id = items.organization_id
      WHERE items.id = item_variants.item_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Service role can manage all variants"
  ON item_variants FOR ALL
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_item_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER item_variants_updated_at
  BEFORE UPDATE ON item_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_item_variants_updated_at();

COMMENT ON TABLE item_variants IS 'Size/type variations for each item (e.g., Small Clamshell, Large Clamshell)';
COMMENT ON COLUMN item_variants.variant_name IS 'Human-readable variant name (e.g., "Small Clamshell")';
COMMENT ON COLUMN item_variants.variant_code IS 'Short code for UI display (e.g., "S", "L", "T20")';
COMMENT ON COLUMN item_variants.price IS 'Price specific to this variant';
COMMENT ON COLUMN item_variants.sort_order IS 'Display order for variants (lower numbers first)';

-- ============================================================
-- Step 2: Add item_variant_id to order tables
-- ============================================================

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS item_variant_id UUID REFERENCES item_variants(id) ON DELETE SET NULL;

ALTER TABLE order_change_proposal_lines
  ADD COLUMN IF NOT EXISTS item_variant_id UUID REFERENCES item_variants(id) ON DELETE SET NULL;

-- ============================================================
-- Step 3: Delete old flat Boston Microgreens items
-- ============================================================

-- Delete test org items (will be replaced with base products)
DELETE FROM items WHERE organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459';

-- Delete demo org items (will be re-copied)
DELETE FROM items WHERE organization_id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- Step 4: Insert base products for Boston Microgreens
-- ============================================================

INSERT INTO items (organization_id, sku, name, description, active) VALUES
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'ANISE-HYSSOP', 'Anise Hyssop', 'Lead time: 4 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'ARUGULA-ASTRO', 'Arugula, Astro', 'Lead time: 2 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'BASIL-GENOVESE', 'Basil, Genovese', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'BASIL-THAI', 'Basil, Thai', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'BORAGE', 'Borage', 'Lead time: 2 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'BROCCOLI', 'Broccoli', 'Lead time: 2 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'CABBAGE-RED-ACRE', 'Cabbage, Red Acre', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'CELERY', 'Celery', 'Lead time: 4 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'CELOSIA', 'Celosia', 'Lead time: 1 week', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'CHERVIL', 'Chervil', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'CILANTRO', 'Cilantro', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'FENNEL-BRONZE', 'Fennel, Bronze', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'FENNEL-GREEN', 'Fennel, Green', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'KALE-RED-RUSSIAN', 'Kale, Red Russian', 'Lead time: 2 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'LEMON-BALM', 'Lemon Balm', 'Lead time: 4 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'MUSTARD-GREEN-MIZUNA', 'Mustard, Green Mizuna', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'MUSTARD-PURPLE-MIZUNA', 'Mustard, Purple Mizuna', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'MUSTARD-SCARLET-FRILLS', 'Mustard, Scarlet Frills', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'MUSTARD-WASABI', 'Mustard, Wasabi', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'NASTURTIUM', 'Nasturtium', 'Lead time: 2.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'PARSLEY', 'Parsley', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'PEA-AFILA', 'Pea, Afila (Tendrils)', 'Lead time: 1.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'PEA-DWARF-GREY-SUGAR', 'Pea, Dwarf Grey Sugar', 'Lead time: 1.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'POPCORN-SHOOTS', 'Popcorn Shoots', 'Lead time: 2 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'RADISH-HONG-VIT', 'Radish, Hong Vit', 'Lead time: 1 week', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'RADISH-KAIWARE', 'Radish, Kaiware', 'Lead time: 1 week', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'RADISH-SANGO', 'Radish, Sango', 'Lead time: 1 week', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'RADISH-MIX', 'Radish Mix', 'Lead time: 1 week', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'SHISO-GREEN', 'Shiso, Green', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'SHISO-RED', 'Shiso, Red', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'SHUNGIKU', 'Shungiku', 'Lead time: 2 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'SORREL-RED-VEINED', 'Sorrel, Red Veined', 'Lead time: 4 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'SUNFLOWER', 'Sunflower', 'Lead time: 1.5 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'TOKYO-ONION', 'Tokyo Onion', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'RAINBOW-MIX', 'Rainbow Mix', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'NUTRITION-MIX', 'Nutrition Mix', 'Lead time: 3 weeks', true),
  ('ac3dd72d-373d-4424-8085-55b3b1844459', 'PASSION-MIX', 'Passion Mix', 'Lead time: 3 weeks', true);

-- ============================================================
-- Step 5: Insert variants for each base product
-- Variant codes: S = Small Clamshell, L = Large Clamshell, T20 = Price Live Tray
-- Sort order: S=1, L=2, T20=3
-- ============================================================

-- Helper: get item_id by sku for this org
-- We use a subquery pattern: (SELECT id FROM items WHERE sku = 'X' AND organization_id = 'Y')

-- Anise Hyssop (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'ANISE-HYSSOP' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 25.00, 1),
  ((SELECT id FROM items WHERE sku = 'ANISE-HYSSOP' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 50.00, 2),
  ((SELECT id FROM items WHERE sku = 'ANISE-HYSSOP' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 35.00, 3);

-- Arugula, Astro (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'ARUGULA-ASTRO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 17.00, 1),
  ((SELECT id FROM items WHERE sku = 'ARUGULA-ASTRO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 34.00, 2),
  ((SELECT id FROM items WHERE sku = 'ARUGULA-ASTRO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 29.00, 3);

-- Basil, Genovese (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'BASIL-GENOVESE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 16.00, 1),
  ((SELECT id FROM items WHERE sku = 'BASIL-GENOVESE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 32.00, 2),
  ((SELECT id FROM items WHERE sku = 'BASIL-GENOVESE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 32.00, 3);

-- Basil, Thai (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'BASIL-THAI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 25.00, 1),
  ((SELECT id FROM items WHERE sku = 'BASIL-THAI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 50.00, 2),
  ((SELECT id FROM items WHERE sku = 'BASIL-THAI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Borage (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'BORAGE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 21.00, 1),
  ((SELECT id FROM items WHERE sku = 'BORAGE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 42.00, 2),
  ((SELECT id FROM items WHERE sku = 'BORAGE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 32.00, 3);

-- Broccoli (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'BROCCOLI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 18.00, 1),
  ((SELECT id FROM items WHERE sku = 'BROCCOLI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 36.00, 2),
  ((SELECT id FROM items WHERE sku = 'BROCCOLI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 29.00, 3);

-- Cabbage, Red Acre (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'CABBAGE-RED-ACRE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 17.00, 1),
  ((SELECT id FROM items WHERE sku = 'CABBAGE-RED-ACRE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 34.00, 2),
  ((SELECT id FROM items WHERE sku = 'CABBAGE-RED-ACRE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 29.00, 3);

-- Celery (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'CELERY' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 24.00, 1),
  ((SELECT id FROM items WHERE sku = 'CELERY' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 48.00, 2),
  ((SELECT id FROM items WHERE sku = 'CELERY' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Celosia (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'CELOSIA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 18.00, 1),
  ((SELECT id FROM items WHERE sku = 'CELOSIA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 36.00, 2),
  ((SELECT id FROM items WHERE sku = 'CELOSIA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Chervil (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'CHERVIL' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 16.00, 1),
  ((SELECT id FROM items WHERE sku = 'CHERVIL' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 32.00, 2),
  ((SELECT id FROM items WHERE sku = 'CHERVIL' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Cilantro (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'CILANTRO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 16.00, 1),
  ((SELECT id FROM items WHERE sku = 'CILANTRO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 32.00, 2),
  ((SELECT id FROM items WHERE sku = 'CILANTRO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 32.00, 3);

-- Fennel, Bronze (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'FENNEL-BRONZE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 25.00, 1),
  ((SELECT id FROM items WHERE sku = 'FENNEL-BRONZE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 50.00, 2),
  ((SELECT id FROM items WHERE sku = 'FENNEL-BRONZE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Fennel, Green (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'FENNEL-GREEN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 25.00, 1),
  ((SELECT id FROM items WHERE sku = 'FENNEL-GREEN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 50.00, 2),
  ((SELECT id FROM items WHERE sku = 'FENNEL-GREEN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Kale, Red Russian (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'KALE-RED-RUSSIAN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 18.00, 1),
  ((SELECT id FROM items WHERE sku = 'KALE-RED-RUSSIAN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 36.00, 2),
  ((SELECT id FROM items WHERE sku = 'KALE-RED-RUSSIAN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Lemon Balm (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'LEMON-BALM' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 27.00, 1),
  ((SELECT id FROM items WHERE sku = 'LEMON-BALM' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 54.00, 2),
  ((SELECT id FROM items WHERE sku = 'LEMON-BALM' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Mustard, Green Mizuna (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'MUSTARD-GREEN-MIZUNA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 19.00, 1),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-GREEN-MIZUNA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-GREEN-MIZUNA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Mustard, Purple Mizuna (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'MUSTARD-PURPLE-MIZUNA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 19.00, 1),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-PURPLE-MIZUNA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-PURPLE-MIZUNA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Mustard, Scarlet Frills (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'MUSTARD-SCARLET-FRILLS' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 19.00, 1),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-SCARLET-FRILLS' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-SCARLET-FRILLS' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Mustard, Wasabi (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'MUSTARD-WASABI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 18.00, 1),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-WASABI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2),
  ((SELECT id FROM items WHERE sku = 'MUSTARD-WASABI' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 34.00, 3);

-- Nasturtium (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'NASTURTIUM' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 19.00, 1),
  ((SELECT id FROM items WHERE sku = 'NASTURTIUM' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2),
  ((SELECT id FROM items WHERE sku = 'NASTURTIUM' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Parsley (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'PARSLEY' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 25.00, 1),
  ((SELECT id FROM items WHERE sku = 'PARSLEY' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 50.00, 2),
  ((SELECT id FROM items WHERE sku = 'PARSLEY' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Pea, Afila (Tendrils) (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'PEA-AFILA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 14.00, 1),
  ((SELECT id FROM items WHERE sku = 'PEA-AFILA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 28.00, 2),
  ((SELECT id FROM items WHERE sku = 'PEA-AFILA' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 29.00, 3);

-- Pea, Dwarf Grey Sugar (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'PEA-DWARF-GREY-SUGAR' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 14.00, 1),
  ((SELECT id FROM items WHERE sku = 'PEA-DWARF-GREY-SUGAR' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 28.00, 2),
  ((SELECT id FROM items WHERE sku = 'PEA-DWARF-GREY-SUGAR' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 29.00, 3);

-- Popcorn Shoots (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'POPCORN-SHOOTS' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 19.00, 1),
  ((SELECT id FROM items WHERE sku = 'POPCORN-SHOOTS' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2),
  ((SELECT id FROM items WHERE sku = 'POPCORN-SHOOTS' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 29.00, 3);

-- Radish, Hong Vit (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'RADISH-HONG-VIT' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 12.00, 1),
  ((SELECT id FROM items WHERE sku = 'RADISH-HONG-VIT' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 24.00, 2),
  ((SELECT id FROM items WHERE sku = 'RADISH-HONG-VIT' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 24.00, 3);

-- Radish, Kaiware (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'RADISH-KAIWARE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 12.00, 1),
  ((SELECT id FROM items WHERE sku = 'RADISH-KAIWARE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 24.00, 2),
  ((SELECT id FROM items WHERE sku = 'RADISH-KAIWARE' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 24.00, 3);

-- Radish, Sango (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'RADISH-SANGO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 14.00, 1),
  ((SELECT id FROM items WHERE sku = 'RADISH-SANGO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 28.00, 2),
  ((SELECT id FROM items WHERE sku = 'RADISH-SANGO' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 26.00, 3);

-- Radish Mix (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'RADISH-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 13.00, 1),
  ((SELECT id FROM items WHERE sku = 'RADISH-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 26.00, 2),
  ((SELECT id FROM items WHERE sku = 'RADISH-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 24.00, 3);

-- Shiso, Green (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'SHISO-GREEN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 25.00, 1),
  ((SELECT id FROM items WHERE sku = 'SHISO-GREEN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 50.00, 2),
  ((SELECT id FROM items WHERE sku = 'SHISO-GREEN' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 35.00, 3);

-- Shiso, Red (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'SHISO-RED' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 27.00, 1),
  ((SELECT id FROM items WHERE sku = 'SHISO-RED' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 54.00, 2),
  ((SELECT id FROM items WHERE sku = 'SHISO-RED' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Shungiku (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'SHUNGIKU' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 18.00, 1),
  ((SELECT id FROM items WHERE sku = 'SHUNGIKU' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 34.00, 2),
  ((SELECT id FROM items WHERE sku = 'SHUNGIKU' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 32.00, 3);

-- Sorrel, Red Veined (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'SORREL-RED-VEINED' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 26.00, 1),
  ((SELECT id FROM items WHERE sku = 'SORREL-RED-VEINED' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 52.00, 2),
  ((SELECT id FROM items WHERE sku = 'SORREL-RED-VEINED' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 36.00, 3);

-- Sunflower (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'SUNFLOWER' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 17.00, 1),
  ((SELECT id FROM items WHERE sku = 'SUNFLOWER' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 34.00, 2),
  ((SELECT id FROM items WHERE sku = 'SUNFLOWER' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 28.00, 3);

-- Tokyo Onion (S, L, T20)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'TOKYO-ONION' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 23.00, 1),
  ((SELECT id FROM items WHERE sku = 'TOKYO-ONION' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 46.00, 2),
  ((SELECT id FROM items WHERE sku = 'TOKYO-ONION' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'T20', 'Price Live Tray', 40.00, 3);

-- MIXES: Only S and L (no T20/PLT)

-- Rainbow Mix (S, L)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'RAINBOW-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 14.00, 1),
  ((SELECT id FROM items WHERE sku = 'RAINBOW-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 28.00, 2);

-- Nutrition Mix (S, L)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'NUTRITION-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 15.00, 1),
  ((SELECT id FROM items WHERE sku = 'NUTRITION-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 30.00, 2);

-- Passion Mix (S, L)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, sort_order) VALUES
  ((SELECT id FROM items WHERE sku = 'PASSION-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'S', 'Small Clamshell', 19.00, 1),
  ((SELECT id FROM items WHERE sku = 'PASSION-MIX' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'), 'L', 'Large Clamshell', 38.00, 2);

-- ============================================================
-- Step 6: Re-copy items + variants to Demo Organization
-- ============================================================

-- Copy base items to demo org
INSERT INTO items (organization_id, sku, name, description, active, category, notes, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  sku, name, description, active, category, notes, NOW(), NOW()
FROM items
WHERE organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459';

-- Copy variants to demo org (linking to demo org's items by matching sku)
INSERT INTO item_variants (item_id, variant_code, variant_name, price, active, sort_order, created_at, updated_at)
SELECT
  demo_items.id,
  src_variants.variant_code,
  src_variants.variant_name,
  src_variants.price,
  src_variants.active,
  src_variants.sort_order,
  NOW(),
  NOW()
FROM item_variants src_variants
JOIN items src_items ON src_items.id = src_variants.item_id
  AND src_items.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'
JOIN items demo_items ON demo_items.sku = src_items.sku
  AND demo_items.organization_id = '00000000-0000-0000-0000-000000000001';

COMMIT;
