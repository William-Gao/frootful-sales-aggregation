-- Customer item notes: per-customer, per-item configuration and notes
-- Used by AI to resolve implicit knowledge (e.g. "moonlight 3 boxes" → full spec)
CREATE TABLE IF NOT EXISTS public.customer_item_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    item_name text NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.customer_item_notes OWNER TO postgres;

COMMENT ON TABLE public.customer_item_notes IS 'Per-customer item-specific notes and configurations (box type, pricing, packaging preferences)';
COMMENT ON COLUMN public.customer_item_notes.item_name IS 'Item/variety name this note applies to';
COMMENT ON COLUMN public.customer_item_notes.note IS 'Free-text note about how this customer orders this item';

-- Indexes
CREATE INDEX idx_customer_item_notes_customer_id ON public.customer_item_notes (customer_id);
CREATE UNIQUE INDEX idx_customer_item_notes_customer_item ON public.customer_item_notes (customer_id, item_name);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_customer_item_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER customer_item_notes_updated_at
  BEFORE UPDATE ON public.customer_item_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_item_notes_updated_at();

-- RLS
ALTER TABLE public.customer_item_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read item notes from their organizations"
  ON public.customer_item_notes FOR SELECT
  USING (customer_id IN (
    SELECT c.id FROM public.customers c
    JOIN public.user_organizations uo ON uo.organization_id = c.organization_id
    WHERE uo.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage item notes in their organizations"
  ON public.customer_item_notes
  USING (customer_id IN (
    SELECT c.id FROM public.customers c
    JOIN public.user_organizations uo ON uo.organization_id = c.organization_id
    WHERE uo.user_id = auth.uid() AND uo.role IN ('admin', 'owner')
  ));

CREATE POLICY "Service role can manage all item notes"
  ON public.customer_item_notes USING (true);

-- Grants
GRANT ALL ON TABLE public.customer_item_notes TO anon;
GRANT ALL ON TABLE public.customer_item_notes TO authenticated;
GRANT ALL ON TABLE public.customer_item_notes TO service_role;
