-- Remove unit_price from order_lines table
-- Pricing should be determined dynamically from the items table based on customer-item relationships
-- This allows different customers to have different prices for the same item

ALTER TABLE order_lines
  DROP COLUMN IF EXISTS unit_price;

COMMENT ON TABLE order_lines IS 'Individual line items for orders. Pricing determined dynamically from items table based on customer relationships.';
