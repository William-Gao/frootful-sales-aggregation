-- Create emails table to store raw emails from Gmail
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  gmail_history_id text,

  -- Email metadata
  from_email text,
  to_email text,
  subject text,
  date timestamptz,

  -- Raw content
  headers jsonb,
  plain_text text,
  html_body text,

  -- Attachments metadata (not content yet)
  attachments jsonb DEFAULT '[]'::jsonb,

  -- Processing status
  processed boolean DEFAULT false,
  processing_started_at timestamptz,
  processed_at timestamptz,
  processing_error text,

  -- Timestamps
  received_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure we don't store duplicate emails
  UNIQUE(user_id, gmail_message_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_gmail_message_id ON emails(gmail_message_id);
CREATE INDEX idx_emails_gmail_thread_id ON emails(gmail_thread_id);
CREATE INDEX idx_emails_processed ON emails(processed) WHERE processed = false;
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);

-- Enable RLS
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own emails"
  ON emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all emails"
  ON emails FOR ALL
  USING (true);

-- Create processing queue table
CREATE TABLE IF NOT EXISTS email_processing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority integer DEFAULT 0,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,

  -- Ensure one queue entry per email
  UNIQUE(email_id)
);

-- Index for queue processing
CREATE INDEX idx_email_queue_pending ON email_processing_queue(status, priority DESC, created_at)
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE email_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy - only service role needs access
CREATE POLICY "Service role can manage queue"
  ON email_processing_queue FOR ALL
  USING (true);

-- Trigger function to automatically queue new emails
CREATE OR REPLACE FUNCTION queue_new_email_for_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Add to processing queue
  INSERT INTO email_processing_queue (email_id, priority)
  VALUES (NEW.id, 0)
  ON CONFLICT (email_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER on_email_insert_auto_queue
  AFTER INSERT ON emails
  FOR EACH ROW
  EXECUTE FUNCTION queue_new_email_for_processing();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER emails_updated_at
  BEFORE UPDATE ON emails
  FOR EACH ROW
  EXECUTE FUNCTION update_emails_updated_at();

-- Add comments for documentation
COMMENT ON TABLE emails IS 'Raw emails fetched from Gmail via Pub/Sub notifications';
COMMENT ON TABLE email_processing_queue IS 'Queue for processing emails (parsing, analysis, etc.)';
COMMENT ON COLUMN emails.gmail_message_id IS 'Gmail unique message ID';
COMMENT ON COLUMN emails.attachments IS 'Array of attachment metadata: [{filename, mimeType, size, attachmentId}]';
COMMENT ON COLUMN emails.processed IS 'Whether email has been fully processed';
