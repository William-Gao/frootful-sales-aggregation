-- Remove raw_text from order_lines table
-- This field stored messy user input which doesn't belong in normalized order data
-- The raw user input already exists in intake_events.raw_content
-- AI extraction tracking belongs in ai_predictions table

ALTER TABLE order_lines
  DROP COLUMN IF EXISTS raw_text;

COMMENT ON TABLE order_lines IS 'Individual line items for orders representing resolved/matched products. Raw user input stored in intake_events.';
