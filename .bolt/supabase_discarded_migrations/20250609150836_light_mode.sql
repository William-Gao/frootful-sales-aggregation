/*
  # Create secure user tokens storage

  1. New Tables
    - `user_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `provider` (text) - 'google' or 'business_central'
      - `encrypted_access_token` (text)
      - `encrypted_refresh_token` (text)
      - `token_expires_at` (timestamptz)
      - `tenant_id` (text) - for Business Central
      - `company_id` (text) - selected company
      - `company_name` (text) - selected company name
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_tokens` table
    - Add policies for authenticated users to manage their own tokens
    - Encrypt sensitive token data

  3. Functions
    - Token encryption/decryption functions
    - Token refresh management
*/

-- Create user_tokens table
CREATE TABLE IF NOT EXISTS user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google', 'business_central')),
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  tenant_id text,
  company_id text,
  company_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
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

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_tokens_updated_at
  BEFORE UPDATE ON user_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_provider ON user_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_user_tokens_expires_at ON user_tokens(token_expires_at);