import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';
import { getAnalysisPrompt } from '../_shared/prompts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
});

interface OrderLine {
  id: string;
  line_number: number;
  product_name: string;
  quantity: number;
  item_id: string | null;
  item_variant_id: string | null;
  status?: string;
  items?: { name: string } | null;
  item_variants?: { variant_code: string } | null;
}

interface TargetOrder {
  id: string;
  customer_id: string | null;
  customer_name: string;
  delivery_date: string;
  organization_id: string;
  order_lines: OrderLine[];
}

interface ItemVariant {
  id: string;
  variant_code: string;
  variant_name: string;
  notes?: string;
}

interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  item_variants?: ItemVariant[];
}

interface Customer {
  id: string;
  name: string;
  email?: string;
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
    // Get user from JWT token for auth
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

    const body = await req.json();
    const { intake_event_id, target_order_id } = body;

    if (!intake_event_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: intake_event_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.info(`[create-proposal] Starting for intake=${intake_event_id}, targetOrder=${target_order_id || 'NEW'}`);

    // 1. Fetch intake event
    const { data: intakeEvent, error: intakeError } = await supabase
      .from('intake_events')
      .select('id, channel, raw_content, organization_id')
      .eq('id', intake_event_id)
      .single();

    if (intakeError || !intakeEvent) {
      console.error('[create-proposal] Intake event not found:', intakeError);
      return new Response(
        JSON.stringify({ success: false, error: 'Intake event not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    let organizationId = intakeEvent.organization_id;
    let targetOrder: TargetOrder | null = null;

    // 2. If target_order_id provided, fetch the target order
    if (target_order_id) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          customer_name,
          delivery_date,
          organization_id,
          order_lines (
            id,
            line_number,
            product_name,
            quantity,
            item_id,
            item_variant_id,
            status,
            items ( name ),
            item_variants ( variant_code )
          )
        `)
        .eq('id', target_order_id)
        .single();

      if (orderError || !order) {
        console.error('[create-proposal] Target order not found:', orderError);
        return new Response(
          JSON.stringify({ success: false, error: 'Target order not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      targetOrder = order as TargetOrder;
      organizationId = targetOrder.organization_id;
    }

    // 3. Fetch organization's items catalog
    const { data: items } = await supabase
      .from('items')
      .select('id, sku, name, item_variants(id, variant_code, variant_name, notes)')
      .eq('organization_id', organizationId)
      .eq('active', true);

    // 4. Fetch customers for new order proposals
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('organization_id', organizationId)
      .eq('active', true);

    console.info(`[create-proposal] Loaded ${items?.length || 0} items, ${customers?.length || 0} customers`);

    // 5. Build message content from intake event
    let messageContent = '';
    const rawContent = intakeEvent.raw_content || {};

    if (intakeEvent.channel === 'sms') {
      messageContent = rawContent.body || '';
    } else {
      // Email
      messageContent = rawContent.body_text || rawContent.body_html || rawContent.subject || '';
    }

    // 6. Fetch and append intake_files content if available
    const { data: intakeFiles } = await supabase
      .from('intake_files')
      .select('filename, processed_content')
      .eq('intake_event_id', intake_event_id)
      .eq('processing_status', 'completed');

    if (intakeFiles && intakeFiles.length > 0) {
      for (const file of intakeFiles) {
        const text = file.processed_content?.llm_whisperer?.text;
        if (text) {
          // Extract result_text from JSON if stored that way
          let extractedText = text;
          if (text.startsWith('{')) {
            try {
              const parsed = JSON.parse(text);
              extractedText = parsed.result_text || text;
            } catch {
              // Use as-is
            }
          }
          messageContent += `\n\n--- Attachment: ${file.filename} ---\n${extractedText}`;
        }
      }
    }

    const currentDate = new Date().toISOString().split('T')[0];
    let analysisResult: any;

    if (targetOrder) {
      // CHANGE TO EXISTING ORDER - use order context prompt
      const activeOrderLines = (targetOrder.order_lines || []).filter(
        (line: OrderLine) => line.status === 'active'
      );

      const existingItemsList = activeOrderLines.map((line: OrderLine) => {
        const itemName = line.items?.name || line.product_name;
        const variantCode = line.item_variants?.variant_code || '';
        return `- ${itemName}${variantCode ? ` (${variantCode})` : ''}: ${line.quantity} (line_id: ${line.id})`;
      }).join('\n');

      const catalogItemsList = (items || []).map((item: CatalogItem) => ({
        id: item.id,
        name: item.name,
        variants: (item.item_variants || []).map((v: ItemVariant) => ({
          code: v.variant_code,
          name: v.variant_name,
          notes: v.notes || null
        }))
      }));

      const systemPrompt = `You are an assistant that analyzes order-related messages and determines what changes should be made to an existing order.

Available items in the catalog: ${JSON.stringify(catalogItemsList)}

Today's date is ${currentDate}.

ITEM VARIANTS:
Each item may have variants with:
- "code": variant code (S, L, T20)
- "name": variant name (Small Clamshell, Large Clamshell, Price Live Tray)
- "notes": additional info like oz weight (e.g., "1.5oz", "3oz")

When matching sizes from customer messages:
- Match "small", "S", or oz weights like "1.5oz" → variant code "S"
- Match "large", "L", or oz weights like "3oz" → variant code "L"
- Match "tray", "T20" → variant code "T20"
- Use the "notes" field to match oz weights to the correct variant code

EXISTING ORDER CONTEXT:
Customer: ${targetOrder.customer_name}
Delivery Date: ${targetOrder.delivery_date}
Current Items in Order:
${existingItemsList || '(No items yet)'}

Based on the message content, determine what changes should be made to this order:
- ADD: New items that should be added (not currently in the order)
- MODIFY: Items where quantity or variant should change
- REMOVE: Items that should be removed from the order

Only include changes that are clearly indicated in the message.`;

      const userPrompt = `Analyze this message and determine the changes to make to the existing order:

MESSAGE:
${messageContent}

Return JSON in this format:
{
  "proposedChanges": [
    {
      "change_type": "add" | "modify" | "remove",
      "itemId": "item UUID from catalog (required for add)",
      "variantCode": "variant code if specified (e.g. S, L, T20)",
      "itemName": "human readable item name",
      "quantity": number (for add/modify),
      "orderLineId": "existing order line ID (for modify/remove)"
    }
  ]
}

Only include items you can confidently match to the catalog.`;

      console.info(`[create-proposal] Calling OpenAI for change analysis`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      analysisResult = JSON.parse(completion.choices[0].message.content || '{}');
      console.info(`[create-proposal] AI returned ${analysisResult.proposedChanges?.length || 0} changes`);

    } else {
      // NEW ORDER - use organization-specific prompts
      const itemsList = (items || []).map((item: CatalogItem) => ({
        id: item.id,
        sku: item.sku,
        displayName: item.name,
        variants: (item.item_variants || []).map((v: ItemVariant) => ({
          code: v.variant_code,
          name: v.variant_name,
          notes: v.notes || null
        }))
      }));

      const customersList = (customers || []).map((c: Customer) => ({
        id: c.id,
        number: c.id,
        displayName: c.name,
        email: c.email || null
      }));

      const { systemPrompt, userPrompt } = getAnalysisPrompt(organizationId, {
        itemsList,
        customersList,
        currentDate,
        content: messageContent
      });

      console.info(`[create-proposal] Calling OpenAI for new order analysis`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      analysisResult = JSON.parse(completion.choices[0].message.content || '{}');
      console.info(`[create-proposal] AI returned ${analysisResult.orderLines?.length || 0} order lines`);
    }

    // 7. Create the proposal in database
    const { data: proposal, error: proposalError } = await supabase
      .from('order_change_proposals')
      .insert({
        organization_id: organizationId,
        order_id: target_order_id || null,
        intake_event_id: intake_event_id,
        status: 'pending',
        tags: { order_frequency: analysisResult.orderFrequency || 'one-time' }
      })
      .select()
      .single();

    if (proposalError || !proposal) {
      console.error('[create-proposal] Failed to create proposal:', proposalError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create proposal' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.info(`[create-proposal] Created proposal ${proposal.id}`);

    // 8. Create proposal lines
    const proposalLines: any[] = [];

    if (targetOrder) {
      // CHANGE TO EXISTING ORDER - create lines from proposedChanges
      const changes = analysisResult.proposedChanges || [];
      const activeOrderLines = (targetOrder.order_lines || []).filter(
        (line: OrderLine) => line.status === 'active'
      );

      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const catalogItem = (items || []).find((item: CatalogItem) => item.id === change.itemId);
        const variant = catalogItem?.item_variants?.find(
          (v: ItemVariant) => v.variant_code === change.variantCode
        );

        // Find existing order line for modify/remove
        let existingLine: OrderLine | undefined;
        if (change.orderLineId) {
          existingLine = activeOrderLines.find((line: OrderLine) => line.id === change.orderLineId);
        }

        proposalLines.push({
          proposal_id: proposal.id,
          order_line_id: existingLine?.id || null,
          line_number: i + 1,
          change_type: change.change_type,
          item_id: change.itemId || existingLine?.item_id || null,
          item_variant_id: variant?.id || existingLine?.item_variant_id || null,
          item_name: change.itemName || catalogItem?.name || 'Unknown',
          proposed_values: {
            quantity: change.quantity,
            variant_code: change.variantCode || null,
            original_quantity: existingLine?.quantity,
            original_variant_code: existingLine?.item_variants?.variant_code
          }
        });
      }
    } else {
      // NEW ORDER - create lines from orderLines (all 'add')
      const orderLines = analysisResult.orderLines || [];
      const matchedCustomer = customers?.find((c: Customer) => c.id === analysisResult.customerId);

      for (let i = 0; i < orderLines.length; i++) {
        const line = orderLines[i];
        const catalogItem = (items || []).find((item: CatalogItem) => item.id === line.itemId);
        const variant = catalogItem?.item_variants?.find(
          (v: ItemVariant) => v.variant_code === line.variantCode
        );

        proposalLines.push({
          proposal_id: proposal.id,
          order_line_id: null,
          line_number: i + 1,
          change_type: 'add',
          item_id: line.itemId || null,
          item_variant_id: variant?.id || null,
          item_name: catalogItem?.name || 'Unknown Item',
          proposed_values: {
            quantity: line.quantity,
            variant_code: line.variantCode || null,
            customer_id: analysisResult.customerId || null,
            customer_name: matchedCustomer?.name || 'Unknown Customer',
            delivery_date: analysisResult.requestedDeliveryDate || null,
            organization_id: organizationId
          }
        });
      }
    }

    if (proposalLines.length > 0) {
      const { error: linesError } = await supabase
        .from('order_change_proposal_lines')
        .insert(proposalLines);

      if (linesError) {
        console.error('[create-proposal] Failed to create proposal lines:', linesError);
        // Don't fail the whole request, just log it
      } else {
        console.info(`[create-proposal] Created ${proposalLines.length} proposal lines`);
      }
    }

    // 9. Fetch the created proposal with lines to return
    const { data: createdProposal } = await supabase
      .from('order_change_proposals')
      .select(`
        id,
        order_id,
        intake_event_id,
        status,
        created_at,
        tags,
        order_change_proposal_lines (
          id,
          order_line_id,
          line_number,
          change_type,
          item_id,
          item_variant_id,
          item_name,
          proposed_values
        )
      `)
      .eq('id', proposal.id)
      .single();

    // Transform lines to frontend format, including available variants for the item
    const lines = (createdProposal?.order_change_proposal_lines || []).map((line: any) => {
      // Find the catalog item to get its available variants
      const catalogItem = (items || []).find((item: CatalogItem) => item.id === line.item_id);
      const availableVariants = catalogItem?.item_variants?.map((v: ItemVariant) => ({
        code: v.variant_code,
        name: v.variant_name
      })) || [];

      return {
        id: line.id,
        order_line_id: line.order_line_id,
        line_number: line.line_number,
        change_type: line.change_type,
        item_id: line.item_id,
        item_variant_id: line.item_variant_id,
        item_name: line.item_name,
        size: line.proposed_values?.variant_code || '',
        quantity: line.proposed_values?.quantity || 0,
        original_quantity: line.proposed_values?.original_quantity,
        original_size: line.proposed_values?.original_variant_code,
        proposed_values: line.proposed_values,
        available_variants: availableVariants
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        proposal_id: proposal.id,
        proposal: {
          id: createdProposal?.id,
          order_id: createdProposal?.order_id,
          intake_event_id: createdProposal?.intake_event_id,
          status: createdProposal?.status,
          created_at: createdProposal?.created_at,
          tags: createdProposal?.tags,
          lines
        }
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('[create-proposal] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});
