-- Drop and recreate the function with explicit postgres ownership
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

-- Create function owned by postgres (supabase_admin)
CREATE OR REPLACE FUNCTION get_user_id_by_phone(user_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT id INTO user_id
  FROM auth.users
  WHERE phone = user_phone
  LIMIT 1;

  RETURN user_id;
END;
$$;

-- Ensure postgres/supabase_admin owns it
ALTER FUNCTION get_user_id_by_phone(text) OWNER TO postgres;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_id_by_phone(text) TO authenticated, service_role, anon;

COMMENT ON FUNCTION get_user_id_by_phone IS 'Returns user ID for a given phone number from auth.users';
