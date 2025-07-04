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
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
    unitPrice: number;
  };
}

interface AnalysisResult {
  orderLines: AnalyzedItem[];
  requestedDeliveryDate?: string; // ISO date string
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
    
    // Step 2: Get Business Central data (customers) - call BC directly
    console.log('Step 2: Fetching Business Central customers...');
    const customers = await fetchCustomersFromBC(userId);

    // Step 3: Find matching customer by email
    console.log('Step 3: Finding matching customer...');
    const senderEmail = emailData.from.match(/<(.+?)>/)?.[1] || emailData.from;
    const matchingCustomer = customers.find(c => c.email === senderEmail);

    // Step 4: Get items - call BC directly
    console.log('Step 4: Fetching items...');
    const items = await fetchItemsFromBC(userId);

    // Step 5: Analyze email content and match items using AI (now includes delivery date)
    console.log('Step 5: Analyzing email content with AI...');
    const analysisResult = await analyzeEmailWithAI(emailData.body, items);

    console.log('Analysis complete! Found', analysisResult.orderLines.length, 'items');
    if (analysisResult.requestedDeliveryDate) {
      console.log('Requested delivery date:', analysisResult.requestedDeliveryDate);
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        email: emailData,
        customers: customers,
        items: items,
        matchingCustomer: matchingCustomer,
        analyzedItems: analysisResult.orderLines,
        requestedDeliveryDate: analysisResult.requestedDeliveryDate
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

// Fetch customers from Business Central directly
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
    console.log('Fetching customers directly from Business Central API...');
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers`, {
      headers: {
        'Authorization': `Bearer ${bcToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch customers: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const customers = data.value || [];
    
    console.log(`Fetched ${customers.length} customers from Business Central`);
    return customers.map((customer: any) => ({
      id: customer.id,
      number: customer.number,
      displayName: customer.displayName,
      email: customer.email
    }));
  } catch (error) {
    console.warn('Error fetching customers:', error);
    return [];
  }
}

// Fetch items from Business Central directly
async function fetchItemsFromBC(userId: string): Promise<Item[]> {
  const bcToken = await getValidBusinessCentralToken(userId);
  if (!bcToken) {
    console.warn('Business Central token not found or could not be refreshed, returning empty items list');
    return [];
  }

  const companyId = await getCompanyId(userId);
  if (!companyId) {
    console.warn('Company ID not found, returning empty items list');
    return [];
  }

  try {
    console.log('Fetching items directly from Business Central API...');
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/items`, {
      headers: {
        'Authorization': `Bearer ${bcToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch items: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const items = data.value || [];
    
    console.log(`Fetched ${items.length} items from Business Central`);
    return items.map((item: any) => ({
      id: item.id,
      number: item.number,
      displayName: item.displayName,
      unitPrice: item.unitPrice
    }));
  } catch (error) {
    console.warn('Error fetching items:', error);
    return [];
  }
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

// Analyze email content with AI - now includes delivery date extraction and current date
async function analyzeEmailWithAI(emailContent: string, items: Item[]): Promise<AnalysisResult> {
  if (items.length === 0) {
    console.warn('No items available for analysis');
    return { orderLines: [] };
  }

  try {
    const itemsList = items.map((item: Item) => ({
      id: item.id,
      number: item.number,
      displayName: item.displayName,
      unitPrice: item.unitPrice
    }));

    // Get current date for context
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from emails and matches them to a list of available items. Here is the list of available items: ${JSON.stringify(itemsList)}

IMPORTANT: Today's date is ${currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context. If a date appears to be from a past year (like 2022), interpret it as the current year (2025) instead.`
        },
        {
          role: 'user',
          content: `Extract products with quantities and requested delivery date from this email and match them to the available items list. For each product found, find the best matching item from the available items list.

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
      "unitPrice": number
    }
  }],
  "requestedDeliveryDate": "YYYY-MM-DD" // ISO date format, only if a delivery date is mentioned in the email
}

For the delivery date, look for phrases like:
- "need by [date]"
- "deliver by [date]"
- "required by [date]"
- "delivery date [date]"
- "ship by [date]"
- "due [date]"
- Any other indication of when the order should be delivered

IMPORTANT: If you find a delivery date that appears to be from a past year (like 2022), interpret it as the current year (2025). Only include dates that make sense as future delivery dates.

If no delivery date is mentioned, omit the requestedDeliveryDate field entirely.`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    return {
      orderLines: analysis.orderLines || [],
      requestedDeliveryDate: analysis.requestedDeliveryDate
    };
  } catch (error) {
    console.error('Error analyzing email with AI:', error);
    return { orderLines: [] };
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