-- Make organization_id nullable in intake_events table
-- This allows intake events to be created without knowing the organization upfront
-- The organization will be determined during processing

ALTER TABLE intake_events
ALTER COLUMN organization_id DROP NOT NULL;

-- Add comment explaining why it's nullable
COMMENT ON COLUMN intake_events.organization_id IS
  'Organization ID - nullable to allow intake from unknown sources. Determined during processing.';
