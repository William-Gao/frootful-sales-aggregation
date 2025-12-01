-- Add Twilio phone number to organizations table
-- This allows mapping SMS messages to the correct organization

ALTER TABLE organizations
ADD COLUMN twilio_phone_number text;

-- Add comment
COMMENT ON COLUMN organizations.twilio_phone_number IS
  'The Twilio phone number assigned to this organization (in E.164 format, e.g., +18005551234)';

-- Add unique constraint to prevent duplicate phone numbers
CREATE UNIQUE INDEX organizations_twilio_phone_number_key
ON organizations(twilio_phone_number)
WHERE twilio_phone_number IS NOT NULL;
