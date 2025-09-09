import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Business Central OAuth configuration
const CLIENT_ID = Deno.env.get('BC_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('BC_CLIENT_SECRET')!;
const REDIRECT_URI = 'https://zkglvdfppodwlgzhfgqs.supabase.co/functions/v1/auth-callback';
const TENANT_ID = 'common';

// Encryption key from environment
const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface JWTPayload {
  tid: string; // tenant ID
  oid: string; // object ID (user ID)
  upn?: string; // user principal name
  email?: string;
  name?: string;
  [key: string]: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    console.log('Business Central OAuth callback received');
    console.log('Code present:', !!code);
    console.log('State present:', !!state);
    console.log('Error:', error);

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      return new Response(
        `OAuth Error: ${error} - ${errorDescription || 'Unknown error'}`,
        { 
          status: 400,
          headers: corsHeaders
        }
      );
    }

    if (!code || !state) {
      return new Response('Missing authorization code or state parameter', { 
        status: 400,
        headers: corsHeaders
      });
    }

    console.log('Retrieving user ID from OAuth state:', state);

    // Retrieve user_id from oauth_states table using the state parameter
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('user_id, created_at, expires_at')
      .eq('state', state)
      .eq('provider', 'business_central')
      .single();

    if (stateError || !stateData) {
      console.error('Invalid or expired OAuth state:', stateError);
      return new Response(
        'Invalid or expired OAuth state. Please try the connection process again.',
        { 
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Check if state has expired
    const now = new Date();
    const expiresAt = new Date(stateData.expires_at);
    if (now > expiresAt) {
      console.error('OAuth state has expired');
      
      // Clean up expired state
      await supabase
        .from('oauth_states')
        .delete()
        .eq('state', state);

      return new Response(
        'OAuth state has expired. Please try the connection process again.',
        { 
          status: 400,
          headers: corsHeaders
        }
      );
    }

    const userId = stateData.user_id;
    console.log('Found user ID from OAuth state:', userId);

    // Clean up the state immediately after successful retrieval
    const { error: deleteError } = await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);

    if (deleteError) {
      console.warn('Failed to clean up OAuth state:', deleteError);
      // Continue anyway - this is not critical
    } else {
      console.log('Successfully cleaned up OAuth state');
    }

    console.log('Exchanging authorization code for tokens...');

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
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

    const responseText = await tokenResponse.text();
    console.log('Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', responseText);
      return new Response(
        `Failed to exchange code for tokens: ${tokenResponse.status} - ${responseText}`,
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    let tokenData: TokenResponse;
    try {
      tokenData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse token response:', parseError);
      return new Response(
        'Failed to parse token response',
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    if (!tokenData.access_token || !tokenData.refresh_token) {
      console.error('Missing tokens in response:', tokenData);
      return new Response(
        'Missing access or refresh token in response',
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    console.log('Successfully received tokens from Microsoft');
    console.log('Access token length:', tokenData.access_token.length);
    console.log('Refresh token length:', tokenData.refresh_token.length);
    console.log('Expires in:', tokenData.expires_in, 'seconds');

    // Parse tenant ID from access token
    const tenantId = await parseTenantIdFromToken(tokenData.access_token);
    console.log('Extracted tenant ID:', tenantId);

    if (!tenantId) {
      console.error('Failed to extract tenant ID from access token');
      return new Response(
        'Failed to extract tenant ID from token',
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    console.log('Token expires at:', expiresAt.toISOString());

    // Store tokens securely using encryption
    console.log('Storing Business Central tokens securely for user:', userId);
    
    const encryptedAccessToken = await encrypt(tokenData.access_token);
    const encryptedRefreshToken = await encrypt(tokenData.refresh_token);

    // Store in user_tokens table using the user_id from oauth_states
    const { data: storedToken, error: storeError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: userId, // Use the user_id from oauth_states, not from email lookup
        provider: 'business_central',
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt.toISOString(),
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      })
      .select();

    if (storeError) {
      console.error('Failed to store tokens:', storeError);
      return new Response(
        `Failed to store tokens: ${storeError.message}`,
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    console.log('Successfully stored Business Central tokens for user:', userId);

    // Verify storage by attempting to decrypt
    try {
      const testDecrypt = await decrypt(encryptedAccessToken);
      console.log('Token storage verification successful');
    } catch (decryptError) {
      console.error('Token storage verification failed:', decryptError);
      return new Response(
        'Token storage verification failed',
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    // Load available companies for the user
    console.log('Loading available Business Central companies...');
    const companies = await loadCompanies(tokenData.access_token);
    console.log(`Found ${companies.length} companies`);

    // If only one company, auto-select it
    if (companies.length === 1) {
      const company = companies[0];
      console.log('Auto-selecting single company:', company.displayName);
      
      const { error: updateError } = await supabase
        .from('user_tokens')
        .update({
          company_id: company.id,
          company_name: company.displayName || company.name,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('provider', 'business_central');

      if (updateError) {
        console.warn('Failed to auto-select company:', updateError);
      } else {
        console.log('Successfully auto-selected company');
      }
    }

    // Redirect to dashboard with success message
    const dashboardUrl = 'https://use.frootful.ai/dashboard?bc_connected=true';
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': dashboardUrl,
      },
    });

  } catch (error) {
    console.error('Error in auth-callback:', error);
    return new Response(
      `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
});

// Parse tenant ID from JWT access token
async function parseTenantIdFromToken(accessToken: string): Promise<string | null> {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const tokenData: JWTPayload = JSON.parse(decodedPayload);
    
    return tokenData.tid || null;
  } catch (error) {
    console.error('Error parsing tenant ID from access token:', error);
    return null;
  }
}

// Load companies from Business Central
async function loadCompanies(accessToken: string): Promise<any[]> {
  try {
    const response = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch companies: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.warn('Error loading companies:', error);
    return [];
  }
}

// Encrypt sensitive data
async function encrypt(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Import the encryption key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return base64 encoded result
  return btoa(String.fromCharCode(...combined));
}

// Decrypt sensitive data
async function decrypt(encryptedText: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = new Uint8Array(
    atob(encryptedText).split('').map(char => char.charCodeAt(0))
  );
  
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}