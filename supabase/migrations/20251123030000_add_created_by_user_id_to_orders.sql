-- Add created_by_user_id to orders table to track who received/forwarded the order
-- This helps identify which team member processed each order

ALTER TABLE orders
ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id);

-- Add comment
COMMENT ON COLUMN orders.created_by_user_id IS
  'The user who received and forwarded this order to Frootful';

-- Create index for faster lookups
CREATE INDEX idx_orders_created_by_user_id ON orders(created_by_user_id);
