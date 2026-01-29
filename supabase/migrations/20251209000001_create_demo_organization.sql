-- Create demo organization for AC215 presentation
-- This organization will be used for public demo access without login

-- Insert demo organization with a known UUID
INSERT INTO organizations (id, name, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'AC215 Demo',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- Insert some demo customers for the demo organization
INSERT INTO customers (id, organization_id, name, email, phone, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0001-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Harvard Dining Services',
    'dining@harvard.edu',
    '+1-617-555-0101',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MIT Catering',
    'catering@mit.edu',
    '+1-617-555-0102',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0001-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Boston Restaurant Group',
    'orders@bostonrestaurants.com',
    '+1-617-555-0103',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Insert demo items/products for the demo organization
INSERT INTO items (id, organization_id, sku, name, description, base_price, category, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0002-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-PEA',
    'Pea Shoots Microgreens',
    'Fresh organic pea shoot microgreens, 4oz clamshell',
    4.50,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-SUN',
    'Sunflower Microgreens',
    'Fresh organic sunflower microgreens, 4oz clamshell',
    5.00,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-RAD',
    'Radish Microgreens',
    'Fresh organic radish microgreens, 4oz clamshell',
    4.75,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000004'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-ARU',
    'Arugula Microgreens',
    'Fresh organic arugula microgreens, 4oz clamshell',
    4.25,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000005'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-MIX',
    'Mixed Microgreens',
    'Fresh organic mixed microgreens variety pack, 8oz',
    8.50,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000006'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-BAS',
    'Basil Microgreens',
    'Fresh organic basil microgreens, 2oz clamshell',
    3.50,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000007'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-CIL',
    'Cilantro Microgreens',
    'Fresh organic cilantro microgreens, 2oz clamshell',
    3.75,
    'Microgreens',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0002-000000000008'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'MICRO-WHEAT',
    'Wheatgrass',
    'Fresh organic wheatgrass, 16oz tray',
    12.00,
    'Microgreens',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Add RLS policy to allow public read access to demo organization data
-- This allows unauthenticated access to the demo org's orders

-- Policy for orders: allow public read for demo org
DROP POLICY IF EXISTS "Allow public read for demo organization orders" ON orders;
CREATE POLICY "Allow public read for demo organization orders"
ON orders FOR SELECT
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Policy for order_lines: allow public read for demo org orders
DROP POLICY IF EXISTS "Allow public read for demo organization order_lines" ON order_lines;
CREATE POLICY "Allow public read for demo organization order_lines"
ON order_lines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_lines.order_id
    AND orders.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

-- Policy for order_change_proposals: allow public read for demo org
DROP POLICY IF EXISTS "Allow public read for demo organization proposals" ON order_change_proposals;
CREATE POLICY "Allow public read for demo organization proposals"
ON order_change_proposals FOR SELECT
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Policy for order_change_proposal_lines: allow public read for demo org proposals
DROP POLICY IF EXISTS "Allow public read for demo organization proposal_lines" ON order_change_proposal_lines;
CREATE POLICY "Allow public read for demo organization proposal_lines"
ON order_change_proposal_lines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_change_proposals
    WHERE order_change_proposals.id = order_change_proposal_lines.proposal_id
    AND order_change_proposals.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

-- Policy for customers: allow public read for demo org
DROP POLICY IF EXISTS "Allow public read for demo organization customers" ON customers;
CREATE POLICY "Allow public read for demo organization customers"
ON customers FOR SELECT
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Policy for items: allow public read for demo org
DROP POLICY IF EXISTS "Allow public read for demo organization items" ON items;
CREATE POLICY "Allow public read for demo organization items"
ON items FOR SELECT
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Policy for intake_events: allow public read for demo org
DROP POLICY IF EXISTS "Allow public read for demo organization intake_events" ON intake_events;
CREATE POLICY "Allow public read for demo organization intake_events"
ON intake_events FOR SELECT
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Policy for order_events: allow public read for demo org orders
DROP POLICY IF EXISTS "Allow public read for demo organization order_events" ON order_events;
CREATE POLICY "Allow public read for demo organization order_events"
ON order_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_events.order_id
    AND orders.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

-- Allow public INSERT for demo org proposals (for accept/reject)
DROP POLICY IF EXISTS "Allow public update for demo organization proposals" ON order_change_proposals;
CREATE POLICY "Allow public update for demo organization proposals"
ON order_change_proposals FOR UPDATE
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);
