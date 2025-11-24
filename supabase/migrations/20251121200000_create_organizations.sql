-- Create organizations table for multi-tenant support
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,

  -- Flexible settings for BC integration, preferences, etc.
  settings jsonb DEFAULT '{}'::jsonb,

  -- Organization status
  active boolean DEFAULT true,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure unique organization names
  UNIQUE(name)
);

-- Index for active organizations
CREATE INDEX idx_organizations_active ON organizations(active) WHERE active = true;

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role can manage all organizations
CREATE POLICY "Service role can manage all organizations"
  ON organizations FOR ALL
  USING (true);

-- Note: User read policy will be added after user_organizations table is created

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_organizations_updated_at();

-- Add comments for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant organizations/customers using the platform';
COMMENT ON COLUMN organizations.settings IS 'Flexible JSONB for BC integration config, email settings, etc.';
COMMENT ON COLUMN organizations.active IS 'Whether organization is active and can use the platform';
