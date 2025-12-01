-- Fix RLS policies for order_change_proposals and order_change_proposal_lines
-- The previous "Service role can manage all proposals" policy used USING (true)
-- which grants access to ALL users, not just service role.
-- Service role bypasses RLS entirely, so these policies are not needed.

-- ============================================================================
-- 1. Drop the problematic policies
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage all proposals" ON order_change_proposals;
DROP POLICY IF EXISTS "Service role can manage all proposal lines" ON order_change_proposal_lines;

-- Note: Service role automatically bypasses RLS, so no replacement policy is needed.
-- The existing user organization-based policies will now correctly restrict access.
