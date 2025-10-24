/*
  # Add attachments column to email_orders table

  1. New Column
    - `attachments` (jsonb, nullable)
      - Stores array of attachment objects with metadata and content
      - Each attachment includes: filename, mimeType, size, attachmentId, content, extractedText

  2. Index
    - Add GIN index on attachments column for efficient JSON queries

  3. Update existing records
    - Set attachments to empty array for existing records
*/

-- Add attachments column to email_orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_orders' AND column_name = 'attachments'
  ) THEN
    ALTER TABLE email_orders ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add GIN index for efficient JSON queries on attachments
CREATE INDEX IF NOT EXISTS idx_email_orders_attachments 
ON email_orders USING gin (attachments);

-- Update existing records to have empty attachments array
UPDATE email_orders 
SET attachments = '[]'::jsonb 
WHERE attachments IS NULL;