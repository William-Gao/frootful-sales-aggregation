-- Add notes column to customers table for free-text customer notes
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.customers.notes
IS 'Free-text notes about this customer (e.g. shipping preferences, payment terms).';
