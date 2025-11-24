import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';

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

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string;
  base_price: number;
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
    const body = await req.json();

    // Handle both webhook format (type, record) and direct call format (intakeEventId)
    let intakeEventId: string;

    if (body.type === 'INSERT' && body.record) {
      // Webhook format from database trigger
      intakeEventId = body.record.id;
      console.log(`=== Database trigger: ${body.type} on intake_events ===`);
    } else if (body.intakeEventId) {
      // Direct call format
      intakeEventId = body.intakeEventId;
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid payload. Expected webhook format (type, record) or direct call (intakeEventId)'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    console.log(`=== Processing Intake Event ${intakeEventId} ===`);

    // Fetch intake_event from database
    const { data: intakeEvent, error: fetchError } = await supabase
      .from('intake_events')
      .select('*')
      .eq('id', intakeEventId)
      .single();

    if (fetchError || !intakeEvent) {
      console.error('Intake event not found:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Intake event not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    console.log('Intake event fetched:', {
      id: intakeEvent.id,
      channel: intakeEvent.channel,
      provider: intakeEvent.provider,
      organization_id: intakeEvent.organization_id
    });

    // Determine organization_id and user_id if not set
    let organizationId = intakeEvent.organization_id;
    let createdByUserId: string | null = null;

    if (!organizationId) {
      console.log('No organization_id set, determining from context...');

      if (intakeEvent.channel === 'sms') {
        // For SMS: Look up organization by sender's phone number (sales associate)
        const fromPhone = intakeEvent.raw_content?.from;

        if (fromPhone) {
          console.log(`Looking up user by phone number: ${fromPhone}`);

          // Normalize phone number (remove + prefix and trim whitespace) before calling function
          const normalizedPhone = fromPhone.replace('+', '').trim();
          console.log(`Normalized phone: "${normalizedPhone}" (length: ${normalizedPhone.length})`);

          // Use database function to get user ID by phone
          console.log(`Calling RPC: get_user_id_by_phone with param:`, { user_phone: normalizedPhone });
          const { data: userId, error: userError } = await supabase
            .rpc('get_user_id_by_phone', { user_phone: normalizedPhone });

          console.log(`RPC result - data: ${userId}, error:`, userError);

          if (userId) {
            console.log(`✅ Found user ${userId} with phone ${fromPhone}`);
            createdByUserId = userId;

            // Get user's organization
            const { data: userOrg } = await supabase
              .from('user_organizations')
              .select('organization_id')
              .eq('user_id', userId)
              .single();

            if (userOrg) {
              organizationId = userOrg.organization_id;
              console.log(`Found organization for sales associate ${fromPhone}: ${organizationId}`);
            } else {
              console.warn(`User ${userId} not associated with any organization`);
            }
          } else {
            console.warn(`No user found for phone ${normalizedPhone}`);
          }
        }
      } else if (intakeEvent.channel === 'email') {
        // For Email: Look up organization by user's email address
        const fromEmail = intakeEvent.raw_content?.from;

        if (fromEmail) {
          // Extract email address from "Name <email@domain.com>" format
          const emailMatch = fromEmail.match(/<([^>]+)>/) || [null, fromEmail];
          const email = emailMatch[1];

          console.log(`Looking up organization by email: ${email}`);

          // Use database function to get user ID by email
          const { data: userId, error: userError } = await supabase
            .rpc('get_user_id_by_email', { user_email: email });

          if (!userError && userId) {
            createdByUserId = userId;

            // Get user's organization
            const { data: userOrg } = await supabase
              .from('user_organizations')
              .select('organization_id')
              .eq('user_id', userId)
              .single();

            if (userOrg) {
              organizationId = userOrg.organization_id;
              console.log(`Found organization for user ${email}: ${organizationId}`);
            }
          } else {
            console.warn(`No user found for email ${email}, using fallback`);
          }
        }
      }

      // Error if organization still not found
      if (!organizationId) {
        const errorMsg = intakeEvent.channel === 'sms'
          ? `Could not determine organization for SMS from ${intakeEvent.raw_content?.from}. No user found with this phone number.`
          : `Could not determine organization for email from ${intakeEvent.raw_content?.from}. No user found with this email address.`;

        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Update the intake_event with the determined organization
      await supabase
        .from('intake_events')
        .update({ organization_id: organizationId })
        .eq('id', intakeEvent.id);
    }

    // Get organization's catalogs
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, email, phone')
      .eq('organization_id', organizationId)
      .eq('active', true);

    const { data: items } = await supabase
      .from('items')
      .select('id, sku, name, description, base_price')
      .eq('organization_id', organizationId)
      .eq('active', true);

    console.log(`Loaded ${customers?.length || 0} customers and ${items?.length || 0} items`);

    // Step 1: Extract basic info (customer, items, delivery date)
    const analysisResult = await analyzeIntakeEvent(
      intakeEvent,
      items || [],
      customers || []
    );

    console.log(`AI analysis complete: found ${analysisResult.orderLines.length} order lines`);
    console.log('This is the analysis result:', analysisResult);
    // Step 2: Fetch recent orders for this customer to detect if this is a change request
    let recentOrders = [];
    if (analysisResult.matchingCustomer?.id) {
      console.log(`Fetching orders for customer_id: ${analysisResult.matchingCustomer.id}, org: ${organizationId}`);

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          customer_name,
          delivery_date,
          status,
          created_at,
          order_lines(
            id,
            line_number,
            product_name,
            quantity
          )
        `)
        .eq('organization_id', organizationId)
        .eq('customer_id', analysisResult.matchingCustomer.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      }

      recentOrders = orders || [];
      console.log(`Found ${recentOrders.length} recent orders for customer ${analysisResult.matchingCustomer.displayName}`);
      console.log('Recent orders:', JSON.stringify(recentOrders));
    }

    // Step 3: Determine if this is a NEW order or a CHANGE to existing order
    const intentResult = await determineOrderIntent(
      intakeEvent,
      analysisResult,
      recentOrders
    );

    console.log(`Intent determined: ${intentResult.intent} ${intentResult.matchedOrderId ? `(matches order ${intentResult.matchedOrderId})` : ''}`);

    // Step 4: Handle based on intent
    if (intentResult.intent === 'NEW_ORDER') {
      // Create NEW ORDER PROPOSAL (not an actual order yet - requires user approval)
      console.log(`Creating new order proposal for customer ${analysisResult.matchingCustomer?.displayName || 'Unknown'}`);

      // Create proposal with order_id = NULL (indicates this is a new order proposal)
      const { data: proposal, error: proposalError } = await supabase
        .from('order_change_proposals')
        .insert({
          organization_id: organizationId,
          order_id: null, // NULL indicates this is a new order proposal
          intake_event_id: intakeEvent.id,
          status: 'pending'
        })
        .select()
        .single();

      if (proposalError) throw proposalError;
      console.log(`✅ Created new order proposal: ${proposal.id}`);

      // Create proposal lines for the proposed order
      const proposalLines = analysisResult.orderLines.map((line: any, index: number) => ({
        proposal_id: proposal.id,
        order_line_id: null, // NULL for new order proposals (no existing order line)
        line_number: index + 1,
        change_type: 'add', // All lines are 'add' for new orders
        item_id: line.matchedItem?.id || null,
        item_name: line.matchedItem?.displayName || line.itemName,
        proposed_values: {
          quantity: line.quantity,
          raw_user_input: line.itemName,
          ai_matched: !!line.matchedItem,
          sku: line.matchedItem?.number || null,
          confidence: line.matchedItem ? 0.9 : 0.5,
          organization_id: organizationId,
          customer_id: analysisResult.matchingCustomer?.id || null,
          customer_name: analysisResult.matchingCustomer?.displayName || 'Unknown Customer',
          delivery_date: analysisResult.requestedDeliveryDate || null,
          source_channel: intakeEvent.channel,
          created_by_user_id: createdByUserId
        }
      }));

      if (proposalLines.length > 0) {
        const { error: linesError } = await supabase
          .from('order_change_proposal_lines')
          .insert(proposalLines);

        if (linesError) throw linesError;
        console.log(`✅ Created ${proposalLines.length} proposal lines for new order`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            proposal_id: proposal.id,
            order_id: null, // No order created yet
            intake_event_id: intakeEventId,
            is_new_order_proposal: true
          }
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    } else if (intentResult.intent === 'CHANGE_ORDER') {
      // Create change proposal
      console.log(`Creating change proposal for order ${intentResult.matchedOrderId}`);

      const matchedOrder = recentOrders.find(o => o.id === intentResult.matchedOrderId);
      if (!matchedOrder) {
        throw new Error(`Matched order ${intentResult.matchedOrderId} not found`);
      }

      console.log(`Matched order details:`, JSON.stringify({
        id: matchedOrder.id,
        customer: matchedOrder.customer_name,
        lines: matchedOrder.order_lines
      }, null, 2));

      // Step 4: Determine specific changes by comparing matched order with change request
      const changesResult = await determineOrderChanges(
        intakeEvent,
        analysisResult,
        matchedOrder
      );

      console.log(`Proposed changes from AI:`, JSON.stringify(changesResult.proposedChanges, null, 2));

      // Create proposal
      const { data: proposal, error: proposalError } = await supabase
        .from('order_change_proposals')
        .insert({
          organization_id: organizationId,
          order_id: matchedOrder.id,
          intake_event_id: intakeEvent.id,
          status: 'pending'
        })
        .select()
        .single();

      if (proposalError) throw proposalError;
      console.log(`✅ Created change proposal: ${proposal.id}`);

      // Create order event for change proposal
      await supabase.from('order_events').insert({
        order_id: matchedOrder.id,
        intake_event_id: intakeEvent.id,
        type: 'change_proposed',
        metadata: {
          proposal_id: proposal.id,
          channel: intakeEvent.channel,
          change_count: changesResult.proposedChanges.length,
          changes_summary: changesResult.proposedChanges.map((c: any) => ({
            type: c.change_type,
            item: c.item_name
          }))
        }
      });

      // Create proposal lines based on detected changes
      const proposalLines = changesResult.proposedChanges.map((change: any, index: number) => {
        console.log(`Processing change ${index + 1}:`, JSON.stringify(change, null, 2));

        return {
          proposal_id: proposal.id,
          order_line_id: change.order_line_id || null,
          line_number: change.line_number,
          change_type: change.change_type,
          item_id: change.item_id || null,
          item_name: change.item_name,
          proposed_values: change.proposed_values || null
        };
      });

      console.log(`Proposal lines to insert:`, JSON.stringify(proposalLines, null, 2));

      if (proposalLines.length > 0) {
        const { error: linesError } = await supabase
          .from('order_change_proposal_lines')
          .insert(proposalLines);

        if (linesError) {
          console.error('Error inserting proposal lines:', linesError);
          throw linesError;
        }
        console.log(`✅ Created ${proposalLines.length} proposal lines`);
      } else {
        console.warn('⚠️ No proposal lines to create - proposedChanges was empty!');
      }

      // Update order status to needs_review
      await supabase
        .from('orders')
        .update({ status: 'needs_review' })
        .eq('id', matchedOrder.id);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            proposal_id: proposal.id,
            order_id: matchedOrder.id,
            intake_event_id: intakeEventId
          }
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    } else {
      // Unknown intent or not relevant
      console.log(`No action taken for intent: ${intentResult.intent}`);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            intake_event_id: intakeEventId,
            intent: intentResult.intent,
            message: 'Intake event processed but no action taken'
          }
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

  } catch (error) {
    console.error('Error processing intake event:', error);

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

async function determineOrderIntent(
  intakeEvent: any,
  analysisResult: any,
  recentOrders: any[]
): Promise<any> {
  // Extract content based on channel
  let content = '';
  if (intakeEvent.channel === 'sms') {
    content = intakeEvent.raw_content.body || '';
  } else if (intakeEvent.channel === 'email') {
    const bodyText = intakeEvent.raw_content.body_text || '';
    const bodyHtml = intakeEvent.raw_content.body_html || '';
    content = bodyText || bodyHtml;
  }

  const requestData = {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert at analyzing order-related messages and determining if they represent:
1. A NEW order (customer placing a fresh order)
2. A CHANGE to an existing order (modifying quantities, adding/removing items, changing delivery date)
3. A CONFIRMATION or acknowledgment (no action needed)
4. IRRELEVANT (not order-related)

When analyzing, look for keywords like:
- Change indicators: "change order", "update order", "modify", "increase", "decrease", "add to order", "remove from order"
- Order references: "order #123", "SO-456", "PO number"
- New order indicators: "I need", "please send", "order for delivery"

Consider the context of recent orders for this customer.`
      },
      {
        role: 'user',
        content: `Analyze this message and determine the intent:

Message:
${content}

Extracted items from message:
${JSON.stringify(analysisResult.orderLines)}

Customer: ${analysisResult.matchingCustomer?.displayName || 'Unknown'}
Requested delivery date: ${analysisResult.requestedDeliveryDate || 'Not specified'}

Recent orders for this customer:
${JSON.stringify(recentOrders.map(o => ({
  id: o.id,
  delivery_date: o.delivery_date,
  status: o.status,
  created_at: o.created_at,
  lines: o.order_lines.map((l: any) => ({
    id: l.id,
    product: l.product_name,
    quantity: l.quantity
  }))
})))}

Return JSON with this structure:
{
  "intent": "NEW_ORDER" | "CHANGE_ORDER" | "CONFIRMATION" | "IRRELEVANT",
  "matchedOrderId": "uuid-if-change-order" | null,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

For CHANGE_ORDER:
- Match to the most relevant recent order based on delivery date, items, and message content
- Return the order ID that should be modified
`
      }
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" }
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    console.log('Intent analysis:', result);

    return result;
  } catch (error) {
    console.error('Error determining intent:', error);
    // Default to NEW_ORDER if we can't determine
    return {
      intent: 'NEW_ORDER',
      matchedOrderId: null,
      confidence: 0.5,
      reasoning: 'Failed to analyze intent, defaulting to new order'
    };
  }
}

async function determineOrderChanges(
  intakeEvent: any,
  analysisResult: any,
  matchedOrder: any
): Promise<any> {
  // Extract content based on channel
  let content = '';
  if (intakeEvent.channel === 'sms') {
    content = intakeEvent.raw_content.body || '';
  } else if (intakeEvent.channel === 'email') {
    const bodyText = intakeEvent.raw_content.body_text || '';
    const bodyHtml = intakeEvent.raw_content.body_html || '';
    content = bodyText || bodyHtml;
  }

  const requestData = {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert at comparing an existing order with a change request and determining exactly what changed.

Your task is to:
1. Compare the existing order lines with the requested items
2. Identify additions (new items not in the original order)
3. Identify removals (items that should be removed)
4. Identify modifications (items where quantity or price changed)

For each change, you must:
- For MODIFY: Include the exact order_line_id from the existing order
- For ADD: Leave order_line_id as null, specify line_number for insertion
- For REMOVE: Include the order_line_id to be marked as deleted`
      },
      {
        role: 'user',
        content: `Compare this existing order with the change request:

EXISTING ORDER:
Order ID: ${matchedOrder.id}
Customer: ${matchedOrder.customer_name}
Delivery Date: ${matchedOrder.delivery_date}
Status: ${matchedOrder.status}

Existing Order Lines:
${JSON.stringify(matchedOrder.order_lines.map((l: any) => ({
  id: l.id,
  line_number: l.line_number,
  product_name: l.product_name,
  quantity: l.quantity
})), null, 2)}

CHANGE REQUEST:
Message: ${content}

Extracted items from change request:
${JSON.stringify(analysisResult.orderLines, null, 2)}

Requested delivery date: ${analysisResult.requestedDeliveryDate || 'Not specified'}

Return JSON with this structure:
{
  "proposedChanges": [
    {
      "change_type": "add" | "remove" | "modify",
      "order_line_id": "uuid-of-existing-line-or-null",
      "line_number": 1,
      "item_id": "uuid-or-null",
      "item_name": "Product Name",
      "proposed_values": {
        "quantity": 75
      }
    }
  ],
  "reasoning": "brief explanation of what changed"
}

IMPORTANT:
- For "modify": Match to the existing order line by product name and include its order_line_id
- For "add": New items not in the original order, order_line_id should be null
- For "remove": Items in original order but not in the change request, include order_line_id
- proposed_values should only contain the NEW values (for add/modify), null for remove
`
      }
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: "json_object" }
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    console.log('Change analysis:', result);

    return result;
  } catch (error) {
    console.error('Error determining changes:', error);
    return {
      proposedChanges: [],
      reasoning: 'Failed to analyze changes'
    };
  }
}

async function analyzeIntakeEvent(
  intakeEvent: any,
  items: Item[],
  customers: Customer[]
): Promise<any> {
  if (items.length === 0) {
    return { orderLines: [] };
  }

  try {
    const currentDate = new Date().toISOString().split('T')[0];

    // Extract content based on channel
    let content = '';
    if (intakeEvent.channel === 'sms') {
      content = intakeEvent.raw_content.body || '';
    } else if (intakeEvent.channel === 'email') {
      const bodyText = intakeEvent.raw_content.body_text || '';
      const bodyHtml = intakeEvent.raw_content.body_html || '';
      content = bodyText || bodyHtml;
    }

    const itemsList = items.map((item) => ({
      id: item.id,
      number: item.sku,
      displayName: item.name,
      unitPrice: item.base_price
    }));

    const customersList = customers.map((customer) => ({
      id: customer.id,
      number: customer.id,
      displayName: customer.name,
      email: customer.email
    }));

    const requestData = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from messages and matches them to available items and customers.

Available items: ${JSON.stringify(itemsList)}
Available customers: ${JSON.stringify(customersList)}

IMPORTANT: Today's date is ${currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context.`
        },
        {
          role: 'user',
          content: `Extract products with quantities, customer information, and requested delivery date from this message and match them to the available items and customers.

Message content:
${content}

Return the data in JSON format with the following structure:
{
  "orderLines": [{
    "itemName": "extracted item name from message",
    "quantity": number,
    "matchedItem": {
      "id": "matched item id",
      "number": "matched item number",
      "displayName": "matched item display name",
      "unitPrice": number
    }
  }],
  "matchingCustomer": {
    "id": "customer id",
    "number": "customer number",
    "displayName": "customer name",
    "email": "customer email"
  },
  "requestedDeliveryDate": "YYYY-MM-DD" // ISO date format, only if mentioned
}

Look for delivery date phrases like "need by", "deliver by", "required by", "delivery date", "ship by", "due", etc.
If no delivery date is mentioned, omit the requestedDeliveryDate field.`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    };

    // Store AI analysis log
    const { data: aiLog } = await supabase
      .from('ai_analysis_logs')
      .insert({
        user_id: null, // No user context in webhook
        analysis_type: intakeEvent.channel,
        source_id: intakeEvent.id,
        raw_request: requestData,
        model_used: 'gpt-4o'
      })
      .select('id')
      .single();

    const aiLogId = aiLog?.id || '';

    // Analyze with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    // Update log with response
    if (aiLogId) {
      await supabase
        .from('ai_analysis_logs')
        .update({
          raw_response: completion,
          tokens_used: completion.usage?.total_tokens || 0,
          processing_time_ms: 0 // TODO: measure time
        })
        .eq('id', aiLogId);
    }

    // Parse result
    let analysisResult;
    try {
      analysisResult = JSON.parse(completion.choices[0].message.content || '{}');
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return { orderLines: [], aiLogId };
    }

    // Update log with final result
    if (aiLogId) {
      await supabase
        .from('ai_analysis_logs')
        .update({ parsed_result: analysisResult })
        .eq('id', aiLogId);
    }

    return { ...analysisResult, aiLogId };
  } catch (error) {
    console.error('Error analyzing with AI:', error);
    return { orderLines: [] };
  }
}
