-- Add global admin support for items and item_variants
-- The admin user (orders.frootful@gmail.com) should be able to read
-- items and variants from ANY organization

-- ============================================================================
-- Update SELECT policy for items to allow global admin
-- ============================================================================
DROP POLICY IF EXISTS "Users can read items from their organizations" ON items;

CREATE POLICY "Users can read items from their organizations"
  ON items FOR SELECT
  USING (
    is_global_admin()
    OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Update SELECT policy for item_variants to allow global admin
-- ============================================================================
DROP POLICY IF EXISTS "Users can read variants from their organizations" ON item_variants;

CREATE POLICY "Users can read variants from their organizations"
  ON item_variants FOR SELECT
  USING (
    is_global_admin()
    OR
    item_id IN (
      SELECT items.id FROM items
      WHERE items.organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- Also update customers table for global admin access
-- ============================================================================
DROP POLICY IF EXISTS "Users can read their organization customers" ON customers;

CREATE POLICY "Users can read their organization customers"
  ON customers FOR SELECT
  USING (
    is_global_admin()
    OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );
