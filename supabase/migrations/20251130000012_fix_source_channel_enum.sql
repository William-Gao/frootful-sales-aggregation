-- Fix source_channel enum: only email and sms
-- Also convert the orders.source_channel column to use the enum type

-- Drop the old enum type
DROP TYPE IF EXISTS source_channel_type;

-- Create enum with only email and sms
CREATE TYPE source_channel_type AS ENUM ('email', 'sms');

-- Convert the column to use the enum type
-- First set any null or invalid values to 'email' as default
UPDATE orders SET source_channel = 'email' WHERE source_channel IS NULL OR source_channel NOT IN ('email', 'sms');

-- Alter the column to use the enum type
ALTER TABLE orders
ALTER COLUMN source_channel TYPE source_channel_type
USING source_channel::source_channel_type;

-- Set a default value
ALTER TABLE orders ALTER COLUMN source_channel SET DEFAULT 'email'::source_channel_type;

COMMENT ON TYPE source_channel_type IS 'Valid source channels for orders: email, sms';
