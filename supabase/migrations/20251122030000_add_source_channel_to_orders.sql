-- Add source_channel to orders table to track where the order originated from
-- This is denormalized from intake_events for easier querying and filtering

ALTER TABLE orders
ADD COLUMN source_channel text;

-- Add comment
COMMENT ON COLUMN orders.source_channel IS
  'Source channel of the order (email, sms, file_upload, etc.) - denormalized from intake_events.channel';

-- Backfill existing orders from intake_events
UPDATE orders o
SET source_channel = ie.channel
FROM intake_events ie
WHERE o.origin_intake_event_id = ie.id
AND o.source_channel IS NULL;
