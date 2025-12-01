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

interface TwilioWebhookData {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  AccountSid: string;
  NumSegments?: string;
  SmsStatus?: string;
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
  requestedDeliveryDate?: string;
  customerInfo?: {
    name?: string;
    company?: string;
    email?: string;
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
    console.log('Received text message webhook');

    // Parse Twilio webhook data
    const contentType = req.headers.get('content-type');
    let webhookData: TwilioWebhookData;

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      // Twilio sends form-encoded data
      const formData = await req.formData();
      webhookData = {
        From: formData.get('From') as string,
        To: formData.get('To') as string,
        Body: formData.get('Body') as string,
        MessageSid: formData.get('MessageSid') as string,
        AccountSid: formData.get('AccountSid') as string,
        NumSegments: formData.get('NumSegments') as string,
        SmsStatus: formData.get('SmsStatus') as string,
      };
    } else {
      // Fallback to JSON parsing for testing
      webhookData = await req.json();
    }

    console.log('Webhook data:', {
      from: webhookData.From,
      to: webhookData.To,
      body: webhookData.Body?.substring(0, 100) + '...',
      messageSid: webhookData.MessageSid
    });

    if (!webhookData.From || !webhookData.Body) {
      throw new Error('Missing required webhook data: From or Body');
    }

    // await supabase.auth.admin.updateUserById('c6c82af8-2b7a-4292-b018-79731e4ae9cc', {
    //   phone: '+17813540382'
    // })

    // For now, we'll associate text orders with the first user in the system
    // In production, you'd want a more sophisticated user mapping system
    // (e.g., based on phone number registration, or a default business account)
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users.users.length) {
      throw new Error('No users found in system');
    }

    console.log('These are the users: ', users);

    // Use the first user for this proof of concept
    // TODO: Implement proper user mapping based on phone number or business account
    const userId = users.users[0].id;
    console.log('Associating text order with user:', userId);

    // Step 1: Store the text message in database with 'processing' status
    console.log('Storing text message in database...');
    const { data: textOrder, error: insertError } = await supabase
      .from('text_orders')
      .insert({
        user_id: userId,
        phone_number: webhookData.From,
        message_content: webhookData.Body,
        status: 'processing'
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to store text order: ${insertError.message}`);
    }

    console.log('Text order stored with ID:', textOrder.id);

    // Step 2: Get Business Central data for analysis
    console.log('Fetching Business Central data...');
    const customers = await fetchCustomersFromBC(userId);
    const items = await fetchItemsFromBC(userId);

    console.log(`Fetched ${customers.length} customers and ${items.length} items`);

    // Step 3: Analyze text message content with AI
    console.log('Analyzing text message with AI...');
    const { analysisResult, aiLogId } = await analyzeTextWithAI(items, customers, webhookData, userId);

    // Step 4: Try to match customer by phone number or analysis
    // const matchingCustomer = findMatchingCustomer(customers, webhookData.From, analysisResult);

    // Step 5: Store analysis results and update status
    const analysisData = {
      customers: customers,
      items: items,
      matchingCustomer: analysisResult.matchingCustomer,
      analyzedItems: analysisResult.orderLines,
      requestedDeliveryDate: analysisResult.requestedDeliveryDate,
      originalMessage: webhookData.Body,
      phoneNumber: webhookData.From,
      messageSid: webhookData.MessageSid,
      aiAnalysisLogId: aiLogId
    };

    console.log('Updating text order with analysis results...');
    const { error: updateError } = await supabase
      .from('text_orders')
      .update({
        status: 'analyzed',
        analysis_data: analysisData,
        ai_analysis_log_id: aiLogId,
        updated_at: new Date().toISOString()
      })
      .eq('id', textOrder.id);

    if (updateError) {
      throw new Error(`Failed to update text order: ${updateError.message}`);
    }

    console.log('Text message analysis completed successfully');

    // Return TwiML response for Twilio
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for your order! We've received your message and are processing it. You'll receive a confirmation shortly.</Message>
</Response>`;

    return new Response(twimlResponse, {
      headers: {
        'Content-Type': 'text/xml',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error processing text message:', error);

    // Return error TwiML response
    const errorTwimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, we encountered an error processing your order. Please try again or contact support.</Message>
</Response>`;

    return new Response(errorTwimlResponse, {
      headers: {
        'Content-Type': 'text/xml',
        ...corsHeaders
      },
      status: 500
    });
  }
});

// Fetch customers from Business Central
async function fetchCustomersFromBC(userId: string): Promise<Customer[]> {
  try {
    const bcToken = await getValidBusinessCentralToken(userId);
    if (!bcToken) {
      console.warn('Business Central token not found, returning empty customers list');
      return [];
    }

    const companyId = await getCompanyId(userId);
    if (!companyId) {
      console.warn('Company ID not found, returning empty customers list');
      return [];
    }

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

// Fetch items from Business Central
async function fetchItemsFromBC(userId: string): Promise<Item[]> {
  try {
    const bcToken = await getValidBusinessCentralToken(userId);
    if (!bcToken) {
      console.warn('Business Central token not found, returning empty items list');
      return [];
    }

    const companyId = await getCompanyId(userId);
    if (!companyId) {
      console.warn('Company ID not found, returning empty items list');
      return [];
    }

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

// Analyze text message with AI
async function analyzeTextWithAI(items: Item[], customers: Customer[], webhookData: any, userId: string): Promise<{ analysisResult: AnalysisResult; aiLogId: string }> {
  const messageContent = webhookData.Body;
  const phoneNumber = webhookData.From;

  if (items.length === 0) {
    console.warn('No items available for analysis');
    return { analysisResult: { orderLines: [] }, aiLogId: '' };
  }

  try {
    const startTime = Date.now();
    
    const itemsList = items.map((item: Item) => ({
      id: item.id,
      number: item.number,
      displayName: item.displayName,
      unitPrice: item.unitPrice
    }));

    const currentDate = new Date().toISOString().split('T')[0];

    // Prepare request data for logging
    const requestData = {
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from text messages and matches them to a list of available items. Here is the list of available items: ${JSON.stringify(itemsList)}

IMPORTANT: Today's date is ${currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context.`
        },
        {
          role: 'user',
          content: `Extract products with quantities, customer information, and requested delivery date from this text message and match them to the available items list.

Text message content:
${messageContent}

Return the data in JSON format with the following structure:
{
  "orderLines": [{
    "itemName": "extracted item name from message",
    "quantity": number,
    "matchedItem": {
      "id": "matched item id",
      "number": "matched item number", 
      "displayName": "matched item display name",
      "unitPrice": number
    }
  }],
  "requestedDeliveryDate": "YYYY-MM-DD", // ISO date format, only if mentioned
}

Look for delivery date phrases like "need by", "deliver by", "required by", "delivery date", "ship by", "due", etc.
Extract any customer information mentioned in the message.
If no delivery date is mentioned, omit the requestedDeliveryDate field.
If no customer info is mentioned, omit those fields from customerInfo.

If the customer asks for two roses, two premiere, three majestic, all different kinds, then do the following order of 7 items:

qty 1 for Rose Dozen Rainbow 40cm (IG0155)
qty 1 for Rose Dozen Red 50cm (M2018)
qty 1 for MG222
qty 1 for M8721
qty 1 for M6221
qty 1 for M8720
qty 1 for M9423
`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    };

    // Store initial AI analysis log with request data
    const { data: initialAiLog, error: initialLogError } = await supabase
      .from('ai_analysis_logs')
      .insert({
        user_id: userId,
        analysis_type: 'text_message',
        source_id: webhookData.MessageSid,
        raw_request: requestData,
        model_used: 'gpt-5.1',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    const aiLogId = initialAiLog?.id || '';
    if (initialLogError) {
      console.warn('Failed to create initial AI analysis log:', initialLogError);
    }
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    let processingTime = Date.now() - startTime;

    // Store raw response immediately after getting it from OpenAI
    if (aiLogId) {
      const { error: updateRawError } = await supabase
        .from('ai_analysis_logs')
        .update({
          raw_response: {
            items_analysis: completion
          },
          tokens_used: completion.usage?.total_tokens || 0,
          processing_time_ms: processingTime
        })
        .eq('id', aiLogId);

      if (updateRawError) {
        console.warn('Failed to store raw AI response:', updateRawError);
      } else {
        console.log('Successfully stored raw AI response for log ID:', aiLogId);
      }
    }

    // Now attempt to parse the response
    let itemsAnalysis;
    try {
      itemsAnalysis = JSON.parse(completion.choices[0].message.content);
    } catch (parseError) {
      console.error('Failed to parse items analysis JSON:', parseError);
      console.error('Raw content:', completion.choices[0].message.content);
      
      // Store the parsing error in the log
      if (aiLogId) {
        await supabase
          .from('ai_analysis_logs')
          .update({
            parsed_result: {
              error: 'JSON parsing failed',
              raw_content: completion.choices[0].message.content,
              parse_error: parseError.message
            }
          })
          .eq('id', aiLogId);
      }
      
      return { analysisResult: { orderLines: [] }, aiLogId };
    }
    processingTime = Date.now() - startTime;

    // Customer analysis
    const customerCompletion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from text messages and matches them to a list of available items. Here is the list of customers ${JSON.stringify(customers)}`
        },
        {
          role: 'user',
          content: `Extract the corresponding customer based on the text message content.

Text message content:
${messageContent}

Return the data in JSON format with the following structure:
{
  "matchingCustomer": {
    id: string;
    number: string;
    displayName: string;
    email: string;
  }
}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    // Update log with customer analysis response
    if (aiLogId) {
      const { error: updateCustomerError } = await supabase
        .from('ai_analysis_logs')
        .update({
          raw_response: {
            items_analysis: completion,
            customer_analysis: customerCompletion
          },
          tokens_used: (completion.usage?.total_tokens || 0) + (customerCompletion.usage?.total_tokens || 0)
        })
        .eq('id', aiLogId);

      if (updateCustomerError) {
        console.warn('Failed to update AI log with customer analysis:', updateCustomerError);
      }
    }

    // Parse customer analysis
    let customerAnalysis;
    try {
      customerAnalysis = JSON.parse(customerCompletion.choices[0].message.content);
    } catch (parseError) {
      console.error('Failed to parse customer analysis JSON:', parseError);
      console.error('Raw content:', customerCompletion.choices[0].message.content);
      
      // Store the parsing error in the log
      if (aiLogId) {
        await supabase
          .from('ai_analysis_logs')
          .update({
            parsed_result: {
              items_analysis: itemsAnalysis,
              customer_error: 'JSON parsing failed',
              customer_raw_content: customerCompletion.choices[0].message.content,
              customer_parse_error: parseError.message
            }
          })
          .eq('id', aiLogId);
      }
    }

    const analysisResult = {
      orderLines: itemsAnalysis.orderLines || [],
      requestedDeliveryDate: itemsAnalysis.requestedDeliveryDate,
      matchingCustomer: customerAnalysis.matchingCustomer
    };

    // Update log with final parsed result
    if (aiLogId) {
      const { error: finalUpdateError } = await supabase
        .from('ai_analysis_logs')
        .update({
          parsed_result: analysisResult
        })
        .eq('id', aiLogId);

      if (finalUpdateError) {
        console.warn('Failed to update AI log with final result:', finalUpdateError);
      }
    }

    return { 
      analysisResult, 
      aiLogId 
    };
  } catch (error) {
    console.error('Error analyzing text with AI:', error);
    return { analysisResult: { orderLines: [] }, aiLogId: '' };
  }
}

// Find matching customer
// function findMatchingCustomer(customers: Customer[], phoneNumber: string, analysisResult: AnalysisResult): Customer | undefined {
//   // First try to match by phone number (would need phone numbers in BC customer data)
//   // For now, try to match by name or email from analysis
//   if (analysisResult.customerInfo?.email) {
//     const emailMatch = customers.find(c => 
//       c.email?.toLowerCase() === analysisResult.customerInfo?.email?.toLowerCase()
//     );
//     if (emailMatch) return emailMatch;
//   }

//   if (analysisResult.customerInfo?.name) {
//     const nameMatch = customers.find(c => 
//       c.displayName?.toLowerCase().includes(analysisResult.customerInfo?.name?.toLowerCase() || '')
//     );
//     if (nameMatch) return nameMatch;
//   }

//   return undefined;
// }

// Helper functions (reused from analyze-email)
async function getValidBusinessCentralToken(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data) {
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
    const decryptedToken = await decrypt(data.encrypted_access_token);
    return decryptedToken;
  } catch (error) {
    console.error('Error getting Business Central token:', error);
    return null;
  }
}

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