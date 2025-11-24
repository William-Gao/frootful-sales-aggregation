-- Drop profiles table if it exists
-- This table is not being used in the application
-- User information is stored in auth.users and user metadata instead

DROP TABLE IF EXISTS profiles CASCADE;
