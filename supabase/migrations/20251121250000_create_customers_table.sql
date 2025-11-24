-- Create customers table for organization-specific customer contacts
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Customer information
  name text NOT NULL,
  email text,
  phone text,

  -- Customer status
  active boolean DEFAULT true,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure unique email per organization (if email is provided)
  UNIQUE(organization_id, email)
);

-- Indexes for efficient querying
CREATE INDEX idx_customers_organization_id ON customers(organization_id);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_active ON customers(active) WHERE active = true;

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read customers from their organizations
CREATE POLICY "Users can read customers from their organizations"
  ON customers FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Admins/owners can manage customers in their organizations
CREATE POLICY "Admins can manage customers in their organizations"
  ON customers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.organization_id = customers.organization_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role IN ('admin', 'owner')
    )
  );

-- Service role can manage all customers
CREATE POLICY "Service role can manage all customers"
  ON customers FOR ALL
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customers_updated_at();

-- Add comments for documentation
COMMENT ON TABLE customers IS 'Organization-specific customer contacts';
COMMENT ON COLUMN customers.name IS 'Customer contact name';
COMMENT ON COLUMN customers.email IS 'Customer email address';
COMMENT ON COLUMN customers.phone IS 'Customer phone number';
COMMENT ON COLUMN customers.active IS 'Whether customer is active';
