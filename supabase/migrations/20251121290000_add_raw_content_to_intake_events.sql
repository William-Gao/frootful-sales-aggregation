-- Add raw_content to intake_events to preserve original message
-- This is separate from normalized_text which is cleaned for LLM processing

ALTER TABLE intake_events
  ADD COLUMN IF NOT EXISTS raw_content jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN intake_events.raw_content IS 'Original raw message data (email headers, body, SMS payload, etc.)';

-- Example raw_content structure:
-- For email: {"from": "...", "to": "...", "subject": "...", "body_html": "...", "body_text": "...", "headers": {...}}
-- For SMS: {"from": "+1234567890", "to": "+0987654321", "body": "...", "media": [...]}
