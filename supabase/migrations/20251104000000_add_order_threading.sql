-- Add threading and parent order relationship fields to email_orders
ALTER TABLE email_orders
  ADD COLUMN parent_order_id uuid REFERENCES email_orders(id),
  ADD COLUMN message_id text;

-- Update status check constraint to include 'needs_review'
ALTER TABLE email_orders DROP CONSTRAINT IF EXISTS email_orders_status_check;
ALTER TABLE email_orders ADD CONSTRAINT email_orders_status_check
CHECK (status IN ('received', 'processing', 'analyzed', 'exported', 'failed', 'pending', 'completed', 'cancelled', 'needs_review'));

-- Add indexes for efficient thread and parent lookups
CREATE INDEX idx_email_orders_thread_id ON email_orders(thread_id);
CREATE INDEX idx_email_orders_parent_order_id ON email_orders(parent_order_id);
CREATE INDEX idx_email_orders_message_id ON email_orders(message_id);
