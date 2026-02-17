-- Add metadata JSONB column to order_change_proposals for audit trail
-- Stores what the user actually submitted (lines, quantities, sizes)
-- so we can compare against AI-proposed values in order_change_proposal_lines
ALTER TABLE public.order_change_proposals
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.order_change_proposals.metadata IS 'Audit trail: stores the lines/values the user actually submitted when accepting a proposal, for comparison against AI-proposed values in order_change_proposal_lines';

-- Add type enum column (replaces tags.intent)
DO $$ BEGIN
  CREATE TYPE public.proposal_type AS ENUM ('new_order', 'change_order', 'cancel_order');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.order_change_proposals
ADD COLUMN IF NOT EXISTS type public.proposal_type;

-- Backfill type from existing tags.intent
UPDATE public.order_change_proposals
SET type = (tags->>'intent')::public.proposal_type
WHERE type IS NULL
  AND tags->>'intent' IS NOT NULL
  AND tags->>'intent' IN ('new_order', 'change_order', 'cancel_order');
