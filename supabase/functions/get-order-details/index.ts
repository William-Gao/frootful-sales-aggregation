import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
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

    // Get user's organization
    const { data: userOrg, error: orgError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (orgError || !userOrg) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not associated with any organization' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const organizationId = userOrg.organization_id;
    const url = new URL(req.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing orderId parameter' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Fetch full order details with all related data
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        customer_name,
        customer_reference,
        status,
        delivery_date,
        total_amount,
        currency,
        created_at,
        updated_at,
        origin_intake_event_id,
        source_channel,
        user_reviewed_at,
        reviewed_by,
        created_by_user_id,
        customers (
          id,
          name,
          email
        ),
        order_lines!inner (
          id,
          line_number,
          product_name,
          quantity,
          item_id,
          meta,
          status
        ),
        intake_events!origin_intake_event_id (
          id,
          channel,
          provider,
          provider_message_id,
          raw_content,
          created_at
        )
      `)
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .eq('order_lines.status', 'active')
      .single();

    if (orderError) {
      console.error('Error fetching order details:', orderError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found',
          details: orderError.message,
          orderId: orderId,
          organizationId: organizationId
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    if (!order) {
      console.error('Order query returned no data for:', orderId, organizationId);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found - no data returned',
          orderId: orderId,
          organizationId: organizationId
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Note: Legacy email_orders table has been removed

    // Fetch creator user information if available
    let creatorInfo = null;
    if (order.created_by_user_id) {
      const { data: creatorData } = await supabase.auth.admin.getUserById(order.created_by_user_id);
      if (creatorData?.user) {
        creatorInfo = {
          id: creatorData.user.id,
          name: creatorData.user.user_metadata?.name || creatorData.user.email?.split('@')[0] || 'Unknown',
          email: creatorData.user.email,
          profile_picture: creatorData.user.user_metadata?.picture || creatorData.user.user_metadata?.avatar_url
        };
      }
    }

    // Transform the data to match the frontend interface
    const intakeEvent = Array.isArray(order.intake_events) ? order.intake_events[0] : order.intake_events;
    const rawContent = intakeEvent?.raw_content || {};
    const customerData = Array.isArray(order.customers) ? order.customers[0] : order.customers;

    // Extract the original content based on channel type
    let intakeEventContent = '';
    if (intakeEvent?.channel === 'sms') {
      // For SMS, show the body text
      intakeEventContent = rawContent.body || '';
    } else if (intakeEvent?.channel === 'email') {
      // For email, show body_text (preferred) or body_html
      intakeEventContent = rawContent.body_text || rawContent.body_html || rawContent.subject || '';
    }

    const transformedOrder = {
      id: order.id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      customer_reference: order.customer_reference,
      status: order.status,
      delivery_date: order.delivery_date,
      total_amount: order.total_amount,
      currency: order.currency,
      created_at: order.created_at,
      updated_at: order.updated_at,
      user_reviewed_at: order.user_reviewed_at,
      reviewed_by: order.reviewed_by,
      source_channel: order.source_channel,

      // Creator information
      created_by: creatorInfo,

      // Include order lines
      order_lines: order.order_lines || [],

      // Original content from intake event
      intake_event_content: intakeEventContent,

      // Email metadata (for backward compatibility)
      email_data: {
        from: rawContent.from,
        subject: rawContent.subject,
        date: rawContent.date,
        thread_id: rawContent.gmail_thread_id,
        message_id: intakeEvent?.provider_message_id
      },

      // Analysis data (for AI predictions display)
      analysis_data: customerData ? {
        matchingCustomer: {
          id: customerData.id,
          number: customerData.id, // Use ID as number
          displayName: customerData.name,
          email: customerData.email
        }
      } : undefined
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: transformedOrder
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error fetching order details:', error);
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
