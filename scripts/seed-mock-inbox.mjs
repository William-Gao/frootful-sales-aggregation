/**
 * Seed mock inbox data for local testing
 *
 * Creates real orders, proposals, and proposal lines in Supabase
 * that match the MOCK_PROPOSALS in Dashboard.tsx so that
 * cancel/modify/create flows work end-to-end.
 *
 * Usage:
 *   node scripts/seed-mock-inbox.mjs              # seed data
 *   node scripts/seed-mock-inbox.mjs --cleanup     # remove seeded data
 *
 * All seeded records use a consistent prefix so cleanup is safe.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://laxhubapvubwwoafrewk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxheGh1YmFwdnVid3dvYWZyZXdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzU5MSwiZXhwIjoyMDg2Njg5NTkxfQ.ZJDH8v5W_aNyAAC_RIgQ92zrcEO06Sk9KkJm0yL7hfA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Tag all seeded records so cleanup can find them
const SEED_TAG = 'mock-inbox-seed';

// Helper: date strings relative to today
const today = new Date();
const d = (offset) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().split('T')[0];
};

const TOMORROW = d(1);
const DAY_AFTER = d(2);
const DAY_3 = d(3);
const DAY_4 = d(4);

// Compute next Tue, Wed, Fri from today
function nextDay(dayOfWeek) {
  const dt = new Date(today);
  const diff = (dayOfWeek - dt.getDay() + 7) % 7 || 7; // always forward
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().split('T')[0];
}
const TUE = nextDay(2);
const WED = nextDay(3);
const FRI = nextDay(5);

// ─── Organization lookup ────────────────────────────────────────────────────
// We need to find the org. Try Boston Microgreens first, fall back to test org.
async function resolveOrg() {
  const orgIds = [
    'e047b512-0012-4287-bb74-dc6d4f7e673f', // Boston Microgreens
    'ac3dd72d-373d-4424-8085-55b3b1844459', // test org
  ];
  for (const id of orgIds) {
    const { data } = await supabase.from('organizations').select('id, name').eq('id', id).single();
    if (data) return data;
  }
  // Last resort: pick any org
  const { data } = await supabase.from('organizations').select('id, name').limit(1).single();
  return data;
}

// ─── Lookup items by name for the org ───────────────────────────────────────
async function loadItems(orgId) {
  const { data } = await supabase
    .from('items')
    .select('id, name, item_variants(id, variant_code)')
    .eq('organization_id', orgId)
    .eq('active', true);
  return data || [];
}

function findItem(items, name) {
  // Fuzzy match: case-insensitive, partial
  return items.find(i => i.name.toLowerCase().includes(name.toLowerCase()));
}

function findVariant(item, code) {
  if (!item?.item_variants) return null;
  return item.item_variants.find(v => v.variant_code === code) || null;
}

// ─── Lookup customers by name for the org ───────────────────────────────────
async function loadCustomers(orgId) {
  const { data } = await supabase
    .from('customers')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('active', true);
  return data || [];
}

function findCustomer(customers, name) {
  return customers.find(c => c.name.toLowerCase().includes(name.toLowerCase())) || null;
}

// ─── SEED ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('=== Seeding Mock Inbox Data ===\n');

  const org = await resolveOrg();
  if (!org) { console.error('No organization found!'); process.exit(1); }
  console.log(`Organization: ${org.name} (${org.id})`);

  const items = await loadItems(org.id);
  console.log(`Loaded ${items.length} items`);

  const customers = await loadCustomers(org.id);
  console.log(`Loaded ${customers.length} customers\n`);

  // ── Step 1: Create intake events (one per message group) ──────────────
  const intakeEventDefs = [
    { key: 'intake-1', channel: 'sms', from: '+16175551001', body: 'Hey Bennett can we remove the cilantro and sunflower for this Friday. Also change Anise to 2 larges and add 2 large shiso green' },
    { key: 'intake-2', channel: 'email', from: 'Marco <chef@mammamia.com>', subject: 'Modification', body: 'Hey Bennett, could we modify our order for Sorrel to just 1 instead of 3? Just for this Friday' },
    { key: 'intake-3', channel: 'sms', from: '+16175551003', body: 'Hey guys can we add on a 2oz micro cilantro and a micro shiso for fridays? This would be weekly' },
    { key: 'intake-5', channel: 'sms', from: '+16175551005', body: 'Hey Bennett, we need to cancel our order for this Friday. Kitchen closed for renovations. Sorry!' },
    { key: 'intake-8', channel: 'email', from: 'Marco <chef@mammamaria.com>', subject: 'Orders for this week', body: 'Tuesday: new order — 3 sm cilantro, 2 lg genovese, 1 sm borage.\nThursday: change arugula from 2→4, add 1 lg shiso.' },
    { key: 'intake-10', channel: 'sms', from: '+16175551010', body: 'Hey cancel our Tuesday order please, kitchen flood. But we still need Thursday: 3 lg basil, 2 sm sorrel, 1 lg cilantro.' },
    { key: 'intake-12', channel: 'email', from: 'Toro <chef@toro-restaurant.com>', subject: "This week's changes", body: "Cancel Monday order — we're closed.\nTuesday: modify arugula 2→5, remove sunflower.\nWednesday: new order — 4 lg cilantro, 2 sm pea shoots, 3 lg basil genovese." },
    { key: 'intake-14', channel: 'email', from: 'Sarma <chef@sarmarestaurant.com>', subject: 'Full week order changes', body: "Bennett, big week ahead:\n1) Mon new order: 5 sm cilantro, 3 lg sunflower, 2 sm pea shoots\n2) Tue: CANCEL\n3) Wed new order: 2 lg basil thai, 1 sm borage, 4 lg arugula\n4) Thu: change shiso from 1→3, add 2 lg sorrel to existing" },
    { key: 'intake-16', channel: 'sms', from: '+16175551016', body: 'Bennett sorry but we need to cancel both our Tuesday AND Thursday orders this week. Closing for staff retreat.' },

    // ── Multi-day Tue/Wed/Fri orders ──────────────────────────────────────
    // 1. Harvest — Tue + Wed + Fri (3-day new orders)
    { key: 'intake-20', channel: 'email', from: 'Harvest <chef@harvest.com>', subject: 'Week order',
      body: `Tuesday: 2 sm cilantro, 1 lg basil genovese, 3 sm arugula\nWednesday: 1 lg sunflower, 2 sm shiso green\nFriday: 4 lg cilantro, 1 sm borage, 2 lg pea tendril` },
    // 2. Pammy's — Tue + Fri (new orders)
    { key: 'intake-21', channel: 'sms', from: '+16175551021', body: 'Hey Bennett, new orders:\nTuesday — 3 lg basil thai, 2 sm radish mix\nFriday — 1 lg fennel bronze, 2 sm nasturtium, 1 lg sorrel' },
    // 3. SRV — Wed + Fri (new order Wed, modify existing Fri)
    { key: 'intake-22', channel: 'email', from: 'SRV <orders@srv-boston.com>', subject: 'Orders this week',
      body: 'Wednesday new order: 2 lg cilantro, 1 sm basil genovese, 3 sm chervil\nFriday: change sunflower from 2 to 4 and add 1 lg shiso red' },
    // 4. Row 34 — Tue only (new order, 5 items)
    { key: 'intake-23', channel: 'sms', from: '+16175551023', body: 'Tuesday order: 2 lg radish sango, 3 sm pea dwarf, 1 lg dill, 2 sm celery, 1 lg parsley' },
    // 5. Deuxave — Tue + Wed (modify Tue, new Wed)
    { key: 'intake-24', channel: 'email', from: 'Deuxave <chef@deuxave.com>', subject: 'Changes',
      body: 'Tuesday: change cilantro from 3 to 1, remove arugula\nWednesday: new order — 2 lg basil genovese, 1 sm borage, 3 lg sunflower' },
    // 6. Saltie Girl — Fri only (new order)
    { key: 'intake-25', channel: 'sms', from: '+16175551025', body: 'Friday order please: 2 sm shiso green, 1 lg nasturtium, 3 sm sorrel, 1 lg cilantro' },
    // 7. Krasi — Tue + Wed + Fri (cancel Tue, new Wed, modify Fri)
    { key: 'intake-26', channel: 'email', from: 'Krasi <info@krasi.com>', subject: 'This week',
      body: 'Tuesday: CANCEL please\nWednesday: new order — 1 lg amaranth, 2 sm lemon balm, 1 lg mustard wasabi\nFriday: change basil from 2 to 5, add 1 sm borage' },
    // 8. Chickadee — Wed + Fri (new orders both days)
    { key: 'intake-27', channel: 'sms', from: '+16175551027', body: 'Wed: 3 lg arugula, 2 sm radish mix, 1 lg chive\nFri: 2 lg basil thai, 1 sm fennel green, 3 sm pea dwarf' },
    // 9. Coquette — Tue + Fri (new Tue, cancel Fri)
    { key: 'intake-28', channel: 'email', from: 'Coquette <chef@coquette.com>', subject: 'Order update',
      body: 'Tuesday: new order — 2 lg cilantro, 1 sm sunflower, 3 lg basil genovese\nFriday: cancel our order please, closed for private event' },
    // 10. Little Donkey — Tue + Wed + Fri (all new orders)
    { key: 'intake-29', channel: 'sms', from: '+16175551029', body: 'Tue: 1 lg shiso red, 2 sm cilantro, 1 lg radish hong vit\nWed: 3 lg sunflower, 1 sm anise hyssop\nFri: 2 lg basil genovese, 2 sm pea tendril, 1 lg dill' },
    // 11. Porto — Fri only (modify existing)
    { key: 'intake-30', channel: 'sms', from: '+16175551030', body: 'Hey for Friday change our cilantro to 3 large and add 2 sm mustard ruby streak' },
    // 12. Nautilus — Wed only (new order)
    { key: 'intake-31', channel: 'email', from: 'Nautilus <chef@nautilus.com>', subject: 'Wednesday order',
      body: 'New order for Wednesday: 2 lg shiso green, 1 sm amaranth, 3 lg radish kaiware, 2 sm celery' },
    // 13. Ruka — Tue + Fri (modify Tue, new Fri)
    { key: 'intake-32', channel: 'sms', from: '+16175551032', body: 'Tuesday: change shiso from 1 to 3, remove the sunflower\nFriday: new order — 2 lg pac choi, 1 sm shungiku, 3 lg radish kaiware' },
    // 14. Davio\'s Seaport — Tue + Wed (new orders)
    { key: 'intake-33', channel: 'email', from: "Davio's <orders@davios.com>", subject: 'Two day order',
      body: 'Tuesday: 4 lg basil genovese, 2 sm arugula, 1 lg cilantro\nWednesday: 2 lg sunflower, 3 sm nasturtium, 1 lg sorrel' },
    // 15. Woods Hill Pier 4 — Tue + Wed + Fri (modify Tue, cancel Wed, new Fri)
    { key: 'intake-35', channel: 'email', from: 'Woods Hill <chef@woodshill.com>', subject: 'Weekly changes',
      body: 'Tuesday: change arugula to 4 and add 2 sm borage\nWednesday: cancel our order\nFriday: new order — 3 lg cilantro, 1 sm lemon balm, 2 lg basil thai, 1 sm chervil' },
  ];

  const intakeEvents = {};
  for (const ie of intakeEventDefs) {
    const raw_content = ie.channel === 'sms'
      ? { body: ie.body, from: ie.from }
      : { body_text: ie.body, from: ie.from, subject: ie.subject };

    const { data, error } = await supabase
      .from('intake_events')
      .insert({
        channel: ie.channel,
        provider: ie.channel === 'sms' ? 'twilio' : 'gmail',
        provider_message_id: `${SEED_TAG}-${ie.key}-${Date.now()}`,
        raw_content,
        organization_id: org.id,
      })
      .select('id')
      .single();

    if (error) { console.error(`Failed to create intake event ${ie.key}:`, error.message); continue; }
    intakeEvents[ie.key] = data.id;
    console.log(`  Created intake event: ${ie.key} → ${data.id}`);
  }

  // ── Step 2: Create orders that proposals will reference ───────────────
  // These are the existing orders that modify/cancel proposals point to.

  const orderDefs = [
    {
      key: 'fri-bistro', customer: 'Bistro Du Midi', date: TOMORROW,
      lines: [
        { product: 'Cilantro', variant: 'L', qty: 1 },
        { product: 'Sunflower', variant: 'L', qty: 1 },
        { product: 'Basil, Genovese', variant: 'S', qty: 1 },
        { product: 'Nasturtium', variant: 'S', qty: 1 },
        { product: 'Anise Hyssop', variant: 'S', qty: 1 },
      ]
    },
    {
      key: 'fri-oceanaire', customer: 'The Oceanaire', date: TOMORROW,
      lines: [
        { product: 'Radish Mix', variant: 'L', qty: 1 },
        { product: 'Cilantro', variant: 'S', qty: 1 },
        { product: 'Sorrel, Red Veined', variant: 'S', qty: 3 },
      ]
    },
    {
      key: 'fri-capo', customer: 'Capo', date: TOMORROW,
      lines: [
        { product: 'Basil, Genovese', variant: 'L', qty: 4 },
        { product: 'Shiso, Green', variant: 'S', qty: 1 },
      ]
    },
  ];

  const orderIds = {};
  for (const od of orderDefs) {
    const cust = findCustomer(customers, od.customer);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        organization_id: org.id,
        customer_id: cust?.id || null,
        customer_name: od.customer,
        status: 'ready',
        delivery_date: od.date,
        source_channel: 'erp',
        customer_reference: SEED_TAG, // tag for cleanup
      })
      .select('id')
      .single();

    if (orderErr) { console.error(`Failed to create order ${od.key}:`, orderErr.message); continue; }
    orderIds[od.key] = order.id;
    console.log(`  Created order: ${od.key} → ${order.id} (${od.customer}, ${od.date})`);

    // Create order lines
    const orderLines = od.lines.map((line, idx) => {
      const item = findItem(items, line.product);
      const variant = item ? findVariant(item, line.variant) : null;
      return {
        order_id: order.id,
        line_number: idx + 1,
        item_id: item?.id || null,
        item_variant_id: variant?.id || null,
        product_name: line.product,
        quantity: line.qty,
        status: 'active',
      };
    });

    const { error: linesErr } = await supabase.from('order_lines').insert(orderLines);
    if (linesErr) console.error(`  Failed to create lines for ${od.key}:`, linesErr.message);
    else console.log(`    ${orderLines.length} order lines created`);
  }

  // ── Step 3: Create proposals ──────────────────────────────────────────
  // Each proposal maps to one from MOCK_PROPOSALS

  const proposalDefs = [
    // Singles
    { key: 'prop-1', intake: 'intake-1', order: 'fri-bistro', customer: 'Bistro Du Midi', date: TOMORROW, tags: { intent: 'change_order', order_frequency: 'one-time' },
      lines: [
        { type: 'remove', name: 'Cilantro', variant: 'L', qty: 1 },
        { type: 'remove', name: 'Sunflower', variant: 'L', qty: 1 },
        { type: 'modify', name: 'Anise Hyssop', variant: 'L', qty: 2 },
        { type: 'add', name: 'Shiso, Green', variant: 'L', qty: 2 },
      ]},
    { key: 'prop-2', intake: 'intake-2', order: 'fri-oceanaire', customer: 'The Oceanaire', date: TOMORROW, tags: { intent: 'change_order', order_frequency: 'one-time' },
      lines: [
        { type: 'modify', name: 'Sorrel, Red Veined', variant: 'S', qty: 1 },
      ]},
    { key: 'prop-3', intake: 'intake-3', order: null, customer: 'Uni', date: TOMORROW, tags: { intent: 'new_order', order_frequency: 'recurring' },
      lines: [
        { type: 'add', name: 'Cilantro', variant: 'S', qty: 1 },
        { type: 'add', name: 'Shiso, Green', variant: 'S', qty: 1 },
      ]},
    { key: 'prop-5', intake: 'intake-5', order: 'fri-capo', customer: 'Capo', date: TOMORROW, tags: { intent: 'cancel_order', order_frequency: 'one-time' },
      lines: [] },

    // Combos
    { key: 'prop-8a', intake: 'intake-8', order: null, customer: 'Mamma Maria', date: TOMORROW, tags: { intent: 'new_order', order_frequency: 'one-time' },
      lines: [
        { type: 'add', name: 'Cilantro', variant: 'S', qty: 3 },
        { type: 'add', name: 'Basil, Genovese', variant: 'L', qty: 2 },
        { type: 'add', name: 'Borage', variant: 'S', qty: 1 },
      ]},
    { key: 'prop-8b', intake: 'intake-8', order: 'fri-oceanaire', customer: 'Mamma Maria', date: DAY_AFTER, tags: { intent: 'change_order', order_frequency: 'one-time' },
      lines: [
        { type: 'modify', name: 'Arugula, Astro', variant: 'L', qty: 4 },
        { type: 'add', name: 'Shiso, Green', variant: 'L', qty: 1 },
      ]},

    // Cancel + Create
    { key: 'prop-10a', intake: 'intake-10', order: 'fri-bistro', customer: 'Neptune Oyster', date: TOMORROW, tags: { intent: 'cancel_order', order_frequency: 'one-time' },
      lines: [] },
    { key: 'prop-10b', intake: 'intake-10', order: null, customer: 'Neptune Oyster', date: DAY_AFTER, tags: { intent: 'new_order', order_frequency: 'one-time' },
      lines: [
        { type: 'add', name: 'Basil, Genovese', variant: 'L', qty: 3 },
        { type: 'add', name: 'Sorrel, Red Veined', variant: 'S', qty: 2 },
        { type: 'add', name: 'Cilantro', variant: 'L', qty: 1 },
      ]},

    // Cancel + Assign + Create (Toro)
    { key: 'prop-12a', intake: 'intake-12', order: 'fri-oceanaire', customer: 'Toro', date: TOMORROW, tags: { intent: 'cancel_order', order_frequency: 'one-time' },
      lines: [] },
    { key: 'prop-12b', intake: 'intake-12', order: 'fri-bistro', customer: 'Toro', date: DAY_AFTER, tags: { intent: 'change_order', order_frequency: 'one-time' },
      lines: [
        { type: 'modify', name: 'Arugula, Astro', variant: 'L', qty: 5 },
        { type: 'remove', name: 'Sunflower', variant: 'S', qty: 1 },
      ]},
    { key: 'prop-12c', intake: 'intake-12', order: null, customer: 'Toro', date: DAY_3, tags: { intent: 'new_order', order_frequency: 'one-time' },
      lines: [
        { type: 'add', name: 'Cilantro', variant: 'L', qty: 4 },
        { type: 'add', name: 'Pea Shoots', variant: 'S', qty: 2 },
        { type: 'add', name: 'Basil, Genovese', variant: 'L', qty: 3 },
      ]},

    // Sarma: Create + Cancel + Create + Assign
    { key: 'prop-14a', intake: 'intake-14', order: null, customer: 'Sarma', date: TOMORROW, tags: { intent: 'new_order', order_frequency: 'one-time' },
      lines: [
        { type: 'add', name: 'Cilantro', variant: 'S', qty: 5 },
        { type: 'add', name: 'Sunflower', variant: 'L', qty: 3 },
        { type: 'add', name: 'Pea Shoots', variant: 'S', qty: 2 },
      ]},
    { key: 'prop-14b', intake: 'intake-14', order: 'fri-capo', customer: 'Sarma', date: DAY_AFTER, tags: { intent: 'cancel_order', order_frequency: 'one-time' },
      lines: [] },
    { key: 'prop-14c', intake: 'intake-14', order: null, customer: 'Sarma', date: DAY_3, tags: { intent: 'new_order', order_frequency: 'one-time' },
      lines: [
        { type: 'add', name: 'Basil, Thai', variant: 'L', qty: 2 },
        { type: 'add', name: 'Borage', variant: 'S', qty: 1 },
        { type: 'add', name: 'Arugula, Astro', variant: 'L', qty: 4 },
      ]},
    { key: 'prop-14d', intake: 'intake-14', order: 'fri-oceanaire', customer: 'Sarma', date: DAY_4, tags: { intent: 'change_order', order_frequency: 'one-time' },
      lines: [
        { type: 'modify', name: 'Shiso, Green', variant: 'S', qty: 3 },
        { type: 'add', name: 'Sorrel, Red Veined', variant: 'L', qty: 2 },
      ]},

    // O Ya: Cancel + Cancel
    { key: 'prop-16a', intake: 'intake-16', order: 'fri-bistro', customer: 'O Ya', date: TOMORROW, tags: { intent: 'cancel_order', order_frequency: 'one-time' },
      lines: [] },
    { key: 'prop-16b', intake: 'intake-16', order: 'fri-capo', customer: 'O Ya', date: DAY_AFTER, tags: { intent: 'cancel_order', order_frequency: 'one-time' },
      lines: [] },
  ];

  let proposalCount = 0;
  let lineCount = 0;

  for (const pd of proposalDefs) {
    const intakeEventId = intakeEvents[pd.intake] || null;
    const orderId = pd.order ? (orderIds[pd.order] || null) : null;

    const { data: proposal, error: propErr } = await supabase
      .from('order_change_proposals')
      .insert({
        organization_id: org.id,
        order_id: orderId,
        intake_event_id: intakeEventId,
        status: 'pending',
        tags: { ...pd.tags, seed: SEED_TAG },
        notes: SEED_TAG,
      })
      .select('id')
      .single();

    if (propErr) { console.error(`Failed to create proposal ${pd.key}:`, propErr.message); continue; }
    proposalCount++;
    console.log(`  Created proposal: ${pd.key} → ${proposal.id} (${pd.customer}, ${pd.date})`);

    // Create proposal lines
    if (pd.lines.length > 0) {
      const proposalLines = pd.lines.map((line, idx) => {
        const item = findItem(items, line.name);
        const variant = item ? findVariant(item, line.variant) : null;
        return {
          proposal_id: proposal.id,
          line_number: idx + 1,
          change_type: line.type,
          item_id: item?.id || null,
          item_variant_id: variant?.id || null,
          item_name: item?.name || line.name,
          proposed_values: {
            quantity: line.qty,
            variant_code: line.variant,
            delivery_date: pd.date,
            customer_name: pd.customer,
          },
        };
      });

      const { error: plErr } = await supabase.from('order_change_proposal_lines').insert(proposalLines);
      if (plErr) console.error(`  Failed to create lines for ${pd.key}:`, plErr.message);
      else lineCount += proposalLines.length;
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`  Orders created: ${Object.keys(orderIds).length}`);
  console.log(`  Intake events: ${Object.keys(intakeEvents).length}`);
  console.log(`  Proposals: ${proposalCount}`);
  console.log(`  Proposal lines: ${lineCount}`);
  console.log(`\nSet USE_MOCK_INBOX = false in Dashboard.tsx to use real data.`);
  console.log(`Run with --cleanup to remove all seeded data.`);
}

// ─── CLEANUP ────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('=== Cleaning Up Mock Inbox Data ===\n');

  // 1. Delete proposal lines for seeded proposals
  const { data: proposals } = await supabase
    .from('order_change_proposals')
    .select('id')
    .eq('notes', SEED_TAG);

  if (proposals && proposals.length > 0) {
    const proposalIds = proposals.map(p => p.id);
    const { error: plErr } = await supabase
      .from('order_change_proposal_lines')
      .delete()
      .in('proposal_id', proposalIds);
    if (plErr) console.error('Error deleting proposal lines:', plErr.message);
    else console.log(`  Deleted proposal lines for ${proposalIds.length} proposals`);

    // 2. Delete proposals
    const { error: propErr } = await supabase
      .from('order_change_proposals')
      .delete()
      .eq('notes', SEED_TAG);
    if (propErr) console.error('Error deleting proposals:', propErr.message);
    else console.log(`  Deleted ${proposalIds.length} proposals`);
  } else {
    console.log('  No seeded proposals found');
  }

  // 3. Delete order lines for seeded orders
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_reference', SEED_TAG);

  if (orders && orders.length > 0) {
    const orderIds = orders.map(o => o.id);

    // Delete order_events that reference these orders
    const { error: evtErr } = await supabase
      .from('order_events')
      .delete()
      .in('order_id', orderIds);
    if (evtErr) console.error('Error deleting order events:', evtErr.message);
    else console.log(`  Deleted order events`);

    const { error: olErr } = await supabase
      .from('order_lines')
      .delete()
      .in('order_id', orderIds);
    if (olErr) console.error('Error deleting order lines:', olErr.message);
    else console.log(`  Deleted order lines for ${orderIds.length} orders`);

    // 4. Delete orders
    const { error: ordErr } = await supabase
      .from('orders')
      .delete()
      .eq('customer_reference', SEED_TAG);
    if (ordErr) console.error('Error deleting orders:', ordErr.message);
    else console.log(`  Deleted ${orderIds.length} orders`);
  } else {
    console.log('  No seeded orders found');
  }

  // 5. Delete intake events
  const { data: intakes, error: intakeQueryErr } = await supabase
    .from('intake_events')
    .select('id')
    .like('provider_message_id', `${SEED_TAG}%`);

  if (intakeQueryErr) {
    console.error('Error querying intake events:', intakeQueryErr.message);
  } else if (intakes && intakes.length > 0) {
    const { error: ieErr } = await supabase
      .from('intake_events')
      .delete()
      .like('provider_message_id', `${SEED_TAG}%`);
    if (ieErr) console.error('Error deleting intake events:', ieErr.message);
    else console.log(`  Deleted ${intakes.length} intake events`);
  } else {
    console.log('  No seeded intake events found');
  }

  // 6. Also clean up any orders created by accepting proposals (they won't have seed tag)
  // These are orders created via "Create Order" button during testing
  // We can't easily identify them, so just note it
  console.log('\n  Note: Orders created via "Create Order" button during testing');
  console.log('  are not automatically cleaned up. Delete them manually if needed.');

  console.log('\n=== Cleanup Complete ===');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

const isCleanup = process.argv.includes('--cleanup');

if (isCleanup) {
  cleanup().catch(console.error);
} else {
  seed().catch(console.error);
}
