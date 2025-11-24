-- Remove event_type from intake_events
-- Reasoning: At intake time, we don't know what type of event this is yet.
-- We need to analyze the content first. Just capture raw data at this stage.

ALTER TABLE intake_events DROP COLUMN IF EXISTS event_type;

-- Update create_order_with_event function to not reference event_type
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

  -- NOTE: We no longer update intake_event with order_id or event_type
  -- intake_event is just raw data capture - analysis happens separately

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_event(uuid, uuid, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION create_order_with_event IS 'Atomically create order and link to intake event (intake_event remains unchanged as raw data)';
