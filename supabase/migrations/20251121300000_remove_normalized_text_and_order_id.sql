-- Remove normalized_text and order_id from intake_events
-- Reasoning:
--   1. normalized_text is redundant - we can extract from raw_content when needed
--   2. order_id assumes 1:1 relationship, but one intake_event can spawn multiple orders
--      (e.g., bulk email forward with multiple orders)
--   The correct relationship is: orders.origin_intake_event_id → intake_events.id

-- Remove normalized_text column
ALTER TABLE intake_events DROP COLUMN IF EXISTS normalized_text;

-- Remove order_id column
ALTER TABLE intake_events DROP COLUMN IF EXISTS order_id;

-- Remove event_type column (we'll rely on analyzing raw_content, not pre-classifying)
-- Actually, keep event_type for now - it's useful for filtering
-- ALTER TABLE intake_events DROP COLUMN IF EXISTS event_type;

-- Update helper function to not set order_id on intake_event
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

  -- NOTE: We no longer update intake_event with order_id
  -- because one intake_event can spawn multiple orders

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_event(uuid, uuid, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION create_order_with_event IS 'Atomically create order and link to intake event (updated: no longer sets order_id on intake_event)';

-- Add comment explaining the relationship
COMMENT ON COLUMN orders.origin_intake_event_id IS 'The intake event that created this order (one intake event can create multiple orders)';
