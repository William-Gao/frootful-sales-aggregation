-- Make get_user_id_by_phone more flexible with phone formats
-- Strips +, spaces, dashes, parens from both sides before comparing
DROP FUNCTION IF EXISTS public.get_user_id_by_phone(text);

CREATE OR REPLACE FUNCTION get_user_id_by_phone(user_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  normalized_input text;
BEGIN
  -- Normalize input: remove +, spaces, dashes, parens
  normalized_input := regexp_replace(user_phone, '[^0-9]', '', 'g');

  -- Also try matching just the last 10 digits (US phone without country code)
  -- This handles cases where auth.users stores 7813540382 but Twilio sends +17813540382
  SELECT id INTO user_id
  FROM auth.users
  WHERE
    -- Exact match after stripping non-digits from both
    regexp_replace(phone, '[^0-9]', '', 'g') = normalized_input
    OR
    -- Match last 10 digits (handles +1 country code difference)
    RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = RIGHT(normalized_input, 10)
  LIMIT 1;

  RETURN user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_id_by_phone(text) TO authenticated, service_role;

COMMENT ON FUNCTION get_user_id_by_phone IS 'Returns user ID for a given phone number from auth.users. Handles various phone formats by normalizing.';
