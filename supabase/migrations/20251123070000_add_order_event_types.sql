-- Add new event types for order lifecycle tracking
ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'change_proposed';
ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'change_accepted';
ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'change_rejected';
ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'erp_exported';

COMMENT ON TYPE order_event_type IS 'Order lifecycle events: created, updated, cancelled, comment, exported, status_changed, change_proposed, change_accepted, change_rejected, erp_exported';
