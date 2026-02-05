-- Feb 6, 2026 Orders for Demo Organization
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
    ('Basil, Genovese'), ('Pea, Tendril'), ('Shiso, Red'), ('Cilantro'), ('Rainbow MIX'),
    ('Sunflower'), ('Celery'), ('Arugula'), ('Nasturtium'), ('Davio''s MIX'),
    ('Radish Mix'), ('Lemon Balm'), ('Mustard, Wasabi'), ('Basil, Thai'),
    ('Radish, Sango'), ('Mustard, Green Mizuna'), ('Radish, Kaiware'),
    ('Sorrel, Red Veined'), ('Passion MIX'), ('Shungiku'), ('Borage'),
    ('Tokyo Onion'), ('Nutrition MIX'), ('Cabbage'), ('Shiso, Green'),
    ('Lettuce, Crisphead'), ('Anise Hyssop')
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
    ('Basil, Genovese', 'L'), ('Basil, Genovese', 'S'), ('Basil, Genovese', 'T20'),
    ('Pea, Tendril', 'L'), ('Pea, Tendril', 'S'), ('Pea, Tendril', 'T20'),
    ('Shiso, Red', 'L'), ('Shiso, Red', 'S'), ('Shiso, Red', 'T20'),
    ('Cilantro', 'L'), ('Cilantro', 'S'),
    ('Rainbow MIX', 'L'),
    ('Sunflower', 'L'), ('Sunflower', 'T20'),
    ('Celery', 'L'), ('Celery', 'S'),
    ('Arugula', 'L'), ('Arugula', 'S'),
    ('Nasturtium', 'L'), ('Nasturtium', 'S'), ('Nasturtium', 'T20'),
    ('Davio''s MIX', 'L'),
    ('Radish Mix', 'L'),
    ('Lemon Balm', 'L'), ('Lemon Balm', 'S'), ('Lemon Balm', 'T20'),
    ('Mustard, Wasabi', 'L'), ('Mustard, Wasabi', 'S'),
    ('Basil, Thai', 'L'), ('Basil, Thai', 'S'),
    ('Radish, Sango', 'L'), ('Radish, Sango', 'S'),
    ('Mustard, Green Mizuna', 'S'),
    ('Radish, Kaiware', 'L'),
    ('Sorrel, Red Veined', 'L'), ('Sorrel, Red Veined', 'S'),
    ('Passion MIX', 'L'),
    ('Shungiku', 'T20'),
    ('Borage', 'T20'),
    ('Tokyo Onion', 'T20'),
    ('Nutrition MIX', 'L'),
    ('Cabbage', 'S'),
    ('Shiso, Green', 'L'),
    ('Lettuce, Crisphead', 'L'),
    ('Anise Hyssop', 'S')
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
    ('Capo'), ('Hunters'), ('Fat Baby'), ('Loco'), ('224 Boston'),
    ('Petula''s'), ('Chickadee'), ('Coquette'), ('Nautilus'), ('Woods Hill Pier 4'),
    ('The Block'), ('Davio''s Seaport'), ('Serafina Seaport'), ('Row 34'), ('Trade'),
    ('O Ya'), ('Baleia'), ('Fuji at Ink Block'), ('Capri Italian Steakhouse'), ('311'),
    ('Douzo'), ('SRV'), ('Desnuda'), ('Zuma'), ('Nagomi'),
    ('Loco Fenway'), ('Asta'), ('La Padrona'), ('The Banks Seafood'), ('Davio''s Arlington'),
    ('Cactus Club Cafe - Boston'), ('Bistro Du Midi'), ('1928'), ('Ruka'), ('Yvonne''s'),
    ('Mariel'), ('The Oceanaire'), ('Mamma Maria')
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

-- 1. Capo
WITH customer AS (SELECT id FROM customers WHERE name = 'Capo' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Capo', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:01' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 4, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 2. Hunters
WITH customer AS (SELECT id FROM customers WHERE name = 'Hunters' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Hunters', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:02' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Pea, Tendril', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 3. Fat Baby
WITH customer AS (SELECT id FROM customers WHERE name = 'Fat Baby' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Fat Baby', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:03' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Shiso, Red', 1, 'L'), (2, 'Cilantro', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 4. Loco
WITH customer AS (SELECT id FROM customers WHERE name = 'Loco' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Loco', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:04' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Cilantro', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 5. 224 Boston
WITH customer AS (SELECT id FROM customers WHERE name = '224 Boston' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, '224 Boston', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:05' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 1, 'L'), (2, 'Rainbow MIX', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 6. Petula's
WITH customer AS (SELECT id FROM customers WHERE name = 'Petula''s' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Petula''s', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:06' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Cilantro', 1, 'L'), (2, 'Basil, Genovese', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 7. Chickadee
WITH customer AS (SELECT id FROM customers WHERE name = 'Chickadee' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Chickadee', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:07' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Sunflower', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 8. Coquette
WITH customer AS (SELECT id FROM customers WHERE name = 'Coquette' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Coquette', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:08' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 9. Nautilus
WITH customer AS (SELECT id FROM customers WHERE name = 'Nautilus' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Nautilus', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:09' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Shiso, Red', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 10. Woods Hill Pier 4
WITH customer AS (SELECT id FROM customers WHERE name = 'Woods Hill Pier 4' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Woods Hill Pier 4', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:10' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Celery', 1, 'L'), (2, 'Arugula', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 11. The Block
WITH customer AS (SELECT id FROM customers WHERE name = 'The Block' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'The Block', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:11' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Arugula', 1, 'S'), (2, 'Cilantro', 1, 'S'), (3, 'Nasturtium', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 12. Davio's Seaport
WITH customer AS (SELECT id FROM customers WHERE name = 'Davio''s Seaport' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Davio''s Seaport', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:12' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Davio''s MIX', 4, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 13. Serafina Seaport
WITH customer AS (SELECT id FROM customers WHERE name = 'Serafina Seaport' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Serafina Seaport', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:13' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 2, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 14. Row 34
WITH customer AS (SELECT id FROM customers WHERE name = 'Row 34' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Row 34', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:14' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 1, 'L'), (2, 'Radish Mix', 1, 'L'), (3, 'Lemon Balm', 1, 'L'), (4, 'Mustard, Wasabi', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 15. Trade
WITH customer AS (SELECT id FROM customers WHERE name = 'Trade' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Trade', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:15' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Lemon Balm', 3, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 16. O Ya
WITH customer AS (SELECT id FROM customers WHERE name = 'O Ya' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'O Ya', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:16' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Thai', 1, 'S'), (2, 'Shiso, Red', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 17. Baleia
WITH customer AS (SELECT id FROM customers WHERE name = 'Baleia' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Baleia', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:17' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Mustard, Wasabi', 1, 'S'), (2, 'Cilantro', 3, 'L'), (3, 'Basil, Thai', 3, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 18. Fuji at Ink Block
WITH customer AS (SELECT id FROM customers WHERE name = 'Fuji at Ink Block' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Fuji at Ink Block', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:18' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Mustard, Wasabi', 2, 'L'), (2, 'Radish, Sango', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 19. Capri Italian Steakhouse
WITH customer AS (SELECT id FROM customers WHERE name = 'Capri Italian Steakhouse' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Capri Italian Steakhouse', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:19' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 2, 'L'), (2, 'Lemon Balm', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 20. 311
WITH customer AS (SELECT id FROM customers WHERE name = '311' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, '311', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:20' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Mustard, Green Mizuna', 3, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 21. Douzo
WITH customer AS (SELECT id FROM customers WHERE name = 'Douzo' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Douzo', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:21' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Rainbow MIX', 1, 'L'), (2, 'Radish, Kaiware', 3, 'L'), (3, 'Cilantro', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 22. SRV
WITH customer AS (SELECT id FROM customers WHERE name = 'SRV' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'SRV', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:22' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Nasturtium', 1, 'L'), (2, 'Pea, Tendril', 1, 'S'), (3, 'Sorrel, Red Veined', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 23. Desnuda
WITH customer AS (SELECT id FROM customers WHERE name = 'Desnuda' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Desnuda', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:23' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Celery', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 24. Zuma
WITH customer AS (SELECT id FROM customers WHERE name = 'Zuma' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Zuma', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:24' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Rainbow MIX', 5, 'L'), (2, 'Shiso, Red', 4, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 25. Nagomi
WITH customer AS (SELECT id FROM customers WHERE name = 'Nagomi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Nagomi', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:25' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Passion MIX', 1, 'L'), (2, 'Rainbow MIX', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 26. Loco Fenway
WITH customer AS (SELECT id FROM customers WHERE name = 'Loco Fenway' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Loco Fenway', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:26' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Cilantro', 2, 'L'), (2, 'Radish, Sango', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 27. Asta
WITH customer AS (SELECT id FROM customers WHERE name = 'Asta' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Asta', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:27' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Pea, Tendril', 2, 'T20'), (2, 'Shungiku', 1, 'T20'), (3, 'Borage', 1, 'T20'), (4, 'Nasturtium', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 28. La Padrona
WITH customer AS (SELECT id FROM customers WHERE name = 'La Padrona' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'La Padrona', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:28' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 5, 'T20'), (2, 'Shiso, Red', 2, 'T20'), (3, 'Tokyo Onion', 3, 'T20'), (4, 'Lemon Balm', 1, 'T20'), (5, 'Pea, Tendril', 1, 'T20')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 29. The Banks Seafood
WITH customer AS (SELECT id FROM customers WHERE name = 'The Banks Seafood' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'The Banks Seafood', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:29' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Pea, Tendril', 2, 'T20'), (2, 'Sorrel, Red Veined', 1, 'S'), (3, 'Cilantro', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 30. Davio's Arlington
WITH customer AS (SELECT id FROM customers WHERE name = 'Davio''s Arlington' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Davio''s Arlington', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:30' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Radish Mix', 5, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 31. Cactus Club Cafe - Boston
WITH customer AS (SELECT id FROM customers WHERE name = 'Cactus Club Cafe - Boston' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Cactus Club Cafe - Boston', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:31' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Sunflower', 3, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 32. Bistro Du Midi
WITH customer AS (SELECT id FROM customers WHERE name = 'Bistro Du Midi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Bistro Du Midi', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:32' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Cilantro', 1, 'L'), (2, 'Sunflower', 1, 'L'), (3, 'Nutrition MIX', 1, 'L'), (4, 'Basil, Genovese', 1, 'S'), (5, 'Nasturtium', 1, 'S'), (6, 'Anise Hyssop', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 33. 1928
WITH customer AS (SELECT id FROM customers WHERE name = '1928' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, '1928', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:33' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Cilantro', 1, 'S'), (2, 'Cabbage', 1, 'S'), (3, 'Basil, Genovese', 1, 'S'), (4, 'Lemon Balm', 1, 'S'), (5, 'Shiso, Green', 1, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 34. Ruka
WITH customer AS (SELECT id FROM customers WHERE name = 'Ruka' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Ruka', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:34' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Thai', 3, 'S'), (2, 'Shiso, Red', 2, 'S'), (3, 'Cilantro', 5, 'S'), (4, 'Basil, Genovese', 6, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 35. Yvonne's
WITH customer AS (SELECT id FROM customers WHERE name = 'Yvonne''s' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Yvonne''s', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:35' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Lettuce, Crisphead', 2, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 36. Mariel
WITH customer AS (SELECT id FROM customers WHERE name = 'Mariel' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Mariel', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:36' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 4, 'L'), (2, 'Pea, Tendril', 1, 'L'), (3, 'Sorrel, Red Veined', 1, 'S'), (4, 'Basil, Thai', 4, 'L')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 37. The Oceanaire
WITH customer AS (SELECT id FROM customers WHERE name = 'The Oceanaire' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'The Oceanaire', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:37' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Radish Mix', 1, 'L'), (2, 'Cilantro', 1, 'S'), (3, 'Mustard, Wasabi', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

-- 38. Mamma Maria
WITH customer AS (SELECT id FROM customers WHERE name = 'Mamma Maria' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' LIMIT 1),
new_order AS (INSERT INTO orders (organization_id, customer_id, customer_name, delivery_date, status, source_channel, created_at) SELECT 'ac3dd72d-373d-4424-8085-55b3b1844459', c.id, 'Mamma Maria', '2026-02-06', 'ready', 'erp', '2026-02-06 08:00:38' FROM customer c RETURNING id)
INSERT INTO order_lines (order_id, line_number, product_name, quantity, item_id, item_variant_id, status) SELECT o.id, lines.row_num, lines.product_name, lines.qty, i.id, iv.id, 'active' FROM new_order o CROSS JOIN (VALUES (1, 'Basil, Genovese', 1, 'L'), (2, 'Sorrel, Red Veined', 3, 'S'), (3, 'Radish, Sango', 1, 'S'), (4, 'Lemon Balm', 1, 'S')) AS lines(row_num, product_name, qty, size) JOIN items i ON i.name = lines.product_name AND i.organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459' JOIN item_variants iv ON iv.item_id = i.id AND iv.variant_code = lines.size;

COMMIT;
