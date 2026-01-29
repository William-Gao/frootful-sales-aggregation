-- Create demo user and set up fallback logic for unknown users/emails
-- Demo Organization ID: 00000000-0000-0000-0000-000000000001

-- Create a demo user in auth.users (if not exists)
-- Note: This creates a user that can be referenced but cannot log in
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'demo@frootful.ai',
  '', -- No password - cannot log in directly
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Demo User", "avatar_url": ""}',
  false,
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
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

-- Create a table to log demo fallback events
CREATE TABLE IF NOT EXISTS demo_fallback_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_email text,
  original_phone text,
  intake_event_id uuid REFERENCES intake_events(id),
  order_id uuid REFERENCES orders(id),
  proposal_id uuid REFERENCES order_change_proposals(id),
  reason text NOT NULL, -- 'user_not_found', 'org_not_found', 'explicit_demo', etc.
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW()
);

-- Index for querying logs
CREATE INDEX IF NOT EXISTS idx_demo_fallback_logs_created_at ON demo_fallback_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_fallback_logs_reason ON demo_fallback_logs(reason);

-- Enable RLS
ALTER TABLE demo_fallback_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage demo_fallback_logs"
ON demo_fallback_logs FOR ALL
USING (true);

-- Allow public read for demo transparency
CREATE POLICY "Public can read demo_fallback_logs"
ON demo_fallback_logs FOR SELECT
USING (true);

-- Create a function to get organization for email/phone with demo fallback
CREATE OR REPLACE FUNCTION get_organization_with_demo_fallback(
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_log_reason text DEFAULT 'auto'
)
RETURNS TABLE (
  organization_id uuid,
  user_id uuid,
  is_demo_fallback boolean,
  log_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_is_demo boolean := false;
  v_log_id uuid;
  v_reason text;
BEGIN
  -- Try to find user by email first
  IF p_email IS NOT NULL THEN
    SELECT au.id INTO v_user_id
    FROM auth.users au
    WHERE LOWER(au.email) = LOWER(p_email)
    LIMIT 1;
  END IF;

  -- If not found by email, try phone
  IF v_user_id IS NULL AND p_phone IS NOT NULL THEN
    SELECT au.id INTO v_user_id
    FROM auth.users au
    WHERE au.phone = p_phone
       OR au.raw_user_meta_data->>'phone' = p_phone
    LIMIT 1;
  END IF;

  -- If user found, get their organization
  IF v_user_id IS NOT NULL THEN
    SELECT uo.organization_id INTO v_org_id
    FROM user_organizations uo
    WHERE uo.user_id = v_user_id
    LIMIT 1;

    -- User exists but has no org - use demo
    IF v_org_id IS NULL THEN
      v_is_demo := true;
      v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
      v_user_id := '00000000-0000-0000-0000-000000000002'::uuid;
      v_reason := 'user_has_no_org';
    END IF;
  ELSE
    -- No user found - use demo
    v_is_demo := true;
    v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
    v_user_id := '00000000-0000-0000-0000-000000000002'::uuid;
    v_reason := 'user_not_found';
  END IF;

  -- Log if this was a demo fallback
  IF v_is_demo THEN
    INSERT INTO demo_fallback_logs (original_email, original_phone, reason, metadata)
    VALUES (
      p_email,
      p_phone,
      COALESCE(v_reason, p_log_reason),
      jsonb_build_object(
        'timestamp', NOW(),
        'resolved_org_id', v_org_id,
        'resolved_user_id', v_user_id
      )
    )
    RETURNING id INTO v_log_id;

    RAISE NOTICE '[DEMO FALLBACK] Email: %, Phone: %, Reason: %, Log ID: %',
      COALESCE(p_email, 'N/A'),
      COALESCE(p_phone, 'N/A'),
      v_reason,
      v_log_id;
  END IF;

  RETURN QUERY SELECT v_org_id, v_user_id, v_is_demo, v_log_id;
END;
$$;

-- Grant execute to service role and anon
GRANT EXECUTE ON FUNCTION get_organization_with_demo_fallback TO service_role;
GRANT EXECUTE ON FUNCTION get_organization_with_demo_fallback TO anon;

COMMENT ON FUNCTION get_organization_with_demo_fallback IS
'Looks up organization for a given email/phone. Falls back to demo organization if user not found. Logs all fallback events.';

COMMENT ON TABLE demo_fallback_logs IS
'Logs all cases where an incoming message was routed to the demo organization due to unknown user/email';
