-- ============================================================================
-- INTAKE FILES TABLE & STORAGE BUCKET
-- ============================================================================
-- Stores files associated with intake events (email attachments, etc.)
-- Binary files stored in Supabase Storage, metadata in this table

-- ============================================================================
-- 1. CREATE INTAKE_FILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  intake_event_id uuid NOT NULL REFERENCES intake_events(id) ON DELETE CASCADE,

  -- File metadata
  filename text NOT NULL,
  extension text,
  mime_type text,
  size_bytes integer,

  -- Source tracking
  source text NOT NULL,  -- 'email', 'sms', 'upload', etc.
  source_metadata jsonb DEFAULT '{}'::jsonb,  -- e.g., {"gmail_attachment_id": "...", "gmail_message_id": "..."}

  -- Storage reference
  storage_path text NOT NULL,  -- Path in Supabase Storage bucket: {org_id}/{intake_event_id}/{file_id}.{ext}

  -- Processed content (generic jsonb for any processor)
  processed_content jsonb DEFAULT '{}'::jsonb,
  -- Example: {"llm_whisperer": {"text": "...", "whisper_hash": "...", "processed_at": "..."}}

  -- Status
  processing_status text DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
CREATE INDEX idx_intake_files_organization_id ON intake_files(organization_id);
CREATE INDEX idx_intake_files_intake_event_id ON intake_files(intake_event_id);
CREATE INDEX idx_intake_files_processing_status ON intake_files(processing_status);
CREATE INDEX idx_intake_files_created_at ON intake_files(created_at DESC);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE intake_files ENABLE ROW LEVEL SECURITY;

-- Users can read files from their organizations
CREATE POLICY "Users can read files from their organizations"
  ON intake_files FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Service role can manage all files
CREATE POLICY "Service role can manage all files"
  ON intake_files FOR ALL
  USING (true);

-- ============================================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_intake_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intake_files_updated_at
  BEFORE UPDATE ON intake_files
  FOR EACH ROW
  EXECUTE FUNCTION update_intake_files_updated_at();

-- ============================================================================
-- 5. STORAGE BUCKET
-- ============================================================================
-- Create the intake-files storage bucket (private by default)
INSERT INTO storage.buckets (id, name, public)
VALUES ('intake-files', 'intake-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can read files from their organizations
CREATE POLICY "Users can read org files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'intake-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Storage RLS: Service role can manage all files
CREATE POLICY "Service role can manage all storage files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'intake-files');

-- ============================================================================
-- 6. DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE intake_files IS 'Files associated with intake events (email attachments, etc.)';
COMMENT ON COLUMN intake_files.source IS 'Origin of the file: email, sms, upload, etc.';
COMMENT ON COLUMN intake_files.source_metadata IS 'Source-specific metadata (e.g., gmail_attachment_id)';
COMMENT ON COLUMN intake_files.storage_path IS 'Path in Supabase Storage: {org_id}/{intake_event_id}/{file_id}.{ext}';
COMMENT ON COLUMN intake_files.processed_content IS 'Results from file processors (e.g., llm_whisperer text extraction)';
COMMENT ON COLUMN intake_files.processing_status IS 'Status of file processing: pending, processing, completed, failed';
