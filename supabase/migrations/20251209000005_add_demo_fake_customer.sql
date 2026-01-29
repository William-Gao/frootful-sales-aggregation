-- Add a demo "FAKE CUSTOMER" for demo organization
-- This customer will be used as the default for demo proposals

INSERT INTO customers (id, organization_id, name, email, phone, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0001-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'DEMO CUSTOMER',
  'demo@example.com',
  '+1-000-000-0000',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();
