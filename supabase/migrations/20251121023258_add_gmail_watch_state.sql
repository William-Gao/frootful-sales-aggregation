-- Create table to track Gmail watch state and history ID per user
CREATE TABLE IF NOT EXISTS gmail_watch_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_history_id text NOT NULL,
  frootful_label_id text,
  watch_expiration timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Add RLS policies
ALTER TABLE gmail_watch_state ENABLE ROW LEVEL SECURITY;

-- Users can read their own watch state
CREATE POLICY "Users can read own watch state"
  ON gmail_watch_state
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all watch states (for Edge Functions)
CREATE POLICY "Service role can manage watch states"
  ON gmail_watch_state
  FOR ALL
  USING (true);

-- Add index for performance
CREATE INDEX IF NOT EXISTS gmail_watch_state_user_id_idx ON gmail_watch_state(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_gmail_watch_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gmail_watch_state_updated_at
  BEFORE UPDATE ON gmail_watch_state
  FOR EACH ROW
  EXECUTE FUNCTION update_gmail_watch_state_updated_at();
