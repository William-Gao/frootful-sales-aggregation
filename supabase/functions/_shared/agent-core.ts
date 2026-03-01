/**
 * Shared agent core — types, base tools, agent loop, and DB helpers.
 *
 * Org-specific agents import from here and extend with custom prompts/tools.
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.39.7';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createLogger } from './logger.ts';

// ─── Clients (shared singleton) ──────────────────────────────────────────────

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);
export const claude = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  item_notes?: CustomerItemNote[];
}

export interface CustomerItemNote {
  id: string;
  item_name: string;
  note: string;
}

export interface ItemVariant {
  id: string;
  variant_code: string;
  variant_name: string;
  notes?: string;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string;
  item_variants?: ItemVariant[];
}

export type ProposalType = 'new_order' | 'change_order' | 'cancel_order';

export interface AgentContext {
  organizationId: string;
  intakeEventId: string | null;
}

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext,
  logger: ReturnType<typeof createLogger>,
) => Promise<unknown>;

/**
 * An org-specific agent definition. Each org module exports one of these.
 */
export interface AgentDefinition {
  /** Build the system prompt given loaded catalog data */
  buildSystemPrompt: (customers: Customer[], items: Item[]) => string;

  /** Tools available to this agent (base + any custom) */
  tools: Anthropic.Tool[];

  /** Execute a tool call. Should handle base tools + any custom tools. */
  executeTool: ToolExecutor;

  /** Optional: model override (defaults to claude-sonnet-4-5-20250929) */
  model?: string;

  /** Optional: max agent turns (defaults to 50) */
  maxTurns?: number;
}

// ─── Catalog Loading ─────────────────────────────────────────────────────────

export const customersById: Record<string, Customer> = {};
export const itemsById: Record<string, Item> = {};
export const variantsById: Record<string, ItemVariant & { item_id: string; item_name: string }> = {};

export async function loadCatalogs(organizationId: string): Promise<{ customers: Customer[]; items: Item[] }> {
  // Reset maps
  for (const key of Object.keys(customersById)) delete customersById[key];
  for (const key of Object.keys(itemsById)) delete itemsById[key];
  for (const key of Object.keys(variantsById)) delete variantsById[key];

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, phone, notes, customer_item_notes(id, item_name, note)')
    .eq('active', true)
    .eq('organization_id', organizationId)
    .order('name');

  const { data: items } = await supabase
    .from('items')
    .select('id, sku, name, description, item_variants(id, variant_code, variant_name, notes)')
    .eq('active', true)
    .eq('organization_id', organizationId)
    .order('name');

  const processedCustomers: Customer[] = (customers || []).map((c: Record<string, unknown>) => ({
    ...c,
    item_notes: (c.customer_item_notes as CustomerItemNote[]) || [],
    customer_item_notes: undefined,
  })) as Customer[];

  for (const c of processedCustomers) {
    customersById[c.id] = c;
  }

  for (const item of (items || []) as Item[]) {
    itemsById[item.id] = item;
    for (const v of item.item_variants || []) {
      variantsById[v.id] = { ...v, item_id: item.id, item_name: item.name };
    }
  }

  return { customers: processedCustomers, items: (items || []) as Item[] };
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

export function resolveCustomer(customerId: string): string {
  return customersById[customerId]?.name || 'Unknown';
}

export function resolveItem(itemId: string, variantId: string): { itemName: string; variantCode: string } {
  const item = itemsById[itemId];
  const variant = variantsById[variantId];
  return {
    itemName: item?.name || 'Unknown',
    variantCode: variant?.variant_code || '?',
  };
}

export async function insertProposal(
  organizationId: string,
  proposalType: ProposalType,
  orderId: string | null,
  orderFrequency: string = 'one-time',
  intakeEventId: string | null = null,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('order_change_proposals')
    .insert({
      organization_id: organizationId,
      order_id: orderId,
      intake_event_id: intakeEventId,
      status: 'pending',
      type: proposalType,
      tags: { source: 'agent', agent_version: '0.6', order_frequency: orderFrequency },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert proposal: ${error.message}`);
  return data;
}

export async function insertProposalLine(params: {
  proposalId: string;
  lineNumber: number;
  itemId: string;
  itemName: string;
  variantId: string;
  variantCode: string;
  quantity: number;
  changeType: string;
  orderLineId: string | null;
  deliveryDate: string;
  customerId: string;
  customerName: string;
  organizationId: string;
}): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('order_change_proposal_lines')
    .insert({
      proposal_id: params.proposalId,
      line_number: params.lineNumber,
      item_id: params.itemId,
      item_name: params.itemName,
      item_variant_id: params.variantId,
      change_type: params.changeType,
      order_line_id: params.orderLineId,
      proposed_values: {
        quantity: params.quantity,
        variant_code: params.variantCode,
        delivery_date: params.deliveryDate,
        customer_id: params.customerId,
        customer_name: params.customerName,
        organization_id: params.organizationId,
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert proposal line: ${error.message}`);
  return data;
}

// ─── Base Tool Definitions ───────────────────────────────────────────────────

const NEW_ORDER_ITEM_SCHEMA = {
  type: 'object' as const,
  properties: {
    item_id: { type: 'string' },
    variant_id: { type: 'string' },
    quantity: { type: 'number' },
  },
  required: ['item_id', 'variant_id', 'quantity'],
};

const MODIFY_ITEM_CHANGE_SCHEMA = {
  type: 'object' as const,
  description:
    "A single item change. The 'type' field determines which other fields are expected:\n" +
    '- add: requires item_id, variant_id, quantity\n' +
    '- update: requires order_line_id, plus any fields being changed (variant_id, quantity)\n' +
    '- remove: requires order_line_id only',
  properties: {
    type: { type: 'string', enum: ['add', 'update', 'remove'] },
    order_line_id: {
      type: 'string',
      description: 'Existing order_line ID from get_existing_orders. Required for update/remove.',
    },
    item_id: { type: 'string', description: 'Item UUID. Required for add.' },
    variant_id: {
      type: 'string',
      description: 'Variant UUID. Required for add. Optional for update (only if variant is changing).',
    },
    quantity: {
      type: 'number',
      description: 'Required for add. Optional for update (only if quantity is changing).',
    },
  },
  required: ['type'],
};

export const BASE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_existing_orders',
    description:
      "Get a customer's upcoming orders (delivery_date >= today). Use this to " +
      'determine if the incoming order is NEW or a CHANGE to an existing order. ' +
      'Returns order ID, delivery date, status, and current line items.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'The customer UUID' },
        delivery_date: {
          type: 'string',
          description: 'Optional: filter to a specific date (YYYY-MM-DD)',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'create_new_order',
    description:
      'Create a proposal for a brand new order. Use this when NO existing order ' +
      'exists for this customer + delivery date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string' },
        delivery_date: { type: 'string', description: 'YYYY-MM-DD' },
        items: { type: 'array', items: NEW_ORDER_ITEM_SCHEMA },
        order_frequency: {
          type: 'string',
          enum: ['one-time', 'recurring'],
          description: 'Whether this is a one-time order or a recurring/standing order',
        },
      },
      required: ['customer_id', 'delivery_date', 'items', 'order_frequency'],
    },
  },
  {
    name: 'modify_order',
    description: 'Modify an existing order. Provide the order_id and a changes object describing what to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        order_id: { type: 'string', description: 'The existing order UUID' },
        changes: {
          type: 'object',
          description: "Fields to change. All are optional — only include what's changing.",
          properties: {
            customer_id: { type: 'string', description: 'New customer ID, if the order is being reassigned' },
            delivery_date: { type: 'string', description: 'New delivery date (YYYY-MM-DD), if the date is changing' },
            items: {
              type: 'array',
              items: MODIFY_ITEM_CHANGE_SCHEMA,
              description: 'Item-level changes (add/update/remove)',
            },
          },
        },
        order_frequency: {
          type: 'string',
          enum: ['one-time', 'recurring'],
          description: 'Whether this is a one-time change or a recurring/standing order change',
        },
      },
      required: ['order_id', 'changes', 'order_frequency'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an existing order entirely.',
    input_schema: {
      type: 'object' as const,
      properties: {
        order_id: { type: 'string', description: 'The existing order UUID' },
        customer_id: { type: 'string' },
        order_frequency: {
          type: 'string',
          enum: ['one-time', 'recurring'],
          description: 'Whether this cancels a one-time order or a recurring/standing order',
        },
      },
      required: ['order_id', 'customer_id', 'order_frequency'],
    },
  },
];

// ─── Base Tool Executor ──────────────────────────────────────────────────────

export async function executeBaseTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext,
  logger: ReturnType<typeof createLogger>,
): Promise<unknown> {
  if (name === 'get_existing_orders') {
    const today = new Date().toISOString().split('T')[0];
    logger.info(`[get_existing_orders] customer_id=${input.customer_id}, delivery_date=${input.delivery_date || 'any'}, org=${ctx.organizationId}`);

    let query = supabase
      .from('orders')
      .select('id, delivery_date, status, order_lines(id, line_number, item_id, quantity, status, item_variant_id, items(name, sku))')
      .eq('customer_id', input.customer_id as string)
      .eq('organization_id', ctx.organizationId)
      .neq('status', 'cancelled')
      .gte('delivery_date', today)
      .order('delivery_date')
      .limit(5);

    if (input.delivery_date) {
      query = query.eq('delivery_date', input.delivery_date as string);
    }

    const { data } = await query;
    logger.info(`[get_existing_orders] Found ${(data || []).length} orders`);
    return data || [];
  }

  if (name === 'create_new_order') {
    const customerId = input.customer_id as string;
    const customerName = resolveCustomer(customerId);
    const items = (input.items || []) as Array<{ item_id: string; variant_id: string; quantity: number }>;
    logger.info(`[create_new_order] customer=${customerName} (${customerId}), date=${input.delivery_date}, frequency=${input.order_frequency}, items=${items.length}`);

    const proposal = await insertProposal(
      ctx.organizationId,
      'new_order',
      null,
      (input.order_frequency as string) || 'one-time',
      ctx.intakeEventId,
    );
    const proposalId = proposal.id as string;

    for (let i = 0; i < items.length; i++) {
      const { itemName, variantCode } = resolveItem(items[i].item_id, items[i].variant_id);
      await insertProposalLine({
        proposalId,
        lineNumber: i + 1,
        itemId: items[i].item_id,
        itemName,
        variantId: items[i].variant_id,
        variantCode,
        quantity: items[i].quantity,
        changeType: 'add',
        orderLineId: null,
        deliveryDate: input.delivery_date as string,
        customerId,
        customerName,
        organizationId: ctx.organizationId,
      });
    }

    return { proposal_id: proposalId, type: 'new_order', lines_created: items.length, delivery_date: input.delivery_date, customer_name: customerName };
  }

  if (name === 'modify_order') {
    const orderId = input.order_id as string;
    const changes = (input.changes || {}) as Record<string, unknown>;
    logger.info(`[modify_order] order_id=${orderId}, frequency=${input.order_frequency}, changes=${JSON.stringify(changes).substring(0, 300)}`);

    const { data: existingOrder } = await supabase
      .from('orders')
      .select('customer_id, delivery_date')
      .eq('id', orderId)
      .single();

    if (!existingOrder) throw new Error(`Order ${orderId} not found`);

    const customerId = (changes.customer_id as string) || existingOrder.customer_id;
    const deliveryDate = (changes.delivery_date as string) || existingOrder.delivery_date;
    const customerName = resolveCustomer(customerId);

    const proposal = await insertProposal(
      ctx.organizationId,
      'change_order',
      orderId,
      (input.order_frequency as string) || 'one-time',
      ctx.intakeEventId,
    );
    const proposalId = proposal.id as string;

    const CHANGE_MAP: Record<string, string> = { add: 'add', update: 'modify', remove: 'remove' };
    const itemChanges = (changes.items || []) as Array<Record<string, unknown>>;

    for (let i = 0; i < itemChanges.length; i++) {
      const change = itemChanges[i];
      const changeTypeRaw = (change.type as string) || 'add';
      const changeType = CHANGE_MAP[changeTypeRaw] || 'add';
      const orderLineId = (change.order_line_id as string) || null;

      let itemId: string, variantId: string, quantity: number;

      if (changeTypeRaw === 'add') {
        itemId = change.item_id as string;
        variantId = change.variant_id as string;
        quantity = change.quantity as number;
      } else if (changeTypeRaw === 'update') {
        const { data: existingLine } = await supabase
          .from('order_lines')
          .select('item_id, item_variant_id, quantity')
          .eq('id', orderLineId!)
          .single();
        if (!existingLine) throw new Error(`Order line ${orderLineId} not found`);

        itemId = (change.item_id as string) || existingLine.item_id;
        variantId = (change.variant_id as string) || existingLine.item_variant_id;
        quantity = (change.quantity as number) ?? existingLine.quantity;
      } else if (changeTypeRaw === 'remove') {
        const { data: existingLine } = await supabase
          .from('order_lines')
          .select('item_id, item_variant_id, quantity')
          .eq('id', orderLineId!)
          .single();
        if (!existingLine) throw new Error(`Order line ${orderLineId} not found`);

        itemId = existingLine.item_id;
        variantId = existingLine.item_variant_id;
        quantity = existingLine.quantity;
      } else {
        continue;
      }

      const { itemName, variantCode } = resolveItem(itemId, variantId);
      await insertProposalLine({
        proposalId,
        lineNumber: i + 1,
        itemId,
        itemName,
        variantId,
        variantCode,
        quantity,
        changeType,
        orderLineId,
        deliveryDate,
        customerId,
        customerName,
        organizationId: ctx.organizationId,
      });
    }

    await supabase.from('orders').update({ status: 'pending_review' }).eq('id', orderId);
    await supabase.from('order_events').insert({
      order_id: orderId,
      type: 'change_proposed',
      metadata: { proposal_id: proposalId, source: 'agent' },
    });

    return { proposal_id: proposalId, type: 'change_order', lines_created: itemChanges.length, delivery_date: deliveryDate, customer_name: customerName };
  }

  if (name === 'cancel_order') {
    const orderId = input.order_id as string;
    const customerId = input.customer_id as string;
    const customerName = resolveCustomer(customerId);
    logger.info(`[cancel_order] order_id=${orderId}, customer=${customerName} (${customerId}), frequency=${input.order_frequency}`);

    const proposal = await insertProposal(
      ctx.organizationId,
      'cancel_order',
      orderId,
      (input.order_frequency as string) || 'one-time',
      ctx.intakeEventId,
    );
    const proposalId = proposal.id as string;

    await supabase.from('orders').update({ status: 'pending_review' }).eq('id', orderId);
    await supabase.from('order_events').insert({
      order_id: orderId,
      type: 'change_proposed',
      metadata: { proposal_id: proposalId, source: 'agent', intent: 'cancel_order' },
    });

    return { proposal_id: proposalId, type: 'cancel_order', customer_name: customerName };
  }

  return { error: `Unknown tool: ${name}` };
}

// ─── Agent Loop ──────────────────────────────────────────────────────────────

export async function runAgentLoop(
  agent: AgentDefinition,
  userContent: string | Anthropic.MessageParam['content'],
  ctx: AgentContext,
  logger: ReturnType<typeof createLogger>,
): Promise<{ success: boolean; turns: number; error?: string }> {
  const systemPrompt = agent.buildSystemPrompt(
    Object.values(customersById),
    Object.values(itemsById),
  );
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];
  const maxTurns = agent.maxTurns || 50;
  const model = agent.model || 'claude-sonnet-4-5-20250929';

  for (let turn = 1; turn <= maxTurns; turn++) {
    logger.info(`Agent turn ${turn}`);

    const response = await claude.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: agent.tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        logger.info('Agent text', { text: block.text.substring(0, 200) });
      }
    }

    if (response.stop_reason === 'end_turn') {
      logger.info('Agent finished', { turns: turn, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
      return { success: true, turns: turn };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        logger.info('Tool call', { tool: block.name, input: JSON.stringify(block.input).substring(0, 200) });

        let resultStr: string;
        try {
          const result = await agent.executeTool(block.name, block.input as Record<string, unknown>, ctx, logger);
          resultStr = JSON.stringify(result, null, 0);
          logger.info('Tool result', { tool: block.name, result: resultStr.substring(0, 200) });
        } catch (e) {
          resultStr = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
          logger.error('Tool error', e, { tool: block.name });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  logger.warn('Agent hit max turns');
  return { success: false, turns: maxTurns, error: 'max_turns_reached' };
}
