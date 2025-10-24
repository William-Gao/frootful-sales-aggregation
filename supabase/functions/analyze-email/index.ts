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
  attachments: Attachment[];
}

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  content?: string; // extracted text content for PDFs
  isInline?: boolean; // for embedded images
  contentId?: string; // for referencing inline images
  downloadUrl?: string; // temporary download URL
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
      filename?: string;
      body?: {
        data?: string;
        attachmentId?: string;
        size?: number;
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

    // Step 5: Process PDF attachments
    console.log('Step 5: Processing PDF attachments...');
    const processedEmailData = await processPDFAttachments(emailData, userId);

    // Step 6: Analyze email content and match items using AI (now includes delivery date and attachments)
    console.log('Step 6: Analyzing email content with AI...');
    const { analysisResult, aiLogId } = await analyzeEmailWithAI(processedEmailData.body, processedEmailData.attachments, items, userId, emailId);

    console.log('Analysis complete! Found', analysisResult.orderLines.length, 'items');
    if (analysisResult.requestedDeliveryDate) {
      console.log('Requested delivery date:', analysisResult.requestedDeliveryDate);
    }

    // Step 7: Store email order in database
    console.log('Step 7: Storing email order in database...');
    const { data: emailOrder, error: emailOrderError } = await supabase
      .from('email_orders')
      .insert({
        user_id: userId,
        email_id: emailId,
        thread_id: processedEmailData.threadId,
        subject: processedEmailData.subject,
        from_email: processedEmailData.from,
        to_email: processedEmailData.to,
        email_content: processedEmailData.body,
        status: 'analyzed',
        analysis_data: {
          customers: customers,
          items: items,
          matchingCustomer: matchingCustomer,
          analyzedItems: analysisResult.orderLines,
          requestedDeliveryDate: analysisResult.requestedDeliveryDate,
          originalEmail: processedEmailData,
          aiAnalysisLogId: aiLogId
        },
        ai_analysis_log_id: aiLogId
      })
      .select()
      .single();

    if (emailOrderError) {
      console.warn('Failed to store email order:', emailOrderError);
      // Continue anyway - analysis was successful
    } else {
      console.log('Email order stored with ID:', emailOrder.id);
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        email: processedEmailData,
        customers: customers,
        items: items,
        matchingCustomer: matchingCustomer,
        analyzedItems: analysisResult.orderLines,
        requestedDeliveryDate: analysisResult.requestedDeliveryDate,
        aiAnalysisLogId: aiLogId
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

// Process PDF attachments and extract text content
async function processPDFAttachments(emailData: EmailData, userId: string): Promise<EmailData> {
  if (!emailData.attachments || emailData.attachments.length === 0) {
    return emailData;
  }

  const googleToken = await getValidGoogleToken(userId);
  if (!googleToken) {
    console.warn('No Google token available for downloading attachments');
    return emailData;
  }

  const processedAttachments: Attachment[] = [];

  for (const attachment of emailData.attachments) {
    // Process PDFs for text extraction
    if (attachment.mimeType === 'application/pdf' && !attachment.isInline) {
      try {
        console.log(`Processing PDF attachment: ${attachment.filename}`);

        // Download the attachment from Gmail API
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.id}/attachments/${attachment.attachmentId}`,
          {
            headers: {
              Authorization: `Bearer ${googleToken}`
            }
          }
        );

        if (!response.ok) {
          console.warn(`Failed to download attachment ${attachment.filename}: ${response.status}`);
          processedAttachments.push(attachment);
          continue;
        }

        const attachmentData = await response.json();
        const pdfData = attachmentData.data;

        // Decode base64 PDF data
        const binaryString = atob(pdfData.replace(/-/g, '+').replace(/_/g, '/'));
        const pdfBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          pdfBytes[i] = binaryString.charCodeAt(i);
        }

        // Extract text from PDF using LLM Whisperer PRO
        const textContent = await extractTextWithLLMWhisperer(pdfBytes, attachment.filename);

        processedAttachments.push({
          ...attachment,
          content: textContent
        });

        console.log(`Successfully extracted text from ${attachment.filename}: ${textContent.length} characters`);
      } catch (error) {
        console.error(`Error processing PDF attachment ${attachment.filename}:`, error);
        processedAttachments.push(attachment);
      }
    } 
    // Generate download URLs for images and other attachments
    else if (attachment.mimeType.startsWith('image/') || attachment.mimeType.startsWith('application/')) {
      try {
        // For now, we'll store the attachment info and generate download URLs on demand
        // In a production system, you might want to store these in cloud storage
        processedAttachments.push({
          ...attachment,
          downloadUrl: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.id}/attachments/${attachment.attachmentId}`
        });
        
        console.log(`Added download URL for ${attachment.filename} (${attachment.mimeType})`);
      } catch (error) {
        console.error(`Error processing attachment ${attachment.filename}:`, error);
        processedAttachments.push(attachment);
      }
    } else {
      // For non-PDF attachments, just add them without content extraction
      processedAttachments.push(attachment);
    }
  }

  return {
    ...emailData,
    attachments: processedAttachments
  };
}

// Extract text from PDF using LLM Whisperer PRO API
async function extractTextWithLLMWhisperer(pdfBytes: Uint8Array, filename: string): Promise<string> {
  try {
    const llmWhispererApiKey = Deno.env.get('LLM_WHISPERER_API_KEY');
    if (!llmWhispererApiKey) {
      console.warn('LLM_WHISPERER_API_KEY not found, falling back to basic extraction');
      return await extractTextFromPDFBasic(pdfBytes);
    }

    console.log(`Extracting text from ${filename} using LLM Whisperer PRO high_quality mode...`);

    // Step 1: Submit document for processing
    const whisperHash = await submitDocumentToLLMWhisperer(pdfBytes, filename, llmWhispererApiKey);
    if (!whisperHash) {
      console.warn('Failed to submit document to LLM Whisperer, falling back to basic extraction');
      return await extractTextFromPDFBasic(pdfBytes);
    }

    // Step 2: Wait for processing and retrieve text
    const extractedText = await retrieveExtractedText(whisperHash, llmWhispererApiKey);
    if (!extractedText) {
      console.warn('Failed to retrieve extracted text from LLM Whisperer, falling back to basic extraction');
      return await extractTextFromPDFBasic(pdfBytes);
    }

    console.log(`Successfully extracted ${extractedText.length} characters from ${filename} using LLM Whisperer`);
    return extractedText;

  } catch (error) {
    console.error('Error using LLM Whisperer:', error);
    // Fall back to basic extraction
    return await extractTextFromPDFBasic(pdfBytes);
  }
}

// Submit document to LLM Whisperer for processing
async function submitDocumentToLLMWhisperer(pdfBytes: Uint8Array, filename: string, apiKey: string): Promise<string | null> {
  try {
    // Call LLM Whisperer v2 API
    const response = await fetch('https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper', {
      method: 'POST',
      headers: {
        'unstract-key': apiKey,
        'Content-Type': 'application/octet-stream'
      },
      body: pdfBytes
    });

    if (response.status !== 202) {
      const errorText = await response.text();
      console.error(`LLM Whisperer API error: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const result = await response.json();
    console.log('Document submitted to LLM Whisperer, whisper_hash:', result.whisper_hash);
    return result.whisper_hash;

  } catch (error) {
    console.error('Error submitting document to LLM Whisperer:', error);
    return null;
  }
}

// Retrieve extracted text from LLM Whisperer
async function retrieveExtractedText(whisperHash: string, apiKey: string): Promise<string | null> {
  try {
    const maxAttempts = 10;
    const delayMs = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Checking LLM Whisperer status (attempt ${attempt}/${maxAttempts})...`);

      // Check status
      const statusResponse = await fetch(`https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper-status?whisper_hash=${whisperHash}`, {
        headers: {
          'unstract-key': apiKey
        }
      });

      if (!statusResponse.ok) {
        console.error(`Status check failed: ${statusResponse.status} ${statusResponse.statusText}`);
        return null;
      }

      const statusResult = await statusResponse.json();
      console.log('LLM Whisperer status:', statusResult.status);

      if (statusResult.status === 'processed') {
        // Retrieve the extracted text
        const textResponse = await fetch(`https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper-retrieve?whisper_hash=${whisperHash}&mode=high_quality&output_mode=layout_preserving`, {
          headers: {
            'unstract-key': apiKey
          }
        });

        if (!textResponse.ok) {
          console.error(`Text retrieval failed: ${textResponse.status} ${textResponse.statusText}`);
          return null;
        }

        const extractedText = await textResponse.text();
        return extractedText;

      } else if (statusResult.status === 'processing') {
        // Wait before next attempt
        if (attempt < maxAttempts) {
          console.log(`Document still processing, waiting ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else if (statusResult.status === 'failed') {
        console.error('LLM Whisperer processing failed:', statusResult);
        return null;
      }
    }

    console.warn('LLM Whisperer processing timed out after maximum attempts');
    return null;

  } catch (error) {
    console.error('Error retrieving extracted text from LLM Whisperer:', error);
    return null;
  }
}

// Fallback basic PDF text extraction (original implementation)
async function extractTextFromPDFBasic(pdfBytes: Uint8Array): Promise<string> {
  try {
    console.log('Using basic PDF text extraction as fallback');

    // Convert to string for basic text extraction
    const pdfString = new TextDecoder('latin1').decode(pdfBytes);

    // Very basic text extraction - look for text between stream objects
    const textMatches = pdfString.match(/BT\s+.*?ET/gs) || [];
    const extractedTexts: string[] = [];

    for (const match of textMatches) {
      // Extract text from Tj and TJ operators
      const tjMatches = match.match(/\(([^)]*)\)\s*Tj/g) || [];
      const tjTextMatches = match.match(/\[([^\]]*)\]\s*TJ/g) || [];

      for (const tjMatch of tjMatches) {
        const text = tjMatch.match(/\(([^)]*)\)/)?.[1];
        if (text) {
          extractedTexts.push(text);
        }
      }

      for (const tjTextMatch of tjTextMatches) {
        const arrayContent = tjTextMatch.match(/\[([^\]]*)\]/)?.[1];
        if (arrayContent) {
          const textParts = arrayContent.match(/\(([^)]*)\)/g) || [];
          for (const part of textParts) {
            const text = part.match(/\(([^)]*)\)/)?.[1];
            if (text) {
              extractedTexts.push(text);
            }
          }
        }
      }
    }

    const result = extractedTexts.join(' ').trim();
    return result || 'Unable to extract text from PDF';
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return 'Error extracting text from PDF';
  }
}

// Analyze email content with AI - now includes delivery date extraction, current date, and attachments
async function analyzeEmailWithAI(emailContent: string, attachments: Attachment[], items: Item[], userId: string, emailId: string): Promise<{ analysisResult: AnalysisResult; aiLogId: string }> {
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

    // Get current date for context
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Prepare content including both email and attachment text
    let fullContent = `Email content:\n${emailContent}`;

    // Add PDF attachment content if available
    const pdfAttachments = attachments.filter(att => att.mimeType === 'application/pdf' && att.content);
    if (pdfAttachments.length > 0) {
      fullContent += '\n\nPDF Attachments:\n';
      pdfAttachments.forEach((att, index) => {
        fullContent += `\n--- PDF Attachment ${index + 1}: ${att.filename} ---\n${att.content}\n`;
      });
    }

    // Prepare request data for logging
    const requestData = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from emails and their PDF attachments, then matches them to a list of available items. Here is the list of available items: ${JSON.stringify(itemsList)}

IMPORTANT: Today's date is ${currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context. If a date appears to be from a past year (like 2022), interpret it as the current year (2025) instead.

You will analyze both the email content and any PDF attachments that may contain purchase order details, item lists, quotes, or other relevant ordering information.`
        },
        {
          role: 'user',
          content: `Extract products with quantities and requested delivery date from this email and its PDF attachments. Match them to the available items list. For each product found, find the best matching item from the available items list.

${fullContent}

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
    };

    // Store initial AI analysis log with request data
    const { data: initialAiLog, error: initialLogError } = await supabase
      .from('ai_analysis_logs')
      .insert({
        user_id: userId,
        analysis_type: 'email',
        source_id: emailId,
        raw_request: requestData,
        model_used: 'gpt-4o',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    const aiLogId = initialAiLog?.id || '';
    if (initialLogError) {
      console.warn('Failed to create initial AI analysis log:', initialLogError);
    }
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    const processingTime = Date.now() - startTime;

    // Store raw response immediately after getting it from OpenAI
    if (aiLogId) {
      const { error: updateRawError } = await supabase
        .from('ai_analysis_logs')
        .update({
          raw_response: completion,
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
    let analysis;
    try {
      analysis = JSON.parse(completion.choices[0].message.content);
    } catch (parseError) {
      console.error('Failed to parse AI response JSON:', parseError);
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
    
    const analysisResult = {
      orderLines: analysis.orderLines || [],
      requestedDeliveryDate: analysis.requestedDeliveryDate
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
    console.error('Error analyzing email with AI:', error);
    return { analysisResult: { orderLines: [] }, aiLogId: '' };
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

// Clean text content and fix encoding issues
function cleanTextContent(text: string): string {
  return text
    // Fix common encoding issues
    .replace(/â¦/g, '...')
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€"/g, '—')
    .replace(/â€"/g, '–')
    .replace(/Â/g, ' ')
    .replace(/â€¦/g, '...')
    // Additional common encoding issues
    .replace(/â€¢/g, '•')
    .replace(/Â /g, ' ')
    .replace(/â€‹/g, '') // Zero-width space
    .replace(/â€Š/g, ' ') // Thin space
    .replace(/â€¯/g, ' ') // Narrow no-break space
    // Clean up extra whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

// Convert HTML to clean text
function convertHtmlToText(html: string): string {
  return html
    // Remove Gmail-specific classes and spans
    .replace(/class="[^"]*"/g, '')
    .replace(/<span[^>]*>/g, '')
    .replace(/<\/span>/g, '')
    // Clean up Microsoft Word formatting
    .replace(/class="MsoNormal"/g, '')
    .replace(/<u><\/u>/g, '')
    // Replace HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    // Convert HTML line breaks and paragraphs to proper formatting
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    // Remove div tags but keep content with line breaks
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n')
    // Remove any remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Fix character encoding issues
    .replace(/â€¦/g, '...')
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€"/g, '—')
    .replace(/â€"/g, '–')
    .replace(/Â/g, ' ')
    .replace(/â€¢/g, '•')
    .replace(/Â /g, ' ')
    .replace(/â€‹/g, '') // Zero-width space
    // Clean up extra whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();
}

// Parse Gmail API response
function parseEmailData(emailData: GmailResponse): EmailData {
  const headers: Record<string, string> = {};

  if (emailData.payload && emailData.payload.headers) {
    emailData.payload.headers.forEach(header => {
      headers[header.name.toLowerCase()] = header.value;
    });
  }

  let htmlBody = '';
  let textBody = '';
  const attachments: Attachment[] = [];
  const inlineImages: Map<string, string> = new Map(); // contentId -> attachmentId mapping

  function extractBodyParts(part: any): void {
    // Check if this part is an attachment
    if (part.filename && part.filename.length > 0 && part.body && part.body.attachmentId) {
      const isImage = part.mimeType?.startsWith('image/');
      const contentId = part.headers?.find((h: any) => h.name.toLowerCase() === 'content-id')?.value;
      
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
        isInline: !!contentId,
        contentId: contentId?.replace(/[<>]/g, '') // Remove < > brackets
      });
      
      // Map inline images for HTML replacement
      if (isImage && contentId) {
        inlineImages.set(contentId.replace(/[<>]/g, ''), part.body.attachmentId);
      }
      return;
    }
    
    // Check for inline attachments without filename
    if (!part.filename && part.body && part.body.attachmentId && part.mimeType?.startsWith('image/')) {
      const contentId = part.headers?.find((h: any) => h.name.toLowerCase() === 'content-id')?.value;
      
      attachments.push({
        filename: `inline-image.${part.mimeType.split('/')[1]}`,
        mimeType: part.mimeType,
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
        isInline: true,
        contentId: contentId?.replace(/[<>]/g, '')
      });
      
      if (contentId) {
        inlineImages.set(contentId.replace(/[<>]/g, ''), part.body.attachmentId);
      }
      return;
    }

    // Extract body text based on MIME type
    if (part.body && part.body.data && !part.filename) {
      const decodedData = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      
      if (part.mimeType === 'text/html') {
        htmlBody += decodedData;
      } else if (part.mimeType === 'text/plain') {
        textBody += decodedData;
      }
    }

    if (part.parts) {
      part.parts.forEach((subPart: any) => {
        extractBodyParts(subPart);
      });
    }
  }

  if (emailData.payload) {
    extractBodyParts(emailData.payload);
  }

  // Replace inline image references in HTML with placeholder text for analysis
  let processedHtmlBody = htmlBody;
  inlineImages.forEach((attachmentId, contentId) => {
    const regex = new RegExp(`cid:${contentId}`, 'gi');
    processedHtmlBody = processedHtmlBody.replace(regex, `[INLINE_IMAGE:${contentId}]`);
  });

  // Clean and process the email body
  let finalBody = '';
  
  // Prefer plain text if available, otherwise convert HTML to text
  if (textBody.trim()) {
    finalBody = cleanTextContent(textBody);
  } else if (processedHtmlBody.trim()) {
    finalBody = convertHtmlToText(processedHtmlBody);
  }
  console.log(`Found ${attachments.length} attachments in email ${emailData.id}`);
  attachments.forEach(att => {
    console.log(`- ${att.filename} (${att.mimeType}, ${att.size} bytes)${att.isInline ? ' [INLINE]' : ''}`);
  });

  return {
    id: emailData.id,
    threadId: emailData.threadId,
    labelIds: emailData.labelIds || [],
    snippet: emailData.snippet || '',
    subject: headers.subject || '',
    from: headers.from || '',
    to: headers.to || '',
    date: headers.date || '',
    body: finalBody,
    attachments: attachments
  };
}