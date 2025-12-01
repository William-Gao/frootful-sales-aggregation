-- Add UPDATE policy for intake_events
-- Allows global admin to assign intake events to organizations
-- Also allows users to update intake events in their organization

-- UPDATE policy for intake_events
CREATE POLICY "Users can update intake events in their organization"
  ON intake_events FOR UPDATE
  USING (
    -- Global admin can update any intake event
    is_global_admin()
    OR
    -- Regular users can update events in their organization
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
    OR
    -- Allow updating unassigned events (to assign them)
    organization_id IS NULL
  )
  WITH CHECK (
    -- Global admin can assign to any organization
    is_global_admin()
    OR
    -- Regular users can only assign to their own organization
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Also update SELECT policy to allow global admin to read all
DROP POLICY IF EXISTS "Users can read intake events from their organization" ON intake_events;

CREATE POLICY "Users can read intake events from their organization"
  ON intake_events FOR SELECT
  USING (
    is_global_admin()
    OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Keep the unassigned policy too (it should be OR'd with the above)
-- The policy already exists from previous migration
