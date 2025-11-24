-- Add support for email forwarding and bulk .eml processing

-- Add new columns to email_orders table
ALTER TABLE email_orders
ADD COLUMN IF NOT EXISTS content_hash text,
ADD COLUMN IF NOT EXISTS original_message_id text,
ADD COLUMN IF NOT EXISTS is_bulk_forward boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_forwarded boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS forwarded_by text,
ADD COLUMN IF NOT EXISTS parent_forward_email_id text,
ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'direct'
  CHECK (order_source IN ('direct', 'single_forward', 'bulk_eml_forward', 'manual')),
ADD COLUMN IF NOT EXISTS forwarding_history jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS processing_metadata jsonb,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

-- Create unique index for content hash deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_orders_content_hash
  ON email_orders(content_hash)
  WHERE content_hash IS NOT NULL;

-- Add index for original_message_id lookups
CREATE INDEX IF NOT EXISTS idx_email_orders_original_message_id
  ON email_orders(original_message_id);

-- Add index for parent forward relationship
CREATE INDEX IF NOT EXISTS idx_email_orders_parent_forward
  ON email_orders(parent_forward_email_id);

-- Add index for order source filtering
CREATE INDEX IF NOT EXISTS idx_email_orders_source
  ON email_orders(order_source);

-- Add index for forwarded orders
CREATE INDEX IF NOT EXISTS idx_email_orders_forwarded
  ON email_orders(is_forwarded)
  WHERE is_forwarded = true;

-- Add comment explaining content_hash usage
COMMENT ON COLUMN email_orders.content_hash IS
  'SHA-256 hash of from_email + subject + date for deduplication of forwarded emails';

COMMENT ON COLUMN email_orders.original_message_id IS
  'Original Message-ID header from email for RFC-compliant deduplication';

COMMENT ON COLUMN email_orders.order_source IS
  'Indicates how order was received: direct (to orders@frootful), single_forward (Fwd: email), bulk_eml_forward (.eml attachment batch)';

COMMENT ON COLUMN email_orders.forwarding_history IS
  'Array of forwarding events: [{forwarded_at, forwarded_by, email_id}]';
