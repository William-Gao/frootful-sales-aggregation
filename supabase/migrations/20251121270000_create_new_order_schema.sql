-- Create new order schema (clean, normalized approach)
-- This migration creates: orders, order_lines, intake_events, order_events
-- Replaces: email_orders, text_orders (which will be deprecated)

-- ============================================================================
-- 1. ORDERS TABLE (canonical order header)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Customer information
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,              -- Denormalized for display
  customer_reference text,         -- PO#, store ref, etc.

  -- Order details
  status text NOT NULL DEFAULT 'pending_review',
  -- Status flow: pending_review → ready → pushed_to_erp → completed → cancelled

  requested_ship_date date,
  delivery_date date,

  total_amount numeric,
  currency text NOT NULL DEFAULT 'USD',

  -- Link to originating intake event
  origin_intake_event_id uuid,  -- FK added after intake_events table created

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Indexes
  CONSTRAINT valid_status CHECK (status IN (
    'pending_review',
    'ready',
    'pushed_to_erp',
    'completed',
    'cancelled'
  ))
);

-- Indexes for orders
CREATE INDEX idx_orders_organization_id ON orders(organization_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders
CREATE POLICY "Users can read orders from their organization"
  ON orders FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create orders in their organization"
  ON orders FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update orders in their organization"
  ON orders FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage all orders"
  ON orders FOR ALL
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

COMMENT ON TABLE orders IS 'Canonical order headers - single source of truth for all orders';
COMMENT ON COLUMN orders.customer_name IS 'Denormalized snapshot of customer name at order creation';
COMMENT ON COLUMN orders.customer_reference IS 'Customer PO number, store reference, or other identifier';

-- ============================================================================
-- 2. ORDER_LINES TABLE (normalized order lines with AI metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_number integer NOT NULL,

  -- Link to items catalog
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,

  -- Denormalized snapshot (preserved even if item deleted)
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  uom text,                        -- 'case', 'pallet', 'each', etc.
  unit_price numeric,
  currency text DEFAULT 'USD',

  -- Original text from email/message
  raw_text text,

  -- AI metadata: confidence, alternatives, user feedback
  meta jsonb DEFAULT '{}'::jsonb,
  -- Example meta structure:
  -- {
  --   "confidence": 0.95,
  --   "alternatives": [{"item_id": "...", "confidence": 0.75}],
  --   "user_corrected": false,
  --   "ai_reasoning": "Matched based on SKU and description similarity"
  -- }

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(order_id, line_number)
);

-- Indexes for order_lines
CREATE INDEX idx_order_lines_order_id ON order_lines(order_id);
CREATE INDEX idx_order_lines_item_id ON order_lines(item_id) WHERE item_id IS NOT NULL;

-- Enable RLS
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_lines (inherit from orders)
CREATE POLICY "Users can read order lines from their organization"
  ON order_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_lines.order_id
      AND orders.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create order lines in their organization"
  ON order_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_lines.order_id
      AND orders.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update order lines in their organization"
  ON order_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_lines.order_id
      AND orders.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can manage all order lines"
  ON order_lines FOR ALL
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_order_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_lines_updated_at
  BEFORE UPDATE ON order_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_order_lines_updated_at();

COMMENT ON TABLE order_lines IS 'Individual line items for orders with AI matching metadata';
COMMENT ON COLUMN order_lines.raw_text IS 'Original text from email (e.g., "3 pallets Sand Pear 28/32")';
COMMENT ON COLUMN order_lines.meta IS 'AI metadata: confidence scores, alternatives, user corrections';

-- ============================================================================
-- 3. INTAKE_EVENTS TABLE (unified message intake)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Channel information
  channel text NOT NULL,           -- 'email', 'sms', 'whatsapp', etc.
  provider text NOT NULL,          -- 'gmail', 'twilio', etc.
  provider_message_id text NOT NULL,

  -- Classification
  event_type text,                 -- 'new_order', 'update_order', 'cancel_order', 'question'
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,  -- Linked after parsing

  -- Content
  normalized_text text,            -- Clean text fed to LLM

  -- Optional reference to channel-specific table
  email_message_id uuid,           -- FK to email_messages (if email)

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(provider, provider_message_id)
);

-- Indexes for intake_events
CREATE INDEX idx_intake_events_organization_id ON intake_events(organization_id);
CREATE INDEX idx_intake_events_order_id ON intake_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_intake_events_created_at ON intake_events(created_at DESC);
CREATE INDEX idx_intake_events_provider_msg ON intake_events(provider, provider_message_id);

-- Enable RLS
ALTER TABLE intake_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for intake_events
CREATE POLICY "Users can read intake events from their organization"
  ON intake_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage all intake events"
  ON intake_events FOR ALL
  USING (true);

COMMENT ON TABLE intake_events IS 'Unified intake for all incoming messages (email, SMS, etc.)';
COMMENT ON COLUMN intake_events.normalized_text IS 'Cleaned text suitable for LLM processing';

-- ============================================================================
-- 4. ORDER_EVENTS TABLE (order timeline/audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  intake_event_id uuid REFERENCES intake_events(id) ON DELETE SET NULL,

  type text NOT NULL,              -- 'created', 'updated', 'cancelled', 'comment', 'exported'
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Example metadata:
  -- {"changes": {"status": {"old": "pending", "new": "ready"}}}
  -- {"exported_to": "business_central", "erp_order_id": "SO-12345"}

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_event_type CHECK (type IN (
    'created',
    'updated',
    'cancelled',
    'comment',
    'exported',
    'status_changed'
  ))
);

-- Indexes for order_events
CREATE INDEX idx_order_events_order_id ON order_events(order_id);
CREATE INDEX idx_order_events_created_at ON order_events(created_at DESC);

-- Enable RLS
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_events (inherit from orders)
CREATE POLICY "Users can read order events from their organization"
  ON order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_events.order_id
      AND orders.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can manage all order events"
  ON order_events FOR ALL
  USING (true);

COMMENT ON TABLE order_events IS 'Timeline/audit trail of all events affecting an order';
COMMENT ON COLUMN order_events.metadata IS 'Event-specific data (changes, exports, etc.)';

-- ============================================================================
-- 5. ADD FOREIGN KEYS (now that all tables exist)
-- ============================================================================
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_origin_intake_event
  FOREIGN KEY (origin_intake_event_id)
  REFERENCES intake_events(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 6. HELPER FUNCTION: Create order with event
-- ============================================================================
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
    COALESCE(p_order_data->>'status', 'pending_review'),
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
    'created',
    jsonb_build_object('source', 'intake_event')
  );

  -- Update intake event with order_id
  UPDATE intake_events
  SET order_id = v_order_id,
      event_type = 'new_order'
  WHERE id = p_intake_event_id;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_event(uuid, uuid, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION create_order_with_event IS 'Atomically create order, link to intake event, and record creation event';
