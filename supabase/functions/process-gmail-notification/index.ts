import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to decode base64url (Gmail Pub/Sub format)
function base64urlDecode(str: string): string {
  // Replace URL-safe characters
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);

  try {
    return atob(padded);
  } catch (error) {
    console.error('Failed to decode base64url:', error);
    throw new Error('Invalid base64url string');
  }
}

// Helper function to fetch email from Gmail API
async function fetchGmailMessage(messageId: string, accessToken: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gmail API error:', error);
    throw new Error(`Gmail API returned ${response.status}: ${error}`);
  }

  return await response.json();
}

// Helper function to extract headers from Gmail message
function getHeader(headers: any[], name: string): string | null {
  const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : null;
}

// Helper function to decode email body
function decodeEmailBody(data: string): string {
  if (!data) return '';
  try {
    return base64urlDecode(data);
  } catch (error) {
    console.error('Failed to decode email body:', error);
    return '';
  }
}

// Helper function to extract body from Gmail message parts
function extractBody(payload: any): { plainText: string; htmlBody: string } {
  let plainText = '';
  let htmlBody = '';

  function traverseParts(part: any) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText += decodeEmailBody(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      htmlBody += decodeEmailBody(part.body.data);
    }

    if (part.parts) {
      part.parts.forEach(traverseParts);
    }
  }

  // Handle single-part message
  if (payload.body?.data) {
    if (payload.mimeType === 'text/plain') {
      plainText = decodeEmailBody(payload.body.data);
    } else if (payload.mimeType === 'text/html') {
      htmlBody = decodeEmailBody(payload.body.data);
    }
  }

  // Handle multi-part message
  if (payload.parts) {
    payload.parts.forEach(traverseParts);
  }

  return { plainText, htmlBody };
}

// Helper function to extract attachments from Gmail message
function extractAttachments(payload: any): any[] {
  const attachments: any[] = [];

  function traverseParts(part: any) {
    // Check if this part is an attachment
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size,
      });
    }

    if (part.parts) {
      part.parts.forEach(traverseParts);
    }
  }

  if (payload.parts) {
    payload.parts.forEach(traverseParts);
  }

  return attachments;
}

// Encryption key from environment - must match token-manager and auth-callback
const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';

// Helper function to decrypt token (must match format used by token-manager)
async function decrypt(encryptedText: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const combined = new Uint8Array(
    atob(encryptedText).split('').map(char => char.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), // Ensure 32 bytes
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

// Helper function to encrypt token (must match format used by token-manager)
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

// Refresh Google OAuth token
async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access_token in refresh response');
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600, // Default to 1 hour
  };
}

// Helper function to get user's Gmail access token from Supabase
async function getUserAccessToken(userId: string, supabaseClient: any): Promise<string | null> {
  const { data, error } = await supabaseClient
    .from('user_tokens')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error) {
    console.error('Error fetching user tokens:', error);
    return null;
  }

  if (!data) {
    console.error('No Google token found for user');
    return null;
  }

  // Check if token is expired
  const now = new Date().getTime();
  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;

  if (now >= expiresAt && data.encrypted_refresh_token) {
    console.log('Token expired, refreshing...');

    try {
      const refreshToken = await decrypt(data.encrypted_refresh_token);
      const newTokens = await refreshGoogleToken(refreshToken);

      // Encrypt new tokens
      const encryptedAccessToken = await encrypt(newTokens.access_token);
      const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();

      // Update in database
      await supabaseClient
        .from('user_tokens')
        .update({
          encrypted_access_token: encryptedAccessToken,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('provider', 'google');

      console.log('✅ Token refreshed successfully');
      return newTokens.access_token;
    } catch (refreshError) {
      console.error('❌ Failed to refresh token:', refreshError);
      // Fall through to try existing token anyway
    }
  }

  // Decrypt and return access token
  return await decrypt(data.encrypted_access_token);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Gmail Pub/Sub Notification Received ===');

    // Parse request body from Pub/Sub
    const body = await req.json();

    if (!body.message || !body.message.data) {
      console.error('Invalid Pub/Sub message format');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid Pub/Sub message format',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Decode the Pub/Sub message data
    const decodedData = base64urlDecode(body.message.data);
    const gmailNotification = JSON.parse(decodedData);

    console.log('=== Gmail Notification ===');
    console.log('Email address:', gmailNotification.emailAddress);
    console.log('History ID:', gmailNotification.historyId);

    // Extract email and history ID
    const userEmail = gmailNotification.emailAddress;
    const historyId = gmailNotification.historyId;

    // IMPORTANT: Acknowledge the Pub/Sub message immediately by returning 200
    // Process the email asynchronously without blocking the response
    processEmailAsync(userEmail, historyId).catch(error => {
      console.error('Error in async processing:', error);
    });

    // Return success immediately to acknowledge Pub/Sub message
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notification received and queued for processing',
        data: {
          userEmail,
          historyId,
          receivedAt: new Date().toISOString(),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('=== Error processing request ===');
    console.error('Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Process email asynchronously after acknowledging Pub/Sub
async function processEmailAsync(userEmail: string, historyId: string) {
  try {
    console.log('=== Starting Async Email Processing ===');
    console.log('User email:', userEmail);
    console.log('History ID:', historyId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user_id from email using RPC function
    console.log('Looking up user by email:', userEmail);
    const { data: userId, error: userError } = await supabaseClient
      .rpc('get_user_id_by_email', { user_email: userEmail });

    if (userError || !userId) {
      console.error('User not found:', userEmail, userError);
      throw new Error('User not found');
    }

    console.log('User ID:', userId);

    // Get user's Gmail access token
    const accessToken = await getUserAccessToken(userId, supabaseClient);

    if (!accessToken) {
      console.error('No access token found for user:', userEmail);
      throw new Error('User access token not found');
    }

    // Get stored watch state (including last processed historyId)
    console.log('=== Getting stored watch state ===');
    const { data: watchState, error: watchStateError } = await supabaseClient
      .from('gmail_watch_state')
      .select('last_history_id')
      .eq('user_id', userId)
      .single();

    if (watchStateError) {
      console.error('Error fetching watch state:', watchStateError);
      throw new Error('Failed to fetch watch state');
    }

    if (!watchState) {
      console.error('No watch state found for user - watch may not be set up yet');
      throw new Error('Watch state not found');
    }

    const lastHistoryId = watchState.last_history_id;

    console.log('Last processed historyId:', lastHistoryId);
    console.log('Current notification historyId:', historyId);

    // Use History API to get changes since last processed historyId
    console.log('=== Fetching history changes ===');
    const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${lastHistoryId}`;

    const historyResponse = await fetch(historyUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!historyResponse.ok) {
      const error = await historyResponse.text();
      console.error('Gmail History API error:', error);
      throw new Error(`Gmail History API returned ${historyResponse.status}: ${error}`);
    }

    const historyData = await historyResponse.json();
    console.log('=== Gmail History Data ===');
    console.log('History records:', historyData.history?.length || 0);

    // Extract ALL message IDs from history records
    const newMessageIds: string[] = [];

    if (historyData.history) {
      console.log('Processing history records...');
      for (const record of historyData.history) {
        // Process ALL messagesAdded events
        if (record.messagesAdded) {
          for (const messageChange of record.messagesAdded) {
            const messageId = messageChange.message.id;
            newMessageIds.push(messageId);
            console.log('✅ Adding message to process:', messageId);
          }
        }

        // Also process labelsAdded events
        if (record.labelsAdded) {
          for (const labelChange of record.labelsAdded) {
            const messageId = labelChange.message.id;
            if (!newMessageIds.includes(messageId)) {
              newMessageIds.push(messageId);
              console.log('✅ Adding message with label change:', messageId);
            }
          }
        }
      }
    } else {
      console.log('⚠️ No history data returned - no changes since historyId:', historyId);
    }

    console.log('=== Message IDs to Process ===');
    console.log('Count:', newMessageIds.length);
    console.log('IDs:', newMessageIds);

    // Process each new message - create intake_events
    for (const messageId of newMessageIds) {
      console.log(`=== Processing Message ${messageId} ===`);

      try {
        // Fetch full message from Gmail API
        const gmailMessage = await fetchGmailMessage(messageId, accessToken);

        // Extract headers
        const headers = gmailMessage.payload.headers;
        const from = getHeader(headers, 'From');
        const to = getHeader(headers, 'To');
        const subject = getHeader(headers, 'Subject');
        const dateStr = getHeader(headers, 'Date');
        const threadId = gmailMessage.threadId;

        console.log('Email Metadata:', { from, to, subject, date: dateStr });

        // Extract body content
        const { plainText, htmlBody } = extractBody(gmailMessage.payload);

        // Extract attachments metadata
        const attachments = extractAttachments(gmailMessage.payload);

        console.log('Attachments:', attachments.length);

        // Convert all headers to object format
        const headersJson = headers.reduce((acc: any, h: any) => {
          acc[h.name] = h.value;
          return acc;
        }, {});

        // Create intake_event WITHOUT organization_id
        // The database trigger will call process-intake-event which will determine the organization
        const { data: intakeEvent, error: intakeError } = await supabaseClient
          .from('intake_events')
          .insert({
            channel: 'email',
            provider: 'gmail',
            provider_message_id: messageId,
            raw_content: {
              from: from,
              to: to,
              subject: subject,
              date: dateStr,
              gmail_thread_id: threadId,
              gmail_message_id: messageId,
              headers: headersJson,
              body_text: plainText,
              body_html: htmlBody,
              attachments: attachments
            }
          })
          .select()
          .single();

        if (intakeError) {
          // Check if duplicate
          if (intakeError.code === '23505') {
            console.log(`⏭️  Intake event already exists for message: ${messageId}`);
          } else {
            console.error('Failed to create intake_event:', intakeError);
          }
        } else {
          console.log(`✅ Created intake_event: ${intakeEvent.id}`);
        }

      } catch (msgError) {
        console.error(`Error processing message ${messageId}:`, msgError);
        // Continue with other messages
      }
    }

    console.log('=== Async Processing Complete ===');
    console.log('Processed messages:', newMessageIds.length);

    // Update stored historyId to the current notification's historyId
    console.log('=== Updating stored historyId ===');
    console.log(`Updating from ${lastHistoryId} to ${historyId}`);

    const { error: updateError } = await supabaseClient
      .from('gmail_watch_state')
      .update({
        last_history_id: historyId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update stored historyId:', updateError);
    } else {
      console.log('✅ Successfully updated stored historyId');
    }

  } catch (error) {
    console.error('=== Error in Async Email Processing ===');
    console.error('Error:', error);
  }
}
