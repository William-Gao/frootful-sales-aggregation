/*
  # Create text orders table for SMS order processing

  1. New Tables
    - `text_orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `phone_number` (text, sender's phone)
      - `message_content` (text, original SMS content)
      - `status` (text, processing status)
      - `analysis_data` (jsonb, AI analysis results)
      - `created_at` (timestamp)
      - `processed_at` (timestamp)
      - `exported_at` (timestamp)
      - `erp_order_id` (text, Business Central order ID)
      - `erp_order_number` (text, Business Central order number)

  2. Security
    - Enable RLS on `text_orders` table
    - Add policies for authenticated users to manage their own orders

  3. Indexes
    - Performance optimization for common queries
*/

-- Create text_orders table
CREATE TABLE IF NOT EXISTS text_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  message_content text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'analyzed', 'exported', 'failed')),
  analysis_data jsonb,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  exported_at timestamptz,
  erp_order_id text,
  erp_order_number text
);

-- Enable RLS
ALTER TABLE text_orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own text orders"
  ON text_orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own text orders"
  ON text_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own text orders"
  ON text_orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all text orders"
  ON text_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_text_orders_user_id ON text_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_text_orders_status ON text_orders(status);
CREATE INDEX IF NOT EXISTS idx_text_orders_created_at ON text_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_text_orders_phone_number ON text_orders(phone_number);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.processed_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_text_orders_processed_at
  BEFORE UPDATE ON text_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();