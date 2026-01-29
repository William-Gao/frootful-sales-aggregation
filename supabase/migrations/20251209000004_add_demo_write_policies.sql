-- Add write policies for demo organization to allow accepting proposals
-- Demo Organization ID: 00000000-0000-0000-0000-000000000001

-- Allow public INSERT for demo org orders
DROP POLICY IF EXISTS "Allow public insert for demo organization orders" ON orders;
CREATE POLICY "Allow public insert for demo organization orders"
ON orders FOR INSERT
WITH CHECK (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Allow public UPDATE for demo org orders
DROP POLICY IF EXISTS "Allow public update for demo organization orders" ON orders;
CREATE POLICY "Allow public update for demo organization orders"
ON orders FOR UPDATE
USING (organization_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Allow public INSERT for demo org order_lines
DROP POLICY IF EXISTS "Allow public insert for demo organization order_lines" ON order_lines;
CREATE POLICY "Allow public insert for demo organization order_lines"
ON order_lines FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_lines.order_id
    AND orders.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

-- Allow public UPDATE for demo org order_lines
DROP POLICY IF EXISTS "Allow public update for demo organization order_lines" ON order_lines;
CREATE POLICY "Allow public update for demo organization order_lines"
ON order_lines FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_lines.order_id
    AND orders.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

-- Allow public INSERT for demo org order_events
DROP POLICY IF EXISTS "Allow public insert for demo organization order_events" ON order_events;
CREATE POLICY "Allow public insert for demo organization order_events"
ON order_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_events.order_id
    AND orders.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);
