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

    // For now, we'll associate text orders with the first user in the system
    // In production, you'd want a more sophisticated user mapping system
    // (e.g., based on phone number registration, or a default business account)
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users.users.length) {
      throw new Error('No users found in system');
    }

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
    const analysisResult = await analyzeTextWithAI(webhookData.Body, items, webhookData.From);

    // Step 4: Try to match customer by phone number or analysis
    const matchingCustomer = findMatchingCustomer(customers, webhookData.From, analysisResult);

    // Step 5: Store analysis results and update status
    const analysisData = {
      customers: customers,
      items: items,
      matchingCustomer: matchingCustomer,
      analyzedItems: analysisResult.orderLines,
      requestedDeliveryDate: analysisResult.requestedDeliveryDate,
      customerInfo: analysisResult.customerInfo,
      originalMessage: webhookData.Body,
      phoneNumber: webhookData.From,
      messageSid: webhookData.MessageSid
    };

    console.log('Updating text order with analysis results...');
    const { error: updateError } = await supabase
      .from('text_orders')
      .update({
        status: 'analyzed',
        analysis_data: analysisData,
        processed_at: new Date().toISOString()
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
async function analyzeTextWithAI(messageContent: string, items: Item[], phoneNumber: string): Promise<AnalysisResult> {
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

    const currentDate = new Date().toISOString().split('T')[0];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from text messages and matches them to a list of available items. Here is the list of available items: ${JSON.stringify(itemsList)}

IMPORTANT: Today's date is ${currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context.

The message is from phone number: ${phoneNumber}`
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
  "customerInfo": {
    "name": "customer name if mentioned",
    "company": "company name if mentioned", 
    "email": "email if mentioned"
  }
}

Look for delivery date phrases like "need by", "deliver by", "required by", "delivery date", "ship by", "due", etc.
Extract any customer information mentioned in the message.
If no delivery date is mentioned, omit the requestedDeliveryDate field.
If no customer info is mentioned, omit those fields from customerInfo.`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    return {
      orderLines: analysis.orderLines || [],
      requestedDeliveryDate: analysis.requestedDeliveryDate,
      customerInfo: analysis.customerInfo
    };
  } catch (error) {
    console.error('Error analyzing text with AI:', error);
    return { orderLines: [] };
  }
}

// Find matching customer
function findMatchingCustomer(customers: Customer[], phoneNumber: string, analysisResult: AnalysisResult): Customer | undefined {
  // First try to match by phone number (would need phone numbers in BC customer data)
  // For now, try to match by name or email from analysis
  if (analysisResult.customerInfo?.email) {
    const emailMatch = customers.find(c => 
      c.email?.toLowerCase() === analysisResult.customerInfo?.email?.toLowerCase()
    );
    if (emailMatch) return emailMatch;
  }

  if (analysisResult.customerInfo?.name) {
    const nameMatch = customers.find(c => 
      c.displayName?.toLowerCase().includes(analysisResult.customerInfo?.name?.toLowerCase() || '')
    );
    if (nameMatch) return nameMatch;
  }

  return undefined;
}

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

    const decryptedToken = await decrypt(data.encrypted_access_token);
    return decryptedToken;
  } catch (error) {
    console.error('Error getting Business Central token:', error);
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