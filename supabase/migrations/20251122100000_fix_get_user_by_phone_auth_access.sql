-- Fix get_user_id_by_phone to properly access auth.users table
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_user_id_by_phone(user_phone text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id
  FROM auth.users
  WHERE REPLACE(COALESCE(phone, ''), '+', '') = REPLACE($1, '+', '')
  LIMIT 1;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_id_by_phone(text) TO authenticated, service_role, anon;

COMMENT ON FUNCTION public.get_user_id_by_phone IS 'Returns user ID for a given phone number from auth.users (normalizes +prefix)';
