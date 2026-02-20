-- Add sort_order column to customers table for custom display ordering
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.customers.sort_order
IS 'Organization-specific display sort order (lower = first). NULL means unsorted, appears after sorted customers.';

CREATE INDEX IF NOT EXISTS idx_customers_org_sort_order
ON public.customers (organization_id, sort_order NULLS LAST, name);
