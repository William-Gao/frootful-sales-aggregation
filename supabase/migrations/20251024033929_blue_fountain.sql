/*
  # Add LLM Whisperer Data Storage

  1. Schema Changes
    - Add `llm_whisperer_data` column to `email_orders` table
    - Store raw LLM Whisperer parsing results for each attachment
    - Enable debugging and reprocessing capabilities

  2. Data Structure
    - JSONB column to store structured LLM Whisperer results
    - Includes whisper_hash, extracted text, processing metadata
    - Organized by attachment filename for easy lookup

  3. Benefits
    - Complete audit trail of document processing
    - Enable reprocessing without re-calling LLM Whisperer
    - Debugging and quality improvement capabilities
*/

-- Add LLM Whisperer data column to email_orders table
ALTER TABLE email_orders 
ADD COLUMN IF NOT EXISTS llm_whisperer_data JSONB DEFAULT NULL;

-- Add index for efficient querying of LLM Whisperer data
CREATE INDEX IF NOT EXISTS idx_email_orders_llm_whisperer_data 
ON email_orders USING GIN (llm_whisperer_data);

-- Add comment to document the column purpose
COMMENT ON COLUMN email_orders.llm_whisperer_data IS 'Raw LLM Whisperer parsing results for email attachments, stored as JSONB for debugging and reprocessing';