-- Test database functions for user lookup

-- 1. Check what users exist and their phone numbers
SELECT id, email, phone, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- 2. Test get_user_id_by_phone with a known phone number
-- Replace with an actual phone number from the query above
SELECT get_user_id_by_phone('+15555551234') as user_id;

-- 3. Test get_user_id_by_email with a known email
-- Replace with an actual email from the query above
SELECT get_user_id_by_email('your-email@example.com') as user_id;

-- 4. Check if the user is associated with an organization
-- Replace with the user_id returned from step 2 or 3
SELECT uo.*, o.name as org_name
FROM user_organizations uo
JOIN organizations o ON o.id = uo.organization_id
WHERE uo.user_id = 'your-user-id-here';

-- 5. Full test: Find user by phone and their organization
SELECT
  u.id as user_id,
  u.email,
  u.phone,
  uo.organization_id,
  o.name as organization_name
FROM auth.users u
LEFT JOIN user_organizations uo ON uo.user_id = u.id
LEFT JOIN organizations o ON o.id = uo.organization_id
WHERE u.phone = '+15555551234';
