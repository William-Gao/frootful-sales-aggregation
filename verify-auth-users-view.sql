-- Verify the auth_users view exists and has data
SELECT * FROM pg_views WHERE viewname = 'auth_users';

-- Check if there are any users in the view
SELECT id, email, phone FROM public.auth_users LIMIT 5;

-- Check permissions on the view
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'auth_users' AND table_schema = 'public';
