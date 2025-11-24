-- Make order_id nullable in order_change_proposals
-- This allows the table to store both:
-- 1. New order proposals (order_id = NULL) - pending user approval to create order
-- 2. Order change proposals (order_id = <existing_order_id>) - proposed changes to existing orders

ALTER TABLE order_change_proposals
  ALTER COLUMN order_id DROP NOT NULL;

COMMENT ON COLUMN order_change_proposals.order_id IS 'NULL for new order proposals, populated for change proposals to existing orders';
