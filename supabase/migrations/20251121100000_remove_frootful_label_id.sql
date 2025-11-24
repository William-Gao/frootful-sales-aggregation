-- Remove frootful_label_id column from gmail_watch_state
-- We're no longer using Frootful labels for filtering
ALTER TABLE gmail_watch_state DROP COLUMN IF EXISTS frootful_label_id;
