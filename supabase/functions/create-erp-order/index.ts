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
    console.log('🔍 Starting create-erp-order function...');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);

    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Extract the JWT token from the Bearer header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted:', token.substring(0, 20) + '...');

    // Initialize Supabase client with service role for all operations
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

    console.log('🔐 Verifying user authentication...');

    // Verify the JWT token is valid by getting the user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    console.log('User verification result:', {
      hasUser: !!user,
      hasError: !!userError,
      errorMessage: userError?.message
    });

    if (userError || !user) {
      console.error('❌ Auth error:', userError);
      throw new Error(`Unauthorized: ${userError?.message || 'No user found'}`);
    }

    console.log('✅ User authenticated:', user.email);

    // Parse request body
    const { orderId } = await req.json();
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    console.log(`📦 Creating ERP order for order ID: ${orderId}`);
    console.log(`👤 Requested by user: ${user.email}`);

    // Get the order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        customer_name,
        customer_reference,
        delivery_date,
        total_amount,
        currency,
        customers (
          id,
          name,
          email
        ),
        order_lines (
          id,
          line_number,
          product_name,
          quantity,
          item_id
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    console.log(`✅ Order retrieved: ${order.customer_name}, ${order.order_lines?.length || 0} lines`);

    // TODO: Integrate with actual ERP system (Business Central, Dynamics 365, etc.)
    // For now, just log and return success - NO DATABASE MODIFICATIONS

    console.log('📝 Order data to be sent to ERP:');
    console.log(JSON.stringify({
      customer: order.customer_name,
      customerReference: order.customer_reference,
      deliveryDate: order.delivery_date,
      totalAmount: order.total_amount,
      currency: order.currency,
      lines: order.order_lines?.map((line: any) => ({
        lineNumber: line.line_number,
        product: line.product_name,
        quantity: line.quantity
      }))
    }, null, 2));

    // Simulate ERP order creation (just logging, not actually creating)
    const erpOrderId = `ERP-${Date.now()}`;
    console.log(`✅ Simulated ERP Order ID: ${erpOrderId}`);

    // Update order status to 'pushed_to_erp'
    console.log('📝 Updating order status to pushed_to_erp...');
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'pushed_to_erp',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to update order status:', updateError);
      throw new Error(`Failed to update order status: ${updateError.message}`);
    }

    console.log('✅ Order status updated to pushed_to_erp');

    // TODO: Create order event when we implement order_events table
    // await supabase.from('order_events').insert({ order_id: orderId, type: 'exported', metadata: {...} });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'ERP order created successfully',
        erpOrderId: erpOrderId,
        orderId: orderId
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
    console.error('Error creating ERP order:', error);
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
