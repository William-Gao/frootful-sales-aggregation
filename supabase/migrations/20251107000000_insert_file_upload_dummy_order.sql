-- Insert dummy order from file upload with produce items
-- This will appear in the "All Orders" section
-- Note: Only inserts if a user exists (won't run on fresh install)

INSERT INTO email_orders (
  user_id,
  email_id,
  thread_id,
  subject,
  from_email,
  to_email,
  email_content,
  status,
  analysis_data,
  created_at,
  updated_at
)
SELECT
  (SELECT id FROM auth.users LIMIT 1), -- Gets the first user
  'file-upload-' || gen_random_uuid()::text,
  'file-upload-thread-' || gen_random_uuid()::text,
  'Produce Order - File Upload',
  'orders@produce-supplier.com',
  'receiving@yourcompany.com',
  'Order uploaded from file with various produce items including fruits, vegetables, and mushrooms.',
  'analyzed',
  jsonb_build_object(
    'matchingCustomer', jsonb_build_object(
      'id', gen_random_uuid(),
      'number', 'CUST-PRODUCE-001',
      'displayName', 'Produce Wholesale Customer',
      'email', 'orders@produce-supplier.com'
    ),
    'analyzedItems', jsonb_build_array(
      jsonb_build_object('itemName', 'Sand Pear 28/32', 'quantity', 3, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Pomelo 8/10c China Red', 'quantity', 1, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Banana Red', 'quantity', 5),
      jsonb_build_object('itemName', 'Longan Vietnam', 'quantity', 1, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Medjool Date 11lb', 'quantity', 2),
      jsonb_build_object('itemName', 'Pomegranate Bin', 'quantity', 1),
      jsonb_build_object('itemName', 'Winter Jujube CA', 'quantity', 5),
      jsonb_build_object('itemName', 'Passion Fruit CA', 'quantity', 2),
      jsonb_build_object('itemName', 'Shine Muscat Grape', 'quantity', 10),
      jsonb_build_object('itemName', 'Shiitake Mush. #1', 'quantity', 30),
      jsonb_build_object('itemName', 'Enoki Mushroom, Korea', 'quantity', 60),
      jsonb_build_object('itemName', 'Green Onion, M', 'quantity', 1, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Fresh Bamboo', 'quantity', 7),
      jsonb_build_object('itemName', 'Korean Chili MX', 'quantity', 2),
      jsonb_build_object('itemName', 'AA Choy Sum Mx #1', 'quantity', 20),
      jsonb_build_object('itemName', 'Taku Choy CA #1', 'quantity', 5),
      jsonb_build_object('itemName', 'Bac Ha', 'quantity', 1),
      jsonb_build_object('itemName', 'Banana Flower', 'quantity', 5),
      jsonb_build_object('itemName', 'Bitter Melon Ind Ca #1', 'quantity', 2),
      jsonb_build_object('itemName', 'Chayote Fancy #1', 'quantity', 7),
      jsonb_build_object('itemName', 'Eggplant Indian Ca', 'quantity', 2),
      jsonb_build_object('itemName', 'Eggplant Thai Green', 'quantity', 3),
      jsonb_build_object('itemName', 'Kabocha 10/12c #1', 'quantity', 1, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Moa Gua Mx', 'quantity', 40),
      jsonb_build_object('itemName', 'MoaP Taiwan', 'quantity', 15),
      jsonb_build_object('itemName', 'Okra #1 Ca', 'quantity', 15),
      jsonb_build_object('itemName', 'Opo Ca', 'quantity', 15),
      jsonb_build_object('itemName', 'Winter Melon Long Mx #1', 'quantity', 4000),
      jsonb_build_object('itemName', 'Arrow Head', 'quantity', 20),
      jsonb_build_object('itemName', 'Japanese Yam M New Crop!', 'quantity', 2, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Nami', 'quantity', 5),
      jsonb_build_object('itemName', 'Sunchoke', 'quantity', 2),
      jsonb_build_object('itemName', 'Taro Small Ecuador', 'quantity', 40),
      jsonb_build_object('itemName', 'Gai Lan Ca #1', 'quantity', 1, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Lemon Grass', 'quantity', 21),
      jsonb_build_object('itemName', 'Korean Lobok Ca', 'quantity', 21),
      jsonb_build_object('itemName', 'Purple Yam Hawaii M', 'quantity', 2, 'unit', 'pallet'),
      jsonb_build_object('itemName', 'Lotus Root China', 'quantity', 20),
      jsonb_build_object('itemName', 'Pomelo 8/10c China Red', 'quantity', 1, 'unit', 'pallet')
    ),
    'requestedDeliveryDate', (CURRENT_DATE + INTERVAL '3 days')::text,
    'customers', jsonb_build_array(),
    'items', jsonb_build_array(),
    'processingCompleted', now()::text
  ),
  now() - INTERVAL '2 hours',
  now() - INTERVAL '2 hours'
WHERE EXISTS (SELECT 1 FROM auth.users LIMIT 1);
