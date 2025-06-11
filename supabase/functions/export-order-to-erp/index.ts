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

interface OrderItem {
  itemName: string;
  quantity: number;
  price: number;
}

interface OrderData {
  customerNumber: string;
  items: OrderItem[];
}

interface TokenData {
  id: string;
  user_id: string;
  provider: string;
  encrypted_access_token: string;
  encrypted_refresh_token?: string;
  token_expires_at?: string;
  tenant_id?: string;
  company_id?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
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

    // Verify token and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (user && !error) {
      userId = user.id;
    } else {
      throw new Error('Invalid Supabase token');
    }

    const { orderData }: { orderData: OrderData } = await req.json();

    if (!orderData || !orderData.customerNumber || !orderData.items || orderData.items.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid order data. Customer number and items are required.' 
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Creating order for customer:', orderData.customerNumber, 'with', orderData.items.length, 'items');

    // Get valid Business Central token (with refresh if needed)
    const bcToken = await getValidBusinessCentralToken(userId);
    if (!bcToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Business Central not connected or token expired. Please reconnect to Business Central.' 
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

    // Get company info
    const { companyId, companyName, tenantId } = await getCompanyInfo(userId);
    if (!companyId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Company not selected. Please select a company in Business Central settings.' 
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Using company:', companyName, 'with ID:', companyId);

    // Step 1: Create Sales Order
    console.log('Creating sales order in Business Central...');
    const orderResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesOrders/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bcToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderDate: new Date().toISOString().split('T')[0],
        customerNumber: orderData.customerNumber,
        currencyCode: "USD"
      })
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Failed to create order:', orderResponse.status, errorText);
      throw new Error(`Failed to create order: ${orderResponse.status} ${orderResponse.statusText}`);
    }

    const order = await orderResponse.json();
    const orderId = order.id;
    const orderNumber = order.number;
    
    console.log('Created order:', orderNumber, 'with ID:', orderId);

    // Step 2: Add Items to Order
    console.log('Adding', orderData.items.length, 'items to order...');
    const addedItems = [];
    
    for (const item of orderData.items) {
      try {
        const lineResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesOrders(${orderId})/salesOrderLines`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${bcToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lineObjectNumber: item.itemName,
            lineType: 'Item',
            quantity: item.quantity,
            unitPrice: item.price
          })
        });

        if (!lineResponse.ok) {
          const errorText = await lineResponse.text();
          console.error(`Failed to add item ${item.itemName}:`, lineResponse.status, errorText);
          throw new Error(`Failed to add item ${item.itemName}: ${lineResponse.status} ${lineResponse.statusText}`);
        }

        const addedItem = await lineResponse.json();
        addedItems.push({
          itemName: item.itemName,
          quantity: item.quantity,
          price: item.price,
          lineId: addedItem.id
        });
        
        console.log(`Added item: ${item.itemName} (qty: ${item.quantity}, price: ${item.price})`);
      } catch (itemError) {
        console.error(`Error adding item ${item.itemName}:`, itemError);
        // Continue with other items even if one fails
      }
    }

    // Generate deep link to the order
    const deepLink = `https://businesscentral.dynamics.com/${tenantId}/Production/?company=${encodeURIComponent(companyName)}&page=42&filter='Sales Header'.'No.' IS '${orderNumber}'`;

    console.log('Order creation completed successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: orderNumber,
        orderId: orderId,
        deepLink: deepLink,
        addedItems: addedItems,
        message: `Successfully created order #${orderNumber} with ${addedItems.length} items`
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error creating order:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while creating order'
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

// Get valid Business Central token with automatic refresh - FIXED VERSION
async function getValidBusinessCentralToken(userId: string): Promise<string | null> {
  try {
    console.log('Getting Business Central token for user:', userId);
    
    // Get current token data
    const { data, error } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data) {
      console.log('No Business Central token found for user');
      return null;
    }

    const tokenData: TokenData = data;
    
    // Check if token is expired
    if (tokenData.token_expires_at) {
      const expiresAt = new Date(tokenData.token_expires_at);
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
      
      if (now.getTime() >= (expiresAt.getTime() - bufferTime)) {
        console.log('Business Central token is expired or expiring soon, attempting refresh...');
        
        // Try to refresh the token
        const refreshedToken = await refreshBusinessCentralToken(userId, tokenData);
        if (refreshedToken) {
          console.log('Successfully refreshed Business Central token');
          return refreshedToken;
        } else {
          console.warn('Failed to refresh Business Central token');
          return null;
        }
      }
    }

    // Token is still valid, decrypt and return
    const decryptedToken = await decrypt(tokenData.encrypted_access_token);
    console.log('Using existing valid Business Central token');
    return decryptedToken;
    
  } catch (error) {
    console.error('Error getting valid Business Central token:', error);
    return null;
  }
}

// Refresh Business Central token using refresh token - FIXED VERSION
async function refreshBusinessCentralToken(userId: string, tokenData: TokenData): Promise<string | null> {
  try {
    if (!tokenData.encrypted_refresh_token || !tokenData.tenant_id) {
      console.warn('No refresh token or tenant ID available for Business Central');
      return null;
    }

    const refreshToken = await decrypt(tokenData.encrypted_refresh_token);
    const clientId = Deno.env.get('BC_CLIENT_ID');
    const clientSecret = Deno.env.get('BC_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      console.error('BC_CLIENT_ID or BC_CLIENT_SECRET not configured');
      return null;
    }

    console.log('Attempting to refresh Business Central token...');
    console.log('Tenant ID:', tokenData.tenant_id);
    console.log('Client ID:', clientId);
    
    // Microsoft OAuth2 token refresh - Fixed format
    const tokenUrl = `https://login.microsoftonline.com/${tokenData.tenant_id}/oauth2/v2.0/token`;
    const requestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.businesscentral.dynamics.com/user_impersonation offline_access'
    });

    console.log('Token refresh URL:', tokenUrl);
    console.log('Request body params:', Object.fromEntries(requestBody.entries()));

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: requestBody
    });

    const responseText = await response.text();
    console.log('Token refresh response status:', response.status);
    console.log('Token refresh response:', responseText);

    if (!response.ok) {
      console.error('Failed to refresh Business Central token:', response.status, response.statusText);
      console.error('Response body:', responseText);
      return null;
    }

    let tokenResponse;
    try {
      tokenResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse token response:', parseError);
      return null;
    }

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
      .eq('provider', 'business_central');

    if (updateError) {
      console.error('Failed to update refreshed Business Central token:', updateError);
      return null;
    }

    console.log('Successfully refreshed and updated Business Central token');
    return tokenResponse.access_token;
    
  } catch (error) {
    console.error('Error refreshing Business Central token:', error);
    return null;
  }
}

// Get company information
async function getCompanyInfo(userId: string): Promise<{ companyId: string | null; companyName: string | null; tenantId: string | null }> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('company_id, company_name, tenant_id')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data) {
      return { companyId: null, companyName: null, tenantId: null };
    }

    return {
      companyId: data.company_id,
      companyName: data.company_name,
      tenantId: data.tenant_id
    };
  } catch (error) {
    console.error('Error getting company info:', error);
    return { companyId: null, companyName: null, tenantId: null };
  }
}

// Encryption functions
async function encrypt(text: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  
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

// Decrypt function
async function decrypt(encryptedText: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  
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