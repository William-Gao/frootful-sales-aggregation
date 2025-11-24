-- Drop emails table if it exists
-- This table is not being used in the application
-- The current architecture uses process-gmail-notification -> process-intake-event -> orders

DROP TABLE IF EXISTS emails CASCADE;
