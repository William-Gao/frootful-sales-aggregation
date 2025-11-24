-- Remove Twilio phone number from organizations table
-- Not needed since users will forward messages directly

-- Drop the unique index first
DROP INDEX IF EXISTS organizations_twilio_phone_number_key;

-- Drop the column
ALTER TABLE organizations
DROP COLUMN IF EXISTS twilio_phone_number;
