/*
  # Add supabase_session provider support

  1. Provider Support
    - Add 'supabase_session' to the allowed provider types
    - This will store Supabase session tokens for Workspace Add-on access

  2. Security
    - Maintains existing RLS policies
    - Uses same encryption for token storage
    - No changes to existing data structure
*/

-- Update the provider check constraint to include supabase_session
DO $$
BEGIN
  -- Drop existing constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_tokens_provider_check' 
    AND table_name = 'user_tokens'
  ) THEN
    ALTER TABLE user_tokens DROP CONSTRAINT user_tokens_provider_check;
  END IF;

  -- Add new constraint with supabase_session
  ALTER TABLE user_tokens 
  ADD CONSTRAINT user_tokens_provider_check 
  CHECK (provider = ANY (ARRAY['google'::text, 'business_central'::text, 'supabase_session'::text]));

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but continue
    RAISE NOTICE 'Error updating provider constraint: %', SQLERRM;
END $$;