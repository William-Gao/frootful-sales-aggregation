-- Remove email_processing_queue table and related trigger
-- We're using database webhooks instead, so we don't need a queue

-- Drop the trigger first
DROP TRIGGER IF EXISTS on_email_insert_auto_queue ON emails;

-- Drop the trigger function
DROP FUNCTION IF EXISTS queue_new_email_for_processing();

-- Drop the queue table
DROP TABLE IF EXISTS email_processing_queue;
