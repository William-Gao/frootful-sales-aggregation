-- Compare the two functions
SELECT
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname IN ('get_user_id_by_email', 'get_user_id_by_phone')
ORDER BY p.proname;

-- Test both functions
SELECT 'email' as test, get_user_id_by_email('william.j.gao@gmail.com') as result
UNION ALL
SELECT 'phone' as test, get_user_id_by_phone('+17813540382') as result;

-- Check what's actually in auth.users
SELECT id, email, phone
FROM auth.users
WHERE email = 'william.j.gao@gmail.com' OR phone LIKE '%7813540382%';
