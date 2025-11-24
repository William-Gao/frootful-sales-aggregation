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

    // Create intake_event - database webhook will handle analysis and order creation
    const { data: intakeEvent, error: intakeError } = await supabase
      .from('intake_events')
      .insert({
        organization_id: null, // Will be determined during processing
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
