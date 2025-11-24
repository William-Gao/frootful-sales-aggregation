-- Check function ownership and ACL
SELECT
  n.nspname as schema,
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner,
  p.proacl as acl,
  p.prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname IN ('get_user_id_by_email', 'get_user_id_by_phone');

-- Check who you're running as
SELECT current_user, session_user;

-- Try to access auth.users directly
SELECT COUNT(*) FROM auth.users;
