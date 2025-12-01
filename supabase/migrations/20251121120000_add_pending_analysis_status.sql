-- Add 'pending_analysis' to the status check constraint
ALTER TABLE email_orders DROP CONSTRAINT IF EXISTS email_orders_status_check;

ALTER TABLE email_orders ADD CONSTRAINT email_orders_status_check
CHECK (status IN (
  'received',
  'processing',
  'analyzed',
  'exported',
  'failed',
  'pending',
  'pending_analysis',
  'completed',
  'cancelled',
  'needs_review'
));
