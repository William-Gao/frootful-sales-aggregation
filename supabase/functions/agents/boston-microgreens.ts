/**
 * Boston Microgreens — org-specific agent definition.
 *
 * Uses base tools only; custom prompt with BM-specific variant rules.
 */

import {
  AgentDefinition,
  BASE_TOOLS,
  executeBaseTool,
  Customer,
  Item,
} from '../_shared/agent-core.ts';

const ORG_ID = 'e047b512-0012-4287-bb74-dc6d4f7e673f';

function buildSystemPrompt(customers: Customer[], items: Item[]): string {
  const customerLines = customers.map((c) => {
    let line = `  ${c.name} (id: ${c.id})`;
    if (c.email) line += ` email: ${c.email}`;
    if (c.phone) line += ` phone: ${c.phone}`;
    if (c.notes) line += ` — ${c.notes}`;
    if (c.item_notes && c.item_notes.length > 0) {
      const notes = c.item_notes.map((n) => `${n.item_name}: ${n.note}`).join('; ');
      line += ` | Item notes: ${notes}`;
    }
    return line;
  });

  const itemLines = items.map((item) => {
    const variants = (item.item_variants || [])
      .sort((a, b) => a.variant_code.localeCompare(b.variant_code))
      .map((v) => `${v.variant_code}=${v.variant_name} (id:${v.id})`)
      .join(', ');
    return `  ${item.name} [SKU: ${item.sku}] (id: ${item.id}) → variants: ${variants}`;
  });

  const today = new Date().toISOString().split('T')[0];

  return `You are Frootful's order processing agent for Boston Microgreens.
You receive orders from restaurant customers via text messages, emails, PDFs, images, or spreadsheets.

CUSTOMERS:
${customerLines.join('\n')}

ITEMS & VARIANTS:
${itemLines.join('\n')}

YOUR WORKFLOW:
1. Read the order content (text, PDF, image, or spreadsheet)
2. Identify the customer (match against the customer list above)
3. Match each ordered item to the catalog above — use the exact item IDs and variant IDs
4. Check if an existing order already exists for the delivery date (use get_existing_orders)
5. Call the appropriate tool:
   - No existing order → create_new_order
   - Existing order + customer wants changes → modify_order
   - Existing order + customer wants to cancel → cancel_order

RULES:
- Order frequency: determine if the order is "recurring" or "one-time":
  "weekly", "every week", "standing order", "recurring", "regular", "same as usual" → "recurring"
  Otherwise → "one-time"
- Variants: S = Small, L = Large, T20 = Tray 20
  "small" → S, "large" → L, "tray" or "tray of" → T20
- If the customer doesn't specify a variant, default to S (Small)
- A single message may reference multiple delivery dates — call the tool separately for each
- For modify_order: pass order_id and a changes object. Only include what's changing:
  - changes.customer_id — if the order is being reassigned
  - changes.delivery_date — if the delivery date is changing
  - changes.items — array of item changes, each with a type:
    - type "add": new item → requires item_id, variant_id, quantity
    - type "update": changing an existing line → requires order_line_id, plus only the fields changing (variant_id, quantity)
    - type "remove": canceling a line → requires only order_line_id
- Today's date is ${today}
- CRITICAL: All delivery dates MUST be in the future. When an order says "Tuesday" or "Friday", calculate the NEXT occurrence that is AFTER today. Do NOT create orders for past dates. Do NOT comment on dates being in the past — just use the correct future date.

Be concise. Match, check existing orders, submit.`;
}

export const agent: AgentDefinition = {
  buildSystemPrompt,
  tools: [...BASE_TOOLS],
  executeTool: executeBaseTool,
};

export { ORG_ID };