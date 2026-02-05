-- Create the Boston Microgreens test organizations
-- ac3dd72d: referenced by catalog insert migration (20251121230000)
-- e047b512: referenced by customer insert migration (20251130000002)
INSERT INTO organizations (id, name, created_at, updated_at)
VALUES
  (
    'ac3dd72d-373d-4424-8085-55b3b1844459'::uuid,
    'Boston Microgreens (Test Catalog)',
    NOW(),
    NOW()
  ),
  (
    'e047b512-0012-4287-bb74-dc6d4f7e673f'::uuid,
    'Boston Microgreens',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;
