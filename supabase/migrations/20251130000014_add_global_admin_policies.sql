-- Add global admin support for order_change_proposals
-- The admin user (orders.frootful@gmail.com) should be able to create/manage
-- proposals for ANY organization, not just their own

-- Create a function to check if the current user is a global admin
CREATE OR REPLACE FUNCTION is_global_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get the email of the current authenticated user
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Check if this is the global admin email
  RETURN user_email = 'orders.frootful@gmail.com';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_global_admin() TO authenticated;

COMMENT ON FUNCTION is_global_admin IS 'Check if current user is the global admin (orders.frootful@gmail.com)';

-- ============================================================================
-- Update INSERT policy for order_change_proposals to allow global admin
-- ============================================================================
DROP POLICY IF EXISTS "Users can create proposals in their organization" ON order_change_proposals;

CREATE POLICY "Users can create proposals in their organization"
  ON order_change_proposals FOR INSERT
  WITH CHECK (
    -- Global admin can create proposals for any organization
    is_global_admin()
    OR
    -- Regular users can only create for their own organization
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Update SELECT policy to allow global admin to read all
-- ============================================================================
DROP POLICY IF EXISTS "Users can read proposals from their organization" ON order_change_proposals;

CREATE POLICY "Users can read proposals from their organization"
  ON order_change_proposals FOR SELECT
  USING (
    is_global_admin()
    OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Update UPDATE policy to allow global admin
-- ============================================================================
DROP POLICY IF EXISTS "Users can update proposals in their organization" ON order_change_proposals;

CREATE POLICY "Users can update proposals in their organization"
  ON order_change_proposals FOR UPDATE
  USING (
    is_global_admin()
    OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Add DELETE policy for global admin
-- ============================================================================
CREATE POLICY "Global admin can delete proposals"
  ON order_change_proposals FOR DELETE
  USING (is_global_admin());

-- ============================================================================
-- Update policies for order_change_proposal_lines as well
-- ============================================================================

-- INSERT policy
DROP POLICY IF EXISTS "Users can create proposal lines in their organization" ON order_change_proposal_lines;

CREATE POLICY "Users can create proposal lines in their organization"
  ON order_change_proposal_lines FOR INSERT
  WITH CHECK (
    is_global_admin()
    OR
    EXISTS (
      SELECT 1 FROM order_change_proposals
      WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
      AND order_change_proposals.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

-- SELECT policy
DROP POLICY IF EXISTS "Users can read proposal lines from their organization" ON order_change_proposal_lines;

CREATE POLICY "Users can read proposal lines from their organization"
  ON order_change_proposal_lines FOR SELECT
  USING (
    is_global_admin()
    OR
    EXISTS (
      SELECT 1 FROM order_change_proposals
      WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
      AND order_change_proposals.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE policy
DROP POLICY IF EXISTS "Users can update proposal lines in their organization" ON order_change_proposal_lines;

CREATE POLICY "Users can update proposal lines in their organization"
  ON order_change_proposal_lines FOR UPDATE
  USING (
    is_global_admin()
    OR
    EXISTS (
      SELECT 1 FROM order_change_proposals
      WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
      AND order_change_proposals.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

-- DELETE policy for global admin
CREATE POLICY "Global admin can delete proposal lines"
  ON order_change_proposal_lines FOR DELETE
  USING (is_global_admin());
