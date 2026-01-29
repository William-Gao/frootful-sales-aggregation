-- Populate demo organization items from Boston Microgreens catalog
-- Demo Organization ID: 00000000-0000-0000-0000-000000000001
-- Source Organization ID: ac3dd72d-373d-4424-8085-55b3b1844459 (Test/Boston Microgreens)

-- First, delete any existing demo items to avoid duplicates
DELETE FROM items WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Copy all items from Test Organization (Boston Microgreens) to Demo Organization
INSERT INTO items (organization_id, sku, name, description, base_price, active, category, notes, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid as organization_id,
  sku,
  name,
  description,
  base_price,
  active,
  category,
  notes,
  NOW() as created_at,
  NOW() as updated_at
FROM items
WHERE organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'::uuid;

-- Also copy customers from Boston Microgreens to demo org
-- First delete existing demo customers
DELETE FROM customers WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Copy customers
INSERT INTO customers (organization_id, name, email, phone, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid as organization_id,
  name,
  email,
  phone,
  NOW() as created_at,
  NOW() as updated_at
FROM customers
WHERE organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459'::uuid;
