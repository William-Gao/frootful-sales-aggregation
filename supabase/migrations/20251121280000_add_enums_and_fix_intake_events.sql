-- Add enums for type safety and remove email_message_id from intake_events

-- ============================================================================
-- 1. CREATE ENUMS
-- ============================================================================

-- Channel types (email, sms, whatsapp, etc.)
CREATE TYPE intake_channel AS ENUM ('email', 'sms', 'whatsapp');

-- Provider types (gmail, twilio, etc.)
CREATE TYPE intake_provider AS ENUM ('gmail', 'twilio', 'whatsapp_business');

-- Event types (what kind of event is this?)
CREATE TYPE intake_event_type AS ENUM (
  'new_order',
  'update_order',
  'cancel_order',
  'question',
  'other'
);

-- Order status enum
CREATE TYPE order_status AS ENUM (
  'pending_review',
  'ready',
  'pushed_to_erp',
  'completed',
  'cancelled'
);

-- Order event types
CREATE TYPE order_event_type AS ENUM (
  'created',
  'updated',
  'cancelled',
  'comment',
  'exported',
  'status_changed'
);

COMMENT ON TYPE intake_channel IS 'Communication channel for intake events';
COMMENT ON TYPE intake_provider IS 'Service provider for intake events';
COMMENT ON TYPE intake_event_type IS 'Classification of intake event';
COMMENT ON TYPE order_status IS 'Order status flow';
COMMENT ON TYPE order_event_type IS 'Type of event in order timeline';

-- ============================================================================
-- 2. UPDATE INTAKE_EVENTS TABLE
-- ============================================================================

-- Remove email_message_id column (too specific for agnostic table)
ALTER TABLE intake_events DROP COLUMN IF EXISTS email_message_id;

-- Update columns to use enums instead of text
ALTER TABLE intake_events
  ALTER COLUMN channel TYPE intake_channel USING channel::intake_channel,
  ALTER COLUMN provider TYPE intake_provider USING provider::intake_provider,
  ALTER COLUMN event_type TYPE intake_event_type USING event_type::intake_event_type;

-- Make event_type NOT NULL with default
ALTER TABLE intake_events
  ALTER COLUMN event_type SET DEFAULT 'new_order'::intake_event_type,
  ALTER COLUMN event_type SET NOT NULL;

-- ============================================================================
-- 3. UPDATE ORDERS TABLE
-- ============================================================================

-- Drop old CHECK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS valid_status;

-- Drop default before type change
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;

-- Update status column to use enum
ALTER TABLE orders
  ALTER COLUMN status TYPE order_status USING status::order_status;

-- Set new default
ALTER TABLE orders
  ALTER COLUMN status SET DEFAULT 'pending_review'::order_status;

-- ============================================================================
-- 4. UPDATE ORDER_EVENTS TABLE
-- ============================================================================

-- Drop old CHECK constraint
ALTER TABLE order_events DROP CONSTRAINT IF EXISTS valid_event_type;

-- Update type column to use enum
ALTER TABLE order_events
  ALTER COLUMN type TYPE order_event_type USING type::order_event_type;

-- ============================================================================
-- 5. UPDATE HELPER FUNCTION
-- ============================================================================

-- Recreate function with enum types
DROP FUNCTION IF EXISTS create_order_with_event(uuid, uuid, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION create_order_with_event(
  p_organization_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_intake_event_id uuid,
  p_order_data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Insert order
  INSERT INTO orders (
    organization_id,
    customer_id,
    customer_name,
    customer_reference,
    status,
    delivery_date,
    origin_intake_event_id,
    total_amount,
    currency
  ) VALUES (
    p_organization_id,
    p_customer_id,
    p_customer_name,
    p_order_data->>'customer_reference',
    COALESCE((p_order_data->>'status')::order_status, 'pending_review'::order_status),
    (p_order_data->>'delivery_date')::date,
    p_intake_event_id,
    (p_order_data->>'total_amount')::numeric,
    COALESCE(p_order_data->>'currency', 'USD')
  )
  RETURNING id INTO v_order_id;

  -- Create order event
  INSERT INTO order_events (
    order_id,
    intake_event_id,
    type,
    metadata
  ) VALUES (
    v_order_id,
    p_intake_event_id,
    'created'::order_event_type,
    jsonb_build_object('source', 'intake_event')
  );

  -- Update intake event with order_id
  UPDATE intake_events
  SET order_id = v_order_id,
      event_type = 'new_order'::intake_event_type
  WHERE id = p_intake_event_id;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_event(uuid, uuid, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION create_order_with_event IS 'Atomically create order, link to intake event, and record creation event (updated with enums)';
