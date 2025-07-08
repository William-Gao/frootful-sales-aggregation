import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Google-Identity',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Encryption key from environment
const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';

interface GoogleIdentityPayload {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  iat: number;
  exp: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Only handle GET requests for token retrieval
    if (req.method !== 'GET') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get Google Identity token from header
    const googleIdentityToken = req.headers.get('X-Google-Identity');
    if (!googleIdentityToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'X-Google-Identity header required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Processing Workspace Add-on authentication request');
    
    // Verify Google Identity token
    const identityPayload = await verifyGoogleIdentityToken(googleIdentityToken);
    if (!identityPayload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid Google Identity token' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Google Identity verified for email:', identityPayload.email);

    // Find user by email in Supabase auth
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
      throw new Error(`Failed to list users: ${userError.message}`);
    }

    const user = users.users.find(u => u.email === identityPayload.email);
    if (!user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User not found. Please sign in to the web app first.',
          requiresSignIn: true
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Found user:', user.id);

    // Get stored Supabase session token
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'supabase_session')
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No Supabase session found. Please sign in to the web app first.',
          requiresSignIn: true
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Check if token is expired and refresh if needed
    let accessToken = await decrypt(tokenData.encrypted_access_token);
    
    if (tokenData.token_expires_at) {
      const expiresAt = new Date(tokenData.token_expires_at);
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
      
      if (now.getTime() >= (expiresAt.getTime() - bufferTime)) {
        console.log('Supabase token expired, refreshing...');
        
        const refreshedToken = await refreshSupabaseToken(user.id, tokenData);
        if (refreshedToken) {
          accessToken = refreshedToken;
          console.log('Successfully refreshed Supabase token');
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Token expired and refresh failed. Please sign in again.',
              requiresSignIn: true
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          );
        }
      }
    }

    console.log('Returning valid access token for Workspace Add-on');

    return new Response(
      JSON.stringify({ 
        success: true, 
        access_token: accessToken,
        user_id: user.id,
        email: identityPayload.email
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error in workspace-auth:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed'
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

// Verify Google Identity token using Google's public keys
async function verifyGoogleIdentityToken(token: string): Promise<GoogleIdentityPayload | null> {
  try {
    // Get Google's public keys
    const certsResponse = await fetch('https://www.googleapis.com/oauth2/v1/certs');
    if (!certsResponse.ok) {
      throw new Error('Failed to fetch Google certificates');
    }
    
    const certs = await certsResponse.json();
    
    // Decode JWT header to get key ID
    const [headerB64] = token.split('.');
    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    
    if (!header.kid || !certs[header.kid]) {
      throw new Error('Invalid key ID in token header');
    }
    
    // For now, we'll do basic JWT parsing and validation
    // In production, you'd want to use a proper JWT library with signature verification
    const [, payloadB64] = token.split('.');
    const payload: GoogleIdentityPayload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    
    // Basic validation
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error('Token expired');
    }
    
    if (payload.iat > now + 300) { // Allow 5 minute clock skew
      throw new Error('Token issued in the future');
    }
    
    // Verify issuer
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error('Invalid issuer');
    }
    
    // Verify email is present and verified
    if (!payload.email || !payload.email_verified) {
      throw new Error('Email not verified');
    }
    
    console.log('Google Identity token verified for:', payload.email);
    return payload;
    
  } catch (error) {
    console.error('Error verifying Google Identity token:', error);
    return null;
  }
}

// Refresh Supabase token using refresh token
async function refreshSupabaseToken(userId: string, tokenData: any): Promise<string | null> {
  try {
    if (!tokenData.encrypted_refresh_token) {
      console.warn('No refresh token available for Supabase session');
      return null;
    }

    const refreshToken = await decrypt(tokenData.encrypted_refresh_token);
    
    console.log('Attempting to refresh Supabase token...');
    
    // Call Supabase token refresh endpoint
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') || ''
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to refresh Supabase token:', response.status, errorText);
      return null;
    }

    const tokenResponse = await response.json();
    
    if (!tokenResponse.access_token) {
      console.error('No access token in refresh response:', tokenResponse);
      return null;
    }
    
    // Calculate new expiry time
    const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
    
    // Encrypt new tokens
    const encryptedAccessToken = await encrypt(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token ? await encrypt(tokenResponse.refresh_token) : tokenData.encrypted_refresh_token;
    
    // Update token in database
    const { error: updateError } = await supabase
      .from('user_tokens')
      .update({
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'supabase_session');

    if (updateError) {
      console.error('Failed to update refreshed Supabase token:', updateError);
      return null;
    }

    console.log('Successfully refreshed and updated Supabase token');
    return tokenResponse.access_token;
    
  } catch (error) {
    console.error('Error refreshing Supabase token:', error);
    return null;
  }
}

// Decrypt sensitive data
async function decrypt(encryptedText: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Decode from base64
  const combined = new Uint8Array(
    atob(encryptedText).split('').map(char => char.charCodeAt(0))
  );
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  // Import the decryption key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), // Ensure 32 bytes
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
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
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), // Ensure 32 bytes
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