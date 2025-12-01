-- Create enum for source_channel
-- Current values used: email, sms
-- Adding: phone (for phone call orders), walk_in (for in-person orders)

CREATE TYPE source_channel_type AS ENUM ('email', 'sms', 'phone', 'walk_in');

-- Note: We're not converting the existing column to use the enum type
-- because that would require handling existing data and null values.
-- The enum is created for reference and can be used for validation in the app layer.

COMMENT ON TYPE source_channel_type IS 'Valid source channels for orders: email, sms, phone, walk_in';
