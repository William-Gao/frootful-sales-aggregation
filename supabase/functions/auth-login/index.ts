// supabase/functions/auth-login/index.ts

import { serve } from 'https://deno.land/std/http/server.ts';

const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID')!;
const TENANT_ID = 'common';
const REDIRECT_URI = 'https://zkglvdfppodwlgzhfgqs.supabase.co/functions/v1/auth-callback';
const SCOPE = 'https://api.businesscentral.dynamics.com/user_impersonation offline_access';

serve((_req) => {
  const state = crypto.randomUUID();

  const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${state}` +
    `&response_mode=query` +
    `&prompt=select_account`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
    },
  });
});