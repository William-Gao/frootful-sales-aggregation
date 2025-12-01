-- ============================================================================
-- AI PREDICTIONS TRACKING
-- ============================================================================
-- This migration creates infrastructure for tracking AI prediction accuracy
-- to enable ML model training and improvement.
--
-- Key features:
-- 1. Separate table for AI predictions (clean separation from operational data)
-- 2. Track customer matching accuracy
-- 3. Track line item accuracy (SKU and quantity separately)
-- 4. Model versioning support
-- 5. First review tracking on orders table
-- ============================================================================

-- ============================================================================
-- 1. ADD USER_REVIEWED TRACKING TO ORDERS TABLE
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_orders_user_reviewed ON orders(user_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_orders_reviewed_by ON orders(reviewed_by);

COMMENT ON COLUMN orders.user_reviewed_at IS 'Timestamp when user first reviewed/edited AI-generated order (critical for training data collection)';
COMMENT ON COLUMN orders.reviewed_by IS 'User who first reviewed the order';

-- ============================================================================
-- 2. ADD USER_REVIEWED EVENT TYPE
-- ============================================================================

ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'user_reviewed';

COMMENT ON TYPE order_event_type IS 'Types of events: created, updated, user_edit, user_reviewed, exported, cancelled, etc.';

-- ============================================================================
-- 3. CREATE AI_PREDICTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_line_id uuid REFERENCES order_lines(id) ON DELETE CASCADE,

  -- Type of prediction
  prediction_type text NOT NULL CHECK (prediction_type IN ('customer', 'line_item')),

  -- =========================================================================
  -- CUSTOMER PREDICTIONS
  -- =========================================================================
  predicted_customer_id text,
  predicted_customer_number text,
  predicted_customer_name text,
  actual_customer_id text,
  actual_customer_number text,
  actual_customer_name text,
  customer_is_accurate boolean,

  -- =========================================================================
  -- LINE ITEM PREDICTIONS
  -- =========================================================================
  predicted_sku text,
  predicted_product_name text,
  predicted_quantity numeric(10, 2),
  actual_sku text,
  actual_product_name text,
  actual_quantity numeric(10, 2),

  -- Accuracy tracking (granular)
  sku_is_accurate boolean,
  quantity_is_accurate boolean,
  line_item_is_accurate boolean GENERATED ALWAYS AS (
    CASE
      WHEN prediction_type = 'line_item'
      THEN (sku_is_accurate = true AND quantity_is_accurate = true)
      ELSE null
    END
  ) STORED,

  -- =========================================================================
  -- ERROR CATEGORIZATION
  -- =========================================================================
  error_type text CHECK (
    error_type IN ('accurate', 'sku_wrong', 'quantity_wrong', 'both_wrong', 'customer_wrong')
  ),

  -- =========================================================================
  -- MODEL METADATA
  -- =========================================================================
  confidence_score numeric(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  model_version text,
  model_provider text, -- 'openai', 'anthropic', etc.

  -- =========================================================================
  -- TIMING & ATTRIBUTION
  -- =========================================================================
  predicted_at timestamptz DEFAULT now(),
  user_reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- =========================================================================
  -- CONSTRAINTS
  -- =========================================================================
  -- Customer predictions must have customer fields
  CONSTRAINT customer_prediction_has_customer_data CHECK (
    prediction_type != 'customer' OR (
      predicted_customer_name IS NOT NULL AND
      actual_customer_name IS NOT NULL
    )
  ),

  -- Line item predictions must have line fields and reference order_line
  CONSTRAINT line_item_prediction_has_line_data CHECK (
    prediction_type != 'line_item' OR (
      order_line_id IS NOT NULL AND
      predicted_sku IS NOT NULL AND
      predicted_quantity IS NOT NULL AND
      actual_sku IS NOT NULL AND
      actual_quantity IS NOT NULL
    )
  )
);

-- ============================================================================
-- 4. INDEXES FOR ANALYTICS QUERIES
-- ============================================================================

-- General indexes
CREATE INDEX idx_ai_predictions_order ON ai_predictions(order_id);
CREATE INDEX idx_ai_predictions_order_line ON ai_predictions(order_line_id);
CREATE INDEX idx_ai_predictions_type ON ai_predictions(prediction_type);
CREATE INDEX idx_ai_predictions_model_version ON ai_predictions(model_version);

-- Accuracy indexes (filtered for performance)
CREATE INDEX idx_ai_predictions_line_accuracy
  ON ai_predictions(line_item_is_accurate)
  WHERE prediction_type = 'line_item';

CREATE INDEX idx_ai_predictions_customer_accuracy
  ON ai_predictions(customer_is_accurate)
  WHERE prediction_type = 'customer';

CREATE INDEX idx_ai_predictions_error_type
  ON ai_predictions(error_type);

-- Review tracking indexes
CREATE INDEX idx_ai_predictions_reviewed
  ON ai_predictions(user_reviewed_at)
  WHERE user_reviewed_at IS NOT NULL;

CREATE INDEX idx_ai_predictions_reviewed_by
  ON ai_predictions(reviewed_by);

-- Composite index for common analytics queries
CREATE INDEX idx_ai_predictions_analytics
  ON ai_predictions(prediction_type, user_reviewed_at, error_type)
  WHERE user_reviewed_at IS NOT NULL;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE ai_predictions ENABLE ROW LEVEL SECURITY;

-- Users can view predictions for orders in their organization
CREATE POLICY "Users can view predictions for their org's orders"
  ON ai_predictions FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id IN (
        SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
      )
    )
  );

-- Service role can do anything (for edge functions)
CREATE POLICY "Service role has full access"
  ON ai_predictions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 6. HELPER FUNCTION FOR CALCULATING ACCURACY METRICS
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_order_accuracy_metrics(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_line_items', COUNT(*) FILTER (WHERE prediction_type = 'line_item'),
    'accurate_line_items', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND line_item_is_accurate = true),
    'inaccurate_line_items', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND line_item_is_accurate = false),
    'accuracy_pct', ROUND(
      100.0 * COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND line_item_is_accurate = true) /
      NULLIF(COUNT(*) FILTER (WHERE prediction_type = 'line_item'), 0),
      2
    ),
    'sku_errors', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND sku_is_accurate = false),
    'quantity_errors', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND quantity_is_accurate = false),
    'sku_only_errors', COUNT(*) FILTER (WHERE error_type = 'sku_wrong'),
    'quantity_only_errors', COUNT(*) FILTER (WHERE error_type = 'quantity_wrong'),
    'both_wrong_errors', COUNT(*) FILTER (WHERE error_type = 'both_wrong'),
    'customer_accurate', BOOL_OR(customer_is_accurate) FILTER (WHERE prediction_type = 'customer'),
    'has_been_reviewed', BOOL_OR(user_reviewed_at IS NOT NULL)
  )
  INTO v_metrics
  FROM ai_predictions
  WHERE order_id = p_order_id;

  RETURN COALESCE(v_metrics, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_order_accuracy_metrics(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION calculate_order_accuracy_metrics IS 'Calculate accuracy metrics for a specific order (used for analytics and order_events metadata)';

-- ============================================================================
-- 7. TRIGGER TO AUTO-UPDATE TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ai_predictions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_predictions_updated_at
  BEFORE UPDATE ON ai_predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_predictions_updated_at();

-- ============================================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ai_predictions IS 'Tracks AI predictions and user corrections for ML training feedback. Separate from operational data for clean analytics.';
COMMENT ON COLUMN ai_predictions.prediction_type IS 'Type of prediction: customer (customer matching) or line_item (SKU and quantity)';
COMMENT ON COLUMN ai_predictions.line_item_is_accurate IS 'Computed column: true only if BOTH SKU and quantity are accurate';
COMMENT ON COLUMN ai_predictions.error_type IS 'Categorization: accurate, sku_wrong, quantity_wrong, both_wrong, customer_wrong';
COMMENT ON COLUMN ai_predictions.confidence_score IS 'AI model confidence (0.0 to 1.0)';
COMMENT ON COLUMN ai_predictions.model_version IS 'AI model version (e.g., gpt-4o-2024-08-06) for tracking improvements';

-- ============================================================================
-- 9. EXAMPLE ANALYTICS QUERIES (COMMENTED OUT)
-- ============================================================================

-- Overall line item accuracy:
-- SELECT
--   COUNT(*) as total_predictions,
--   SUM(CASE WHEN line_item_is_accurate THEN 1 ELSE 0 END) as accurate,
--   ROUND(100.0 * SUM(CASE WHEN line_item_is_accurate THEN 1 ELSE 0 END) / COUNT(*), 2) as accuracy_pct
-- FROM ai_predictions
-- WHERE prediction_type = 'line_item' AND user_reviewed_at IS NOT NULL;

-- Error breakdown:
-- SELECT
--   error_type,
--   COUNT(*) as count,
--   ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
-- FROM ai_predictions
-- WHERE prediction_type = 'line_item' AND user_reviewed_at IS NOT NULL
-- GROUP BY error_type
-- ORDER BY count DESC;

-- Customer matching accuracy:
-- SELECT
--   COUNT(*) as total_orders,
--   SUM(CASE WHEN customer_is_accurate THEN 1 ELSE 0 END) as correct_customers,
--   ROUND(100.0 * SUM(CASE WHEN customer_is_accurate THEN 1 ELSE 0 END) / COUNT(*), 2) as accuracy_pct
-- FROM ai_predictions
-- WHERE prediction_type = 'customer' AND user_reviewed_at IS NOT NULL;

-- Training data export (corrections only):
-- SELECT
--   p.*,
--   ol.raw_text as original_line_text,
--   o.customer_name,
--   o.created_at as order_created_at
-- FROM ai_predictions p
-- JOIN order_lines ol ON p.order_line_id = ol.id
-- JOIN orders o ON p.order_id = o.id
-- WHERE p.user_reviewed_at IS NOT NULL
-- AND p.line_item_is_accurate = false
-- ORDER BY p.user_reviewed_at DESC;
