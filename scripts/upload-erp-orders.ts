/**
 * Script to upload ERP orders for Boston Microgreens
 * Run with: npx ts-node scripts/upload-erp-orders.ts
 * Or: npx tsx scripts/upload-erp-orders.ts
 */

import { createClient } from '@supabase/supabase-js';

// Supabase config - using service role key for admin access
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kdwpnmoayphvhxuqocbw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Run with: SUPABASE_SERVICE_ROLE_KEY=your_key npx tsx scripts/upload-erp-orders.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Boston Microgreens Organization ID (production - has customers)
const BOSTON_MICROGREENS_ORG_ID = 'e047b512-0012-4287-bb74-dc6d4f7e673f';

// Test Organization ID (has the microgreens items catalog)
const TEST_ORG_WITH_ITEMS = 'ac3dd72d-373d-4424-8085-55b3b1844459';

// Use the Boston Microgreens org for orders (we'll match items from test org if needed)
const ORGANIZATION_ID = BOSTON_MICROGREENS_ORG_ID;

// Delivery date from the order sheet
const DELIVERY_DATE = '2026-01-27';

// Size code mapping
const SIZE_MAP: Record<string, string> = {
  'S': 'SM',
  'L': 'LG',
  'T20': 'PLT'
};

// Product name to SKU prefix mapping
const PRODUCT_SKU_MAP: Record<string, string> = {
  'Basil, Genovese': 'BASIL-GENOVESE',
  'Pea, Tendril': 'PEA-AFILA',  // Tendril = Afila
  'Cilantro': 'CILANTRO',
  'Amaranth': 'AMARANTH',
  'Radish, Sango': 'RADISH-SANGO',
  'Shiso, Green': 'SHISO-GREEN',
  'Radish, Kaiware': 'RADISH-KAIWARE',
  'Shiso, Red': 'SHISO-RED',
  'Arugula': 'ARUGULA-ASTRO',
  'Nasturtium': 'NASTURTIUM',
  'Davio\'s MIX': 'RAINBOW-MIX',  // Assuming Davio's MIX is Rainbow Mix
  'Lemon Balm': 'LEMON-BALM',
  'Radish Mix': 'RADISH-MIX',
  'Mustard, Wasabi': 'MUSTARD-WASABI',
  'Basil, Thai': 'BASIL-THAI',
  'Celery': 'CELERY',
  'Mustard, Green Mizuna': 'MUSTARD-GREEN-MIZUNA',
  'Rainbow MIX': 'RAINBOW-MIX',
  'Nutrition MIX': 'NUTRITION-MIX',
  'Passion MIX': 'PASSION-MIX',
  'Sorrel, Red Veined': 'SORREL-RED-VEINED',
  'Beets, Bulls Blood': 'BEETS-BULLS-BLOOD',
  'Kale': 'KALE-RED-RUSSIAN',
  'Borage': 'BORAGE',
  'Tokyo Onion': 'TOKYO-ONION',
  'Sunflower': 'SUNFLOWER',
  'Cabbage': 'CABBAGE-RED-ACRE',
};

// Raw order data from the spreadsheet
const RAW_ORDERS = `Capo	Basil, Genovese	L	4
Hunters	Pea, Tendril	L	1
Fat Baby	Cilantro	L	2
Fat Baby	Amaranth	L	1
Loco	Cilantro	L	2
Loco	Radish, Sango	S	1
Petula's	Cilantro	L	1
Petula's	Basil, Genovese	L	1
Coquette	Basil, Genovese	L	2
Ocean Prime	Shiso, Green	L	2
Ocean Prime	Radish, Kaiware	L	4
Ocean Prime	Pea, Tendril	L	3
Nautilus	Shiso, Red	L	2
The Block	Arugula	S	2
The Block	Nasturtium	L	1
The Block	Cilantro	S	2
Woods Hill Pier 4	Cilantro	S	1
Woods Hill Pier 4	Shiso, Red	S	1
Woods Hill Pier 4	Arugula	L	1
Davio's Seaport	Davio's MIX	L	4
Serafina Seaport	Basil, Genovese	T20	1
Row 34	Lemon Balm	L	1
Row 34	Basil, Genovese	L	1
Row 34	Radish Mix	L	1
Row 34	Mustard, Wasabi	L	1
Trade	Lemon Balm	S	3
O Ya	Shiso, Red	S	1
O Ya	Basil, Thai	S	2
O Ya	Cilantro	S	1
O Ya	Celery	S	1
O Ya	Lemon Balm	S	1
Baleia	Cilantro	L	2
Baleia	Basil, Thai	S	2
Capri Italian Steakhouse	Basil, Genovese	L	2
Capri Italian Steakhouse	Lemon Balm	S	1
311	Mustard, Green Mizuna	S	3
Douzo	Cilantro	S	1
Douzo	Rainbow MIX	L	1
Douzo	Radish, Kaiware	L	3
Gigi	Basil, Genovese	S	3
SRV	Nasturtium	S	1
SRV	Lemon Balm	S	1
SRV	Beets, Bulls Blood	S	1
SRV	Sorrel, Red Veined	S	1
SRV	Pea, Tendril	L	1
Zuma	Rainbow MIX	L	3
Zuma	Shiso, Red	L	3
Glass House	Nutrition MIX	L	2
Catalyst	Lemon Balm	S	1
Catalyst	Shiso, Red	S	1
Catalyst	Basil, Genovese	L	1
Catalyst	Rainbow MIX	L	2
Nagomi	Passion MIX	L	1
Nagomi	Rainbow MIX	L	1
Loco Fenway	Cilantro	L	2
Loco Fenway	Radish, Sango	L	1
Deuxave	Basil, Genovese	L	1
Deuxave	Lemon Balm	S	1
Deuxave	Shiso, Red	S	1
Deuxave	Mustard, Wasabi	S	1
Deuxave	Kale	S	1
Deuxave	Radish Mix	L	1
Deuxave	Sorrel, Red Veined	S	1
Asta	Borage	T20	1
Asta	Pea, Tendril	T20	1
Asta	Pea, Tendril	T20	1
Asta	Nasturtium	T20	1
Uni	Shiso, Red	S	2
Uni	Cilantro	S	2
Typhoon	Radish, Kaiware	T20	1
Porto	Shiso, Red	T20	1
La Padrona	Basil, Genovese	T20	4
La Padrona	Shiso, Red	T20	3
La Padrona	Tokyo Onion	T20	3
The Banks Seafood	Cilantro	L	1
The Banks Seafood	Pea, Tendril	T20	1
The Banks Seafood	Sorrel, Red Veined	S	1
Davio's Arlington	Radish Mix	L	5
Cactus Club Cafe - Boston	Sunflower	L	3
1928	Shiso, Green	L	1
1928	Lemon Balm	S	1
1928	Cabbage	S	1
1928	Basil, Genovese	S	1
1928	Shiso, Red	S	1
1928	Cilantro	S	1
Ruka	Cilantro	S	5
Ruka	Basil, Thai	S	2
Ruka	Basil, Genovese	S	5
Ruka	Shiso, Red	S	2
Mariel	Basil, Genovese	L	4
Mariel	Sorrel, Red Veined	S	1
Mariel	Pea, Tendril	L	1
Mariel	Basil, Thai	L	3
The Oceanaire	Radish Mix	L	1
The Oceanaire	Mustard, Wasabi	S	1
Mamma Maria	Sorrel, Red Veined	S	3
Mamma Maria	Basil, Genovese	L	2
Mamma Maria	Radish, Sango	S	1
Mamma Maria	Lemon Balm	S	1`;

interface OrderLine {
  customer: string;
  product: string;
  size: string;
  quantity: number;
}

interface GroupedOrder {
  customer: string;
  customerId: string | null;
  lines: {
    product: string;
    size: string;
    quantity: number;
    itemId: string | null;
    sku: string | null;
    unitPrice: number | null;
  }[];
}

async function main() {
  console.log('Starting ERP order upload...\n');

  // 1. Load customers from database
  console.log('Loading customers...');
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name')
    .eq('organization_id', ORGANIZATION_ID);

  if (customersError) {
    console.error('Error loading customers:', customersError);
    process.exit(1);
  }
  console.log(`Loaded ${customers?.length || 0} customers\n`);

  // 2. Load items from database (try Boston Microgreens first, fall back to test org)
  console.log('Loading items...');
  let { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, sku, name, base_price')
    .eq('organization_id', ORGANIZATION_ID);

  // If no items in production org, try test org
  if (!items || items.length === 0) {
    console.log('No items in production org, trying test org...');
    const result = await supabase
      .from('items')
      .select('id, sku, name, base_price')
      .eq('organization_id', TEST_ORG_WITH_ITEMS);
    items = result.data;
    itemsError = result.error;
  }

  if (itemsError) {
    console.error('Error loading items:', itemsError);
    process.exit(1);
  }
  console.log(`Loaded ${items?.length || 0} items\n`);

  // Create lookup maps
  const customerMap = new Map<string, string>();
  customers?.forEach(c => customerMap.set(c.name.toLowerCase(), c.id));

  const itemMap = new Map<string, { id: string; sku: string; price: number }>();
  items?.forEach(i => itemMap.set(i.sku, { id: i.id, sku: i.sku, price: i.base_price }));

  // 3. Parse raw order data
  const orderLines: OrderLine[] = RAW_ORDERS
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split('\t');
      return {
        customer: parts[0].trim(),
        product: parts[1].trim(),
        size: parts[2].trim(),
        quantity: parseInt(parts[3].trim(), 10)
      };
    });

  console.log(`Parsed ${orderLines.length} order lines\n`);

  // 4. Group by customer
  const groupedOrders = new Map<string, GroupedOrder>();
  const unmatchedCustomers = new Set<string>();
  const unmatchedProducts = new Set<string>();

  for (const line of orderLines) {
    // Find customer
    const customerId = customerMap.get(line.customer.toLowerCase()) || null;
    if (!customerId) {
      unmatchedCustomers.add(line.customer);
    }

    // Find item SKU
    const skuPrefix = PRODUCT_SKU_MAP[line.product];
    const sizeCode = SIZE_MAP[line.size] || line.size;
    const fullSku = skuPrefix ? `${skuPrefix}-${sizeCode}` : null;
    const item = fullSku ? itemMap.get(fullSku) : null;

    if (!item && skuPrefix) {
      unmatchedProducts.add(`${line.product} (${line.size}) -> ${fullSku}`);
    } else if (!skuPrefix) {
      unmatchedProducts.add(`${line.product} (no SKU mapping)`);
    }

    // Group orders
    if (!groupedOrders.has(line.customer)) {
      groupedOrders.set(line.customer, {
        customer: line.customer,
        customerId,
        lines: []
      });
    }

    groupedOrders.get(line.customer)!.lines.push({
      product: line.product,
      size: line.size,
      quantity: line.quantity,
      itemId: item?.id || null,
      sku: item?.sku || fullSku,
      unitPrice: item?.price || null
    });
  }

  // 5. Report unmatched items
  if (unmatchedCustomers.size > 0) {
    console.log('⚠️  Unmatched customers (will create orders without customer_id):');
    unmatchedCustomers.forEach(c => console.log(`   - ${c}`));
    console.log();
  }

  if (unmatchedProducts.size > 0) {
    console.log('⚠️  Unmatched products (will create lines without item_id):');
    unmatchedProducts.forEach(p => console.log(`   - ${p}`));
    console.log();
  }

  // 6. Create orders
  console.log(`Creating ${groupedOrders.size} orders...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const [customerName, order] of groupedOrders) {
    try {
      // Calculate total
      const totalAmount = order.lines.reduce((sum, line) => {
        return sum + (line.unitPrice || 0) * line.quantity;
      }, 0);

      // Create order
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          organization_id: ORGANIZATION_ID,
          customer_id: order.customerId,
          customer_name: customerName,
          status: 'pending',
          source_channel: 'erp',
          delivery_date: DELIVERY_DATE,
          total_amount: totalAmount,
          currency: 'USD'
        })
        .select('id')
        .single();

      if (orderError) {
        console.error(`❌ Error creating order for ${customerName}:`, orderError.message);
        errorCount++;
        continue;
      }

      // Create order lines
      const orderLinesData = order.lines.map((line, index) => ({
        order_id: newOrder.id,
        line_number: index + 1,
        item_id: line.itemId,
        product_name: `${line.product} - ${line.size === 'S' ? 'Small' : line.size === 'L' ? 'Large' : 'Tray'}`,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        currency: 'USD',
        status: 'active'
      }));

      const { error: linesError } = await supabase
        .from('order_lines')
        .insert(orderLinesData);

      if (linesError) {
        console.error(`❌ Error creating lines for ${customerName}:`, linesError.message);
        errorCount++;
        continue;
      }

      console.log(`✅ ${customerName}: ${order.lines.length} lines, $${totalAmount.toFixed(2)}`);
      successCount++;

    } catch (err) {
      console.error(`❌ Unexpected error for ${customerName}:`, err);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Complete! ${successCount} orders created, ${errorCount} errors`);
}

main().catch(console.error);
