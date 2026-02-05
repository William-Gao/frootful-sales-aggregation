-- Populate oz notes for Small (S) and Large (L) variants
-- Organization ID: ac3dd72d-373d-4424-8085-55b3b1844459
-- T20 variants have no oz value, so they stay NULL

-- Small variants (S)
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Amaranth' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Anise Hyssop' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Arugula' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Basil, Genovese' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Basil, Thai' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Beets, Bulls Blood' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Borage' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Broccoli' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Cabbage' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.75 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Celery' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Chervil' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Chive' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Cilantro' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Dill' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Fennel, Bronze' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Fennel, Green' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Kale' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Lemon Balm' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Lettuce, Crisphead' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Green Mizuna' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Purple Mizuna' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Ruby Streak' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Scarlet Frills' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Wasabi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.75 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Nasturtium' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Parsley' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Pea, Tendril' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Pea, Dwarf' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Popcorn Shoots' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Radish Mix' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Radish, Hong Vit' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Radish, Kaiware' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Radish, Sango' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.75 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Shiso, Green' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.75 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Shiso, Red' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Shungiku' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Sorrel, Red Veined' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Sunflower' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Swiss Chard' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '1.50 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Tahoon' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '2.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Tokyo Onion' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'S' AND item_id IN (SELECT id FROM items WHERE name = 'Pac Choi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');

-- Large variants (L)
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Amaranth' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Anise Hyssop' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Arugula' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Basil, Genovese' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Basil, Thai' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Beets, Bulls Blood' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Borage' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Broccoli' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Cabbage' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.50 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Celery' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Chervil' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Chive' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '5.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Cilantro' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Dill' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Fennel, Bronze' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Fennel, Green' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Kale' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Lemon Balm' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Lettuce, Crisphead' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Green Mizuna' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Purple Mizuna' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Ruby Streak' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Scarlet Frills' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '5.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Mustard, Wasabi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.50 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Nasturtium' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Parsley' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '5.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Pea, Tendril' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '5.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Pea, Dwarf' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '8.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Popcorn Shoots' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '8.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Radish Mix' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '8.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Radish, Hong Vit' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '8.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Radish, Kaiware' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '8.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Radish, Sango' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.50 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Shiso, Green' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.50 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Shiso, Red' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Shungiku' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Sorrel, Red Veined' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '8.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Sunflower' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Swiss Chard' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '3.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Tahoon' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '4.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Tokyo Onion' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');
UPDATE item_variants SET notes = '6.00 oz' WHERE variant_code = 'L' AND item_id IN (SELECT id FROM items WHERE name = 'Pac Choi' AND organization_id = 'ac3dd72d-373d-4424-8085-55b3b1844459');

-- T20 variants have no oz value, they stay NULL
