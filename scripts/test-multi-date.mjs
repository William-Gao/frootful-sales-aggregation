/**
 * Test script for multi-delivery-date order splitting
 *
 * Usage: node scripts/test-multi-date.mjs
 *
 * Requires STAGING env: run `npm run env:staging` first, or set vars manually.
 */

import { createClient } from '@supabase/supabase-js';

const STAGING_URL = 'https://laxhubapvubwwoafrewk.supabase.co';
const STAGING_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxheGh1YmFwdnVid3dvYWZyZXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTM1OTEsImV4cCI6MjA4NjY4OTU5MX0.OuVzgcvR0-8lMZI770Wh5KezU745O7Y32nwPLsZAxMU';
const STAGING_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxheGh1YmFwdnVid3dvYWZyZXdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzU5MSwiZXhwIjoyMDg2Njg5NTkxfQ.ZJDH8v5W_aNyAAC_RIgQ92zrcEO06Sk9KkJm0yL7hfA';

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';

const supabase = createClient(STAGING_URL, STAGING_SERVICE_KEY);

async function main() {
  console.log('=== Multi-Date Order Splitting Test ===\n');

  // Step 1: Verify demo org has items
  const { data: items, error: itemsErr } = await supabase
    .from('items')
    .select('id, name')
    .eq('organization_id', DEMO_ORG_ID)
    .eq('active', true)
    .limit(10);

  if (itemsErr) {
    console.error('Failed to fetch items:', itemsErr.message);
    console.log('\nMake sure migrations were applied: supabase db push');
    process.exit(1);
  }

  console.log(`Found ${items.length} items in demo org:`);
  items.forEach(i => console.log(`  - ${i.name} (${i.id})`));

  if (items.length === 0) {
    console.error('\nNo items found. Migrations may not have run correctly.');
    process.exit(1);
  }

  // Step 2: Insert a test intake event with multi-date message
  const testMessage = `Hi, I'd like to place an order:

For delivery on 2026-02-17 (Tuesday):
- 3 Pea Shoots Microgreens
- 2 Sunflower Microgreens

For delivery on 2026-02-19 (Thursday):
- 5 Radish Microgreens
- 4 Basil Microgreens
- 1 Wheatgrass`;

  console.log('\n--- Inserting test intake event ---');
  console.log('Message:', testMessage.substring(0, 100) + '...');

  const { data: intakeEvent, error: intakeErr } = await supabase
    .from('intake_events')
    .insert({
      channel: 'sms',
      provider: 'twilio',
      provider_message_id: `test-multi-date-${Date.now()}`,
      raw_content: {
        body: testMessage,
        from: '+1-617-555-9999'
      },
      organization_id: DEMO_ORG_ID
    })
    .select()
    .single();

  if (intakeErr) {
    console.error('Failed to insert intake event:', intakeErr.message);
    process.exit(1);
  }

  console.log(`Created intake event: ${intakeEvent.id}`);

  // Step 3: Call process-intake-event function
  console.log('\n--- Calling process-intake-event ---');

  try {
    const response = await fetch(`${STAGING_URL}/functions/v1/process-intake-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intakeEventId: intakeEvent.id
      })
    });

    const result = await response.json();

    console.log(`\nResponse status: ${response.status}`);
    console.log('Result:', JSON.stringify(result, null, 2));

    // Step 4: Verify proposals were created
    if (result.success && result.data?.proposals) {
      const proposals = result.data.proposals;
      console.log(`\n=== RESULTS ===`);
      console.log(`Proposals created: ${proposals.length}`);

      for (const p of proposals) {
        console.log(`\n  Proposal ${p.proposal_id}:`);
        console.log(`    Delivery date: ${p.delivery_date}`);
        console.log(`    Order ID: ${p.order_id || 'NEW ORDER'}`);
        console.log(`    New order: ${p.is_new_order_proposal || false}`);
      }

      // Fetch full proposal details
      console.log('\n--- Fetching proposal details ---');
      for (const p of proposals) {
        if (!p.proposal_id) continue;

        const { data: lines } = await supabase
          .from('order_change_proposal_lines')
          .select('item_name, proposed_values')
          .eq('proposal_id', p.proposal_id);

        console.log(`\n  Proposal ${p.proposal_id} (${p.delivery_date}):`);
        (lines || []).forEach(l => {
          console.log(`    - ${l.item_name} x${l.proposed_values?.quantity} (delivery: ${l.proposed_values?.delivery_date})`);
        });
      }

      if (proposals.length >= 2) {
        console.log('\n✅ SUCCESS: Multiple proposals created from single message!');
      } else if (proposals.length === 1) {
        console.log('\n⚠️  Only 1 proposal created. The AI may not have split by date.');
        console.log('    Check the logs in Supabase dashboard for grouping details.');
      }
    } else {
      console.log('\n❌ Unexpected result format');
    }

  } catch (err) {
    console.error('Error calling function:', err.message);
  }
}

main().catch(console.error);