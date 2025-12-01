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
    const dataType = url.searchParams.get('type'); // 'customers' or 'items'

    if (!dataType || !['customers', 'items'].includes(dataType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid data type. Use "customers" or "items"' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    let data;
    if (dataType === 'customers') {
      // Fetch customers from our database
      const { data: customers, error } = await supabase
        .from('customers')
        .select('id, name, email, phone, active')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('Error fetching customers:', error);
        throw error;
      }

      // Transform to match Business Central format for compatibility
      data = customers?.map(c => ({
        id: c.id,
        number: c.id, // Use ID as number since we don't have a separate customer number
        displayName: c.name,
        email: c.email,
        phoneNumber: c.phone
      })) || [];
    } else {
      // Fetch items from our database
      const { data: items, error } = await supabase
        .from('items')
        .select('id, sku, name, description, base_price, category, notes, active')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('Error fetching items:', error);
        throw error;
      }

      // Transform to match Business Central format for compatibility
      data = items?.map(i => ({
        id: i.id,
        number: i.sku,
        displayName: i.name,
        description: i.description,
        unitPrice: i.base_price,
        category: i.category,
        notes: i.notes
      })) || [];
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: data
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error fetching catalog data:', error);
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
