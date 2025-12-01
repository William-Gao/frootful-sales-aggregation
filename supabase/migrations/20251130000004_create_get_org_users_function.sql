-- Create a function to get users for an organization
-- Returns user_id and email for users in the specified organization
CREATE OR REPLACE FUNCTION get_organization_users(org_id uuid)
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uo.user_id,
    au.email::text,
    uo.role
  FROM user_organizations uo
  JOIN auth.users au ON au.id = uo.user_id
  WHERE uo.organization_id = org_id
  ORDER BY au.email;
END;
$$;

-- Grant execute to authenticated and service role
GRANT EXECUTE ON FUNCTION get_organization_users(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION get_organization_users IS 'Returns users (id, email, role) for a given organization';
