/**
 * Organization-specific prompts for AI analysis
 *
 * Add custom prompts for specific organizations here.
 * Falls back to 'default' if organization ID not found.
 *
 * Usage:
 * ```typescript
 * import { getAnalysisPrompt } from '../_shared/prompts.ts';
 *
 * const { systemPrompt, userPrompt } = getAnalysisPrompt(organizationId, {
 *   itemsList,
 *   customersList,
 *   currentDate,
 *   content
 * });
 * ```
 */

export interface ExistingOrderContext {
  customerName: string;
  deliveryDate: string;
  lines: Array<{
    productName: string;
    quantity: number;
  }>;
}

export interface PromptContext {
  itemsList: Array<{
    id: string;
    sku: string;
    displayName: string;
    variants?: Array<{ code: string; name: string; notes?: string | null }>;
  }>;
  customersList: Array<{
    id: string;
    number: string;
    displayName: string;
    email: string | null;
  }>;
  currentDate: string;
  content: string;
  existingOrders?: ExistingOrderContext[];
}

interface PromptTemplate {
  system: (ctx: PromptContext) => string;
  user: (ctx: PromptContext) => string;
}

/**
 * Build a prompt section describing the customer's existing orders.
 * This helps the AI resolve vague references like "each", "same as usual", "these items".
 */
function buildExistingOrdersSection(ctx: PromptContext): string {
  if (!ctx.existingOrders || ctx.existingOrders.length === 0) return '';

  const ordersText = ctx.existingOrders.map(o => {
    const lines = o.lines.map(l => `  - ${l.productName} x${l.quantity}`).join('\n');
    return `${o.customerName} — ${o.deliveryDate}:\n${lines}`;
  }).join('\n\n');

  return `\n\nEXISTING ORDERS FOR THIS CUSTOMER:\nThe customer currently has these upcoming orders on file. Use this to resolve vague references like "each", "same as usual", "these items", "the usual", etc.\n${ordersText}`;
}

const PROMPTS: Record<string, PromptTemplate> = {
  default: {
    system: (ctx) => {
      const simplifiedItems = ctx.itemsList.map(item => ({
        id: item.id,
        name: item.displayName,
        ...(item.variants && item.variants.length > 0 ? { variants: item.variants } : {})
      }));
      const simplifiedCustomers = ctx.customersList.map(customer => ({
        id: customer.id,
        name: customer.displayName
      }));

      return `You are an expert sales associate that extracts purchase order information from messages and matches them to available items and customers.

Available items: ${JSON.stringify(simplifiedItems)}
Available customers: ${JSON.stringify(simplifiedCustomers)}

IMPORTANT: Today's date is ${ctx.currentDate}.

ITEM VARIANTS:
Products may have size/type variants. Each variant has:
- "code": the variant code (e.g., "S", "L", "T20")
- "name": the variant name (e.g., "Small Clamshell", "Large Clamshell")
- "notes": additional info like oz weight (e.g., "1.5oz", "3oz")

CRITICAL: Match oz weights to variants by looking at each item's variant "notes" field.
- If customer says "3oz", find the variant whose "notes" contains "3oz"
- Do NOT assume 3oz = Large or 1.5oz = Small
- The oz-to-variant mapping varies by item, so always check the "notes" field

For general size references (when oz not specified):
- "small", "S" → variant with code "S"
- "large", "L" → variant with code "L"
- "tray" → variant with code containing "T"

CUSTOMER AND DATE IDENTIFICATION:
The customer name and delivery dates are often stated explicitly in the message, but sometimes they are implicit. A single message can refer to multiple delivery dates.

DATE CALCULATION:
Today's date is ${ctx.currentDate}. When the message says "this Tuesday", "this Friday", "starting this week", etc., calculate the actual YYYY-MM-DD dates relative to today. For example, if today is a Monday and the message says "this Tuesday and Friday", compute the upcoming Tuesday and Friday dates. Always produce concrete dates — never leave requestedDeliveryDate empty when day-of-week references are present.

READING THE FULL MESSAGE:
The email subject line is part of the message. Products, customers, or context mentioned in the subject line (e.g., "Subject: Sorrel & pea tendril") are directly relevant. When the body says "these items", "these micro herbs", "the above", etc., it refers to items named in the subject line or earlier in the message.

UNITS:
- "pk", "pkg", "pack", "package" = 1 unit (e.g., "1pk" = quantity 1, "2pk" = quantity 2)
- If no size/variant is specified, omit variantCode

ORDER FREQUENCY:
- "weekly", "every week", "standing order", "recurring", "regular", "same as usual" → orderFrequency: "recurring"
- Otherwise → orderFrequency: "one-time"${buildExistingOrdersSection(ctx)}`;
    },

    user: (ctx) => `Extract the order from this message. Match products and customer to the available lists.

Message:
${ctx.content}

Return JSON:
{
  "orderLines": [{
    "itemId": "matched item id (REQUIRED)",
    "variantCode": "S, L, or T20 if size specified",
    "quantity": number,
    "requestedDeliveryDate": "YYYY-MM-DD (only if this line has a DIFFERENT delivery date from the top-level requestedDeliveryDate)"
  }],
  "customerId": "matched customer id",
  "requestedDeliveryDate": "YYYY-MM-DD (default delivery date for all items)",
  "orderFrequency": "one-time" or "recurring",
  "cancelDates": ["YYYY-MM-DD"] // dates where the customer wants to CANCEL their entire order (optional)
}

MULTIPLE DELIVERY DATES:
A single message can contain orders for multiple dates. If the message mentions different days or dates, use per-line requestedDeliveryDate to assign each item to the correct delivery date. Set the top-level requestedDeliveryDate to the first date. Items without a per-line date inherit the top-level date.

CANCELLATIONS FOR SPECIFIC DATES:
If the customer wants to CANCEL their order for a specific date (e.g., "cancel 2/20" or "Wednesday: cancel"), include that date in the "cancelDates" array. Do NOT create orderLines for cancelled dates.

IMPORTANT:
- Only include items with a matching ID from the available items list
- CRITICAL: When customer specifies oz weight, look at each item's variants and find the one whose "notes" field contains that oz weight. Do NOT assume oz weights map to specific sizes.
- Read the ENTIRE message including the subject line — products may be named there and referenced in the body as "these", "each", etc.
- "X of each" means X quantity of EACH item mentioned (in subject or body). Create a separate orderLine for each item.
- Look for day references like "this Tuesday" to determine delivery date. Use today's date (${ctx.currentDate}) to calculate the actual YYYY-MM-DD.
- If no delivery date mentioned, omit requestedDeliveryDate
- NEVER return an empty orderLines array if products are identifiable in the message`
  }
};

/**
 * Get the analysis prompt for a given organization
 */
export function getAnalysisPrompt(
  organizationId: string | null,
  context: PromptContext
): { systemPrompt: string; userPrompt: string; isCustomPrompt: boolean } {
  const hasCustomPrompt = organizationId !== null && organizationId in PROMPTS;
  const template = hasCustomPrompt ? PROMPTS[organizationId] : PROMPTS.default;

  if (hasCustomPrompt) {
    console.info(`[prompts] Using custom prompt for organization: ${organizationId}`);
  } else {
    console.info(`[prompts] Using default prompt (no custom prompt for org: ${organizationId || 'null'})`);
  }

  return {
    systemPrompt: template.system(context),
    userPrompt: template.user(context),
    isCustomPrompt: hasCustomPrompt
  };
}
