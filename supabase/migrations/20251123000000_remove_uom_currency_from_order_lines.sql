-- Remove unused hardcoded fields from order_lines table
-- These fields (uom and currency) were not being used meaningfully

ALTER TABLE order_lines
  DROP COLUMN IF EXISTS uom,
  DROP COLUMN IF EXISTS currency;

COMMENT ON TABLE order_lines IS 'Individual line items for orders with AI matching metadata. Currency inherited from parent order.';
