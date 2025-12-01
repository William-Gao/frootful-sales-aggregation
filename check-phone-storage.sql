-- Check how phone numbers are actually stored in auth.users
SELECT
  id,
  email,
  phone,
  LENGTH(phone) as phone_length,
  phone LIKE '+%' as has_plus_prefix,
  REPLACE(phone, '+', '') as phone_without_plus,
  created_at
FROM auth.users
WHERE phone IS NOT NULL
ORDER BY created_at DESC;

-- Test the normalization function with your specific phone number
SELECT
  get_user_id_by_phone('+17813540382') as with_plus,
  get_user_id_by_phone('17813540382') as without_plus;

-- Debug: See what the function is actually comparing
SELECT
  id,
  phone,
  REPLACE(phone, '+', '') as normalized_phone,
  REPLACE('+17813540382', '+', '') as normalized_input
FROM auth.users
WHERE phone IS NOT NULL;
