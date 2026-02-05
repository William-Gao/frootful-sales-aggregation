-- Update ai_analysis_logs check constraint to use 'sms' instead of 'text_message'
-- This matches the channel values used in intake_events

-- Drop the old constraint
ALTER TABLE ai_analysis_logs DROP CONSTRAINT IF EXISTS ai_analysis_logs_analysis_type_check;

-- Add the updated constraint with 'sms' instead of 'text_message'
ALTER TABLE ai_analysis_logs ADD CONSTRAINT ai_analysis_logs_analysis_type_check
  CHECK (analysis_type IN ('email', 'sms'));

-- Update any existing 'text_message' values to 'sms'
UPDATE ai_analysis_logs SET analysis_type = 'sms' WHERE analysis_type = 'text_message';
