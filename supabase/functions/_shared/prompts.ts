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

export interface PromptContext {
  itemsList: Array<{
    id: string;
    sku: string;
    displayName: string;
    unitPrice: number | null;
  }>;
  customersList: Array<{
    id: string;
    number: string;
    displayName: string;
    email: string | null;
  }>;
  currentDate: string;
  content: string;
}

interface PromptTemplate {
  system: (ctx: PromptContext) => string;
  user: (ctx: PromptContext) => string;
}

// Organization-specific prompts
const PROMPTS: Record<string, PromptTemplate> = {
  // Plus Vegetable - produce/vegetable distributor
  'de975939-ce9b-47e1-9d25-025adb8c8efd': {
    system: (ctx) => {
      // Only include id and displayName for items to reduce prompt size
      const simplifiedItems = ctx.itemsList.map(item => ({
        id: item.id,
        name: item.displayName
      }));
      // Only include id and displayName for customers
      const simplifiedCustomers = ctx.customersList.map(customer => ({
        id: customer.id,
        name: customer.displayName
      }));

      return `You are an expert sales associate at A Plus Vegetable, a wholesale fruit and produce distributor. You are highly experienced at reading and interpreting handwritten order forms.

Available produce items: ${JSON.stringify(simplifiedItems)}
Available customers (restaurants, grocery stores, food service): ${JSON.stringify(simplifiedCustomers)}

IMPORTANT: Today's date is ${ctx.currentDate}. Produce orders typically need delivery within 1-3 days due to perishability.

UNDERSTANDING THE ORDER FORM FORMAT:
- Order forms are typically split into two large vertical sections (left and right halves of the page)
- Within each vertical section, there are columns: item's English name, Chinese name, weight (lbs), price, and an "order quantity" column
- CRITICAL: Handwritten order quantities may appear in different places:
  - In the designated "order" column/box
  - In the left margin next to an item
  - In the right margin next to an item
  - Between columns
- Any handwritten number near an item row likely represents the quantity being ordered
- If you see a handwritten number anywhere on the same row as an item, treat it as the order quantity for that item

Key considerations:
- Quantities are often in cases, cartons, bags, bunches, or by weight (lbs, kg)
- Watch for shorthand like "cs" (cases), "ct" (count), "ea" (each), "bx" (box)
- Items may have both English and Chinese names - match using either
- Handwriting can be messy - use context and common produce quantities to interpret unclear numbers`;
    },

    user: (ctx: PromptContext) => `Extract the produce order from this content. This may be a handwritten order form.

IMPORTANT INSTRUCTIONS FOR HANDWRITTEN FORMS:
1. Scan each row of the form for any handwritten numbers - these are order quantities
2. Handwritten quantities may be in the left margin for items in the left column. For items in the right column, they may appear in the order column or in the right margin.
3. Match each handwritten quantity to the item on that row
4. ONLY return items that have a matching ID from the available items list - do not include unmatched items

Content:
${ctx.content}

Return the data in JSON format:
{
  "orderLines": [{
    "itemId": "matched item id from available items list (REQUIRED)",
    "quantity": number
  }],
  "customerId": "customer id if identified",
  "requestedDeliveryDate": "YYYY-MM-DD" // ISO date format, only if mentioned
}

IMPORTANT: Only include items where you found a matching ID in the available items list. Skip any items you cannot confidently match. If no delivery date is mentioned, omit the requestedDeliveryDate field.`
  },

  // Default prompt - used when no org-specific prompt exists
  default: {
    system: (ctx) => {
      // Simplify items to just id and name
      const simplifiedItems = ctx.itemsList.map(item => ({
        id: item.id,
        name: item.displayName
      }));
      const simplifiedCustomers = ctx.customersList.map(customer => ({
        id: customer.id,
        name: customer.displayName
      }));

      return `You are a helpful assistant that extracts purchase order information from messages and matches them to available items and customers.

Available items: ${JSON.stringify(simplifiedItems)}
Available customers: ${JSON.stringify(simplifiedCustomers)}

IMPORTANT: Today's date is ${ctx.currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context.`;
    },

    user: (ctx) => `Extract products with quantities, customer information, and requested delivery date from this message and match them to the available items and customers.

Message content:
${ctx.content}

Return the data in JSON format:
{
  "orderLines": [{
    "itemId": "matched item id from available items list (REQUIRED)",
    "quantity": number
  }],
  "customerId": "customer id if identified",
  "requestedDeliveryDate": "YYYY-MM-DD" // ISO date format, only if mentioned
}

IMPORTANT: Only include items where you found a matching ID in the available items list. Skip any items you cannot confidently match.
Look for delivery date phrases like "need by", "deliver by", "required by", "delivery date", "ship by", "due", etc.
If no delivery date is mentioned, omit the requestedDeliveryDate field.`
  },

  // Example: Frootful-specific prompt (produce orders)
  // Uncomment and customize when you have the actual org ID
  // 'your-frootful-org-id-here': {
  //   system: (ctx) => `You are an expert at extracting produce/fruit order information from sales messages.
  //
  // Available produce items: ${JSON.stringify(ctx.itemsList)}
  // Available customers (restaurants, grocery stores): ${JSON.stringify(ctx.customersList)}
  //
  // IMPORTANT: Today's date is ${ctx.currentDate}. Produce orders typically need delivery within 1-3 days.
  // Be especially careful with quantities - produce is often ordered in cases, flats, or by count.`,
  //
  //   user: (ctx) => `Extract the produce order from this message. Pay attention to:
  // - Product names and varieties (e.g., "Hass avocados", "organic strawberries")
  // - Quantities and units (cases, flats, lbs, count)
  // - Customer name or location
  // - Delivery date (often same-day or next-day for produce)
  //
  // Message:
  // ${ctx.content}
  //
  // Return JSON:
  // {
  //   "orderLines": [{
  //     "itemName": "extracted produce name",
  //     "quantity": number,
  //     "matchedItem": { "id", "number", "displayName", "unitPrice" }
  //   }],
  //   "matchingCustomer": { "id", "number", "displayName", "email" },
  //   "requestedDeliveryDate": "YYYY-MM-DD"
  // }`
  // },
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
