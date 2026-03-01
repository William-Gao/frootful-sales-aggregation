import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ChangeLine {
  action: 'add' | 'modify' | 'remove';
  order_line_id?: string;
  item_name: string;
  item_id?: string;
  item_variant_id?: string;
  variant_code?: string;
  quantity: number;
}

interface UpdateOrderPayload {
  orderId: string;
  lines?: ChangeLine[];
  cancel_entire_order?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify user is authenticated
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

    const payload: UpdateOrderPayload = await req.json();
    const { orderId, lines, cancel_entire_order } = payload;

    if (!orderId || (!cancel_entire_order && (!lines || lines.length === 0))) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing orderId or lines' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Verify user has access to this order's organization
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, organization_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', order.organization_id)
      .single();

    if (!userOrg) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Cancel entire order
    if (cancel_entire_order) {
      const { error: cancelError } = await supabase
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (cancelError) throw cancelError;

      // Soft-delete all active lines
      await supabase
        .from('order_lines')
        .update({ status: 'deleted' })
        .eq('order_id', orderId)
        .eq('status', 'active');

      // Audit event
      await supabase.from('order_events').insert({
        order_id: orderId,
        type: 'cancelled',
        metadata: { cancelled_by: user.email, source: 'dashboard' },
      });

      console.log(`Order ${orderId} cancelled by ${user.email}`);

      return new Response(
        JSON.stringify({ success: true, message: 'Order cancelled' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get max line_number for new lines
    const { data: existingLines } = await supabase
      .from('order_lines')
      .select('line_number')
      .eq('order_id', orderId)
      .order('line_number', { ascending: false })
      .limit(1);
    let nextLineNumber = (existingLines?.[0]?.line_number || 0) + 1;

    // Apply each change
    for (const line of lines) {
      if (line.action === 'add') {
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

        // If no item_id, try to find the item by name
        let itemId = line.item_id || null;
        if (!itemId && line.item_name) {
          const { data: itemData } = await supabase
            .from('items')
            .select('id')
            .eq('organization_id', order.organization_id)
            .ilike('name', line.item_name)
            .limit(1)
            .single();
          if (itemData) {
            itemId = itemData.id;
            // Also try to find variant if we now have an item_id
            if (!itemVariantId && line.variant_code) {
              const { data: variantData } = await supabase
                .from('item_variants')
                .select('id')
                .eq('item_id', itemId)
                .eq('variant_code', line.variant_code)
                .single();
              if (variantData) itemVariantId = variantData.id;
            }
          }
        }

        const { error } = await supabase.from('order_lines').insert({
          order_id: orderId,
          line_number: nextLineNumber++,
          product_name: line.item_name,
          quantity: line.quantity,
          item_id: itemId,
          item_variant_id: itemVariantId,
          status: 'active',
        });
        if (error) throw error;

      } else if (line.action === 'remove' && line.order_line_id) {
        const { error } = await supabase
          .from('order_lines')
          .update({ status: 'deleted' })
          .eq('id', line.order_line_id);
        if (error) throw error;

      } else if (line.action === 'modify' && line.order_line_id) {
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

    // Update the order's updated_at timestamp
    await supabase
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);

    console.log(`Order ${orderId} updated: ${lines.length} change(s) by ${user.email}`);

    return new Response(
      JSON.stringify({ success: true, message: `Applied ${lines.length} change(s)` }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error updating order:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
