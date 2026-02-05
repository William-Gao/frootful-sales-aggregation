-- Add notes column to item_variants
ALTER TABLE item_variants ADD COLUMN IF NOT EXISTS notes text;

-- Add comment for documentation
COMMENT ON COLUMN item_variants.notes IS 'Additional info like oz weight for Small/Large variants';
