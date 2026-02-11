-- Create a trigger to call the sync-google-sheet Edge Function
-- This trigger fires when an order_change_proposal is ACCEPTED
-- It calls the Edge Function only if the proposal is tagged as 'recurring'

-- Enable pg_net extension if not enabled
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 1. Create the function that calls the Edge Function
CREATE OR REPLACE FUNCTION trigger_sync_google_sheet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload jsonb;
  v_url text := 'https://kdwpnmoayphvhxuqocbw.supabase.co/functions/v1/sync-google-sheet';
  v_request_id int;
  v_order_frequency text;
BEGIN
  -- Only fire on UPDATE when status changes to 'accepted'
  IF (TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status != 'accepted') THEN

    -- Check order_frequency in tags
    v_order_frequency := NEW.tags->>'order_frequency';

    IF (v_order_frequency = 'recurring') THEN
      -- Construct payload
      v_payload := jsonb_build_object(
        'proposal_id', NEW.id,
        'order_id', NEW.order_id
      );

      -- Make HTTP request via pg_net
      SELECT net.http_post(
        url := v_url,
        body := v_payload,
        headers := '{"Content-Type": "application/json"}'::jsonb
      ) INTO v_request_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create the Trigger on order_change_proposals
DROP TRIGGER IF EXISTS on_proposal_accepted_sync_sheet ON order_change_proposals;

CREATE TRIGGER on_proposal_accepted_sync_sheet
  AFTER UPDATE
  ON order_change_proposals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_google_sheet();
