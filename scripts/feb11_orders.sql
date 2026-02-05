-- Feb 11, 2026 Orders for Demo Organization
-- Organization ID: ac3dd72d-373d-4424-8085-55b3b1844459
-- Status: ready, Source: erp
-- Sequential created_at timestamps to preserve display order
-- Uses EXACT item name matching with INNER JOIN (fails if item not found)
-- Wrapped in transaction - rolls back entirely if any match fails

BEGIN;

-- =====================================================
-- VALIDATION BLOCK: Fail early if items/variants or customers are missing
-- =====================================================
DO $$
DECLARE
  missing_items TEXT;
  missing_variants TEXT;
  missing_customers TEXT;
  org_id UUID := 'ac3dd72d-373d-4424-8085-55b3b1844459';
BEGIN
  -- Check for missing items
  SELECT string_agg(DISTINCT expected.product_name, ', ')
  INTO missing_items
  FROM (VALUES
    ('Nasturtium'), ('Basil, Genovese'), ('Shiso, Red'), ('Cilantro'), ('Celery'),
    ('Mustard, Wasabi'), ('Rainbow MIX'), ('Tokyo Onion'), ('Radish, Sango'),
    ('Lemon Balm'), ('Pea, Tendril'), ('Sorrel, Red Veined'), ('Mustard, Purple Mizuna'),
    ('Fennel, Bronze'), ('Shiso, Green')
  ) AS expected(product_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM items
    WHERE items.name = expected.product_name
    AND items.organization_id = org_id
  );

  IF missing_items IS NOT NULL THEN
    RAISE EXCEPTION 'Missing items: %', missing_items;
  END IF;

  -- Check for missing item+variant combinations (item name + variant code)
  SELECT string_agg(expected.product_name || ' (' || expected.size_code || ')', ', ')
  INTO missing_variants
  FROM (VALUES
    ('Nasturtium', 'S'), ('Basil, Genovese', 'L'), ('Shiso, Red', 'S'), ('Shiso, Red', 'L'),
    ('Cilantro', 'L'), ('Celery', 'S'), ('Mustard, Wasabi', 'S'), ('Rainbow MIX', 'L'),
    ('Tokyo Onion', 'L'), ('Tokyo Onion', 'T20'), ('Radish, Sango', 'T20'),
    ('Lemon Balm', 'T20'), ('Pea, Tendril', 'T20'), ('Sorrel, Red Veined', 'S'),
    ('Sorrel, Red Veined', 'T20'), ('Mustard, Purple Mizuna', 'S'), ('Fennel, Bronze', 'T20'),
    ('Shiso, Green', 'T20')
  ) AS expected(product_name, size_code)
  WHERE NOT EXISTS (
    SELECT 1 FROM items i
    JOIN item_variants iv ON iv.item_id = i.id
    WHERE i.name = expected.product_name
    AND i.organization_id = org_id
    AND iv.variant_code = expected.size_code
  );

  IF missing_variants IS NOT NULL THEN
    RAISE EXCEPTION 'Missing item+variant combinations: %', missing_variants;
  END IF;

  -- Check for missing customers
  SELECT string_agg(expected.customer_name, ', ')
  INTO missing_customers
  FROM (VALUES
    ('Kaia South End'), ('Shore Leave'), ('Zuma'), ('Dovetail Charlestown'),
    ('Brewer''s Fork'), ('Prima'), ('Cafe Sushi'), ('Pammy''s'), ('Harvest'),
    ('Nine Restaurant'), ('Thaiger Den')
  ) AS expected(customer_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM customers
    WHERE customers.name = expected.customer_name
    AND customers.organization_id = org_id
  );

  IF missing_customers IS NOT NULL THEN
    RAISE EXCEPTION 'Missing customers: %', missing_customers;
  END IF;

  RAISE NOTICE 'Validation passed: All items, variants, and customers exist';
END $$;

-- 1. Kaia South End
WITH customer AS (SELECT id FROM customers WHERE name = 'Kaia South End' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Kaia South End', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:01' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Nasturtium', 1, 'S'), (2, 'Basil, Genovese', 1, 'L'), (3, 'Shiso, Red', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 2. Shore Leave
WITH customer AS (SELECT id FROM customers WHERE name = 'Shore Leave' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Shore Leave', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:02' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Shiso, Red', 1, 'S'), (2, 'Cilantro', 1, 'L'), (3, 'Celery', 1, 'S'), (4, 'Mustard, Wasabi', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 3. Zuma
WITH customer AS (SELECT id FROM customers WHERE name = 'Zuma' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Zuma', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:03' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Rainbow MIX', 3, 'L'), (2, 'Shiso, Red', 3, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 4. Dovetail Charlestown
WITH customer AS (SELECT id FROM customers WHERE name = 'Dovetail Charlestown' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Dovetail Charlestown', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:04' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 1, 'L'), (2, 'Tokyo Onion', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 5. Brewer's Fork
WITH customer AS (SELECT id FROM customers WHERE name = 'Brewer''s Fork' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Brewer''s Fork', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:05' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Cilantro', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 6. Prima
WITH customer AS (SELECT id FROM customers WHERE name = 'Prima' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Prima', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:06' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 7. Cafe Sushi
WITH customer AS (SELECT id FROM customers WHERE name = 'Cafe Sushi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Cafe Sushi', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:07' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Radish, Sango', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 8. Pammy's
WITH customer AS (SELECT id FROM customers WHERE name = 'Pammy''s' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Pammy''s', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:08' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Lemon Balm', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 9. Harvest
WITH customer AS (SELECT id FROM customers WHERE name = 'Harvest' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Harvest', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:09' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Pea, Tendril', 2, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 10. Nine Restaurant
WITH customer AS (SELECT id FROM customers WHERE name = 'Nine Restaurant' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Nine Restaurant', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:10' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Rainbow MIX', 1, 'L'), (2, 'Sorrel, Red Veined', 1, 'S'), (3, 'Mustard, Purple Mizuna', 1, 'S'), (4, 'Fennel, Bronze', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 11. Thaiger Den
WITH customer AS (SELECT id FROM customers WHERE name = 'Thaiger Den' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Thaiger Den', '2026-02-11', 'ready', 'erp', '2026-02-11 08:00:11' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Sorrel, Red Veined', 1, 'T20'), (2, 'Tokyo Onion', 1, 'T20'), (3, 'Shiso, Green', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

COMMIT;
