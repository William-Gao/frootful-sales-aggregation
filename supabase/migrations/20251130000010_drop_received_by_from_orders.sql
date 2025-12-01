-- Drop received_by column from orders table
-- This column is redundant with created_by_user_id

DROP INDEX IF EXISTS idx_orders_received_by;
ALTER TABLE orders DROP COLUMN IF EXISTS received_by;
