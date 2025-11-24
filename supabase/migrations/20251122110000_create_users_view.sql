-- Create a view in public schema to access auth.users
-- This allows the service role to query user information

DROP VIEW IF EXISTS public.auth_users;

CREATE VIEW public.auth_users AS
SELECT id, email, phone, created_at, updated_at
FROM auth.users;

-- Grant select to service role
GRANT SELECT ON public.auth_users TO service_role;

COMMENT ON VIEW public.auth_users IS 'View to access auth.users from service role';

-- Recreate the function to use the view
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_user_id_by_phone(user_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.auth_users
  WHERE REPLACE(COALESCE(phone, ''), '+', '') = REPLACE($1, '+', '')
  LIMIT 1;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_id_by_phone(text) TO authenticated, service_role, anon;

COMMENT ON FUNCTION public.get_user_id_by_phone IS 'Returns user ID for a given phone number using auth_users view (normalizes +prefix)';
