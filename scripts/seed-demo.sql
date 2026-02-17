-- Demo Data Seed Script
-- Run this after applying migrations to populate demo organization data.
-- Usage: paste into Supabase SQL Editor, or run via psql
--
-- This script is idempotent (safe to run multiple times).

-- ============================================================
-- 1. Demo Organization
-- ============================================================
INSERT INTO organizations (id, name, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Demo Organization',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- ============================================================
-- 2. Demo Customers
-- ============================================================
INSERT INTO customers (id, organization_id, name, email, phone, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0001-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'DEMO CUSTOMER',
    'demo@example.com',
    '+1-000-000-0000',
    NOW(),
    NOW()
  ),
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

-- ============================================================
-- 3. Demo Items (Microgreens catalog)
-- ============================================================
INSERT INTO items (id, organization_id, sku, name, description, category, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0002-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-PEA', 'Pea Shoots Microgreens', 'Fresh organic pea shoot microgreens, 4oz clamshell', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000002'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-SUN', 'Sunflower Microgreens', 'Fresh organic sunflower microgreens, 4oz clamshell', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-RAD', 'Radish Microgreens', 'Fresh organic radish microgreens, 4oz clamshell', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-ARU', 'Arugula Microgreens', 'Fresh organic arugula microgreens, 4oz clamshell', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000005'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-MIX', 'Mixed Microgreens', 'Fresh organic mixed microgreens variety pack, 8oz', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000006'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-BAS', 'Basil Microgreens', 'Fresh organic basil microgreens, 2oz clamshell', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000007'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-CIL', 'Cilantro Microgreens', 'Fresh organic cilantro microgreens, 2oz clamshell', 'Microgreens', NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000008'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'MICRO-WHEAT', 'Wheatgrass', 'Fresh organic wheatgrass, 16oz tray', 'Microgreens', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Demo User (auth.users — for demo fallback logic)
-- ============================================================
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  'demo@frootful.ai', '',
  NOW(), NOW(), NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Demo User", "avatar_url": ""}',
  false, '', '', '', ''
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = NOW();

-- Link demo user to demo organization
INSERT INTO user_organizations (user_id, organization_id, role, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'admin',
  NOW()
)
ON CONFLICT (user_id, organization_id) DO NOTHING;
