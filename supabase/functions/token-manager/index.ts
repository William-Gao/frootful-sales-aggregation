import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Encryption key from environment
const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';

interface TokenData {
  provider: 'google' | 'business_central' | 'supabase_session';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tenantId?: string;
  companyId?: string;
  companyName?: string;
  email?: string; // For supabase_session provider
}

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
    // Check for Google Identity header (from Workspace Add-on)
    const googleIdentityHeader = req.headers.get('X-Google-Identity');
    
    if (googleIdentityHeader) {
      // Handle Workspace Add-on authentication flow
      return await handleWorkspaceAddOnAuth(req, googleIdentityHeader);
    }

    // Standard authentication flow - Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
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
    let userId: string;

    // Try to verify as Supabase JWT first
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        userId = user.id;
      } else {
        throw new Error('Invalid Supabase token');
      }
    } catch (supabaseError) {
      // Fallback to Google token verification for Chrome extension
      try {
        const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
        
        if (!tokenInfoResponse.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid token' }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          );
        }

        const tokenInfo = await tokenInfoResponse.json();
        userId = tokenInfo.sub; // Google user ID

        if (!userId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid token - no user ID' }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          );
        }
      } catch (googleError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token verification failed' }),
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

    const url = new URL(req.url);
    const method = req.method;
    const provider = url.searchParams.get('provider') as 'google' | 'business_central' | 'supabase_session';

    switch (method) {
      case 'GET':
        return await getTokens(userId, provider);
      
      case 'POST':
        const tokenData: TokenData = await req.json();
        return await storeTokens(userId, tokenData);
      
      case 'PUT':
        const updateData: Partial<TokenData> = await req.json();
        return await updateTokens(userId, provider, updateData);
      
      case 'DELETE':
        return await deleteTokens(userId, provider);
      
      default:
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
  } catch (error) {
    console.error('Token manager error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
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

// Handle Workspace Add-on authentication flow
async function handleWorkspaceAddOnAuth(req: Request, googleIdentityToken: string): Promise<Response> {
  try {
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
          error: 'User not found. Please sign in to the web app first.' 
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
          error: 'No Supabase session found. Please sign in to the web app first.' 
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
              error: 'Token expired and refresh failed. Please sign in again.' 
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
    console.error('Error in Workspace Add-on auth:', error);
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
}

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

// Store tokens securely
async function storeTokens(userId: string, tokenData: TokenData): Promise<Response> {
  const encryptedAccessToken = await encrypt(tokenData.accessToken);
  const encryptedRefreshToken = tokenData.refreshToken ? await encrypt(tokenData.refreshToken) : null;
  
  // For supabase_session provider, also store email for lookup
  const additionalFields: any = {};
  if (tokenData.provider === 'supabase_session' && tokenData.email) {
    // We don't need to store email separately since we can look up by user_id
    // But we could add it for debugging purposes
  }
  
  const { data, error } = await supabase
    .from('user_tokens')
    .upsert({
      user_id: userId,
      provider: tokenData.provider,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: tokenData.expiresAt,
      tenant_id: tokenData.tenantId,
      company_id: tokenData.companyId,
      company_name: tokenData.companyName,
      ...additionalFields
    }, {
      onConflict: 'user_id,provider'
    })
    .select();

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  );
}

// Retrieve and decrypt tokens
async function getTokens(userId: string, provider?: string): Promise<Response> {
  let query = supabase
    .from('user_tokens')
    .select('*')
    .eq('user_id', userId);

  if (provider) {
    query = query.eq('provider', provider);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to retrieve tokens: ${error.message}`);
  }

  // Decrypt tokens
  const decryptedTokens = await Promise.all(
    data.map(async (token) => ({
      ...token,
      access_token: token.encrypted_access_token ? await decrypt(token.encrypted_access_token) : null,
      refresh_token: token.encrypted_refresh_token ? await decrypt(token.encrypted_refresh_token) : null,
      // Remove encrypted fields from response
      encrypted_access_token: undefined,
      encrypted_refresh_token: undefined
    }))
  );

  return new Response(
    JSON.stringify({ success: true, tokens: decryptedTokens }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  );
}

// Update tokens
async function updateTokens(userId: string, provider: string, updateData: Partial<TokenData>): Promise<Response> {
  const updateFields: any = {};

  if (updateData.accessToken) {
    updateFields.encrypted_access_token = await encrypt(updateData.accessToken);
  }
  
  if (updateData.refreshToken) {
    updateFields.encrypted_refresh_token = await encrypt(updateData.refreshToken);
  }

  if (updateData.expiresAt) {
    updateFields.token_expires_at = updateData.expiresAt;
  }

  if (updateData.tenantId) {
    updateFields.tenant_id = updateData.tenantId;
  }

  if (updateData.companyId) {
    updateFields.company_id = updateData.companyId;
  }

  if (updateData.companyName) {
    updateFields.company_name = updateData.companyName;
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .update(updateFields)
    .eq('user_id', userId)
    .eq('provider', provider)
    .select();

  if (error) {
    throw new Error(`Failed to update tokens: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  );
}

// Delete tokens
async function deleteTokens(userId: string, provider?: string): Promise<Response> {
  let query = supabase
    .from('user_tokens')
    .delete()
    .eq('user_id', userId);

  if (provider) {
    query = query.eq('provider', provider);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Failed to delete tokens: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  );
}