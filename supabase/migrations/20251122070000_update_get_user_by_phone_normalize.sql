-- Update get_user_id_by_phone to normalize phone numbers (handle with/without + prefix)
CREATE OR REPLACE FUNCTION get_user_id_by_phone(user_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  user_id uuid;
  normalized_phone text;
BEGIN
  -- Normalize the phone: remove + if present
  normalized_phone := REPLACE(user_phone, '+', '');

  -- Try to find user by matching phone with or without + prefix
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
