import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Business Central OAuth configuration
const CLIENT_ID = Deno.env.get('BC_CLIENT_ID')!;
const TENANT_ID = 'common';
const REDIRECT_URI = 'https://zkglvdfppodwlgzhfgqs.supabase.co/functions/v1/auth-callback';
const SCOPE = 'https://api.businesscentral.dynamics.com/user_impersonation offline_access';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed. Use POST.' }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header provided' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify Supabase token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Invalid Supabase token:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token. Please sign in again.' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Initiating Business Central OAuth for user:', user.id);

    // Generate cryptographically secure state parameter
    const state = generateSecureState();
    console.log('Generated OAuth state:', state);

    // Store state with user_id in database
    const { error: stateError } = await supabase
      .from('oauth_states')
      .insert({
        state: state,
        user_id: user.id,
        provider: 'business_central',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      });

    if (stateError) {
      console.error('Failed to store OAuth state:', stateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to initiate OAuth flow. Please try again.' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Successfully stored OAuth state for user:', user.id);

    // Construct Microsoft OAuth URL with state
    const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
      `client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&state=${state}` +
      `&response_mode=query` +
      `&prompt=select_account`;

    console.log('Generated OAuth URL for Business Central');

    // Return the OAuth URL to the client
    return new Response(
      JSON.stringify({ 
        success: true, 
        authUrl: authUrl,
        state: state // Include state for debugging (optional)
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error in auth-login:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 500
      }
    );
  }
});

// Generate cryptographically secure state parameter
function generateSecureState(): string {
  const array = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}