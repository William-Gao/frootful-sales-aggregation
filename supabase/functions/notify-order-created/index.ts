import { Resend } from 'npm:resend@2.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { orderId, customerName, deliveryDate, items, orderFrequency } = await req.json();

    if (!resend) {
      console.warn('RESEND_API_KEY not configured, skipping email notification');
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get user's email/name for the "created by" field
    const createdBy = user.email || 'Unknown user';

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const itemsHtml = (items || [])
      .map((item: { name: string; size: string; quantity: number }) =>
        `<tr><td style="padding: 4px 8px;">${item.name}</td><td style="padding: 4px 8px; text-align: center;">${item.size || '-'}</td><td style="padding: 4px 8px; text-align: center;">${item.quantity}</td></tr>`
      )
      .join('');

    await resend.emails.send({
      from: 'Frootful Orders <orders@notifications.frootful.ai>',
      to: ['william@frootful.ai'],
      subject: `New Order Created: ${customerName} — ${deliveryDate}`,
      html: `
        <h2>New Order Created Manually</h2>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Delivery Date:</strong> ${deliveryDate}</p>
        <p><strong>Type:</strong> ${orderFrequency === 'recurring' ? 'Recurring' : 'One-time'}</p>
        <p><strong>Created by:</strong> ${createdBy}</p>
        <p><strong>Time:</strong> ${timestamp}</p>
        <hr/>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr style="background: #f5f5f5; text-align: left;">
              <th style="padding: 6px 8px;">Item</th>
              <th style="padding: 6px 8px; text-align: center;">Size</th>
              <th style="padding: 6px 8px; text-align: center;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <hr/>
        <p><small>Order ID: ${orderId}</small></p>
      `,
    });

    console.log('Email notification sent for manual order creation');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
