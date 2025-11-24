-- Drop text_orders table if it exists
-- This table is part of the legacy SMS processing architecture
-- The new architecture uses: process-twilio-webhook -> process-intake-event -> orders table
-- The TextOrdersSection.tsx component that used this table is no longer imported in Dashboard

DROP TABLE IF EXISTS text_orders CASCADE;
