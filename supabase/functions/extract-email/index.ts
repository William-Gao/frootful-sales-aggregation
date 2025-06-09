import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

    // Get Google access token from stored tokens
    const googleToken = await getGoogleToken(userId);
    if (!googleToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Google token not found. Please sign in again.' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Extract email from Gmail API
    const emailData = await extractEmailFromGmail(emailId, googleToken);

    return new Response(
      JSON.stringify({
        success: true,
        data: emailData
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error extracting email:', error);
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

async function getGoogleToken(userId: string): Promise<string | null> {
  try {
    // Get Google token from user_tokens table
    const { data, error } = await supabase
      .from('user_tokens')
      .select('encrypted_access_token')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (error || !data?.encrypted_access_token) {
      console.error('No Google token found for user:', userId);
      return null;
    }

    // Decrypt the token
    const decryptedToken = await decrypt(data.encrypted_access_token);
    return decryptedToken;
  } catch (error) {
    console.error('Error getting Google token:', error);
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

async function extractEmailFromGmail(emailId: string, token: string): Promise<EmailData> {
  // Fetch email from Gmail API
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch email: ${response.status}`);
  }
  
  const emailData: GmailResponse = await response.json();
  
  // Parse email data
  return parseEmailData(emailData);
}

function parseEmailData(emailData: GmailResponse): EmailData {
  const headers: Record<string, string> = {};
  
  // Extract headers
  if (emailData.payload && emailData.payload.headers) {
    emailData.payload.headers.forEach(header => {
      headers[header.name.toLowerCase()] = header.value;
    });
  }
  
  // Extract body content
  let body = '';
  
  function extractBodyParts(part: any): void {
    if (part.body && part.body.data) {
      // Decode base64 content
      const decodedData = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      body += decodedData;
    }
    
    if (part.parts) {
      part.parts.forEach((subPart: any) => {
        // Prefer HTML content
        if (subPart.mimeType === 'text/html') {
          extractBodyParts(subPart);
        }
      });
      
      // If no HTML found, use plain text
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