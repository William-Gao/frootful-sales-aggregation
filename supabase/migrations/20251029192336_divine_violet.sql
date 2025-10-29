/*
  # Create EDI Orders Table

  1. New Tables
    - `edi_orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `edi_document_type` (text, e.g., '850', '855', '856')
      - `trading_partner` (text, partner identifier)
      - `document_number` (text, EDI document number)
      - `edi_content` (text, raw EDI content)
      - `parsed_data` (jsonb, parsed EDI data)
      - `status` (text, processing status)
      - `analysis_data` (jsonb, AI analysis results)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `processed_at` (timestamp)
      - `exported_at` (timestamp)
      - `erp_order_id` (text)
      - `erp_order_number` (text)
      - `ai_analysis_log_id` (uuid, foreign key)

  2. Security
    - Enable RLS on `edi_orders` table
    - Add policies for authenticated users to manage their own EDI orders
    - Add policy for service role to manage all EDI orders

  3. Indexes
    - Index on user_id for performance
    - Index on status for filtering
    - Index on created_at for sorting
    - Index on trading_partner for partner-based queries
    - Index on document_type for document type filtering
*/

CREATE TABLE IF NOT EXISTS edi_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edi_document_type text NOT NULL DEFAULT 'unknown',
  trading_partner text,
  document_number text,
  edi_content text NOT NULL,
  parsed_data jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'analyzed', 'exported', 'failed')),
  analysis_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  exported_at timestamptz,
  erp_order_id text,
  erp_order_number text,
  ai_analysis_log_id uuid REFERENCES ai_analysis_logs(id)
);

-- Enable RLS
ALTER TABLE edi_orders ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Users can insert own EDI orders"
  ON edi_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own EDI orders"
  ON edi_orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own EDI orders"
  ON edi_orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own EDI orders"
  ON edi_orders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for service role
CREATE POLICY "Service role can manage all EDI orders"
  ON edi_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_edi_orders_user_id ON edi_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_edi_orders_status ON edi_orders(status);
CREATE INDEX IF NOT EXISTS idx_edi_orders_created_at ON edi_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edi_orders_trading_partner ON edi_orders(trading_partner);
CREATE INDEX IF NOT EXISTS idx_edi_orders_document_type ON edi_orders(edi_document_type);
CREATE INDEX IF NOT EXISTS idx_edi_orders_ai_analysis_log_id ON edi_orders(ai_analysis_log_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_edi_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_edi_orders_updated_at
  BEFORE UPDATE ON edi_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_edi_orders_updated_at();