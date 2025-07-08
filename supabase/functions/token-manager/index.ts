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
    // Get user from JWT token
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