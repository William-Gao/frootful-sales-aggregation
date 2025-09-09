/*
  # Create OAuth States Table

  1. New Tables
    - `oauth_states`
      - `state` (text, primary key) - Unique state string for OAuth flow
      - `user_id` (uuid, foreign key) - References auth.users(id)
      - `provider` (text) - OAuth provider (e.g., 'business_central')
      - `created_at` (timestamp) - When the state was created
      - `expires_at` (timestamp) - When the state expires (for cleanup)

  2. Security
    - Foreign key constraint to auth.users with CASCADE delete
    - Index on user_id for performance
    - Automatic cleanup of expired states

  3. Notes
    - States expire after 10 minutes for security
    - Automatic cleanup prevents table bloat
*/

-- Create oauth_states table
CREATE TABLE IF NOT EXISTS oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'business_central',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '10 minutes')
);

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'oauth_states_user_id_fkey'
  ) THEN
    ALTER TABLE oauth_states 
    ADD CONSTRAINT oauth_states_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states(user_id);

-- Add index on expires_at for cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Add check constraint for provider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'oauth_states_provider_check'
  ) THEN
    ALTER TABLE oauth_states 
    ADD CONSTRAINT oauth_states_provider_check 
    CHECK (provider IN ('business_central', 'dynamics_365'));
  END IF;
END $$;

-- Function to clean up expired states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < now();
END $$;

-- Create a scheduled job to clean up expired states (runs every hour)
-- Note: This requires pg_cron extension which may not be available in all environments
-- You can also clean up expired states in your application code