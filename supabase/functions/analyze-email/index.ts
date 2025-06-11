import OpenAI from 'npm:openai@4.28.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
  customerPricingGroup?: string;
  customerPricingGroupName?: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
  customerPrice?: number;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
    unitPrice: number;
    customerPrice?: number;
  };
}

interface GmailResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{
      name: string;
      value: string;
    }>;
    body?: {
      data?: string;
    };
    parts?: Array<{
      mimeType?: string;
      body?: {
        data?: string;
      };
      parts?: any[];
    }>;
  };
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
    const { emailId } = await req.json();

    if (!emailId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email ID is required' }),
        {
          status: 400,
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

    console.log('Starting comprehensive email analysis for user:', userId);

    // Step 1: Extract email from Gmail (with token refresh)
    console.log('Step 1: Extracting email from Gmail...');
    const emailData = await extractEmailFromGmail(emailId, userId);
    
    // Step 2: Get Business Central data (customers with pricing groups)
    console.log('Step 2: Fetching Business Central customers with pricing groups...');
    const customers = await fetchCustomersFromBC(userId);

    // Step 3: Find matching customer by email
    console.log('Step 3: Finding matching customer...');
    const senderEmail = emailData.from.match(/<(.+?)>/)?.[1] || emailData.from;
    const matchingCustomer = customers.find(c => c.email === senderEmail);

    // Step 4: Get items with customer-specific pricing if customer found
    console.log('Step 4: Fetching items with customer-specific pricing...');
    let items: Item[] = [];
    if (matchingCustomer) {
      console.log(`Found matching customer: ${matchingCustomer.displayName} (Pricing Group: ${matchingCustomer.customerPricingGroupName || 'None'})`);
      items = await fetchItemsWithCustomerPricing(userId, matchingCustomer.number);
    } else {
      console.log('No matching customer found, using standard pricing');
      items = await fetchItemsFromBC(userId);
    }

    // Step 5: Analyze email content and match items using AI
    console.log('Step 5: Analyzing email content with AI...');
    const analyzedItems = await analyzeEmailWithAI(emailData.body, items);

    console.log('Analysis complete! Found', analyzedItems.length, 'items');

    return new Response(JSON.stringify({
      success: true,
      data: {
        email: emailData,
        customers: customers,
        items: items,
        matchingCustomer: matchingCustomer,
        analyzedItems: analyzedItems
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error in comprehensive email analysis:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
      status: 500
    });
  }
});

// Extract email from Gmail API with token refresh
async function extractEmailFromGmail(emailId: string, userId: string): Promise<EmailData> {
  const googleToken = await getValidGoogleToken(userId);
  if (!googleToken) {
    throw new Error('Google token not found or could not be refreshed. Please sign in again.');
  }

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`, {
    headers: {
      Authorization: `Bearer ${googleToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch email: ${response.status}`);
  }
  
  const emailData: GmailResponse = await response.json();
  return parseEmailData(emailData);
}

// Fetch customers from Business Central with pricing groups
async function fetchCustomersFromBC(userId: string): Promise<Customer[]> {
  const bcToken = await getValidBusinessCentralToken(userId);
  if (!bcToken) {
    console.warn('Business Central token not found or could not be refreshed, returning empty customers list');
    return [];
  }

  const companyId = await getCompanyId(userId);
  if (!companyId) {
    console.warn('Company ID not found, returning empty customers list');
    return [];
  }

  try {
    // Use the business-central-data endpoint to get customers with pricing groups
    const response = await fetch(`${supabaseUrl}/functions/v1/business-central-data?type=customers`, {
      headers: {
        'Authorization': `Bearer ${await getSupabaseToken(userId)}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch customers: ${response.status} ${response.statusText}`);
      return [];
    }

    const result = await response.json();
    if (!result.success) {
      console.warn('Failed to fetch customers:', result.error);
      return [];
    }

    return result.data || [];
  } catch (error) {
    console.warn('Error fetching customers:', error);
    return [];
  }
}

// Fetch items from Business Central with customer-specific pricing
async function fetchItemsWithCustomerPricing(userId: string, customerNumber: string): Promise<Item[]> {
  try {
    // Use the business-central-data endpoint to get items with customer pricing
    const response = await fetch(`${supabaseUrl}/functions/v1/business-central-data?type=items&customerNumber=${encodeURIComponent(customerNumber)}`, {
      headers: {
        'Authorization': `Bearer ${await getSupabaseToken(userId)}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch items with customer pricing: ${response.status} ${response.statusText}`);
      return await fetchItemsFromBC(userId); // Fallback to standard pricing
    }

    const result = await response.json();
    if (!result.success) {
      console.warn('Failed to fetch items with customer pricing:', result.error);
      return await fetchItemsFromBC(userId); // Fallback to standard pricing
    }

    return result.data || [];
  } catch (error) {
    console.warn('Error fetching items with customer pricing:', error);
    return await fetchItemsFromBC(userId); // Fallback to standard pricing
  }
}

// Fetch items from Business Central with standard pricing
async function fetchItemsFromBC(userId: string): Promise<Item[]> {
  try {
    // Use the business-central-data endpoint to get items with standard pricing
    const response = await fetch(`${supabaseUrl}/functions/v1/business-central-data?type=items`, {
      headers: {
        'Authorization': `Bearer ${await getSupabaseToken(userId)}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch items: ${response.status} ${response.statusText}`);
      return [];
    }

    const result = await response.json();
    if (!result.success) {
      console.warn('Failed to fetch items:', result.error);
      return [];
    }

    return result.data || [];
  } catch (error) {
    console.warn('Error fetching items:', error);
    return [];
  }
}

// Get Supabase token for internal API calls
async function getSupabaseToken(userId: string): Promise<string> {
  // For internal calls, we can use the service role key or create a session token
  // For now, we'll use a simple approach - in production, you might want to create a proper session token
  const { data, error } = await supabase.auth.admin.generateAccessToken(userId);
  if (error || !data) {
    throw new Error('Failed to generate access token for internal API call');
  }
  return data.access_token;
}

// Get valid Google token with automatic refresh
async function getValidGoogleToken(userId: string): Promise<string | null> {
  try {
    console.log('Getting Google token for user:', userId);
    
    // Get current token data
    const { data, error } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (error || !data) {
      console.log('No Google token found for user');
      return null;
    }

    const tokenData: TokenData = data;
    
    // Check if token is expired
    if (tokenData.token_expires_at) {
      const expiresAt = new Date(tokenData.token_expires_at);
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
      
      if (now.getTime() >= (expiresAt.getTime() - bufferTime)) {
        console.log('Google token is expired or expiring soon, attempting refresh...');
        
        // Try to refresh the token
        const refreshedToken = await refreshGoogleToken(userId, tokenData);
        if (refreshedToken) {
          console.log('Successfully refreshed Google token');
          return refreshedToken;
        } else {
          console.warn('Failed to refresh Google token');
          return null;
        }
      }
    }

    // Token is still valid, decrypt and return
    const decryptedToken = await decrypt(tokenData.encrypted_access_token);
    console.log('Using existing valid Google token');
    return decryptedToken;
    
  } catch (error) {
    console.error('Error getting valid Google token:', error);
    return null;
  }
}

// Get valid Business Central token with automatic refresh
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

// Refresh Google token using refresh token
async function refreshGoogleToken(userId: string, tokenData: TokenData): Promise<string | null> {
  try {
    if (!tokenData.encrypted_refresh_token) {
      console.warn('No refresh token available for Google');
      return null;
    }

    const refreshToken = await decrypt(tokenData.encrypted_refresh_token);
    
    // Google OAuth2 token refresh
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh Google token:', response.status, response.statusText);
      return null;
    }

    const tokenResponse = await response.json();
    
    // Calculate new expiry time
    const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
    
    // Encrypt new access token
    const encryptedAccessToken = await encrypt(tokenResponse.access_token);
    
    // Update token in database
    const { error: updateError } = await supabase
      .from('user_tokens')
      .update({
        encrypted_access_token: encryptedAccessToken,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'google');

    if (updateError) {
      console.error('Failed to update refreshed Google token:', updateError);
      return null;
    }

    console.log('Successfully refreshed and updated Google token');
    return tokenResponse.access_token;
    
  } catch (error) {
    console.error('Error refreshing Google token:', error);
    return null;
  }
}

// Refresh Business Central token using refresh token
async function refreshBusinessCentralToken(userId: string, tokenData: TokenData): Promise<string | null> {
  try {
    if (!tokenData.encrypted_refresh_token || !tokenData.tenant_id) {
      console.warn('No refresh token or tenant ID available for Business Central');
      return null;
    }

    const refreshToken = await decrypt(tokenData.encrypted_refresh_token);
    
    // Microsoft OAuth2 token refresh
    const response = await fetch(`https://login.microsoftonline.com/${tokenData.tenant_id}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: Deno.env.get('BC_CLIENT_ID') || '',
        client_secret: Deno.env.get('BC_CLIENT_SECRET') || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://api.businesscentral.dynamics.com/user_impersonation offline_access',
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh Business Central token:', response.status, response.statusText);
      return null;
    }

    const tokenResponse = await response.json();
    
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

// Analyze email content with AI (updated to include customer pricing)
async function analyzeEmailWithAI(emailContent: string, items: Item[]): Promise<AnalyzedItem[]> {
  if (items.length === 0) {
    console.warn('No items available for analysis');
    return [];
  }

  try {
    const itemsList = items.map((item: Item) => ({
      id: item.id,
      number: item.number,
      displayName: item.displayName,
      unitPrice: item.unitPrice,
      customerPrice: item.customerPrice || item.unitPrice
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from emails and matches them to a list of available items. Here is the list of available items with pricing: ${JSON.stringify(itemsList)}`
        },
        {
          role: 'user',
          content: `Extract products with quantities from this email and match them to the available items list. For each product found, find the best matching item from the available items list. Use the customerPrice if available, otherwise use unitPrice.

Email content:
${emailContent}

Return the data in JSON format with the following structure:
{
  "orderLines": [{
    "itemName": "extracted item name from email",
    "quantity": number,
    "matchedItem": {
      "id": "matched item id",
      "number": "matched item number",
      "displayName": "matched item display name",
      "unitPrice": number,
      "customerPrice": number
    }
  }]
}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    return analysis.orderLines || [];
  } catch (error) {
    console.error('Error analyzing email with AI:', error);
    return [];
  }
}

// Helper functions for basic token operations
async function getCompanyId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('company_id')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data?.company_id) {
      return null;
    }

    return data.company_id;
  } catch (error) {
    console.error('Error getting company ID:', error);
    return null;
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

// Parse Gmail API response
function parseEmailData(emailData: GmailResponse): EmailData {
  const headers: Record<string, string> = {};
  
  if (emailData.payload && emailData.payload.headers) {
    emailData.payload.headers.forEach(header => {
      headers[header.name.toLowerCase()] = header.value;
    });
  }
  
  let body = '';
  
  function extractBodyParts(part: any): void {
    if (part.body && part.body.data) {
      const decodedData = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      body += decodedData;
    }
    
    if (part.parts) {
      part.parts.forEach((subPart: any) => {
        if (subPart.mimeType === 'text/html') {
          extractBodyParts(subPart);
        }
      });
      
      if (!body) {
        part.parts.forEach((subPart: any) => {
          if (subPart.mimeType === 'text/plain') {
            extractBodyParts(subPart);
          }
        });
      }
    }
  }
  
  if (emailData.payload) {
    extractBodyParts(emailData.payload);
  }
  
  return {
    id: emailData.id,
    threadId: emailData.threadId,
    labelIds: emailData.labelIds || [],
    snippet: emailData.snippet || '',
    subject: headers.subject || '',
    from: headers.from || '',
    to: headers.to || '',
    date: headers.date || '',
    body: body
  };
}