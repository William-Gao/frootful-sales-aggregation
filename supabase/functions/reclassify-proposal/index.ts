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
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const body = await req.json();
    const { proposal_id, action, target_order_id } = body;

    if (!proposal_id || !action) {
      return new Response(
        JSON.stringify({ success: false, error: 'proposal_id and action are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    console.log(`Reclassifying proposal ${proposal_id}: ${action}`);

    // Fetch the proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('order_change_proposals')
      .select('*')
      .eq('id', proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ success: false, error: 'Proposal not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Reject the current proposal
    const { error: rejectError } = await supabase
      .from('order_change_proposals')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', proposal_id);

    if (rejectError) {
      throw new Error(`Failed to reject proposal: ${rejectError.message}`);
    }

    if (action === 'convert_to_new') {
      // Update the intake event to remove order_id association
      // This will make it analyze as a new order
      const { error: updateIntakeError } = await supabase
        .from('intake_events')
        .update({ order_id: null })
        .eq('id', proposal.intake_event_id);

      if (updateIntakeError) {
        throw new Error(`Failed to update intake event: ${updateIntakeError.message}`);
      }

      console.log(`Re-analyzing intake event ${proposal.intake_event_id} as new order`);

      // Call process-intake-event to re-analyze with AI
      const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-intake-event`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intakeEventId: proposal.intake_event_id
        })
      });

      const processResult = await processResponse.json();

      if (!processResponse.ok || !processResult.success) {
        throw new Error(`Failed to re-analyze: ${processResult.error || 'Unknown error'}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Proposal reclassified as new order and re-analyzed',
          analysis_result: processResult
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );

    } else if (action === 'reassign_to_order') {
      if (!target_order_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'target_order_id is required for reassign action' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
      }

      // Verify the target order exists
      const { data: targetOrder, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('id', target_order_id)
        .single();

      if (orderError || !targetOrder) {
        return new Response(
          JSON.stringify({ success: false, error: 'Target order not found' }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
      }

      // Update the intake event to link to the target order
      const { error: updateIntakeError } = await supabase
        .from('intake_events')
        .update({ order_id: target_order_id })
        .eq('id', proposal.intake_event_id);

      if (updateIntakeError) {
        throw new Error(`Failed to update intake event: ${updateIntakeError.message}`);
      }

      console.log(`Intake event ${proposal.intake_event_id} reassigned to order ${target_order_id}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Proposal rejected and intake event reassigned. Please refresh to see updated status.',
          intake_event_id: proposal.intake_event_id,
          target_order_id: target_order_id
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action. Use "convert_to_new" or "reassign_to_order"' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

  } catch (error) {
    console.error('Error reclassifying proposal:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 500
      }
    );
  }
});
