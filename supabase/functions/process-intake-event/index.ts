import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';
import { createLogger } from '../_shared/logger.ts';
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

// Debug mode - set to false to enable normal processing
const DEBUG_MODE = false;

// Demo organization constants for fallback
const DEMO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

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
  category?: string;
  notes?: string;  // Page reference (P.1, P.2, etc.)
}

/**
 * Detect which page(s) are mentioned in the OCR text
 * Scans for patterns like "P.1", "P.2", "p.1", "P1", "Page 1", etc.
 * Also detects "Promotion" keyword for P.4
 * Returns array of detected pages (e.g., ['P.1', 'P.2'])
 */
function detectPagesInText(text: string): string[] {
  if (!text) return [];

  const detectedPages = new Set<string>();

  // Pattern 1: P.1, P.2, P.3, P.4, P.5 (case insensitive, flexible boundaries for OCR)
  const dotPattern = /p\.([1-5])(?:\b|[^0-9]|$)/gi;
  let match;
  while ((match = dotPattern.exec(text)) !== null) {
    detectedPages.add(`P.${match[1]}`);
  }

  // Pattern 2: P1, P2, P3, P4, P5 (without dot, case insensitive)
  const noDotPattern = /(?:^|[^a-zA-Z])p([1-5])(?:\b|[^0-9]|$)/gi;
  while ((match = noDotPattern.exec(text)) !== null) {
    detectedPages.add(`P.${match[1]}`);
  }

  // Pattern 3: "Page 1", "Page 2", etc.
  const pagePattern = /page\s*([1-5])(?:\b|[^0-9]|$)/gi;
  while ((match = pagePattern.exec(text)) !== null) {
    detectedPages.add(`P.${match[1]}`);
  }

  // Pattern 4: "Promotion" keyword indicates P.4
  if (/\bpromotion\b/i.test(text)) {
    detectedPages.add('P.4');
  }

  return Array.from(detectedPages).sort();
}

/**
 * Filter items by detected pages
 * If pages detected, return only items from those pages
 * If no pages detected, return all items
 */
function filterItemsByPages(items: Item[], detectedPages: string[]): Item[] {
  if (detectedPages.length === 0) {
    return items;
  }

  return items.filter(item => {
    // Include items that match detected pages
    if (item.notes && detectedPages.includes(item.notes)) {
      return true;
    }
    // Also include items without a page reference (in case they're relevant)
    if (!item.notes) {
      return true;
    }
    return false;
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const requestId = crypto.randomUUID();
  const logger = createLogger({
    requestId,
    functionName: 'process-intake-event'
  });

  try {
    const body = await req.json();

    // Handle both webhook format (type, record) and direct call format (intakeEventId)
    let intakeEventId: string;

    if (body.type === 'INSERT' && body.record) {
      // Webhook format from database trigger
      intakeEventId = body.record.id;
      logger.info('Database trigger received', { triggerType: body.type });
    } else if (body.intakeEventId) {
      // Direct call format
      intakeEventId = body.intakeEventId;
      logger.info('Direct call received');
    } else {
      logger.error('Invalid payload format');
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

    // Create a logger with intakeEventId context
    const eventLogger = logger.child({ intakeEventId });
    eventLogger.info('Processing intake event');

    // Debug mode - just log and return
    if (DEBUG_MODE) {
      console.log('🔍 DEBUG MODE - process-intake-event called but not processing');
      console.log('Intake Event ID:', intakeEventId);
      return new Response(
        JSON.stringify({ success: true, debug: true, intakeEventId }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Fetch intake_event from database
    const { data: intakeEvent, error: fetchError } = await supabase
      .from('intake_events')
      .select('*')
      .eq('id', intakeEventId)
      .single();

    if (fetchError || !intakeEvent) {
      eventLogger.error('Intake event not found', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Intake event not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    eventLogger.info('Intake event fetched', {
      channel: intakeEvent.channel,
      provider: intakeEvent.provider,
      organizationId: intakeEvent.organization_id
    });

    // Determine organization_id if not set, and always resolve user_id for AI logging
    let organizationId = intakeEvent.organization_id;
    let createdByUserId: string | null = null;

    // Always try to resolve user from sender info (needed for AI analysis logging)
    if (intakeEvent.channel === 'sms') {
      const fromPhone = intakeEvent.raw_content?.from;
      if (fromPhone) {
        const normalizedPhone = fromPhone.replace('+', '').trim();
        const { data: userId, error: userError } = await supabase
          .rpc('get_user_id_by_phone', { user_phone: normalizedPhone });

        if (userId) {
          eventLogger.info('Found user by phone', { userId, fromPhone });
          createdByUserId = userId;

          // If org not set, get it from user
          if (!organizationId) {
            const { data: userOrg } = await supabase
              .from('user_organizations')
              .select('organization_id')
              .eq('user_id', userId)
              .single();

            if (userOrg) {
              organizationId = userOrg.organization_id;
              eventLogger.info('Organization resolved from phone', { organizationId, fromPhone });
            } else {
              eventLogger.warn('User not associated with any organization', { userId });
            }
          }
        } else {
          eventLogger.warn('No user found for phone', { normalizedPhone, error: userError });
        }
      }
    } else if (intakeEvent.channel === 'email') {
      const fromEmail = intakeEvent.raw_content?.from;
      if (fromEmail) {
        const emailMatch = fromEmail.match(/<([^>]+)>/) || [null, fromEmail];
        const email = emailMatch[1];

        const { data: userId, error: userError } = await supabase
          .rpc('get_user_id_by_email', { user_email: email });

        if (!userError && userId) {
          createdByUserId = userId;

          // If org not set, get it from user
          if (!organizationId) {
            const { data: userOrg } = await supabase
              .from('user_organizations')
              .select('organization_id')
              .eq('user_id', userId)
              .single();

            if (userOrg) {
              organizationId = userOrg.organization_id;
              eventLogger.info('Organization resolved from email', { organizationId, email });
            }
          }
        } else {
          eventLogger.warn('No user found for email', { email });
        }
      }
    }

    // Fallback to demo organization if organization not found
    if (!organizationId) {
      organizationId = DEMO_ORGANIZATION_ID;
      createdByUserId = DEMO_USER_ID;

      eventLogger.info('Falling back to demo organization', {
        channel: intakeEvent.channel,
        from: intakeEvent.raw_content?.from,
        reason: 'org_not_found'
      });

      // Log demo fallback for transparency
      try {
        await supabase
          .from('demo_fallback_logs')
          .insert({
            original_email: intakeEvent.channel === 'email' ? intakeEvent.raw_content?.from : null,
            original_phone: intakeEvent.channel === 'sms' ? intakeEvent.raw_content?.from : null,
            intake_event_id: intakeEvent.id,
            reason: 'org_not_found',
            metadata: {
              channel: intakeEvent.channel,
              from: intakeEvent.raw_content?.from,
              subject: intakeEvent.raw_content?.subject,
              timestamp: new Date().toISOString()
            }
          });
      } catch (logError) {
        eventLogger.warn('Failed to log demo fallback', { error: logError });
      }
    }

    // Fallback to demo user if user not found (but org was found)
    // This ensures ai_analysis_logs always has a valid user_id
    if (!createdByUserId) {
      createdByUserId = DEMO_USER_ID;
      eventLogger.info('Falling back to demo user for AI logging', {
        organizationId,
        reason: 'user_not_found'
      });
    }

    // Update the intake_event with the determined organization if it wasn't set
    if (!intakeEvent.organization_id) {
      await supabase
        .from('intake_events')
        .update({ organization_id: organizationId })
        .eq('id', intakeEvent.id);
    }

    // Create logger with organization context
    const orgLogger = eventLogger.child({ organizationId });

    // Get organization's catalogs
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, email, phone')
      .eq('organization_id', organizationId)
      .eq('active', true);

    const { data: items } = await supabase
      .from('items')
      .select('id, sku, name, description, base_price, category, notes')
      .eq('organization_id', organizationId)
      .eq('active', true);

    orgLogger.info('Loaded catalogs', { customerCount: customers?.length || 0, itemCount: items?.length || 0 });

    // Step 1: Process attachments from intake_files table
    let attachmentText = '';

    // Query intake_files for this intake event
    const { data: intakeFiles, error: filesError } = await supabase
      .from('intake_files')
      .select('*')
      .eq('intake_event_id', intakeEventId);

    if (filesError) {
      orgLogger.warn('Error fetching intake_files', { error: filesError });
    } else if (intakeFiles && intakeFiles.length > 0) {
      orgLogger.info('Processing intake files', { fileCount: intakeFiles.length });

      for (const file of intakeFiles) {
        try {
          // Check if already processed with LLM Whisperer
          if (file.processed_content?.llm_whisperer?.text) {
            orgLogger.info('File already processed, using cached text', { filename: file.filename });

            // Extract result_text from stored JSON (or use raw text as fallback)
            let ocrText = file.processed_content.llm_whisperer.text;
            if (ocrText.startsWith('{')) {
              try {
                const parsed = JSON.parse(ocrText);
                ocrText = parsed.result_text || ocrText;
              } catch {
                // Not valid JSON, use as-is
              }
            }

            attachmentText += `\n\n--- Attachment: ${file.filename} ---\n${ocrText}`;
            continue;
          }

          // Skip non-document files (images without OCR value, etc.)
          const processableExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp', 'doc', 'docx', 'xls', 'xlsx'];
          if (file.extension && !processableExtensions.includes(file.extension.toLowerCase())) {
            orgLogger.info('Skipping file - extension not processable', { filename: file.filename, extension: file.extension });
            continue;
          }

          orgLogger.info('Processing file from storage', { filename: file.filename });

          // Update status to processing
          await supabase
            .from('intake_files')
            .update({ processing_status: 'processing' })
            .eq('id', file.id);

          // Generate signed URL for LLM Whisperer (preferred: avoids downloading file into memory)
          const { data: signedUrlData, error: signedUrlError } = await supabase
            .storage
            .from('intake-files')
            .createSignedUrl(file.storage_path, 600); // 10 minute expiry

          if (signedUrlError || !signedUrlData?.signedUrl) {
            orgLogger.error('Failed to create signed URL', signedUrlError, { filename: file.filename });
            await supabase
              .from('intake_files')
              .update({
                processing_status: 'failed',
                processing_error: signedUrlError?.message || 'Failed to create signed URL'
              })
              .eq('id', file.id);
            continue;
          }

          orgLogger.info('Created signed URL for LLM Whisperer', { filename: file.filename });

          // Extract text using LLM Whisperer with URL (no file download needed)
          const { textContent, resultText, whispererData } = await extractTextWithLLMWhisperer(signedUrlData.signedUrl, file.filename);

          // Update intake_files with processed content (store full JSON response)
          const processedContent = {
            ...file.processed_content,
            llm_whisperer: {
              text: textContent,  // Full JSON for storage
              whisper_hash: 'whisperHash' in whispererData ? whispererData.whisperHash : null,
              processed_at: new Date().toISOString(),
              metadata: whispererData
            }
          };

          await supabase
            .from('intake_files')
            .update({
              processed_content: processedContent,
              processing_status: textContent ? 'completed' : 'failed',
              processing_error: textContent ? null : 'No text extracted'
            })
            .eq('id', file.id);

          if (resultText) {
            // Use resultText (just the extracted text) for the AI prompt
            attachmentText += `\n\n--- Attachment: ${file.filename} ---\n${resultText}`;
            orgLogger.info('File processed successfully', { filename: file.filename, extractedChars: resultText.length });
          }

        } catch (error) {
          orgLogger.error('Error processing file', error, { filename: file.filename });
          await supabase
            .from('intake_files')
            .update({
              processing_status: 'failed',
              processing_error: error instanceof Error ? error.message : 'Unknown error'
            })
            .eq('id', file.id);
        }
      }

      if (attachmentText) {
        orgLogger.info('Total attachment text extracted', { totalChars: attachmentText.length });
      }
    } else {
      orgLogger.info('No files found in intake_files table for this event');
    }

    // Step 2: Extract basic info (customer, items, delivery date)
    const analysisResult = await analyzeIntakeEvent(
      intakeEvent,
      items || [],
      customers || [],
      attachmentText,
      organizationId,
      createdByUserId
    );

    // Build maps for looking up customer/item by ID
    const customersById = new Map<string, Customer>(customers?.map((c: Customer) => [c.id, c]) || []);
    const matchedCustomer = analysisResult.customerId ? customersById.get(analysisResult.customerId) : null;

    orgLogger.info('AI analysis complete', {
      orderLineCount: analysisResult.orderLines.length,
      matchedCustomerId: analysisResult.customerId,
      matchedCustomerName: matchedCustomer?.name,
      requestedDeliveryDate: analysisResult.requestedDeliveryDate
    });

    // Step 2: Fetch recent orders for this customer to detect if this is a change request
    let recentOrders = [];
    if (analysisResult.customerId) {
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
        .eq('customer_id', analysisResult.customerId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (ordersError) {
        orgLogger.error('Error fetching orders', ordersError);
      }

      recentOrders = orders || [];
      orgLogger.info('Fetched recent orders for customer', {
        customerId: analysisResult.customerId,
        customerName: matchedCustomer?.name,
        recentOrderCount: recentOrders.length
      });
    }

    // Step 3: Determine if this is a NEW order or a CHANGE to existing order
    const intentResult = await determineOrderIntent(
      intakeEvent,
      analysisResult,
      recentOrders
    );

    orgLogger.info('Order intent determined', {
      intent: intentResult.intent,
      matchedOrderId: intentResult.matchedOrderId,
      confidence: intentResult.confidence
    });

    // Step 4: Handle based on intent
    if (intentResult.intent === 'NEW_ORDER') {
      // Create NEW ORDER PROPOSAL (not an actual order yet - requires user approval)
      orgLogger.info('Creating new order proposal', { customerName: matchedCustomer?.name || 'Unknown' });

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

      const proposalLogger = orgLogger.child({ proposalId: proposal.id });
      proposalLogger.info('Created new order proposal');

      // Create proposal lines for the proposed order
      // Build a map of valid item IDs to their official data
      const itemsById = new Map<string, Item>(items.map((item: Item) => [item.id, item]));

      const proposalLines = analysisResult.orderLines.map((line: any, index: number) => {
        // New simplified format: line.itemId instead of line.matchedItem?.id
        const itemId = line.itemId;
        const matchedItemData = itemId ? itemsById.get(itemId) : null;

        if (itemId && !matchedItemData) {
          proposalLogger.warn('AI matched to non-existent item ID, setting to null', {
            itemId,
            quantity: line.quantity
          });
        }

        if (!itemId) {
          proposalLogger.warn('AI did not return item ID', {
            quantity: line.quantity
          });
        }

        // Use official item name from our database (source of truth)
        const officialItemName = matchedItemData?.name || 'Unknown Item';
        const officialSku = matchedItemData?.sku || null;

        if (matchedItemData) {
          proposalLogger.info('Matched item from database', {
            itemId,
            officialName: officialItemName,
            sku: officialSku
          });
        }

        return {
          proposal_id: proposal.id,
          order_line_id: null, // NULL for new order proposals (no existing order line)
          line_number: index + 1,
          change_type: 'add', // All lines are 'add' for new orders
          item_id: matchedItemData ? itemId : null,
          item_name: officialItemName,
          proposed_values: {
            quantity: line.quantity,
            ai_matched: !!matchedItemData,
            sku: officialSku,
            confidence: matchedItemData ? 0.9 : 0.5,
            organization_id: organizationId,
            customer_id: analysisResult.customerId || null,
            customer_name: matchedCustomer?.name || 'Unknown Customer',
            delivery_date: analysisResult.requestedDeliveryDate || null,
            source_channel: intakeEvent.channel,
            created_by_user_id: createdByUserId
          }
        };
      });

      if (proposalLines.length > 0) {
        const { error: linesError } = await supabase
          .from('order_change_proposal_lines')
          .insert(proposalLines);

        if (linesError) throw linesError;
        proposalLogger.info('Created proposal lines', { lineCount: proposalLines.length });
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
      const matchedOrderId = intentResult.matchedOrderId;
      orgLogger.info('Creating change proposal', { matchedOrderId });

      const matchedOrder = recentOrders.find(o => o.id === matchedOrderId);
      if (!matchedOrder) {
        orgLogger.error('Matched order not found', undefined, { matchedOrderId });
        throw new Error(`Matched order ${matchedOrderId} not found`);
      }

      orgLogger.info('Matched order found', {
        orderId: matchedOrder.id,
        customer: matchedOrder.customer_name,
        lineCount: matchedOrder.order_lines?.length
      });

      // Step 4: Determine specific changes by comparing matched order with change request
      const changesResult = await determineOrderChanges(
        intakeEvent,
        analysisResult,
        matchedOrder
      );

      orgLogger.info('Changes determined', { changeCount: changesResult.proposedChanges?.length || 0 });

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

      const proposalLogger = orgLogger.child({ proposalId: proposal.id, orderId: matchedOrder.id });
      proposalLogger.info('Created change proposal');

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
      // Build a map of valid item IDs to their official data
      const itemsById = new Map<string, Item>(items.map((item: Item) => [item.id, item]));

      const proposalLines = changesResult.proposedChanges.map((change: any, _index: number) => {
        // Validate item_id exists in current items list
        const itemId = change.item_id;
        const matchedItem = itemId ? itemsById.get(itemId) : null;

        if (itemId && !matchedItem) {
          proposalLogger.warn('Change references non-existent item ID, setting to null', {
            itemId,
            itemName: change.item_name
          });
        }

        // Use official item name from our database if available
        const officialItemName = matchedItem?.name || change.item_name;

        return {
          proposal_id: proposal.id,
          order_line_id: change.order_line_id || null,
          line_number: change.line_number,
          change_type: change.change_type,
          item_id: matchedItem ? itemId : null,
          item_name: officialItemName,
          proposed_values: change.proposed_values || null
        };
      });

      if (proposalLines.length > 0) {
        const { error: linesError } = await supabase
          .from('order_change_proposal_lines')
          .insert(proposalLines);

        if (linesError) {
          proposalLogger.error('Error inserting proposal lines', linesError);
          throw linesError;
        }
        proposalLogger.info('Created proposal lines', { lineCount: proposalLines.length });
      } else {
        proposalLogger.warn('No proposal lines to create - proposedChanges was empty');
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
      orgLogger.info('No action taken for intent', { intent: intentResult.intent });

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
    logger.error('Error processing intake event', error);

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
    model: 'gpt-5.1',
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

Customer ID: ${analysisResult.customerId || 'Unknown'}
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
      model: 'gpt-5.1',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return result;
  } catch (_error) {
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
    model: 'gpt-5.1',
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
      model: 'gpt-5.1',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_tokens: requestData.max_tokens,
      response_format: requestData.response_format
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return result;
  } catch (_error) {
    return {
      proposedChanges: [],
      reasoning: 'Failed to analyze changes'
    };
  }
}

async function analyzeIntakeEvent(
  intakeEvent: any,
  items: Item[],
  customers: Customer[],
  attachmentText: string = '',
  organizationId: string | null = null,
  userId: string | null = null
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

    // Append attachment text if available
    if (attachmentText) {
      content += `\n\n${attachmentText}`;
    }

    // Detect pages in the content and filter items accordingly
    // Debug: Log last 200 chars of content to verify P.X markers are present
    console.info(`[process-intake-event] Content tail (last 200 chars): ${content.slice(-500)}`);

    const detectedPages = detectPagesInText(content);
    let filteredItems = items;

    if (detectedPages.length > 0) {
      filteredItems = filterItemsByPages(items, detectedPages);
      console.info(`[process-intake-event] Detected pages: ${detectedPages.join(', ')}`);
      console.info(`[process-intake-event] Filtered items from ${items.length} to ${filteredItems.length} based on page detection`);
    } else {
      console.info(`[process-intake-event] No page indicators detected, using all ${items.length} items`);
    }

    const itemsList = filteredItems.map((item) => ({
      id: item.id,
      sku: item.sku,
      displayName: item.name,
      unitPrice: item.base_price
    }));

    const customersList = customers.map((customer) => ({
      id: customer.id,
      number: customer.id,
      displayName: customer.name,
      email: customer.email || null
    }));

    // Get organization-specific prompts
    const { systemPrompt, userPrompt, isCustomPrompt } = getAnalysisPrompt(organizationId, {
      itemsList,
      customersList,
      currentDate,
      content
    });

    console.info(`[process-intake-event] Prompt retrieved: isCustomPrompt=${isCustomPrompt}, organizationId=${organizationId}`);
    console.info(`[process-intake-event] System prompt length: ${systemPrompt.length}, User prompt length: ${userPrompt.length}`);
    console.info(`[process-intake-event] Content being analyzed (first 500 chars): ${content.substring(0, 500)}`);

    const requestData = {
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    };

    // Store AI analysis log
    const { data: aiLog, error: aiLogError } = await supabase
      .from('ai_analysis_logs')
      .insert({
        user_id: userId,
        analysis_type: intakeEvent.channel,
        source_id: intakeEvent.id,
        raw_request: requestData,
        model_used: 'gpt-5.1'
      })
      .select('id')
      .single();

    if (aiLogError) {
      console.error('[process-intake-event] Failed to create AI analysis log:', aiLogError);
    }

    const aiLogId = aiLog?.id || '';

    // Analyze with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: requestData.messages,
      temperature: requestData.temperature,
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
    } catch (_parseError) {
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
  } catch (_error) {
    return { orderLines: [] };
  }
}

// --- Helper Functions for LLM Whisperer ---

// Extract text from files using LLM Whisperer PRO API
// Supports both URL-based (preferred) and bytes-based submission
async function extractTextWithLLMWhisperer(input: string | Uint8Array, filename: string) {
  try {
    const llmWhispererApiKey = Deno.env.get('LLM_WHISPERER_API_KEY');

    if (!llmWhispererApiKey) {
      return {
        textContent: "",
        resultText: "",
        whispererData: { error: "API key not found" }
      };
    }

    // Step 1: Submit document for processing (URL or bytes)
    const submitResult = await submitDocumentToLLMWhisperer(input, filename, llmWhispererApiKey);

    if (!submitResult.whisperHash) {
      return {
        textContent: "",
        resultText: "",
        whispererData: {
          error: "Failed to submit document",
          submitResult: submitResult
        }
      };
    }

    // Step 2: Wait for processing and retrieve text
    const retrieveResult = await retrieveExtractedText(submitResult.whisperHash, llmWhispererApiKey);

    if (!retrieveResult.extractedText) {
      return {
        textContent: "",
        resultText: "",
        whispererData: {
          error: "Failed to retrieve text",
          whisperHash: submitResult.whisperHash,
          submitResult: submitResult,
          retrieveResult: retrieveResult
        }
      };
    }

    // Only store essential metadata, not the full text again or verbose attempt logs
    const whispererData = {
      whisperHash: submitResult.whisperHash,
      filename: filename,
      extractedTextLength: retrieveResult.extractedText.length,
      processedAt: new Date().toISOString(),
      totalAttempts: (retrieveResult.retrieveData?.attempts as unknown[])?.length || 1
    };

    return {
      textContent: retrieveResult.extractedText,     // Full JSON for storage
      resultText: retrieveResult.resultText || "",   // Just result_text for AI prompt
      whispererData: whispererData
    };

  } catch (error) {
    return {
      textContent: "",
      resultText: "",
      whispererData: {
        error: error instanceof Error ? error.message : 'Unknown error',
        processedAt: new Date().toISOString()
      }
    };
  }
}

// Submit document to LLM Whisperer for processing (supports URL or bytes)
async function submitDocumentToLLMWhisperer(input: string | Uint8Array, _filename: string, apiKey: string) {
  try {
    const isUrl = typeof input === 'string';
    const baseUrl = 'https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper?mode=form&output_mode=layout_preserving&mark_vertical_lines=true&mark_horizontal_lines=true';
    const url = isUrl ? `${baseUrl}&url_in_post=true` : baseUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'unstract-key': apiKey,
        'Content-Type': isUrl ? 'text/plain' : 'application/octet-stream'
      },
      body: isUrl ? input : (input as unknown as BodyInit)
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_parseError) {
      result = { error: 'Failed to parse response', responseText: responseText };
    }

    if (response.status !== 202) {
      return {
        whisperHash: null,
        submitResponse: {
          status: response.status,
          statusText: response.statusText,
          error: responseText,
          result: result
        }
      };
    }

    return {
      whisperHash: result.whisper_hash,
      submitResponse: {
        status: response.status,
        result: result,
        submittedAt: new Date().toISOString(),
        method: isUrl ? 'url' : 'bytes'
      }
    };
  } catch (error) {
    return {
      whisperHash: null,
      submitResponse: {
        error: error instanceof Error ? error.message : 'Unknown error',
        submittedAt: new Date().toISOString()
      }
    };
  }
}

// Retrieve extracted text from LLM Whisperer
async function retrieveExtractedText(whisperHash: string, apiKey: string) {
  try {
    const maxAttempts = 60;
    const delayMs = 3000; // 3 seconds - total ~3 minutes
    const retrieveData: Record<string, unknown> = {
      whisperHash: whisperHash,
      attempts: [],
      startedAt: new Date().toISOString()
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStart = new Date().toISOString();

      // Check status
      const statusResponse = await fetch(`https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper-status?whisper_hash=${whisperHash}`, {
        headers: {
          'unstract-key': apiKey
        }
      });

      if (!statusResponse.ok) {
        (retrieveData.attempts as unknown[]).push({
          attempt: attempt,
          attemptStart: attemptStart,
          error: `Status check failed: ${statusResponse.status} ${statusResponse.statusText}`,
          attemptEnd: new Date().toISOString()
        });
        return { extractedText: null, resultText: null, retrieveData: retrieveData };
      }

      const statusResult = await statusResponse.json();

      (retrieveData.attempts as unknown[]).push({
        attempt: attempt,
        attemptStart: attemptStart,
        status: statusResult.status,
        statusResult: statusResult,
        attemptEnd: new Date().toISOString()
      });

      if (statusResult.status === 'processed') {
        // Retrieve the extracted text
        const textResponse = await fetch(`https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper-retrieve?whisper_hash=${whisperHash}`, {
          headers: {
            'unstract-key': apiKey
          }
        });

        if (!textResponse.ok) {
          retrieveData.textRetrievalError = {
            status: textResponse.status,
            statusText: textResponse.statusText,
            retrievedAt: new Date().toISOString()
          };
          return { extractedText: null, resultText: null, retrieveData: retrieveData };
        }

        const responseText = await textResponse.text();
        retrieveData.completedAt = new Date().toISOString();
        retrieveData.extractedTextLength = responseText.length;

        // Parse JSON response and extract result_text for the AI prompt
        // Store full response for storage, but use just result_text for analysis
        let resultText = responseText;
        if (responseText.startsWith('{')) {
          try {
            const parsed = JSON.parse(responseText);
            resultText = parsed.result_text || responseText;
          } catch {
            // Not valid JSON, use raw text
          }
        }

        return { extractedText: responseText, resultText: resultText, retrieveData: retrieveData };

      } else if (statusResult.status === 'processing') {
        // Wait before next attempt
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else if (statusResult.status === 'failed') {
        retrieveData.processingFailed = {
          statusResult: statusResult,
          failedAt: new Date().toISOString()
        };
        return { extractedText: null, resultText: null, retrieveData: retrieveData };
      }
    }

    retrieveData.timedOut = {
      maxAttempts: maxAttempts,
      timedOutAt: new Date().toISOString()
    };
    return { extractedText: null, resultText: null, retrieveData: retrieveData };

  } catch (error) {
    return {
      extractedText: null,
      resultText: null,
      retrieveData: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorAt: new Date().toISOString()
      }
    };
  }
}
