-- Create user_organizations junction table to link users to organizations
CREATE TABLE IF NOT EXISTS user_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- User's role within the organization
  role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure a user can only have one role per organization
  UNIQUE(user_id, organization_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_organization_id ON user_organizations(organization_id);
CREATE INDEX idx_user_organizations_role ON user_organizations(role);

-- Enable RLS
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own organization memberships
CREATE POLICY "Users can read own organization memberships"
  ON user_organizations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read other memberships in their organizations (to see teammates)
CREATE POLICY "Users can read memberships in their organizations"
  ON user_organizations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Only admins/owners can insert new memberships
CREATE POLICY "Admins can manage memberships"
  ON user_organizations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.organization_id = user_organizations.organization_id
      AND user_organizations.user_id = auth.uid()
      AND user_organizations.role IN ('admin', 'owner')
    )
  );

-- Service role can manage all memberships
CREATE POLICY "Service role can manage all memberships"
  ON user_organizations FOR ALL
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER user_organizations_updated_at
  BEFORE UPDATE ON user_organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_user_organizations_updated_at();

-- Add comments for documentation
COMMENT ON TABLE user_organizations IS 'Junction table linking users to organizations with roles';
COMMENT ON COLUMN user_organizations.role IS 'User role: owner (full access), admin (manage users/settings), member (basic access)';

-- Now add the user read policy to organizations table (requires user_organizations to exist)
CREATE POLICY "Users can read their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.organization_id = organizations.id
      AND user_organizations.user_id = auth.uid()
    )
  );
