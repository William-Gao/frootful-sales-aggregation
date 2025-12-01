-- Add INSERT policies for order_change_proposals and order_change_proposal_lines
-- Users should be able to create proposals for orders in their organization

-- ============================================================================
-- 1. INSERT policy for order_change_proposals
-- ============================================================================
CREATE POLICY "Users can create proposals in their organization"
  ON order_change_proposals FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. INSERT policy for order_change_proposal_lines
-- ============================================================================
CREATE POLICY "Users can create proposal lines in their organization"
  ON order_change_proposal_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM order_change_proposals
      WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
      AND order_change_proposals.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );
