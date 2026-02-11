import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { Resend } from 'npm:resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Resend client
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface TwilioWebhookData {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  AccountSid: string;
  NumSegments?: string;
  SmsStatus?: string;
  FromCity?: string;
  FromState?: string;
  FromCountry?: string;
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
    console.log('📱 Processing incoming Twilio webhook...');

    // Parse Twilio webhook payload
    const contentType = req.headers.get('content-type');
    let webhookData: TwilioWebhookData;

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      webhookData = {
        From: formData.get('From') as string,
        To: formData.get('To') as string,
        Body: formData.get('Body') as string,
        MessageSid: formData.get('MessageSid') as string,
        AccountSid: formData.get('AccountSid') as string,
        NumSegments: formData.get('NumSegments') as string,
        SmsStatus: formData.get('SmsStatus') as string,
        FromCity: formData.get('FromCity') as string,
        FromState: formData.get('FromState') as string,
        FromCountry: formData.get('FromCountry') as string,
      };
    } else {
      webhookData = await req.json();
    }

    console.log(`Received text from: ${webhookData.From}`);
    console.log(`Message body: ${webhookData.Body?.substring(0, 100)}...`);

    if (!webhookData.From || !webhookData.Body) {
      throw new Error('Missing required webhook data: From or Body');
    }

    // Look up organization from sender's phone number (user phone → user_organizations)
    const normalizedPhone = webhookData.From.replace(/\s+/g, '');
    console.log(`🔍 Looking up organization for phone: ${normalizedPhone}`);

    let organizationId: string | null = null;

    // Try to find user by phone number using existing RPC
    const { data: userId } = await supabase
      .rpc('get_user_id_by_phone', { user_phone: normalizedPhone });

    if (userId) {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      if (userOrg) {
        organizationId = userOrg.organization_id;
        console.log(`✅ Resolved org ${organizationId} from phone ${normalizedPhone}`);
      }
    } else {
      // Try without + prefix (some systems store without it)
      const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
      const { data: altUserId } = await supabase
        .rpc('get_user_id_by_phone', { user_phone: phoneWithoutPlus });

      if (altUserId) {
        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', altUserId)
          .single();

        if (userOrg) {
          organizationId = userOrg.organization_id;
          console.log(`✅ Resolved org ${organizationId} from phone ${phoneWithoutPlus} (without +)`);
        }
      }
    }

    // Error if no organization found - don't silently route to wrong org
    if (!organizationId) {
      throw new Error(`No organization found for phone number: ${normalizedPhone}`);
    }

    // Create intake_event with resolved organization
    const { data: intakeEvent, error: intakeError } = await supabase
      .from('intake_events')
      .insert({
        organization_id: organizationId,
        channel: 'sms',
        provider: 'twilio',
        provider_message_id: webhookData.MessageSid,
        raw_content: {
          from: webhookData.From,
          to: webhookData.To,
          body: webhookData.Body,
          account_sid: webhookData.AccountSid,
          from_city: webhookData.FromCity,
          from_state: webhookData.FromState,
          from_country: webhookData.FromCountry,
          num_segments: webhookData.NumSegments,
          sms_status: webhookData.SmsStatus
        }
      })
      .select()
      .single();

    if (intakeError) throw intakeError;
    console.log(`✅ Created intake_event: ${intakeEvent.id}`);

    // Send email notification via Resend
    if (resend) {
      try {
        const timestamp = new Date().toLocaleString('en-US', {
          timeZone: 'America/New_York',
          dateStyle: 'medium',
          timeStyle: 'short'
        });

        await resend.emails.send({
          from: 'Frootful Orders <orders@notifications.frootful.ai>',
          to: ['william@frootful.ai'],
          subject: `New SMS Order from ${webhookData.From}`,
          html: `
            <h2>New SMS Order Received</h2>
            <p><strong>From:</strong> ${webhookData.From}</p>
            <p><strong>To:</strong> ${webhookData.To}</p>
            <p><strong>Time:</strong> ${timestamp}</p>
            <p><strong>Location:</strong> ${webhookData.FromCity || 'Unknown'}, ${webhookData.FromState || 'Unknown'}</p>
            <hr/>
            <p><strong>Message:</strong></p>
            <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #333;">
              ${webhookData.Body}
            </blockquote>
            <hr/>
            <p><small>Intake Event ID: ${intakeEvent.id}</small></p>
          `,
        });
        console.log('📧 Email notification sent to william@frootful.ai');
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't throw - email failure shouldn't break the webhook
      }
    } else {
      console.warn('⚠️ RESEND_API_KEY not configured, skipping email notification');
    }

    // Return TwiML response
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for your order! We've received your message and are processing it. You'll receive a confirmation shortly.</Message>
</Response>`,
      {
        headers: {
          'Content-Type': 'text/xml',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error processing Twilio webhook:', error);

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, we encountered an error processing your order. Please try again or contact support.</Message>
</Response>`,
      {
        headers: {
          'Content-Type': 'text/xml',
          ...corsHeaders
        },
        status: 500
      }
    );
  }
});
