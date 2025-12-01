-- Ensure the function is in the public schema and has correct permissions
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_user_id_by_phone(user_phone text)
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

  RAISE LOG 'get_user_id_by_phone: input=%, normalized=%', user_phone, normalized_phone;

  -- Try to find user by matching phone with or without + prefix
  SELECT id INTO user_id
  FROM auth.users
  WHERE REPLACE(COALESCE(phone, ''), '+', '') = normalized_phone
  LIMIT 1;

  RAISE LOG 'get_user_id_by_phone: found user_id=%', user_id;

  RETURN user_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_id_by_phone(text) TO authenticated, service_role, anon;

COMMENT ON FUNCTION public.get_user_id_by_phone IS 'Returns user ID for a given phone number from auth.users (normalizes +prefix)';
