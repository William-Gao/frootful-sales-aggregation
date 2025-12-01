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

const ADMIN_EMAIL = 'orders.frootful@gmail.com';
const NOTIFICATION_RECIPIENT = 'william@frootful.ai';

interface ProposalLine {
  id: string;
  change_type: 'add' | 'remove' | 'modify';
  item_name: string;
  proposed_values: Record<string, unknown>;
}

interface NotificationPayload {
  proposalId: string;
  orderId: string | null;
  customerName: string;
  deliveryDate: string | null;
  isNewOrder: boolean;
  lines: ProposalLine[];
  acceptedBy: string;
  organizationName: string;
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
    // Verify authorization (accept both service role and authenticated users)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const payload: NotificationPayload = await req.json();
    console.log('Received notification payload:', JSON.stringify(payload, null, 2));

    // Get admin user by email
    const { data: adminUsers, error: adminError } = await supabase.auth.admin.listUsers();
    if (adminError) {
      throw new Error(`Failed to list users: ${adminError.message}`);
    }

    const adminUser = adminUsers.users.find(u => u.email === ADMIN_EMAIL);
    if (!adminUser) {
      throw new Error(`Admin user ${ADMIN_EMAIL} not found`);
    }

    console.log('Found admin user:', adminUser.id);

    // Get Google token for admin
    const googleToken = await getGoogleToken(adminUser.id);
    if (!googleToken) {
      throw new Error(`Google token not found for ${ADMIN_EMAIL}. Please sign in with Google.`);
    }

    console.log('Got Google token for admin');

    // Build email content
    const emailSubject = payload.isNewOrder
      ? `[Frootful] New Order Accepted: ${payload.customerName}`
      : `[Frootful] Order Change Accepted: ${payload.customerName}`;

    const emailBody = buildEmailBody(payload);

    // Send email via Gmail API
    await sendEmail(googleToken, NOTIFICATION_RECIPIENT, emailSubject, emailBody);

    console.log('Email sent successfully to', NOTIFICATION_RECIPIENT);

    return new Response(
      JSON.stringify({ success: true, message: `Notification sent to ${NOTIFICATION_RECIPIENT}` }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );

  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 500
      }
    );
  }
});

async function getGoogleToken(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (error || !data?.encrypted_access_token) {
      console.error('No Google token found for user:', userId);
      return null;
    }

    // Check if token is expired
    if (data.token_expires_at) {
      const expiresAt = new Date(data.token_expires_at);
      const now = new Date();

      // If token expires in less than 5 minutes, try to refresh it
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000 && data.encrypted_refresh_token) {
        console.log('Token expiring soon, attempting refresh...');
        const refreshedToken = await refreshGoogleToken(userId, data.encrypted_refresh_token);
        if (refreshedToken) {
          return refreshedToken;
        }
      }
    }

    // Decrypt the token
    return await decrypt(data.encrypted_access_token);
  } catch (error) {
    console.error('Error getting Google token:', error);
    return null;
  }
}

async function refreshGoogleToken(userId: string, encryptedRefreshToken: string): Promise<string | null> {
  try {
    const refreshToken = await decrypt(encryptedRefreshToken);
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials not configured');
      return null;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh token:', await response.text());
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update the stored token
    const encryptedNewToken = await encrypt(newAccessToken);
    await supabase
      .from('user_tokens')
      .update({
        encrypted_access_token: encryptedNewToken,
        token_expires_at: newExpiresAt,
      })
      .eq('user_id', userId)
      .eq('provider', 'google');

    console.log('Token refreshed successfully');
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

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

async function encrypt(text: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

function buildEmailBody(payload: NotificationPayload): string {
  const lines = payload.lines;

  let linesHtml = '';

  // Group lines by change type
  const added = lines.filter(l => l.change_type === 'add');
  const modified = lines.filter(l => l.change_type === 'modify');
  const removed = lines.filter(l => l.change_type === 'remove');

  if (added.length > 0) {
    linesHtml += `
      <h3 style="color: #16a34a; margin-top: 16px;">Added Items (${added.length})</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr style="background-color: #dcfce7;">
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Item</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Quantity</th>
        </tr>
        ${added.map(line => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${line.item_name}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${(line.proposed_values as any)?.quantity || '-'}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  if (modified.length > 0) {
    linesHtml += `
      <h3 style="color: #ca8a04; margin-top: 16px;">Modified Items (${modified.length})</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr style="background-color: #fef9c3;">
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Item</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Original Qty</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">New Qty</th>
        </tr>
        ${modified.map(line => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${line.item_name}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${(line.proposed_values as any)?.original_quantity || '-'}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${(line.proposed_values as any)?.quantity || '-'}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  if (removed.length > 0) {
    linesHtml += `
      <h3 style="color: #dc2626; margin-top: 16px;">Removed Items (${removed.length})</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr style="background-color: #fee2e2;">
          <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Item</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Quantity</th>
        </tr>
        ${removed.map(line => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; text-decoration: line-through;">${line.item_name}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd; text-decoration: line-through;">${(line.proposed_values as any)?.original_quantity || '-'}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Proposal Accepted</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">
          ${payload.isNewOrder ? 'New Order Accepted' : 'Order Change Accepted'}
        </h1>
      </div>

      <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <h2 style="margin-top: 0; color: #7c3aed;">Proposal Details</h2>

        <table style="width: 100%; margin-bottom: 20px;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Proposal ID:</td>
            <td style="padding: 4px 0; font-family: monospace;">${payload.proposalId}</td>
          </tr>
          ${payload.orderId ? `
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Order ID:</td>
            <td style="padding: 4px 0; font-family: monospace;">${payload.orderId}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Customer:</td>
            <td style="padding: 4px 0; font-weight: bold;">${payload.customerName}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Organization:</td>
            <td style="padding: 4px 0;">${payload.organizationName}</td>
          </tr>
          ${payload.deliveryDate ? `
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Delivery Date:</td>
            <td style="padding: 4px 0;">${payload.deliveryDate}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Accepted By:</td>
            <td style="padding: 4px 0;">${payload.acceptedBy}</td>
          </tr>
        </table>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

        <h2 style="color: #7c3aed;">Order Contents</h2>

        ${linesHtml || '<p style="color: #6b7280;">No line items</p>'}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">
          This is an automated notification from Frootful Sales Aggregation.
        </p>
      </div>
    </body>
    </html>
  `;
}

async function sendEmail(accessToken: string, to: string, subject: string, htmlBody: string): Promise<void> {
  // Build the email in RFC 2822 format
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ].join('\r\n');

  // Base64url encode the email
  const encodedEmail = btoa(email)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedEmail
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Email sent, message ID:', result.id);
}
