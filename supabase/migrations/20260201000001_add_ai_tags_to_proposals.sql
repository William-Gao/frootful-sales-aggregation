-- Add tags JSONB column to order_change_proposals
-- Stores flexible metadata like order_frequency, priority, etc.
-- Using JSONB object for simple key-value storage.
-- Example: {"order_frequency": "one-time", "priority": "high"}

ALTER TABLE order_change_proposals
ADD COLUMN tags JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN order_change_proposals.tags IS 'Flexible tags/metadata. Key-value object.';
