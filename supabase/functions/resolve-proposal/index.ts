import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { createLogger } from '../_shared/logger.ts';

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

interface SubmittedLine {
  change_type: 'add' | 'remove' | 'modify';
  item_name: string;
  item_id: string | null;
  item_variant_id: string | null;
  quantity: number;
  variant_code: string | null;
  order_line_id: string | null;
}

interface ResolvePayload {
  proposalId: string;
  action: 'accept' | 'reject';
  submittedLines?: SubmittedLine[];
  customerName?: string;
  customerId?: string | null;
  deliveryDate?: string | null;
  notes?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const logger = createLogger({ requestId, functionName: 'resolve-proposal' });

  try {
    // Auth: verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const payload: ResolvePayload = await req.json();
    const proposalLogger = logger.child({ proposalId: payload.proposalId });
    proposalLogger.info('Received resolve request', { action: payload.action, userEmail: user.email });

    // Fetch proposal
    const { data: proposal, error: proposalFetchError } = await supabase
      .from('order_change_proposals')
      .select('*, organization_id')
      .eq('id', payload.proposalId)
      .single();

    if (proposalFetchError || !proposal) {
      return new Response(
        JSON.stringify({ success: false, error: 'Proposal not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (proposal.status !== 'pending') {
      return new Response(
        JSON.stringify({ success: false, error: `Proposal already ${proposal.status}` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Fetch original AI proposal lines for audit comparison
    const { data: originalLines } = await supabase
      .from('order_change_proposal_lines')
      .select('*')
      .eq('proposal_id', payload.proposalId)
      .order('line_number', { ascending: true });

    // Determine proposal type from column, fall back to tags.intent
    const proposalType = proposal.type || proposal.tags?.intent || null;
    proposalLogger.info('Proposal type', { type: proposalType, orderId: proposal.order_id });

    // Get organization name for notifications
    let organizationName = 'Unknown Organization';
    if (proposal.organization_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', proposal.organization_id)
        .single();
      if (orgData?.name) organizationName = orgData.name;
    }

    let result: { success: boolean; orderId: string | null };

    if (payload.action === 'accept') {
      result = await handleAccept(payload, proposal, proposalType, originalLines || [], user, organizationName, proposalLogger);
    } else {
      result = await handleReject(payload, proposal, user, organizationName, proposalLogger);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    logger.error('Unhandled error in resolve-proposal', error);

    // Send error notification
    try {
      await sendNotificationEmail(
        `[Frootful] Error Resolving Proposal`,
        buildErrorEmailBody(error, 'resolve-proposal'),
      );
    } catch (notifError) {
      logger.error('Failed to send error notification', notifError);
    }

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});

async function handleAccept(
  payload: ResolvePayload,
  proposal: any,
  proposalType: string | null,
  originalLines: any[],
  user: any,
  organizationName: string,
  logger: any
): Promise<{ success: boolean; orderId: string | null }> {
  let orderId = proposal.order_id;

  if (proposalType === 'cancel_order') {
    // Cancel order flow
    if (!orderId) throw new Error('Cancel proposal has no order_id');

    logger.info('Cancelling order', { orderId });

    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    // Check if recurring cancel needs ERP sync
    const isRecurring = proposal.tags?.order_frequency === 'recurring';
    const updatedTags = isRecurring
      ? { ...proposal.tags, erp_sync_status: 'pending' }
      : proposal.tags;

    await supabase
      .from('order_change_proposals')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        order_id: orderId,
        tags: updatedTags,
      })
      .eq('id', payload.proposalId);

    // Create order event
    await supabase.from('order_events').insert({
      order_id: orderId,
      type: 'cancelled',
      metadata: {
        proposal_id: payload.proposalId,
        cancelled_by: user.email,
      }
    });

    // Send notification
    await sendAcceptNotification(payload, proposal, orderId, user, organizationName, true, logger);

    return { success: true, orderId };

  } else if (proposalType === 'new_order') {
    // New order flow
    const submittedLines = payload.submittedLines || [];
    if (submittedLines.length === 0) throw new Error('No submitted lines for new order');

    logger.info('Creating new order', { lineCount: submittedLines.length });

    // Get customer info
    const customerName = payload.customerName || 'Unknown Customer';
    const customerId = payload.customerId || null;

    // Get first original line's proposed_values for org/channel info
    const firstOriginal = originalLines[0]?.proposed_values || {};

    const { data: newOrder, error: createError } = await supabase
      .from('orders')
      .insert({
        organization_id: proposal.organization_id,
        customer_id: customerId,
        customer_name: customerName,
        delivery_date: payload.deliveryDate || null,
        source_channel: firstOriginal.source_channel || null,
        status: 'pushed_to_erp',
        created_by_user_id: firstOriginal.created_by_user_id || null,
      })
      .select()
      .single();

    if (createError) throw createError;
    orderId = newOrder.id;
    logger.info('Order created', { orderId });

    // Create order events
    await supabase.from('order_events').insert([
      {
        order_id: orderId,
        type: 'created',
        metadata: { proposal_id: payload.proposalId, source: 'approved_proposal', line_count: submittedLines.length }
      },
      {
        order_id: orderId,
        type: 'exported',
        metadata: { proposal_id: payload.proposalId, destination: 'ERP', status: 'pushed_to_erp' }
      }
    ]);

    // Insert order lines
    await insertOrderLines(orderId, submittedLines, logger);

    // Audit: compare submitted vs AI-proposed
    const auditData = buildAuditData(submittedLines, originalLines, user);

    // Check for recurring ERP sync
    const isRecurring = proposal.tags?.order_frequency === 'recurring';
    const updatedTags = isRecurring
      ? { ...proposal.tags, erp_sync_status: 'pending' }
      : proposal.tags;

    // Update proposal
    await supabase
      .from('order_change_proposals')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        order_id: orderId,
        tags: updatedTags,
        metadata: auditData,
      })
      .eq('id', payload.proposalId);

    // Send notification
    await sendAcceptNotification(payload, proposal, orderId, user, organizationName, true, logger);

    return { success: true, orderId };

  } else if (proposalType === 'change_order') {
    // Change order flow
    if (!orderId) throw new Error('Change proposal has no order_id');
    const submittedLines = payload.submittedLines || [];
    if (submittedLines.length === 0) throw new Error('No submitted lines for change order');

    logger.info('Applying changes to order', { orderId, lineCount: submittedLines.length });

    // Apply line changes
    await applyOrderLineChanges(orderId, submittedLines, logger);

    // Audit
    const auditData = buildAuditData(submittedLines, originalLines, user);

    // Check for recurring ERP sync
    const isRecurring = proposal.tags?.order_frequency === 'recurring';
    const updatedTags = isRecurring
      ? { ...proposal.tags, erp_sync_status: 'pending' }
      : proposal.tags;

    // Update proposal
    await supabase
      .from('order_change_proposals')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        order_id: orderId,
        tags: updatedTags,
        metadata: auditData,
      })
      .eq('id', payload.proposalId);

    // Create order event with audit
    await supabase.from('order_events').insert({
      order_id: orderId,
      type: 'change_accepted',
      metadata: {
        proposal_id: payload.proposalId,
        ...auditData,
      }
    });

    // Send notification
    await sendAcceptNotification(payload, proposal, orderId, user, organizationName, false, logger);

    return { success: true, orderId };

  } else {
    throw new Error(`Unknown proposal type: ${proposalType}`);
  }
}

async function handleReject(
  payload: ResolvePayload,
  proposal: any,
  user: any,
  organizationName: string,
  logger: any
): Promise<{ success: boolean; orderId: string | null }> {
  logger.info('Rejecting proposal', { orderId: proposal.order_id, notes: payload.notes });

  // Update proposal status
  await supabase
    .from('order_change_proposals')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      notes: payload.notes || null,
    })
    .eq('id', payload.proposalId);

  // Create order event (only for proposals linked to existing orders)
  if (proposal.order_id) {
    await supabase.from('order_events').insert({
      order_id: proposal.order_id,
      type: 'change_rejected',
      metadata: {
        proposal_id: payload.proposalId,
        rejected_by: user.email,
        notes: payload.notes || null,
      }
    });
  }

  // Send rejection notification
  try {
    const proposalType = proposal.type || proposal.tags?.intent || 'unknown';
    // Get customer name for notification
    let customerName = 'Unknown Customer';
    if (proposal.order_id) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('customer_name')
        .eq('id', proposal.order_id)
        .single();
      if (orderData) customerName = orderData.customer_name;
    } else {
      // For new order proposals, get from proposal lines
      const { data: firstLine } = await supabase
        .from('order_change_proposal_lines')
        .select('proposed_values')
        .eq('proposal_id', payload.proposalId)
        .limit(1)
        .single();
      if (firstLine?.proposed_values?.customer_name) {
        customerName = firstLine.proposed_values.customer_name;
      }
    }

    await sendNotificationEmail(
      `[Frootful] Proposal Rejected: ${customerName}`,
      buildRejectEmailBody({
        proposalId: payload.proposalId,
        customerName,
        organizationName,
        proposalType,
        rejectedBy: user.email || 'Unknown User',
        notes: payload.notes || null,
      })
    );
  } catch (notifError) {
    logger.error('Failed to send rejection notification (non-blocking)', notifError);
  }

  return { success: true, orderId: proposal.order_id };
}

// ---- Order line operations ----

async function insertOrderLines(orderId: string, lines: SubmittedLine[], logger: any) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineData: any = {
      order_id: orderId,
      line_number: i + 1,
      product_name: line.item_name,
      quantity: line.quantity,
      item_id: line.item_id || null,
      item_variant_id: line.item_variant_id || null,
      status: 'active',
    };

    // If no item_variant_id but we have item_id + variant_code, look it up
    if (!lineData.item_variant_id && line.item_id && line.variant_code) {
      const { data: variantData } = await supabase
        .from('item_variants')
        .select('id')
        .eq('item_id', line.item_id)
        .eq('variant_code', line.variant_code)
        .single();
      if (variantData) lineData.item_variant_id = variantData.id;
    }

    const { error } = await supabase.from('order_lines').insert(lineData);
    if (error) {
      logger.error('Error inserting order line', error, { lineNumber: i + 1, itemName: line.item_name });
      throw error;
    }
  }
  logger.info('Order lines inserted', { count: lines.length });
}

async function applyOrderLineChanges(orderId: string, lines: SubmittedLine[], logger: any) {
  // Get max line_number for new lines
  const { data: existingLines } = await supabase
    .from('order_lines')
    .select('line_number')
    .eq('order_id', orderId)
    .order('line_number', { ascending: false })
    .limit(1);
  let nextLineNumber = (existingLines?.[0]?.line_number || 0) + 1;

  for (const line of lines) {
    if (line.change_type === 'add') {
      let itemVariantId = line.item_variant_id || null;
      if (!itemVariantId && line.item_id && line.variant_code) {
        const { data: variantData } = await supabase
          .from('item_variants')
          .select('id')
          .eq('item_id', line.item_id)
          .eq('variant_code', line.variant_code)
          .single();
        if (variantData) itemVariantId = variantData.id;
      }

      const { error } = await supabase.from('order_lines').insert({
        order_id: orderId,
        line_number: nextLineNumber++,
        product_name: line.item_name,
        quantity: line.quantity,
        item_id: line.item_id || null,
        item_variant_id: itemVariantId,
        status: 'active',
      });
      if (error) throw error;

    } else if (line.change_type === 'remove' && line.order_line_id) {
      const { error } = await supabase
        .from('order_lines')
        .update({ status: 'deleted' })
        .eq('id', line.order_line_id);
      if (error) throw error;

    } else if (line.change_type === 'modify' && line.order_line_id) {
      const updates: Record<string, unknown> = { quantity: line.quantity };

      if (line.item_id && line.variant_code) {
        const { data: variantData } = await supabase
          .from('item_variants')
          .select('id')
          .eq('item_id', line.item_id)
          .eq('variant_code', line.variant_code)
          .single();
        if (variantData) updates.item_variant_id = variantData.id;
      } else if (line.item_variant_id) {
        updates.item_variant_id = line.item_variant_id;
      }

      const { error } = await supabase
        .from('order_lines')
        .update(updates)
        .eq('id', line.order_line_id);
      if (error) throw error;
    }
  }
  logger.info('Order line changes applied', { count: lines.length });
}

// ---- Audit ----

function buildAuditData(submittedLines: SubmittedLine[], originalLines: any[], user: any) {
  // Compare submitted lines vs AI-proposed to determine if user edited
  const wasEdited = detectEdits(submittedLines, originalLines);

  return {
    submitted_lines: submittedLines.map(l => ({
      change_type: l.change_type,
      item_name: l.item_name,
      item_id: l.item_id || null,
      quantity: l.quantity,
      variant_code: l.variant_code || null,
      order_line_id: l.order_line_id || null,
    })),
    was_edited: wasEdited,
    accepted_at: new Date().toISOString(),
    accepted_by: user.email || null,
  };
}

function detectEdits(submitted: SubmittedLine[], original: any[]): boolean {
  if (submitted.length !== original.length) return true;

  for (let i = 0; i < submitted.length; i++) {
    const s = submitted[i];
    // Try to find a matching original line
    const match = original.find(o =>
      o.item_name === s.item_name &&
      o.change_type === s.change_type &&
      (o.proposed_values?.quantity ?? null) === s.quantity
    );
    if (!match) return true;
  }
  return false;
}

// ---- Notifications ----

async function sendAcceptNotification(
  payload: ResolvePayload,
  proposal: any,
  orderId: string,
  user: any,
  organizationName: string,
  isNewOrder: boolean,
  logger: any
) {
  try {
    const submittedLines = payload.submittedLines || [];
    const proposalType = proposal.type || proposal.tags?.intent || 'unknown';

    // Get customer name
    let customerName = payload.customerName || 'Unknown Customer';
    if (!payload.customerName && orderId) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('customer_name, delivery_date')
        .eq('id', orderId)
        .single();
      if (orderData) customerName = orderData.customer_name;
    }

    const emailSubject = proposalType === 'cancel_order'
      ? `[Frootful] Order Cancelled: ${customerName}`
      : isNewOrder
        ? `[Frootful] New Order Accepted: ${customerName}`
        : `[Frootful] Order Change Accepted: ${customerName}`;

    const emailBody = buildAcceptEmailBody({
      proposalId: payload.proposalId,
      orderId,
      customerName,
      deliveryDate: payload.deliveryDate || null,
      isNewOrder,
      isCancelOrder: proposalType === 'cancel_order',
      lines: submittedLines,
      acceptedBy: user.email || 'Unknown User',
      organizationName,
    });

    await sendNotificationEmail(emailSubject, emailBody);
    logger.info('Notification email sent', { recipient: NOTIFICATION_RECIPIENT });
  } catch (notifError) {
    logger.error('Failed to send accept notification (non-blocking)', notifError);
  }
}

async function sendNotificationEmail(subject: string, htmlBody: string) {
  // Get admin user's Google token
  const { data: adminUsers, error: adminError } = await supabase.auth.admin.listUsers();
  if (adminError) throw new Error(`Failed to list users: ${adminError.message}`);

  const adminUser = adminUsers.users.find(u => u.email === ADMIN_EMAIL);
  if (!adminUser) throw new Error(`Admin user ${ADMIN_EMAIL} not found`);

  const googleToken = await getGoogleToken(adminUser.id);
  if (!googleToken) throw new Error(`Google token not found for ${ADMIN_EMAIL}`);

  await sendEmailViaGmail(googleToken, NOTIFICATION_RECIPIENT, subject, htmlBody);
}

async function sendEmailViaGmail(accessToken: string, to: string, subject: string, htmlBody: string) {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ].join('\r\n');

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
    body: JSON.stringify({ raw: encodedEmail }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email: ${response.status} - ${errorText}`);
  }
}

// ---- Google Token Management (from process-accept-proposal) ----

async function getGoogleToken(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (error || !data?.encrypted_access_token) return null;

    if (data.token_expires_at) {
      const expiresAt = new Date(data.token_expires_at);
      const now = new Date();
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000 && data.encrypted_refresh_token) {
        const refreshedToken = await refreshGoogleToken(userId, data.encrypted_refresh_token);
        if (refreshedToken) return refreshedToken;
      }
    }

    return await decrypt(data.encrypted_access_token);
  } catch {
    return null;
  }
}

async function refreshGoogleToken(userId: string, encryptedRefreshToken: string): Promise<string | null> {
  try {
    const refreshToken = await decrypt(encryptedRefreshToken);
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return null;

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

    if (!response.ok) return null;

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const encryptedNewToken = await encrypt(newAccessToken);
    await supabase
      .from('user_tokens')
      .update({ encrypted_access_token: encryptedNewToken, token_expires_at: newExpiresAt })
      .eq('user_id', userId)
      .eq('provider', 'google');

    return newAccessToken;
  } catch {
    return null;
  }
}

async function decrypt(encryptedText: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const combined = new Uint8Array(atob(encryptedText).split('').map(char => char.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' }, false, ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return decoder.decode(decrypted);
}

async function encrypt(text: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' }, false, ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// ---- Email Body Builders ----

function buildAcceptEmailBody(params: {
  proposalId: string;
  orderId: string;
  customerName: string;
  deliveryDate: string | null;
  isNewOrder: boolean;
  isCancelOrder: boolean;
  lines: SubmittedLine[];
  acceptedBy: string;
  organizationName: string;
}): string {
  let linesHtml = '';

  if (params.isCancelOrder) {
    linesHtml = '<p style="color: #dc2626; font-weight: bold;">Order has been cancelled.</p>';
  } else {
    const added = params.lines.filter(l => l.change_type === 'add');
    const modified = params.lines.filter(l => l.change_type === 'modify');
    const removed = params.lines.filter(l => l.change_type === 'remove');

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
              <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${line.quantity || '-'}</td>
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
            <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">New Qty</th>
          </tr>
          ${modified.map(line => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${line.item_name}</td>
              <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${line.quantity || '-'}</td>
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
              <td style="padding: 8px; text-align: center; border: 1px solid #ddd; text-decoration: line-through;">${line.quantity || '-'}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }
  }

  const title = params.isCancelOrder
    ? 'Order Cancelled'
    : params.isNewOrder
      ? 'New Order Accepted'
      : 'Order Change Accepted';

  const headerColor = params.isCancelOrder ? '#dc2626' : '#7c3aed';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>${title}</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${headerColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">${title}</h1>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; margin-bottom: 20px;">
          <tr><td style="padding: 4px 0; color: #6b7280;">Proposal ID:</td><td style="padding: 4px 0; font-family: monospace;">${params.proposalId}</td></tr>
          ${params.orderId ? `<tr><td style="padding: 4px 0; color: #6b7280;">Order ID:</td><td style="padding: 4px 0; font-family: monospace;">${params.orderId}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #6b7280;">Customer:</td><td style="padding: 4px 0; font-weight: bold;">${params.customerName}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Organization:</td><td style="padding: 4px 0;">${params.organizationName}</td></tr>
          ${params.deliveryDate ? `<tr><td style="padding: 4px 0; color: #6b7280;">Delivery Date:</td><td style="padding: 4px 0;">${params.deliveryDate}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #6b7280;">Accepted By:</td><td style="padding: 4px 0;">${params.acceptedBy}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <h2 style="color: #7c3aed;">Order Contents</h2>
        ${linesHtml || '<p style="color: #6b7280;">No line items</p>'}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">This is an automated notification from Frootful Sales Aggregation.</p>
      </div>
    </body>
    </html>
  `;
}

function buildRejectEmailBody(params: {
  proposalId: string;
  customerName: string;
  organizationName: string;
  proposalType: string;
  rejectedBy: string;
  notes: string | null;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Proposal Rejected</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Proposal Rejected</h1>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; margin-bottom: 20px;">
          <tr><td style="padding: 4px 0; color: #6b7280;">Proposal ID:</td><td style="padding: 4px 0; font-family: monospace;">${params.proposalId}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Customer:</td><td style="padding: 4px 0; font-weight: bold;">${params.customerName}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Organization:</td><td style="padding: 4px 0;">${params.organizationName}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Proposal Type:</td><td style="padding: 4px 0;">${params.proposalType}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Rejected By:</td><td style="padding: 4px 0;">${params.rejectedBy}</td></tr>
        </table>
        ${params.notes ? `
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <h3 style="color: #f59e0b;">Rejection Notes</h3>
        <p style="background-color: #fffbeb; padding: 12px; border-radius: 4px; border: 1px solid #fde68a;">${params.notes}</p>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">This is an automated notification from Frootful Sales Aggregation.</p>
      </div>
    </body>
    </html>
  `;
}

function buildErrorEmailBody(error: unknown, context: string): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : '';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Processing Error</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Processing Error</h1>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; margin-bottom: 20px;">
          <tr><td style="padding: 4px 0; color: #6b7280;">Context:</td><td style="padding: 4px 0;">${context}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Error:</td><td style="padding: 4px 0; color: #dc2626;">${errorMessage}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Time:</td><td style="padding: 4px 0;">${new Date().toISOString()}</td></tr>
        </table>
        ${errorStack ? `
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <h3>Stack Trace</h3>
        <pre style="background-color: #fee2e2; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px;">${errorStack}</pre>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">This is an automated error notification from Frootful Sales Aggregation.</p>
      </div>
    </body>
    </html>
  `;
}
