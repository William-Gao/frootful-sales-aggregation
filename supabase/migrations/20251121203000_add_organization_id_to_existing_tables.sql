-- Add organization_id to existing tables for multi-tenant support

-- Add organization_id to emails table
ALTER TABLE emails
ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Add index for organization filtering
CREATE INDEX idx_emails_organization_id ON emails(organization_id);

-- Add organization_id to email_orders table
ALTER TABLE email_orders
ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Add index for organization filtering
CREATE INDEX idx_email_orders_organization_id ON email_orders(organization_id);

-- Add organization_id to user_tokens table (tokens are org-specific for BC integration)
ALTER TABLE user_tokens
ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Add index for organization filtering
CREATE INDEX idx_user_tokens_organization_id ON user_tokens(organization_id);

-- Update RLS policies for emails to be organization-scoped
DROP POLICY IF EXISTS "Users can read own emails" ON emails;
CREATE POLICY "Users can read emails from their organizations"
  ON emails FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Update RLS policies for email_orders to be organization-scoped
DROP POLICY IF EXISTS "Users can read own orders" ON email_orders;
CREATE POLICY "Users can read orders from their organizations"
  ON email_orders FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own orders" ON email_orders;
CREATE POLICY "Users can update orders in their organizations"
  ON email_orders FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Update RLS policies for user_tokens to be organization-scoped
DROP POLICY IF EXISTS "Users can manage own tokens" ON user_tokens;
CREATE POLICY "Users can read tokens from their organizations"
  ON user_tokens FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tokens in their organizations"
  ON user_tokens FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON COLUMN emails.organization_id IS 'Organization this email belongs to (multi-tenant support)';
COMMENT ON COLUMN email_orders.organization_id IS 'Organization this order belongs to (multi-tenant support)';
COMMENT ON COLUMN user_tokens.organization_id IS 'Organization these tokens are for (BC integration is org-specific)';

-- Note: Existing data will have NULL organization_id
-- You'll need to manually assign organizations to existing records
-- or run a data migration script to populate these values
