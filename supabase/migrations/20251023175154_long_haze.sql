/*
  # Add AI Response Logging

  1. New Tables
    - `ai_analysis_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `analysis_type` (text) - 'email' or 'text_message'
      - `source_id` (text) - email ID or text order ID
      - `raw_request` (jsonb) - the request sent to OpenAI
      - `raw_response` (jsonb) - the full response from OpenAI
      - `parsed_result` (jsonb) - the parsed/processed result
      - `model_used` (text) - which OpenAI model was used
      - `tokens_used` (integer) - token count if available
      - `processing_time_ms` (integer) - how long the analysis took
      - `created_at` (timestamp)

  2. Updates to Existing Tables
    - Add `ai_analysis_log_id` to `text_orders` table to link to the AI analysis
    - This allows us to trace back to the raw AI response for any order

  3. Security
    - Enable RLS on `ai_analysis_logs` table
    - Add policies for users to read their own logs
    - Add policy for service role to manage all logs
*/

-- Create AI analysis logs table
CREATE TABLE IF NOT EXISTS ai_analysis_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_type text NOT NULL CHECK (analysis_type IN ('email', 'text_message')),
  source_id text NOT NULL,
  raw_request jsonb,
  raw_response jsonb,
  parsed_result jsonb,
  model_used text DEFAULT 'gpt-4o',
  tokens_used integer,
  processing_time_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint to auth.users
ALTER TABLE ai_analysis_logs 
ADD CONSTRAINT ai_analysis_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_user_id ON ai_analysis_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_created_at ON ai_analysis_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_analysis_type ON ai_analysis_logs(analysis_type);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_source_id ON ai_analysis_logs(source_id);

-- Enable RLS
ALTER TABLE ai_analysis_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own AI analysis logs"
  ON ai_analysis_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all AI analysis logs"
  ON ai_analysis_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add reference to AI analysis log in text_orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'text_orders' AND column_name = 'ai_analysis_log_id'
  ) THEN
    ALTER TABLE text_orders ADD COLUMN ai_analysis_log_id uuid REFERENCES ai_analysis_logs(id);
    CREATE INDEX IF NOT EXISTS idx_text_orders_ai_analysis_log_id ON text_orders(ai_analysis_log_id);
  END IF;
END $$;