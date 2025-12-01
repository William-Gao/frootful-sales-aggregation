-- Fix RLS policies for intake_events
-- 1. Drop the problematic "Service role can manage all" policy (same bug as before)
-- 2. Add policy to allow reading unassigned intake events (organization_id IS NULL)

-- Drop the problematic policy
DROP POLICY IF EXISTS "Service role can manage all intake events" ON intake_events;

-- Add policy to allow authenticated users to read unassigned intake events
-- This allows the admin to see intake events that haven't been assigned to any org yet
CREATE POLICY "Users can read unassigned intake events"
  ON intake_events FOR SELECT
  USING (organization_id IS NULL);

-- Note: Service role automatically bypasses RLS, so no replacement policy is needed.
