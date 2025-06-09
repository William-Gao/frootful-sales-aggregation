/*
  # Safe update for user tokens storage

  1. Tables
    - Ensure `user_tokens` table exists with all required columns
    - Preserve existing data and structure

  2. Security
    - Ensure RLS is enabled
    - Recreate policies safely to avoid conflicts

  3. Performance
    - Ensure all indexes exist
*/

-- Ensure the table exists with all required columns
DO $$ 
BEGIN
  -- Create table if it doesn't exist
  CREATE TABLE IF NOT EXISTS user_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    provider text NOT NULL CHECK (provider = ANY (ARRAY['google'::text, 'business_central'::text])),
    encrypted_access_token text,
    encrypted_refresh_token text,
    token_expires_at timestamptz,
    tenant_id text,
    company_id text,
    company_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_tokens_user_id_fkey' 
    AND table_name = 'user_tokens'
  ) THEN
    ALTER TABLE user_tokens 
    ADD CONSTRAINT user_tokens_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_tokens_user_id_provider_key' 
    AND table_name = 'user_tokens'
  ) THEN
    ALTER TABLE user_tokens 
    ADD CONSTRAINT user_tokens_user_id_provider_key 
    UNIQUE (user_id, provider);
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but continue
    RAISE NOTICE 'Error creating table or constraints: %', SQLERRM;
END $$;

-- Ensure RLS is enabled
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

-- Safely recreate policies
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can read own tokens" ON user_tokens;
  DROP POLICY IF EXISTS "Users can insert own tokens" ON user_tokens;
  DROP POLICY IF EXISTS "Users can update own tokens" ON user_tokens;
  DROP POLICY IF EXISTS "Users can delete own tokens" ON user_tokens;

  -- Create new policies
  CREATE POLICY "Users can read own tokens"
    ON user_tokens
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert own tokens"
    ON user_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update own tokens"
    ON user_tokens
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can delete own tokens"
    ON user_tokens
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, policies will be created when table is created
    RAISE NOTICE 'Table user_tokens does not exist yet, skipping policy creation';
  WHEN OTHERS THEN
    -- Log error but continue
    RAISE NOTICE 'Error creating policies: %', SQLERRM;
END $$;

-- Ensure trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Safely recreate trigger
DO $$
BEGIN
  -- Drop existing trigger if it exists
  DROP TRIGGER IF EXISTS update_user_tokens_updated_at ON user_tokens;
  
  -- Create trigger
  CREATE TRIGGER update_user_tokens_updated_at
    BEFORE UPDATE ON user_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, trigger will be created when table is created
    RAISE NOTICE 'Table user_tokens does not exist yet, skipping trigger creation';
  WHEN OTHERS THEN
    -- Log error but continue
    RAISE NOTICE 'Error creating trigger: %', SQLERRM;
END $$;

-- Create indexes for performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_provider ON user_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_user_tokens_expires_at ON user_tokens(token_expires_at);