-- Add received_by column to orders table
-- This tracks which user received/created the order
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for queries by received_by
CREATE INDEX IF NOT EXISTS idx_orders_received_by ON orders(received_by);

COMMENT ON COLUMN orders.received_by IS 'User ID of the person who received/created this order';
