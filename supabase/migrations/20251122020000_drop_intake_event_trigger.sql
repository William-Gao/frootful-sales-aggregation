-- Drop any existing trigger on intake_events table
-- This cleans up any auto-created triggers so we can set up webhook manually

DROP TRIGGER IF EXISTS on_intake_event_created ON intake_events;
DROP FUNCTION IF EXISTS trigger_process_intake_event();

-- Add comment
COMMENT ON TABLE intake_events IS
  'Intake events from various channels (email, sms). Database webhook will be configured manually in Supabase dashboard.';
