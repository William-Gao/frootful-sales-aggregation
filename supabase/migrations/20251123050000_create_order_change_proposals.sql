-- Create order change proposals tables
-- Allows tracking AI-proposed changes to existing orders

-- ============================================================================
-- 1. Add soft delete to order_lines
-- ============================================================================
ALTER TABLE order_lines
ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted'));

CREATE INDEX idx_order_lines_status ON order_lines(order_id, status);

COMMENT ON COLUMN order_lines.status IS 'Soft delete: active or deleted';

-- ============================================================================
-- 2. Create order_change_proposals table
-- ============================================================================
CREATE TABLE order_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  intake_event_id UUID REFERENCES intake_events(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),

  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_change_proposals_order ON order_change_proposals(order_id);
CREATE INDEX idx_change_proposals_status ON order_change_proposals(status);
CREATE INDEX idx_change_proposals_org ON order_change_proposals(organization_id);

COMMENT ON TABLE order_change_proposals IS 'AI-proposed changes to existing orders';
COMMENT ON COLUMN order_change_proposals.status IS 'Workflow: pending → accepted/rejected';

-- ============================================================================
-- 3. Create order_change_proposal_lines table
-- ============================================================================
CREATE TABLE order_change_proposal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES order_change_proposals(id) ON DELETE CASCADE,

  order_line_id UUID REFERENCES order_lines(id) ON DELETE SET NULL, -- NULL for 'add', populated for 'modify'/'remove'
  line_number INTEGER,                                               -- For additions, what line number to insert at

  change_type TEXT NOT NULL CHECK (change_type IN ('add', 'remove', 'modify')),

  -- Item info
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,

  -- Proposed values (NULL for 'remove')
  -- For 'add' and 'modify': contains the new/proposed values
  -- Example: { "quantity": 75, "unit_price": 2.50, "uom": "boxes" }
  -- FE will compare with current order_lines to show diff
  proposed_values JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_lines_proposal ON order_change_proposal_lines(proposal_id);
CREATE INDEX idx_proposal_lines_order_line ON order_change_proposal_lines(order_line_id);

COMMENT ON TABLE order_change_proposal_lines IS 'Individual line changes (add/remove/modify)';
COMMENT ON COLUMN order_change_proposal_lines.proposed_values IS 'AI-proposed values for this line (NULL for remove)';

-- ============================================================================
-- 4. Enable RLS
-- ============================================================================
ALTER TABLE order_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_change_proposal_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS Policies for order_change_proposals
-- ============================================================================
CREATE POLICY "Users can read proposals from their organization"
  ON order_change_proposals FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update proposals in their organization"
  ON order_change_proposals FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage all proposals"
  ON order_change_proposals FOR ALL
  USING (true);

-- ============================================================================
-- 6. RLS Policies for order_change_proposal_lines
-- ============================================================================
CREATE POLICY "Users can read proposal lines from their organization"
  ON order_change_proposal_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM order_change_proposals
      WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
      AND order_change_proposals.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update proposal lines in their organization"
  ON order_change_proposal_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM order_change_proposals
      WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
      AND order_change_proposals.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can manage all proposal lines"
  ON order_change_proposal_lines FOR ALL
  USING (true);
