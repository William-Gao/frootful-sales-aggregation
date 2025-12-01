import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 Starting complete-onboarding function...');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify the user's JWT token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error(`Unauthorized: ${userError?.message || 'No user found'}`);
    }

    console.log('✅ User authenticated:', user.email);

    // Parse request body
    const { phone } = await req.json();

    if (!phone) {
      throw new Error('Phone number is required');
    }

    // Validate phone format (should be E.164: +1XXXXXXXXXX)
    if (!/^\+1\d{10}$/.test(phone)) {
      throw new Error('Invalid phone format. Expected: +1XXXXXXXXXX');
    }

    console.log(`📞 Updating phone number for user ${user.email}: ${phone}`);

    // Update the user's phone number and metadata in a single call
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        phone: phone,
        user_metadata: {
          phone_number: phone,
          onboarding_completed: true
        }
      }
    );

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }

    console.log('✅ Onboarding completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Onboarding completed successfully',
        phone: phone
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Error completing onboarding:', error);
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
