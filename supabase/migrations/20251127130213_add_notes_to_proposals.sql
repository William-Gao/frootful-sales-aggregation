-- Add notes column to track context about proposal actions
ALTER TABLE order_change_proposals
ADD COLUMN notes TEXT;

COMMENT ON COLUMN order_change_proposals.notes IS 'Notes about the proposal (e.g., rejection reason, re-analysis context)';
