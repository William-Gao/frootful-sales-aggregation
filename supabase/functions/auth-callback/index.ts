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

    if (!code) {
      return new Response('Missing authorization code', { 
        status: 400,
        headers: corsHeaders
      });
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

    // Parse tenant ID and user info from access token
    const { tenantId, userEmail } = await parseAccessToken(tokenData.access_token);
    console.log('Extracted tenant ID:', tenantId);
    console.log('Extracted user email:', userEmail);

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

    // Find user by email in Supabase auth
    const user = await findUserByEmail(userEmail);
    if (!user) {
      console.error('User not found in Supabase:', userEmail);
      return new Response(
        `User not found. Please sign in to Frootful first with email: ${userEmail}`,
        { 
          status: 404,
          headers: corsHeaders
        }
      );
    }

    console.log('Found Supabase user:', user.id);

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    console.log('Token expires at:', expiresAt.toISOString());

    // Store tokens securely using encryption
    console.log('Storing Business Central tokens securely...');
    
    const encryptedAccessToken = await encrypt(tokenData.access_token);
    const encryptedRefreshToken = await encrypt(tokenData.refresh_token);

    // Store in user_tokens table
    const { data: storedToken, error: storeError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: user.id,
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

    console.log('Successfully stored Business Central tokens');

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
        .eq('user_id', user.id)
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

// Parse access token to extract tenant ID and user info
async function parseAccessToken(accessToken: string): Promise<{ tenantId: string | null; userEmail: string | null }> {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const tokenData: JWTPayload = JSON.parse(decodedPayload);
    
    return {
      tenantId: tokenData.tid || null,
      userEmail: tokenData.upn || tokenData.email || null
    };
  } catch (error) {
    console.error('Error parsing access token:', error);
    return { tenantId: null, userEmail: null };
  }
}

// Find user by email in Supabase auth
async function findUserByEmail(email: string | null): Promise<any> {
  if (!email) {
    return null;
  }

  try {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error('Failed to list users:', error);
      return null;
    }

    return users.users.find(u => u.email === email) || null;
  } catch (error) {
    console.error('Error finding user by email:', error);
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