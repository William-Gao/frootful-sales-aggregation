-- Make organization_id nullable on intake_events
-- This allows intake events to exist without an assigned organization
-- (e.g., from unknown senders that haven't been matched yet)

ALTER TABLE intake_events
ALTER COLUMN organization_id DROP NOT NULL;

COMMENT ON COLUMN intake_events.organization_id IS 'Organization this event belongs to. NULL for unassigned/unmatched events.';
