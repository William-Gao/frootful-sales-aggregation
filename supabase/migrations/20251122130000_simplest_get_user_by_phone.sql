-- Simplify get_user_id_by_phone to match get_user_id_by_email exactly
-- Normalization happens in the calling code, not in the function
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

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

GRANT EXECUTE ON FUNCTION get_user_id_by_phone(text) TO authenticated, service_role;

COMMENT ON FUNCTION get_user_id_by_phone IS 'Returns user ID for a given phone number from auth.users';
