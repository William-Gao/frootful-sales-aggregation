-- Fix infinite recursion in user_organizations RLS policies
-- The issue: "Users can read memberships in their organizations" policy
-- queries user_organizations FROM user_organizations, causing infinite recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can read memberships in their organizations" ON user_organizations;

-- The "Users can read own organization memberships" policy is sufficient
-- for users to see their own memberships, and service role can see all.
-- If we need users to see teammates, we should do it at the application level
-- or use a different approach that doesn't cause recursion.

-- Alternative: If you DO need users to see teammates, use a simpler policy
-- that doesn't create recursion by directly checking user_id
-- (but this means users can only see their own memberships, not teammates)

-- Note: The "Admins can manage memberships" policy also has the same issue
-- Let's fix that too
DROP POLICY IF EXISTS "Admins can manage memberships" ON user_organizations;

-- Create a security definer function to check if user is admin
-- This function runs with the privileges of the function owner (bypassing RLS)
-- Create the function FIRST before using it in the policy
CREATE OR REPLACE FUNCTION is_organization_admin(check_user_id uuid, check_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_id = check_user_id
    AND organization_id = check_org_id
    AND role IN ('admin', 'owner')
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_organization_admin(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION is_organization_admin IS 'Check if a user is an admin or owner of an organization (bypasses RLS)';

-- Now create the policy that uses the function
-- Create a simpler admin policy that doesn't cause recursion
-- This policy allows insert/update/delete for users who are already owners/admins
CREATE POLICY "Owners and admins can manage memberships"
  ON user_organizations FOR ALL
  USING (
    -- Check if the current user is an owner/admin by using a function
    -- that bypasses RLS
    is_organization_admin(auth.uid(), organization_id)
  );
