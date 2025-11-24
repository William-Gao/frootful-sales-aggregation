-- Update create_order_with_event to accept and store created_by_user_id

CREATE OR REPLACE FUNCTION create_order_with_event(
  p_organization_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_intake_event_id uuid,
  p_order_data jsonb,
  p_created_by_user_id uuid DEFAULT NULL
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
    currency,
    created_by_user_id
  ) VALUES (
    p_organization_id,
    p_customer_id,
    p_customer_name,
    p_order_data->>'customer_reference',
    COALESCE(p_order_data->>'status', 'pending_review'),
    (p_order_data->>'delivery_date')::timestamp with time zone,
    p_intake_event_id,
    COALESCE((p_order_data->>'total_amount')::numeric, 0),
    COALESCE(p_order_data->>'currency', 'USD'),
    p_created_by_user_id
  )
  RETURNING id INTO v_order_id;

  -- Update the intake_event to link to this order
  UPDATE intake_events
  SET order_id = v_order_id
  WHERE id = p_intake_event_id;

  RETURN v_order_id;
END;
$$;
