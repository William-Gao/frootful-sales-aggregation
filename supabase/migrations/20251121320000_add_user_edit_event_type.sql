-- Add 'user_edit' to order_event_type enum
-- This allows tracking manual user edits to orders (customer changes, item changes, etc.)

ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'user_edit';

COMMENT ON TYPE order_event_type IS 'Types of events that can occur on an order: created, updated, user_edit, exported, cancelled, etc.';
