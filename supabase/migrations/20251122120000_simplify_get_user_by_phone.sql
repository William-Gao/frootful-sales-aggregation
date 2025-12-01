-- Simplify get_user_id_by_phone to match get_user_id_by_email pattern exactly
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

CREATE OR REPLACE FUNCTION get_user_id_by_phone(user_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  normalized_phone text;
BEGIN
  -- Normalize the phone: remove + if present
  normalized_phone := REPLACE(user_phone, '+', '');

  SELECT id INTO user_id
  FROM auth.users
  WHERE REPLACE(COALESCE(phone, ''), '+', '') = normalized_phone
  LIMIT 1;

  RETURN user_id;
END;
$$;

-- Grant execute to authenticated and service role
GRANT EXECUTE ON FUNCTION get_user_id_by_phone(text) TO authenticated, service_role;

COMMENT ON FUNCTION get_user_id_by_phone IS 'Returns user ID for a given phone number from auth.users (normalizes +prefix)';
