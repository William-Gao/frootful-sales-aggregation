-- Fix RLS policies for orders and order_lines
-- The "Service role can manage all..." policies used USING (true)
-- which grants access to ALL users, not just service role.
-- Service role bypasses RLS entirely, so these policies are not needed.

-- ============================================================================
-- 1. Drop the problematic policies
-- ============================================================================
DROP POLICY IF EXISTS "Service role can manage all orders" ON orders;
DROP POLICY IF EXISTS "Service role can manage all order lines" ON order_lines;

-- Note: Service role automatically bypasses RLS, so no replacement policy is needed.
-- The existing organization-based policies will now correctly restrict access.
