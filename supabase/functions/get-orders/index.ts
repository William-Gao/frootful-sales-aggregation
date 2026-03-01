import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Day-of-week (JS getDay: 0=Sun) → sort order name
const DAY_TO_SORT_ORDER: Record<number, string> = {
  2: 'Tuesday',
  3: 'Wednesday',
  5: 'Friday',
};

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

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing organization_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Verify org membership
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single();

    if (!userOrg) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Fetch orders (same shape as Dashboard loadOrders)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        customer_name,
        status,
        delivery_date,
        created_at,
        updated_at,
        source_channel,
        order_lines (
          id,
          product_name,
          quantity,
          status,
          item_id,
          item_variant_id,
          items ( name ),
          item_variants ( variant_code )
        )
      `)
      .eq('organization_id', organization_id)
      .neq('status', 'cancelled')
      .order('delivery_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (ordersError) throw ordersError;

    // Fetch sort orders + entries for this org
    const { data: sortOrders } = await supabase
      .from('sort_orders')
      .select(`
        id,
        name,
        sort_order_entries (
          customer_id,
          position
        )
      `)
      .eq('organization_id', organization_id);

    // Build lookup: sort_order_name → { customer_id → position }
    const sortLookup: Record<string, Record<string, number>> = {};
    for (const so of sortOrders || []) {
      const customerPositions: Record<string, number> = {};
      for (const entry of so.sort_order_entries || []) {
        customerPositions[entry.customer_id] = entry.position;
      }
      sortLookup[so.name] = customerPositions;
    }

    // Attach sort_position to each order
    const ordersWithSort = (orders || []).map((order: any) => {
      let sort_position: number | null = null;

      if (order.delivery_date && order.customer_id) {
        // delivery_date is a date string like "2026-03-03"
        // Parse as UTC to get consistent day-of-week
        const date = new Date(order.delivery_date + 'T00:00:00Z');
        const dayOfWeek = date.getUTCDay();
        const sortOrderName = DAY_TO_SORT_ORDER[dayOfWeek];

        if (sortOrderName && sortLookup[sortOrderName]) {
          sort_position = sortLookup[sortOrderName][order.customer_id] ?? null;
        }
      }

      return { ...order, sort_position };
    });

    // Sort: delivery_date ASC, sort_position ASC (nulls last), customer_name ASC
    ordersWithSort.sort((a: any, b: any) => {
      // delivery_date ASC
      if (a.delivery_date < b.delivery_date) return -1;
      if (a.delivery_date > b.delivery_date) return 1;

      // sort_position ASC, nulls last
      const aPos = a.sort_position ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.sort_position ?? Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;

      // customer_name ASC
      return (a.customer_name || '').localeCompare(b.customer_name || '');
    });

    return new Response(
      JSON.stringify({ success: true, orders: ordersWithSort }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error fetching orders:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
