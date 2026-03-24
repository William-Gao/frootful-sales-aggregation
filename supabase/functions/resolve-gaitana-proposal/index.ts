import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ORCHESTRATOR_URL = Deno.env.get('ORCHESTRATOR_URL') || '';

interface ResolveGaitanaPayload {
  proposalId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Auth
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
    const userId = user.id;
    const userEmail = user.email || 'unknown';

    const { proposalId }: ResolveGaitanaPayload = await req.json();
    if (!proposalId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing proposalId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 1. Fetch proposal
    const { data: proposal, error: fetchError } = await supabase
      .from('order_change_proposals')
      .select('*, organization_id')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
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

    // Get fields from metadata (parsed from .md by orchestrator)
    // Fallback: parse from .md if separate fields missing
    const metadata = proposal.metadata || {};
    const md = (metadata.webflor_order_md || '') as string;
    function parseMdField(fieldName: string): string | null {
      const re = new RegExp(`\\|\\s*${fieldName}\\s*\\|\\s*(.+?)\\s*\\|`);
      const m = md.match(re);
      return m ? m[1].trim() : null;
    }
    const customerName = metadata.customer_name || parseMdField('Customer') || proposal.tags?.customer_name || 'Unknown Customer';
    const poNumber = metadata.po_number || parseMdField('PO') || proposal.tags?.po_number || null;

    // Convert delivery_date from MM/DD/YYYY to YYYY-MM-DD for Postgres date column
    const rawDate = metadata.delivery_date || parseMdField('Consolidation Date') || proposal.tags?.delivery_date || null;
    let deliveryDate: string | null = null;
    if (rawDate) {
      const m = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        deliveryDate = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      } else {
        deliveryDate = rawDate; // already in ISO or other format
      }
    }

    // Fetch source channel from intake event
    let sourceChannel = 'email';
    if (proposal.intake_event_id) {
      const { data: ie } = await supabase
        .from('intake_events')
        .select('channel')
        .eq('id', proposal.intake_event_id)
        .single();
      if (ie?.channel) sourceChannel = ie.channel;
    }

    // 2. Mark proposal as accepted
    await supabase
      .from('order_change_proposals')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        tags: {
          ...proposal.tags,
          erp_sync_status: 'pending',
        },
      })
      .eq('id', proposalId);

    // 3. Create order with status export_in_progress (no order lines)
    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        organization_id: proposal.organization_id,
        customer_name: customerName,
        customer_reference: poNumber,
        delivery_date: deliveryDate,
        origin_intake_event_id: proposal.intake_event_id,
        status: 'export_in_progress',
        source_channel: sourceChannel,
        created_by_user_id: userId,
        metadata: {
          proposal_id: proposalId,
          intake_event_id: proposal.intake_event_id,
          po_number: poNumber,
        },
      })
      .select('id')
      .single();

    if (orderError || !newOrder) {
      throw new Error(`Failed to create order: ${orderError?.message || 'unknown'}`);
    }

    const orderId = newOrder.id;

    // Link order to proposal
    await supabase
      .from('order_change_proposals')
      .update({ order_id: orderId })
      .eq('id', proposalId);

    // 4. Insert order_event: erp_exported with stage started
    await supabase.from('order_events').insert({
      order_id: orderId,
      type: 'erp_exported',
      metadata: {
        proposal_id: proposalId,
        stage: 'started',
        destination: 'WebFlor',
        triggered_by: userEmail,
      },
    });

    // 5. Kick off /enter on orchestrator (must await — Deno kills unawaited fetches on exit)
    console.log(`ORCHESTRATOR_URL value: "${ORCHESTRATOR_URL}" (length=${ORCHESTRATOR_URL.length})`);
    if (ORCHESTRATOR_URL) {
      try {
        const orchRes = await fetch(`${ORCHESTRATOR_URL}/enter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposal_id: proposalId,
            order_id: orderId,
            user_id: userId,
          }),
        });
        console.log(`Orchestrator /enter response: ${orchRes.status}`);
      } catch (err) {
        console.error('Orchestrator /enter trigger failed:', err);
      }
    } else {
      console.warn('ORCHESTRATOR_URL not set, skipping /enter trigger');
    }

    return new Response(
      JSON.stringify({ success: true, orderId }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error in resolve-gaitana-proposal:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
