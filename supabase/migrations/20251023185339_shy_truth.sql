/*
  # Create email orders table

  1. New Tables
    - `email_orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `email_id` (text, Gmail message ID)
      - `thread_id` (text, Gmail thread ID)
      - `subject` (text, email subject)
      - `from_email` (text, sender email)
      - `to_email` (text, recipient email)
      - `email_content` (text, email body content)
      - `status` (text, processing status)
      - `analysis_data` (jsonb, AI analysis results)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `exported_at` (timestamp)
      - `erp_order_id` (text, Business Central order ID)
      - `erp_order_number` (text, Business Central order number)
      - `ai_analysis_log_id` (uuid, foreign key to ai_analysis_logs)

  2. Security
    - Enable RLS on `email_orders` table
    - Add policies for authenticated users to manage their own orders
    - Add policy for service role to manage all orders

  3. Indexes
    - Index on user_id for performance
    - Index on status for filtering
    - Index on created_at for sorting
    - Index on email_id for lookups
*/

CREATE TABLE IF NOT EXISTS email_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_id text NOT NULL,
  thread_id text,
  subject text,
  from_email text,
  to_email text,
  email_content text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'analyzed', 'exported', 'failed')),
  analysis_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  exported_at timestamptz,
  erp_order_id text,
  erp_order_number text,
  ai_analysis_log_id uuid,
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_analysis_log_id) REFERENCES ai_analysis_logs(id)
);

-- Enable RLS
ALTER TABLE email_orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own email orders"
  ON email_orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email orders"
  ON email_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email orders"
  ON email_orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email orders"
  ON email_orders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all email orders"
  ON email_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_orders_user_id ON email_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_email_orders_status ON email_orders(status);
CREATE INDEX IF NOT EXISTS idx_email_orders_created_at ON email_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_orders_email_id ON email_orders(email_id);
CREATE INDEX IF NOT EXISTS idx_email_orders_ai_analysis_log_id ON email_orders(ai_analysis_log_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_email_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_orders_updated_at
  BEFORE UPDATE ON email_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_email_orders_updated_at();