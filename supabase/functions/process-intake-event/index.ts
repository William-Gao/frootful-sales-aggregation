import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';
import { createLogger } from '../_shared/logger.ts';
import { getAnalysisPrompt, ExistingOrderContext } from '../_shared/prompts.ts';

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

interface ItemVariant {
  id: string;
  variant_code: string;
  variant_name: string;
  notes?: string;
}

interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  notes?: string;  // Page reference (P.1, P.2, etc.)
  item_variants?: ItemVariant[];
}

interface OrderLine {
  id: string;
  line_number: number;
  product_name: string;
  quantity: number;
  item_variants?: { variant_code: string; variant_name: string } | null;
}

interface Order {
  id: string;
  customer_name: string;
  delivery_date: string;
  status: string;
  created_at: string;
  order_lines: OrderLine[];
}

interface DeliveryDateGroup {
  requestedDeliveryDate: string | null;
  orderLines: any[];
}

/**
 * Groups order lines by delivery date.
 * Lines with a per-line requestedDeliveryDate use that date.
 * Lines without one inherit the defaultDate (top-level requestedDeliveryDate).
 * Returns one group per unique delivery date.
 */
function groupOrderLinesByDeliveryDate(
  orderLines: any[],
  defaultDate: string | null
): DeliveryDateGroup[] {
  if (!orderLines || orderLines.length === 0) {
    return [{ requestedDeliveryDate: defaultDate, orderLines: [] }];
  }

  const groups = new Map<string | null, any[]>();

  for (const line of orderLines) {
    const date = line.requestedDeliveryDate || defaultDate || null;

    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(line);
  }

  return Array.from(groups.entries()).map(([date, lines]) => ({
    requestedDeliveryDate: date,
    orderLines: lines,
  }));
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

    // Idempotency check: skip if proposals already exist for this intake event
    const { count: existingProposalCount } = await supabase
      .from('order_change_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('intake_event_id', intakeEventId);

    if (existingProposalCount && existingProposalCount > 0) {
      eventLogger.info('Skipping - proposals already exist for this intake event', {
        existingProposalCount
      });
      return new Response(
        JSON.stringify({
          success: true,
          data: { intake_event_id: intakeEventId, skipped: true, reason: 'already_processed' }
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Determine organization_id if not set, and always resolve user_id for AI logging
    let organizationId = intakeEvent.organization_id;
    let createdByUserId: string | null = null;

    // For SMS: resolve user from sender phone number
    if (intakeEvent.channel === 'sms') {
      const fromPhone = intakeEvent.raw_content?.from;
      if (fromPhone) {
        // Twilio sends phone in E.164 format (+1XXXXXXXXXX), just strip whitespace
        const normalizedPhone = fromPhone.replace(/\s+/g, '');

        eventLogger.info('SMS phone lookup attempt', {
          rawPhone: fromPhone,
          normalizedPhone: normalizedPhone
        });

        // Try RPC first
        const { data: userId, error: userError } = await supabase
          .rpc('get_user_id_by_phone', { user_phone: normalizedPhone });

        eventLogger.info('Phone RPC lookup result', {
          normalizedPhone,
          userId,
          error: userError?.message || null
        });

        // Debug: Also try direct query to see what's in auth.users
        // This helps us understand if the issue is the RPC or the phone format
        if (!userId) {
          // Try without + prefix (in case auth.users stores without it)
          const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
          const { data: altUserId } = await supabase
            .rpc('get_user_id_by_phone', { user_phone: phoneWithoutPlus });

          eventLogger.info('Phone lookup without + prefix', {
            phoneWithoutPlus,
            altUserId
          });

          if (altUserId) {
            createdByUserId = altUserId;
            eventLogger.info('Found user by phone (without + prefix)', { userId: altUserId });
          }
        }

        if (!userError && userId) {
          createdByUserId = userId;
          eventLogger.info('Found user by phone', { userId, fromPhone: normalizedPhone });
        }

        // If org not set, get it from user
        if (createdByUserId && !organizationId) {
          const { data: userOrg } = await supabase
            .from('user_organizations')
            .select('organization_id')
            .eq('user_id', createdByUserId)
            .single();

          if (userOrg) {
            organizationId = userOrg.organization_id;
            eventLogger.info('Organization resolved from phone', { organizationId, phone: normalizedPhone });
          }
        }

        if (!createdByUserId) {
          eventLogger.warn('No user found for phone', { phone: normalizedPhone, error: userError });
        }
      }
    }

    // For email: resolve user from sender email (needed for AI analysis logging)
    if (intakeEvent.channel === 'email') {
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
      .select('id, sku, name, description, item_variants(id, variant_code, variant_name, notes)')
      .eq('organization_id', organizationId)
      .eq('active', true);

    orgLogger.info('Loaded catalogs', { customerCount: customers?.length || 0, itemCount: items?.length || 0 });

    // Pre-fetch existing orders for the customer (before AI analysis)
    // This gives the AI context to resolve vague references like "each", "these items", "same as usual"
    let preMatchedCustomerId: string | null = null;
    let existingOrders: ExistingOrderContext[] = [];

    if (intakeEvent.channel === 'sms') {
      // For SMS, the "from" phone is the forwarder, NOT the customer.
      // Instead, try to match a customer name from the message body text.
      const smsBody = (intakeEvent.raw_content?.body || '').toLowerCase();
      if (smsBody && customers) {
        const matchedCustomer = customers.find((c: Customer) => {
          if (!c.name) return false;
          return smsBody.includes(c.name.toLowerCase());
        });

        if (matchedCustomer) {
          preMatchedCustomerId = matchedCustomer.id;
          orgLogger.info('Pre-matched customer from SMS body text', { customerId: matchedCustomer.id, customerName: matchedCustomer.name });
        } else {
          orgLogger.info('No customer name match found in SMS body');
        }
      }
    } else if (intakeEvent.channel === 'email') {
      // For email, try to match sender email to a customer
      const fromEmail = intakeEvent.raw_content?.from;
      if (fromEmail && customers) {
        const emailMatch = fromEmail.match(/<([^>]+)>/) || [null, fromEmail];
        const email = (emailMatch[1] || '').toLowerCase();
        const matchedCustomer = customers.find((c: Customer) => {
          if (!c.email) return false;
          return c.email.toLowerCase() === email;
        });

        if (matchedCustomer) {
          preMatchedCustomerId = matchedCustomer.id;
          orgLogger.info('Pre-matched customer from email', { customerId: matchedCustomer.id, customerName: matchedCustomer.name });
        }
      }
    }

    // If we identified a customer, fetch their upcoming orders for AI context
    if (preMatchedCustomerId) {
      const today = new Date().toISOString().split('T')[0];
      const { data: preOrders } = await supabase
        .from('orders')
        .select('id, customer_name, delivery_date, order_lines(product_name, quantity)')
        .eq('organization_id', organizationId)
        .eq('customer_id', preMatchedCustomerId)
        .neq('status', 'cancelled')
        .gte('delivery_date', today)
        .order('delivery_date', { ascending: true })
        .limit(5);

      if (preOrders && preOrders.length > 0) {
        existingOrders = preOrders.map((o: any) => ({
          customerName: o.customer_name,
          deliveryDate: o.delivery_date,
          lines: (o.order_lines || []).map((l: any) => ({
            productName: l.product_name,
            quantity: Number(l.quantity)
          }))
        }));
        orgLogger.info('Pre-fetched existing orders for AI context', {
          customerName: preOrders[0].customer_name,
          orderCount: existingOrders.length,
          totalLines: existingOrders.reduce((sum, o) => sum + o.lines.length, 0)
        });
      }
    }

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
      createdByUserId,
      existingOrders
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

    // Step 2: Fetch both upcoming and recent orders for this customer
    // Upcoming: most likely candidates for modifications
    // Recent: context for patterns or past order references
    let upcomingOrders: Order[] = [];
    let pastOrders: Order[] = [];
    const today = new Date().toISOString().split('T')[0];

    if (analysisResult.customerId) {
      // Fetch upcoming orders (delivery_date >= today) for matched customer
      const { data: upcoming, error: upcomingError } = await supabase
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
            quantity,
            item_variants(variant_code, variant_name)
          )
        `)
        .eq('organization_id', organizationId)
        .eq('customer_id', analysisResult.customerId)
        .neq('status', 'cancelled')
        .eq('order_lines.status', 'active')
        .gte('delivery_date', today)
        .order('delivery_date', { ascending: true })  // Nearest delivery first
        .limit(5);

      if (upcomingError) {
        orgLogger.error('Error fetching upcoming orders', upcomingError);
      }
      upcomingOrders = upcoming || [];

      // Fetch recent past orders (delivery_date < today)
      const { data: past, error: pastError } = await supabase
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
            quantity,
            item_variants(variant_code, variant_name)
          )
        `)
        .eq('organization_id', organizationId)
        .eq('customer_id', analysisResult.customerId)
        .neq('status', 'cancelled')
        .eq('order_lines.status', 'active')
        .lt('delivery_date', today)
        .order('delivery_date', { ascending: false })  // Most recent past first
        .limit(3);

      if (pastError) {
        orgLogger.error('Error fetching past orders', pastError);
      }
      pastOrders = past || [];

      orgLogger.info('Fetched orders for customer', {
        customerId: analysisResult.customerId,
        customerName: matchedCustomer?.name,
        upcomingOrderCount: upcomingOrders.length,
        pastOrderCount: pastOrders.length
      });
    } else {
      // FALLBACK: Customer not matched - fetch ALL upcoming orders so AI can attempt name-based matching
      // This handles cases where "Deauxave" doesn't match exactly to customer in DB
      orgLogger.warn('Customer not matched - fetching all upcoming orders as fallback', {
        requestedDeliveryDate: analysisResult.requestedDeliveryDate
      });

      const { data: allUpcoming, error: allUpcomingError } = await supabase
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
            quantity,
            item_variants(variant_code, variant_name)
          )
        `)
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .eq('order_lines.status', 'active')
        .gte('delivery_date', today)
        .order('delivery_date', { ascending: true })
        .limit(20);  // Get more orders since we're doing name matching

      if (allUpcomingError) {
        orgLogger.error('Error fetching all upcoming orders', allUpcomingError);
      }
      upcomingOrders = allUpcoming || [];

      orgLogger.info('Fetched all upcoming orders for fallback matching', {
        orderCount: upcomingOrders.length,
        customerNames: upcomingOrders.map(o => o.customer_name)
      });
    }

    // Step 3: Group order lines by delivery date for multi-order support
    const dateGroups = groupOrderLinesByDeliveryDate(
      analysisResult.orderLines || [],
      analysisResult.requestedDeliveryDate || null
    );

    // Add cancel-only groups from cancelDates (dates with no order lines)
    const cancelDates: string[] = analysisResult.cancelDates || [];
    for (const cancelDate of cancelDates) {
      const alreadyHasGroup = dateGroups.some(g => g.requestedDeliveryDate === cancelDate);
      if (!alreadyHasGroup) {
        dateGroups.push({ requestedDeliveryDate: cancelDate, orderLines: [] });
      }
    }

    orgLogger.info('Order lines grouped by delivery date', {
      groupCount: dateGroups.length,
      cancelDates,
      groups: dateGroups.map(g => ({
        date: g.requestedDeliveryDate,
        lineCount: g.orderLines.length,
        isCancelOnly: cancelDates.includes(g.requestedDeliveryDate || '')
      }))
    });

    // Build item lookup map once (shared across all groups)
    const itemsById = new Map<string, Item>(items.map((item: Item) => [item.id, item]));

    // Process each delivery date group independently
    const createdProposals: any[] = [];

    for (const group of dateGroups) {
      // Skip empty groups (unless they're cancel-only groups from cancelDates)
      const isCancelGroup = cancelDates.includes(group.requestedDeliveryDate || '');
      if (group.orderLines.length === 0 && !isCancelGroup) {
        orgLogger.info('Skipping empty delivery date group', { date: group.requestedDeliveryDate });
        continue;
      }

      const groupLogger = orgLogger.child({
        groupDate: group.requestedDeliveryDate || undefined,
      });

      // Build per-group analysis result
      const groupAnalysis = {
        ...analysisResult,
        orderLines: group.orderLines,
        requestedDeliveryDate: group.requestedDeliveryDate,
      };

      try {
        // Check for exact date match for THIS group's delivery date
        let exactDateMatchOrder: Order | null = null;
        if (group.requestedDeliveryDate && upcomingOrders.length > 0) {
          exactDateMatchOrder = upcomingOrders.find(
            o => o.delivery_date === group.requestedDeliveryDate
          ) || null;

          if (exactDateMatchOrder) {
            groupLogger.info('========== EXACT DATE MATCH FOUND ==========');
            groupLogger.info('Existing order found for requested delivery date - will be treated as CHANGE_ORDER', {
              requestedDeliveryDate: group.requestedDeliveryDate,
              matchedOrderId: exactDateMatchOrder.id,
              matchedOrderCustomer: exactDateMatchOrder.customer_name,
              existingOrderItems: exactDateMatchOrder.order_lines.map(l => `${l.product_name} x${l.quantity}`).join(', ')
            });
            groupLogger.info('============================================');
          } else {
            groupLogger.info('No exact date match - requested date has no existing order', {
              requestedDeliveryDate: group.requestedDeliveryDate,
              upcomingOrderDates: upcomingOrders.map(o => o.delivery_date)
            });
          }
        } else if (!group.requestedDeliveryDate) {
          groupLogger.info('No requested delivery date for this group');
        }

        // Determine intent: skip AI for cancel-only groups from cancelDates
        let intentResult;
        if (isCancelGroup && group.orderLines.length === 0) {
          // This group came from cancelDates — force CANCEL_ORDER intent
          intentResult = {
            intent: exactDateMatchOrder ? 'CANCEL_ORDER' : 'CANCEL_ORDER',
            matchedOrderId: exactDateMatchOrder?.id || null,
            confidence: 1.0,
            reasoning: 'Cancel date specified by customer (from cancelDates)'
          };
          groupLogger.info('Cancel group — skipping AI intent detection', {
            intent: intentResult.intent,
            matchedOrderId: intentResult.matchedOrderId,
          });
        } else {
          intentResult = await determineOrderIntent(
            intakeEvent,
            groupAnalysis,
            upcomingOrders,
            pastOrders,
            exactDateMatchOrder
          );
          groupLogger.info('Order intent determined', {
            intent: intentResult.intent,
            matchedOrderId: intentResult.matchedOrderId,
            confidence: intentResult.confidence
          });
        }

        // Step 4: Handle based on intent
        if (intentResult.intent === 'NEW_ORDER') {
          // Create NEW ORDER PROPOSAL (not an actual order yet - requires user approval)
          groupLogger.info('Creating new order proposal', { customerName: matchedCustomer?.name || 'Unknown' });

          // Create proposal with order_id = NULL (indicates this is a new order proposal)
          const { data: proposal, error: proposalError } = await supabase
            .from('order_change_proposals')
            .insert({
              organization_id: organizationId,
              order_id: null, // NULL indicates this is a new order proposal
              intake_event_id: intakeEvent.id,
              status: 'pending',
              type: 'new_order',
              tags: { order_frequency: groupAnalysis.orderFrequency || 'one-time' }
            })
            .select()
            .single();

          if (proposalError) throw proposalError;

          const proposalLogger = groupLogger.child({ proposalId: proposal.id });
          proposalLogger.info('Created new order proposal');

          // Create proposal lines for the proposed order
          const proposalLines = groupAnalysis.orderLines.map((line: any, index: number) => {
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

            // Resolve variant from AI response
            const variantCode = line.variantCode || null;
            let itemVariantId: string | null = null;
            if (matchedItemData && variantCode) {
              const variant = matchedItemData.item_variants?.find(
                (v: ItemVariant) => v.variant_code === variantCode
              );
              itemVariantId = variant?.id || null;
            }

            if (matchedItemData) {
              proposalLogger.info('Matched item from database', {
                itemId,
                officialName: officialItemName,
                sku: officialSku,
                variantCode,
                itemVariantId
              });
            }

            return {
              proposal_id: proposal.id,
              order_line_id: null, // NULL for new order proposals (no existing order line)
              line_number: index + 1,
              change_type: 'add', // All lines are 'add' for new orders
              item_id: matchedItemData ? itemId : null,
              item_variant_id: itemVariantId,
              item_name: officialItemName,
              proposed_values: {
                quantity: line.quantity,
                variant_code: variantCode,
                ai_matched: !!matchedItemData,
                sku: officialSku,
                confidence: matchedItemData ? 0.9 : 0.5,
                organization_id: organizationId,
                customer_id: groupAnalysis.customerId || null,
                customer_name: matchedCustomer?.name || 'Unknown Customer',
                delivery_date: group.requestedDeliveryDate || null,
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

          createdProposals.push({
            proposal_id: proposal.id,
            order_id: null,
            intake_event_id: intakeEventId,
            is_new_order_proposal: true,
            delivery_date: group.requestedDeliveryDate
          });

        } else if (intentResult.intent === 'CHANGE_ORDER') {
          // Create change proposal
          const matchedOrderId = intentResult.matchedOrderId;
          groupLogger.info('Creating change proposal', { matchedOrderId });

          // Search both upcoming and past orders for the matched order
          const allOrders = [...upcomingOrders, ...pastOrders];
          const matchedOrder = allOrders.find(o => o.id === matchedOrderId);
          if (!matchedOrder) {
            groupLogger.error('Matched order not found', undefined, { matchedOrderId });
            throw new Error(`Matched order ${matchedOrderId} not found`);
          }

          groupLogger.info('Matched order found', {
            orderId: matchedOrder.id,
            customer: matchedOrder.customer_name,
            lineCount: matchedOrder.order_lines?.length
          });

          // Determine specific changes by comparing matched order with change request
          const changesResult = await determineOrderChanges(
            intakeEvent,
            groupAnalysis,
            matchedOrder,
            items
          );

          // Ensure proposedChanges is always an array (AI may return undefined/null for large emails)
          const proposedChanges = changesResult.proposedChanges || [];

          groupLogger.info('Changes determined', { changeCount: proposedChanges.length });

          // Create proposal
          const { data: proposal, error: proposalError } = await supabase
            .from('order_change_proposals')
            .insert({
              organization_id: organizationId,
              order_id: matchedOrder.id,
              intake_event_id: intakeEvent.id,
              status: 'pending',
              type: 'change_order',
              tags: { order_frequency: groupAnalysis.orderFrequency || 'one-time' }
            })
            .select()
            .single();

          if (proposalError) throw proposalError;

          const proposalLogger = groupLogger.child({ proposalId: proposal.id, orderId: matchedOrder.id });
          proposalLogger.info('Created change proposal');

          // Create order event for change proposal
          await supabase.from('order_events').insert({
            order_id: matchedOrder.id,
            intake_event_id: intakeEvent.id,
            type: 'change_proposed',
            metadata: {
              proposal_id: proposal.id,
              channel: intakeEvent.channel,
              change_count: proposedChanges.length,
              changes_summary: proposedChanges.map((c: any) => ({
                type: c.change_type,
                item: c.item_name
              }))
            }
          });

          // Create proposal lines based on detected changes
          const proposalLines = proposedChanges.map((change: any, _index: number) => {
            const itemId = change.item_id;
            const matchedItem = itemId ? itemsById.get(itemId) : null;

            if (itemId && !matchedItem) {
              proposalLogger.warn('Change references non-existent item ID, setting to null', {
                itemId,
                itemName: change.item_name
              });
            }

            const officialItemName = matchedItem?.name || change.item_name;

            const variantCode = change.proposed_values?.variant_code || null;
            let itemVariantId: string | null = null;
            if (matchedItem && variantCode) {
              const variant = matchedItem.item_variants?.find(
                (v: ItemVariant) => v.variant_code === variantCode
              );
              itemVariantId = variant?.id || null;
            }

            return {
              proposal_id: proposal.id,
              order_line_id: change.order_line_id || null,
              line_number: change.line_number,
              change_type: change.change_type,
              item_id: matchedItem ? itemId : null,
              item_variant_id: itemVariantId,
              item_name: officialItemName,
              proposed_values: {
                ...(change.proposed_values || {}),
                variant_code: variantCode,
              }
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
            .update({ status: 'pending_review' })
            .eq('id', matchedOrder.id);

          createdProposals.push({
            proposal_id: proposal.id,
            order_id: matchedOrder.id,
            intake_event_id: intakeEventId,
            delivery_date: group.requestedDeliveryDate
          });

        } else if (intentResult.intent === 'CANCEL_ORDER') {
          // Handle order cancellation
          const matchedOrderId = intentResult.matchedOrderId;
          groupLogger.info('Processing order cancellation', { matchedOrderId });

          if (!matchedOrderId) {
            groupLogger.warn('CANCEL_ORDER intent but no matchedOrderId');
            createdProposals.push({
              intake_event_id: intakeEventId,
              intent: intentResult.intent,
              message: 'Cancel intent detected but no order matched',
              delivery_date: group.requestedDeliveryDate
            });
            continue;
          }

          const allOrders = [...upcomingOrders, ...pastOrders];
          const matchedOrder = allOrders.find(o => o.id === matchedOrderId);
          if (!matchedOrder) {
            groupLogger.error('Matched order not found for cancellation', undefined, { matchedOrderId });
            throw new Error(`Matched order ${matchedOrderId} not found`);
          }

          groupLogger.info('Order found for cancellation', {
            orderId: matchedOrder.id,
            customer: matchedOrder.customer_name,
            deliveryDate: matchedOrder.delivery_date
          });

          const { data: proposal, error: proposalError } = await supabase
            .from('order_change_proposals')
            .insert({
              organization_id: organizationId,
              order_id: matchedOrder.id,
              intake_event_id: intakeEvent.id,
              status: 'pending',
              type: 'cancel_order',
              tags: { order_frequency: 'one-time' }
            })
            .select()
            .single();

          if (proposalError) throw proposalError;

          const proposalLogger = groupLogger.child({ proposalId: proposal.id, orderId: matchedOrder.id });
          proposalLogger.info('Created cancel proposal');

          await supabase.from('order_events').insert({
            order_id: matchedOrder.id,
            intake_event_id: intakeEvent.id,
            type: 'change_proposed',
            metadata: {
              proposal_id: proposal.id,
              channel: intakeEvent.channel,
              reasoning: intentResult.reasoning,
              intent: 'cancel_order'
            }
          });

          await supabase
            .from('orders')
            .update({ status: 'pending_review' })
            .eq('id', matchedOrder.id);

          createdProposals.push({
            proposal_id: proposal.id,
            order_id: matchedOrder.id,
            intake_event_id: intakeEventId,
            intent: 'CANCEL_ORDER',
            delivery_date: group.requestedDeliveryDate
          });

        } else {
          // Unknown intent or not relevant
          groupLogger.info('No action taken for intent', { intent: intentResult.intent });
          createdProposals.push({
            intake_event_id: intakeEventId,
            intent: intentResult.intent,
            message: 'Intake event processed but no action taken',
            delivery_date: group.requestedDeliveryDate
          });
        }

      } catch (groupError) {
        // Log error for this group but continue processing remaining groups
        groupLogger.error('Error processing delivery date group', groupError);
        createdProposals.push({
          intake_event_id: intakeEventId,
          delivery_date: group.requestedDeliveryDate,
          error: groupError instanceof Error ? groupError.message : 'Unknown error'
        });
      }
    }

    // Summary log
    orgLogger.info('═══ INTAKE PROCESSING COMPLETE ═══', {
      intakeEventId,
      totalGroups: dateGroups.length,
      proposalsCreated: createdProposals.filter(p => p.proposal_id).length,
      errors: createdProposals.filter(p => p.error).length,
      results: createdProposals.map(p => ({
        date: p.delivery_date,
        intent: p.intent || (p.is_new_order_proposal ? 'NEW_ORDER' : p.order_id ? 'CHANGE_ORDER' : 'UNKNOWN'),
        proposalId: p.proposal_id || null,
        error: p.error || null,
      }))
    });

    // Return all created proposals
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          intake_event_id: intakeEventId,
          proposals: createdProposals,
          // Backwards-compatible: include first proposal's data at top level
          proposal_id: createdProposals[0]?.proposal_id || null,
          order_id: createdProposals[0]?.order_id || null,
          is_new_order_proposal: createdProposals[0]?.is_new_order_proposal || false,
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

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
  upcomingOrders: Order[],
  pastOrders: Order[],
  exactDateMatchOrder: Order | null = null
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
1. A NEW order (customer placing a fresh order with multiple items)
2. A CHANGE to an existing order (modifying quantities, adding/removing items, changing delivery date)
3. A CANCEL order (customer wants to cancel their entire order - NOT individual item removals)
4. UNKNOWN (not clearly order-related or unclear intent)

CRITICAL RULE: If there is ALREADY an order for this customer on the requested delivery date (in UPCOMING orders), the intent is ALWAYS CHANGE_ORDER, not NEW_ORDER. The customer is modifying their existing order for that day.

CANCEL vs CHANGE_ORDER - THIS IS CRITICAL:
- CANCEL_ORDER: Customer wants to cancel THE ENTIRE ORDER with NO specific items mentioned (e.g., "cancel my order", "cancel everything", "I don't need my order anymore", "please cancel", "we won't need the delivery")
- CHANGE_ORDER: Customer mentions ANY SPECIFIC ITEM by name, even if they say "remove" (e.g., "remove the radish", "take off the basil", "remove the cabbage from all orders", "please remove X going forward")

IMPORTANT: If the message mentions a SPECIFIC ITEM NAME (like "cabbage", "radish", "sunflower", etc.), it is ALWAYS a CHANGE_ORDER, even if they say "remove from all orders" or "going forward". The key distinction is:
- Specific item mentioned → CHANGE_ORDER (removing that item from orders)
- No specific item mentioned, just "cancel" → CANCEL_ORDER (cancelling entire order)

CUSTOMER NAME MATCHING: If Customer ID is "Unknown", look at the customer_name in the UPCOMING orders and try to match by name. Names may be spelled slightly differently (e.g., "Deauxave" might match "Deuxave" or "Deaux Ave"). Use fuzzy matching logic - if a customer name in the message is similar to an order's customer_name, consider it a match.

CRITICAL: If a customer with upcoming orders asks to "add", "remove", or "change" items, this is almost always a CHANGE_ORDER (modifying their existing order), NOT a new order.

Change/modification indicators (→ CHANGE_ORDER):
- "can we add", "add a", "add one more", "add to my order"
- "change", "update", "modify", "increase", "decrease"
- "remove [specific item]", "take off [item]", "drop the [item]"
- "remove X from all orders", "remove X going forward" (still CHANGE_ORDER because specific item is named)
- "just for this [day]" (implies modifying a specific delivery)
- Single item requests from customers with existing orders
- ANY request that mentions a date where the customer already has an order
- ANY message that names a specific product/item

Cancel indicators (→ CANCEL_ORDER):
- "cancel my order", "cancel the order", "cancel everything"
- "we don't need", "we won't need the delivery"
- "please cancel", "need to cancel"
- NO specific items/products mentioned, just cancelling the whole order
- The word "cancel" WITHOUT any specific item names

New order indicators (→ NEW_ORDER):
- Full order lists with multiple items AND no existing order for that date
- "I need to place an order", "new order"
- "please send" (with full item list)
- No upcoming orders exist for this customer for the requested date

Consider the context of upcoming orders for this customer. If the customer already has an order for the requested delivery date, it's a CHANGE_ORDER.`
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
${exactDateMatchOrder ? `
⚠️ EXACT DATE MATCH FOUND ⚠️
There is ALREADY an existing order for the requested delivery date (${analysisResult.requestedDeliveryDate}).
Order ID: ${exactDateMatchOrder.id}
Customer: ${exactDateMatchOrder.customer_name}
Current items: ${JSON.stringify(exactDateMatchOrder.order_lines.map((l: OrderLine) => ({ product: l.product_name, quantity: l.quantity })))}

This means the customer is MODIFYING their existing order, NOT placing a new one.
Intent MUST be CHANGE_ORDER with matchedOrderId: "${exactDateMatchOrder.id}"
` : ''}
UPCOMING orders (delivery_date >= today - these are the most likely targets for modifications):
${JSON.stringify(upcomingOrders.map(o => ({
          id: o.id,
          customer_name: o.customer_name,
          delivery_date: o.delivery_date,
          status: o.status,
          lines: o.order_lines.map((l: OrderLine) => ({
            id: l.id,
            product: l.product_name,
            quantity: l.quantity
          }))
        })))}

PAST orders (for context and pattern reference):
${JSON.stringify(pastOrders.map(o => ({
          id: o.id,
          delivery_date: o.delivery_date,
          status: o.status,
          lines: o.order_lines.map((l: OrderLine) => ({
            id: l.id,
            product: l.product_name,
            quantity: l.quantity
          }))
        })))}

Return JSON with this structure:
{
  "intent": "NEW_ORDER" | "CHANGE_ORDER" | "CANCEL_ORDER" | "UNKNOWN",
  "matchedOrderId": "uuid-if-change-or-cancel-order" | null,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

For CHANGE_ORDER and CANCEL_ORDER:
- Match to the most relevant order based on delivery date
- Return the order ID that should be modified or cancelled
- If the message mentions a specific day (e.g., "this Tuesday", "2/10"), match to the order with that delivery date
- ALWAYS return matchedOrderId if intent is CHANGE_ORDER or CANCEL_ORDER

CRITICAL:
1. If there's an EXACT DATE MATCH (shown above), intent MUST be CHANGE_ORDER or CANCEL_ORDER with the matched order ID
2. If a customer says "can we add X" or "remove X" or "change X" and has an upcoming order, this is a CHANGE_ORDER
3. If a customer wants to cancel THE ENTIRE ORDER (not just specific items), use CANCEL_ORDER
4. Only use NEW_ORDER if there is NO existing order for this customer on the requested date
`
      }
    ],
    temperature: 0.3,
    max_completion_tokens: 1000,
    response_format: { type: "json_object" }
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_completion_tokens: requestData.max_completion_tokens,
      response_format: requestData.response_format
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return result;
  } catch (error) {
    // Log the error for debugging
    console.error('========== ERROR IN determineOrderIntent ==========');
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('====================DEFAULTING TO NEW_ORDER===============================');

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
  matchedOrder: any,
  catalogItems: Item[]
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

  // Build catalog items list with variants for the AI
  const catalogItemsList = catalogItems.map(item => ({
    id: item.id,
    name: item.name,
    variants: item.item_variants?.map(v => ({
      code: v.variant_code,
      name: v.variant_name,
      notes: v.notes
    })) || []
  }));

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
4. Identify modifications (items where quantity or variant/size changed)

ITEM VARIANTS:
Each item may have size variants with:
- "code": variant code (S, L, T20)
- "name": variant name
- "notes": additional info like oz weight (e.g., "1.5oz", "3oz")

CRITICAL: Match oz weights to variants by looking at each item's variant "notes" field.
- If customer says "3oz", find the variant whose "notes" contains "3oz"
- Do NOT assume 3oz = Large or 1.5oz = Small
- The oz-to-variant mapping varies by item, so always check the "notes" field

For general size references (when oz not specified):
- "small", "S" → variant_code: "S"
- "large", "L" → variant_code: "L"
- "tray", "T20" → variant_code: "T20"

Use the catalog items list to find the correct item_id and variant_code.

CRITICAL RULE — TRUST THE EXTRACTED ITEMS:
The "Extracted items from change request" below have already been parsed by a prior AI step. They represent exactly what the customer wants to ADD or CHANGE. Your job is to compare them against the existing order to produce the minimal set of changes:
- If an extracted item matches an existing order line (same item) but has a different quantity or variant → MODIFY
- If an extracted item is not in the existing order → ADD
- If an extracted item matches an existing order line with the same quantity and variant → NO CHANGE (skip it)

CRITICAL — PARTIAL vs FULL UPDATES:
Most change requests are PARTIAL — the customer only mentions the items they want to add or modify. Items NOT mentioned in the extracted list should be LEFT ALONE (no change, no removal).

⚠️ ABSOLUTE RULE — NEVER REMOVE UNMENTIONED ITEMS ⚠️
You MUST NOT generate a "remove" change for any existing order item that is not explicitly mentioned for removal in the raw message. If an item is in the existing order but NOT in the extracted items list, that means the customer didn't mention it — it should stay unchanged.

Only generate a "remove" change if the raw message contains an EXPLICIT removal verb ("remove", "cancel", "delete", "take off", "drop", "no more", "skip") followed by a specific item name. Examples:
- "remove the basil" → remove basil ✓
- "cancel the lemon balm" → remove lemon balm ✓
- "1 wasabi 1 radish mix" (mentions only new items, says nothing about existing items) → ADD wasabi and radish mix. DO NOT remove any existing items. ✓
- "just need wasabi and radish" (no removal verb) → ADD or MODIFY only the mentioned items. DO NOT remove others. ✓

If you are unsure whether the customer wants to remove an item, DO NOT remove it. Err on the side of keeping existing items.

Do NOT re-interpret the raw message to override the extracted items. The extracted items are the source of truth for what the customer wants to add or change.

VARIANT PRESERVATION:
When the extracted items specify a variant (e.g., variantCode "L"), keep that variant. When the extracted items do NOT specify a variant, preserve the existing order line's variant. Do NOT change variants unless the extracted items explicitly specify a different one.

For each change, you must:
- For MODIFY: Include the exact order_line_id from the existing order
- For ADD: Leave order_line_id as null, specify line_number for insertion
- For REMOVE: Include the order_line_id to be marked as deleted`
      },
      {
        role: 'user',
        content: `Compare this existing order with the change request:

CATALOG ITEMS (use these to match item_id and variant_code):
${JSON.stringify(catalogItemsList, null, 2)}

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
          quantity: l.quantity,
          variant_code: l.item_variants?.variant_code || null,
          variant_name: l.item_variants?.variant_name || null
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
      "item_id": "uuid-from-catalog",
      "item_name": "Product Name",
      "proposed_values": {
        "quantity": 1,
        "variant_code": "L"
      }
    }
  ],
  "reasoning": "brief explanation of what changed"
}

IMPORTANT RULES FOR MODIFICATIONS:
1. When customer requests ONLY a variant/size change (e.g., "change X to large", "switch X to T20"):
   - Keep the SAME quantity from the existing order line
   - Only change the variant code
   - Do NOT modify the quantity unless explicitly specified
2. When customer specifies a quantity AND variant, use both values
3. When customer specifies only a quantity change, keep the existing variant

OTHER RULES:
- For "modify": Match to the existing order line by product name and include its order_line_id. Use the quantity and variant from the EXTRACTED ITEMS.
- For "add": New items not in the original order, order_line_id should be null
- For "remove": ONLY generate a remove if the raw message EXPLICITLY asks to remove/cancel/delete a specific item by name. Do NOT remove items just because they are absent from the extracted items list — most messages are partial updates where unmentioned items should stay unchanged.
- proposed_values should contain quantity AND variant_code
- Match item_id from the CATALOG ITEMS list above
`
      }
    ],
    temperature: 0.3,
    max_completion_tokens: 16384,
    response_format: { type: "json_object" }
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: requestData.messages,
      temperature: requestData.temperature,
      max_completion_tokens: requestData.max_completion_tokens,
      response_format: requestData.response_format
    });

    const responseContent = completion.choices[0].message.content || '{}';
    console.info('[determineOrderChanges] AI response length:', responseContent.length);
    console.info('[determineOrderChanges] Finish reason:', completion.choices[0].finish_reason);

    const result = JSON.parse(responseContent);
    console.info('[determineOrderChanges] Parsed changes count:', result.proposedChanges?.length || 0);

    return result;
  } catch (error) {
    console.error('========== ERROR IN determineOrderChanges ==========');
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('====================================================');
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
  userId: string | null = null,
  existingOrders: ExistingOrderContext[] = []
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
      variants: (item.item_variants || []).map(v => ({
        code: v.variant_code,
        name: v.variant_name,
        notes: v.notes || null,
      }))
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
      content,
      existingOrders
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
