-- Add policy allowing admin users to manage all orders
-- This allows orders.frootful@gmail.com to create/manage orders for any organization

-- Policy for INSERT
CREATE POLICY "Admin can create orders for any organization"
  ON orders FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'orders.frootful@gmail.com'
  );

-- Policy for UPDATE
CREATE POLICY "Admin can update orders for any organization"
  ON orders FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'orders.frootful@gmail.com'
  );

-- Policy for SELECT (admin can read all orders)
CREATE POLICY "Admin can read all orders"
  ON orders FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'orders.frootful@gmail.com'
  );

-- Also add similar policies for order_lines
CREATE POLICY "Admin can create order lines for any organization"
  ON order_lines FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'orders.frootful@gmail.com'
  );

CREATE POLICY "Admin can update order lines for any organization"
  ON order_lines FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'orders.frootful@gmail.com'
  );

CREATE POLICY "Admin can read all order lines"
  ON order_lines FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'orders.frootful@gmail.com'
  );
