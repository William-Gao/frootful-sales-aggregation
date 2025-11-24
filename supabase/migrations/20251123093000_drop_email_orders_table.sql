-- Drop email_orders table if it exists
-- This table is part of the legacy email processing architecture
-- The new architecture uses: process-gmail-notification -> process-intake-event -> orders table
-- The EmailOrdersSection.tsx component that used this table is no longer imported in Dashboard

DROP TABLE IF EXISTS email_orders CASCADE;
