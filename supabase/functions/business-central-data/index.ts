import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Verify token and get user
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        userId = user.id;
      } else {
        throw new Error('Invalid Supabase token');
      }
    } catch (supabaseError) {
      // Fallback to Google token verification
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
        userId = tokenInfo.sub;
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
    const dataType = url.searchParams.get('type'); // 'customers' or 'items'

    if (!dataType || !['customers', 'items'].includes(dataType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid data type. Use "customers" or "items"' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get Business Central token from stored tokens
    const bcToken = await getBusinessCentralToken(userId);
    if (!bcToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Business Central token not found. Please connect to Business Central first.' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get company ID
    const companyId = await getCompanyId(userId);
    if (!companyId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Company ID not found. Please select a company first.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    let data;
    if (dataType === 'customers') {
      data = await fetchCustomers(bcToken, companyId);
    } else {
      data = await fetchItems(bcToken, companyId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: data
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error fetching Business Central data:', error);
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

async function getBusinessCentralToken(userId: string): Promise<string | null> {
  try {
    // Get Business Central token from user_tokens table
    const { data, error } = await supabase
      .from('user_tokens')
      .select('encrypted_access_token')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data?.encrypted_access_token) {
      console.error('No Business Central token found for user:', userId);
      return null;
    }

    // Decrypt the token
    const decryptedToken = await decrypt(data.encrypted_access_token);
    return decryptedToken;
  } catch (error) {
    console.error('Error getting Business Central token:', error);
    return null;
  }
}

async function getCompanyId(userId: string): Promise<string | null> {
  try {
    // Get company ID from user_tokens table
    const { data, error } = await supabase
      .from('user_tokens')
      .select('company_id')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data?.company_id) {
      console.error('No company ID found for user:', userId);
      return null;
    }

    return data.company_id;
  } catch (error) {
    console.error('Error getting company ID:', error);
    return null;
  }
}

async function decrypt(encryptedText: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  
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
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
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

async function fetchCustomers(token: string, companyId: string): Promise<Customer[]> {
  try {
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch customers: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
}

async function fetchItems(token: string, companyId: string): Promise<Item[]> {
  try {
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/items`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch items: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching items:', error);
    throw error;
  }
}