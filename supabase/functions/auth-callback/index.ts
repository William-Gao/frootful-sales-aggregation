// supabase/functions/auth-callback/index.ts

import { serve } from 'https://deno.land/std/http/server.ts';

const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET')!;
const REDIRECT_URI = 'https://zkglvdfppodwlgzhfgqs.supabase.co/functions/v1/auth-callback';
const TENANT_ID = 'common';

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing auth code', { status: 400 });
  }

  const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'https://api.businesscentral.dynamics.com/user_impersonation offline_access',
    }),
  });

  const tokenData = await tokenResp.json();

  if (!tokenResp.ok) {
    return new Response(`Failed to fetch token: ${JSON.stringify(tokenData)}`, { status: 500 });
  }

  // Save tokenData securely somewhere: Supabase Auth, DB, encrypted cookie, etc.
  // For now, just return it for debug (not production safe)
  return new Response(JSON.stringify(tokenData, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});