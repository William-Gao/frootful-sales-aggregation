import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger, type Logger } from '../_shared/logger.ts';

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
  } catch (_error) {
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
  } catch (_error) {
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

// Helper function to download Gmail attachment
async function downloadGmailAttachment(messageId: string, attachmentId: string, accessToken: string): Promise<Uint8Array> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to download attachment: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Gmail returns base64url encoded data
  const base64Data = data.data.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

// Helper function to get file extension from filename
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

// Helper function to store attachment in Supabase Storage and create intake_files record
async function storeAttachment(
  supabaseClient: any,
  attachment: any,
  messageId: string,
  accessToken: string,
  intakeEventId: string,
  organizationId: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    // Download the attachment from Gmail
    const fileBytes = await downloadGmailAttachment(messageId, attachment.attachmentId, accessToken);

    // Generate file ID and storage path
    const fileId = crypto.randomUUID();
    const extension = getFileExtension(attachment.filename);
    const storagePath = `${organizationId}/${intakeEventId}/${fileId}${extension ? '.' + extension : ''}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseClient.storage
      .from('intake-files')
      .upload(storagePath, fileBytes, {
        contentType: attachment.mimeType || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    // Create intake_files record
    const { error: insertError } = await supabaseClient
      .from('intake_files')
      .insert({
        id: fileId,
        organization_id: organizationId,
        intake_event_id: intakeEventId,
        filename: attachment.filename,
        extension: extension || null,
        mime_type: attachment.mimeType,
        size_bytes: attachment.size || fileBytes.length,
        source: 'email',
        source_metadata: {
          gmail_attachment_id: attachment.attachmentId,
          gmail_message_id: messageId,
        },
        storage_path: storagePath,
        processing_status: 'pending',
      });

    if (insertError) {
      // Try to clean up the uploaded file
      await supabaseClient.storage.from('intake-files').remove([storagePath]);
      return { success: false, error: insertError.message };
    }

    return { success: true, fileId };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
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

  if (error || !data) {
    return null;
  }

  // Check if token is expired
  const now = new Date().getTime();
  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;

  if (now >= expiresAt && data.encrypted_refresh_token) {
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

      return newTokens.access_token;
    } catch (_refreshError) {
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

  const requestId = crypto.randomUUID();
  const logger = createLogger({
    requestId,
    functionName: 'process-gmail-notification'
  });

  try {
    logger.info('Gmail Pub/Sub notification received');

    // Parse request body from Pub/Sub
    const body = await req.json();

    if (!body.message || !body.message.data) {
      logger.error('Invalid Pub/Sub message format');
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

    // Extract email and history ID
    const userEmail = gmailNotification.emailAddress;
    const historyId = gmailNotification.historyId;

    logger.info('Gmail notification parsed', { userEmail, historyId });

    // IMPORTANT: Acknowledge the Pub/Sub message immediately by returning 200
    // Process the email asynchronously without blocking the response
    processEmailAsync(userEmail, historyId, logger).catch(error => {
      logger.error('Error in async processing', error);
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
    logger.error('Error processing request', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Process email asynchronously after acknowledging Pub/Sub
async function processEmailAsync(userEmail: string, historyId: string, logger: Logger) {
  try {
    logger.info('Starting async email processing', { userEmail, historyId });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user_id from email using RPC function
    const { data: userId, error: userError } = await supabaseClient
      .rpc('get_user_id_by_email', { user_email: userEmail });

    if (userError || !userId) {
      logger.error('User not found', userError, { userEmail });
      throw new Error('User not found');
    }

    logger.info('User found', { userId });

    // NOTE: We don't look up organization here - the organization is determined per email
    // based on the SENDER's email (the sales associate), not the recipient (orders.frootful@gmail.com)

    // Get user's Gmail access token
    const accessToken = await getUserAccessToken(userId, supabaseClient);

    if (!accessToken) {
      logger.error('No access token found for user', undefined, { userEmail });
      throw new Error('User access token not found');
    }

    // Get stored watch state (including last processed historyId)
    const { data: watchState, error: watchStateError } = await supabaseClient
      .from('gmail_watch_state')
      .select('last_history_id')
      .eq('user_id', userId)
      .single();

    if (watchStateError) {
      logger.error('Error fetching watch state', watchStateError);
      throw new Error('Failed to fetch watch state');
    }

    if (!watchState) {
      logger.error('No watch state found for user - watch may not be set up yet');
      throw new Error('Watch state not found');
    }

    const lastHistoryId = watchState.last_history_id;

    logger.info('Watch state retrieved', { lastHistoryId, currentHistoryId: historyId });

    // Use History API to get changes since last processed historyId
    const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${lastHistoryId}`;

    const historyResponse = await fetch(historyUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!historyResponse.ok) {
      const error = await historyResponse.text();
      logger.error('Gmail History API error', undefined, { status: historyResponse.status, error });
      throw new Error(`Gmail History API returned ${historyResponse.status}: ${error}`);
    }

    const historyData = await historyResponse.json();
    const historyRecordCount = historyData.history?.length || 0;

    logger.info('Gmail history fetched', { historyRecordCount });

    // Extract ALL message IDs from history records
    const newMessageIds: string[] = [];

    if (historyData.history) {
      for (const record of historyData.history) {
        // Process ALL messagesAdded events
        if (record.messagesAdded) {
          for (const messageChange of record.messagesAdded) {
            const messageId = messageChange.message.id;
            newMessageIds.push(messageId);
          }
        }

        // Also process labelsAdded events
        if (record.labelsAdded) {
          for (const labelChange of record.labelsAdded) {
            const messageId = labelChange.message.id;
            if (!newMessageIds.includes(messageId)) {
              newMessageIds.push(messageId);
            }
          }
        }
      }
    }

    logger.info('Messages to process', { count: newMessageIds.length, messageIds: newMessageIds });

    // Process each new message - create intake_events
    for (const messageId of newMessageIds) {
      // Create a child logger with messageId context
      const msgLogger = logger.child({ messageId });

      try {
        msgLogger.info('Processing message');

        // Fetch full message from Gmail API
        const gmailMessage = await fetchGmailMessage(messageId, accessToken);

        // Extract headers
        const headers = gmailMessage.payload.headers;
        const from = getHeader(headers, 'From');
        const to = getHeader(headers, 'To');
        const subject = getHeader(headers, 'Subject');
        const dateStr = getHeader(headers, 'Date');
        const threadId = gmailMessage.threadId;

        msgLogger.info('Email metadata extracted', { from, to, subject, date: dateStr });

        // Extract body content
        const { plainText, htmlBody } = extractBody(gmailMessage.payload);

        // Extract attachments metadata
        const attachments = extractAttachments(gmailMessage.payload);

        msgLogger.info('Email content extracted', { attachmentCount: attachments.length, hasPlainText: !!plainText, hasHtml: !!htmlBody });

        // Convert all headers to object format
        const headersJson = headers.reduce((acc: any, h: any) => {
          acc[h.name] = h.value;
          return acc;
        }, {});

        // Determine organization_id from the SENDER's email (sales associate)
        // Extract email address from "Name <email@domain.com>" format
        const emailMatch = from ? from.match(/<([^>]+)>/) || [null, from] : [null, null];
        const senderEmail = emailMatch[1]?.trim();

        if (!senderEmail) {
          msgLogger.warn('Unrecognized sender - could not extract email', { from });
          continue;
        }

        // Demo organization constants
        const DEMO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
        const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

        // Get user ID by sender email
        const { data: senderUserId, error: senderUserError } = await supabaseClient
          .rpc('get_user_id_by_email', { user_email: senderEmail });

        let organizationId: string;
        let resolvedUserId: string;
        let isDemoFallback = false;
        let fallbackReason: string | null = null;

        if (senderUserError || !senderUserId) {
          // User not found - fall back to demo organization
          isDemoFallback = true;
          fallbackReason = 'user_not_found';
          organizationId = DEMO_ORGANIZATION_ID;
          resolvedUserId = DEMO_USER_ID;
          msgLogger.info('Sender not found - falling back to demo organization', { senderEmail, subject, from });
        } else {
          // Get sender's organization
          const { data: senderOrg, error: senderOrgError } = await supabaseClient
            .from('user_organizations')
            .select('organization_id')
            .eq('user_id', senderUserId)
            .single();

          if (senderOrgError || !senderOrg) {
            // User exists but has no organization - fall back to demo
            isDemoFallback = true;
            fallbackReason = 'user_has_no_org';
            organizationId = DEMO_ORGANIZATION_ID;
            resolvedUserId = DEMO_USER_ID;
            msgLogger.info('Sender has no organization - falling back to demo organization', { senderEmail, senderUserId, subject, from });
          } else {
            organizationId = senderOrg.organization_id;
            resolvedUserId = senderUserId;
          }
        }

        const orgLogger = msgLogger.child({ organizationId, isDemoFallback });

        // Log demo fallback for transparency
        if (isDemoFallback) {
          const { data: logEntry, error: logError } = await supabaseClient
            .from('demo_fallback_logs')
            .insert({
              original_email: senderEmail,
              reason: fallbackReason,
              metadata: {
                subject: subject,
                from: from,
                gmail_message_id: messageId,
                timestamp: new Date().toISOString()
              }
            })
            .select('id')
            .single();

          if (logError) {
            orgLogger.warn('Failed to log demo fallback', { error: logError.message });
          } else {
            orgLogger.info('Demo fallback logged', { logId: logEntry?.id, reason: fallbackReason });
          }
        }

        orgLogger.info('Organization resolved for sender', { senderEmail, isDemoFallback });

        // Create intake_event
        const { data: intakeEvent, error: intakeError } = await supabaseClient
          .from('intake_events')
          .insert({
            organization_id: organizationId,
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
            orgLogger.info('Intake event already exists for message (duplicate)');
          } else {
            orgLogger.error('Failed to create intake_event', intakeError);
          }
        } else {
          const intakeLogger = orgLogger.child({ intakeEventId: intakeEvent.id });
          intakeLogger.info('Created intake_event');

          // Store attachments in Supabase Storage
          if (attachments.length > 0) {
            intakeLogger.info('Storing attachments', { count: attachments.length });
            for (const attachment of attachments) {
              const result = await storeAttachment(
                supabaseClient,
                attachment,
                messageId,
                accessToken,
                intakeEvent.id,
                organizationId
              );
              if (!result.success) {
                intakeLogger.warn('Failed to store attachment', { filename: attachment.filename, error: result.error });
              } else {
                intakeLogger.info('Attachment stored', { filename: attachment.filename, fileId: result.fileId });
              }
            }
          }
        }

      } catch (msgError) {
        msgLogger.error('Error processing message', msgError);
        // Continue with other messages
      }
    }

    logger.info('Async processing complete', { processedCount: newMessageIds.length });

    // Update stored historyId to the current notification's historyId
    const { error: updateError } = await supabaseClient
      .from('gmail_watch_state')
      .update({
        last_history_id: historyId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      logger.error('Failed to update stored historyId', updateError);
    } else {
      logger.info('Updated stored historyId', { from: lastHistoryId, to: historyId });
    }

  } catch (error) {
    logger.error('Error in async email processing', error);
  }
}
