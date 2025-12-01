-- Create items table for organization-specific SKU catalog
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- SKU and product information
  sku text NOT NULL,
  name text NOT NULL,
  description text,

  -- Base price (optional, variants can override)
  base_price decimal(10, 2),

  -- Item status
  active boolean DEFAULT true,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure unique SKUs per organization
  UNIQUE(organization_id, sku)
);

-- Indexes for efficient querying
CREATE INDEX idx_items_organization_id ON items(organization_id);
CREATE INDEX idx_items_sku ON items(sku);
CREATE INDEX idx_items_active ON items(active) WHERE active = true;
CREATE INDEX idx_items_name ON items(name);

-- Create item_variants table for size/type variations
CREATE TABLE IF NOT EXISTS item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,

  -- Variant information
  variant_name text NOT NULL, -- e.g., "Small Clamshell", "Large Clamshell", "Price Live Tray"
  variant_code text, -- Optional short code e.g., "SM", "LG", "PLT"

  -- Variant-specific price
  price decimal(10, 2) NOT NULL,

  -- Variant status
  active boolean DEFAULT true,

  -- Display ordering
  sort_order integer DEFAULT 0,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure unique variant names per item
  UNIQUE(item_id, variant_name)
);

-- Indexes for efficient querying
CREATE INDEX idx_item_variants_item_id ON item_variants(item_id);
CREATE INDEX idx_item_variants_active ON item_variants(active) WHERE active = true;
CREATE INDEX idx_item_variants_sort_order ON item_variants(sort_order);

-- Enable RLS on items
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for items
-- Users can read items from their organizations
CREATE POLICY "Users can read items from their organizations"
  ON items FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Admins/owners can manage items in their organizations
CREATE POLICY "Admins can manage items in their organizations"
  ON items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.organization_id = items.organization_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role IN ('admin', 'owner')
    )
  );

-- Service role can manage all items
CREATE POLICY "Service role can manage all items"
  ON items FOR ALL
  USING (true);

-- Enable RLS on item_variants
ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for item_variants
-- Users can read variants from their organization's items
CREATE POLICY "Users can read variants from their organizations"
  ON item_variants FOR SELECT
  USING (
    item_id IN (
      SELECT items.id FROM items
      INNER JOIN user_organizations ON user_organizations.organization_id = items.organization_id
      WHERE user_organizations.user_id = auth.uid()
    )
  );

-- Admins/owners can manage variants in their organizations
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

-- Service role can manage all variants
CREATE POLICY "Service role can manage all variants"
  ON item_variants FOR ALL
  USING (true);

-- Function to update items updated_at timestamp
CREATE OR REPLACE FUNCTION update_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for items updated_at
CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_items_updated_at();

-- Function to update item_variants updated_at timestamp
CREATE OR REPLACE FUNCTION update_item_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for item_variants updated_at
CREATE TRIGGER item_variants_updated_at
  BEFORE UPDATE ON item_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_item_variants_updated_at();

-- Add comments for documentation
COMMENT ON TABLE items IS 'Organization-specific product catalog (base SKUs)';
COMMENT ON TABLE item_variants IS 'Size/type variations for each item (e.g., Small Clamshell, Large Clamshell)';
COMMENT ON COLUMN items.sku IS 'Unique SKU code per organization';
COMMENT ON COLUMN items.base_price IS 'Default price if variants do not override';
COMMENT ON COLUMN item_variants.variant_name IS 'Human-readable variant name (e.g., "Small Clamshell")';
COMMENT ON COLUMN item_variants.variant_code IS 'Optional short code for ordering systems (e.g., "SM")';
COMMENT ON COLUMN item_variants.price IS 'Price specific to this variant';
COMMENT ON COLUMN item_variants.sort_order IS 'Display order for variants (lower numbers first)';
