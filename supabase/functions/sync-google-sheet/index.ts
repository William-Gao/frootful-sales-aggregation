import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { JWT } from 'npm:google-auth-library@9';
import { google } from 'npm:googleapis@126';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const SPREADSHEET_ID = '1dM3kbJIpc9C_dfZaKFKdWeNt9rSBIVg7mOUEnZk7kJI';
const SHEET_NAME = 'Orders';
const DATE_COLUMN_INDEX = 3; // Column D (0-based) for Date Headers and Customer Names

// Service Account Credentials from Environment Variable
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');

interface Payload {
  proposal_id: string;
  order_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: Payload = await req.json();
    console.log(`Processing sync-google-sheet for proposal ${payload.proposal_id}`);

    if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch Proposal Details (to get changes and order info)
    const { data: proposal, error: proposalError } = await supabase
      .from('order_change_proposals')
      .select(`
        *,
        order_change_proposal_lines (
          change_type,
          item_name,
          proposed_values,
          items ( sku ),
          order_line_id
        )
      `)
      .eq('id', payload.proposal_id)
      .single();

    if (proposalError || !proposal) {
      throw new Error(`Proposal not found: ${proposalError?.message}`);
    }

    // Double check it's recurring
    if (proposal.tags?.order_frequency !== 'recurring') {
      console.log('Proposal is not recurring, skipping.');
      return new Response(JSON.stringify({ message: 'Skipped' }), { headers: corsHeaders });
    }

    // 2. Fetch Order Details (for delivery date and customer name)
    // Note: If the order was just cancelled (by this proposal), we still need its details.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', payload.order_id)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    // Initialize Google Sheets API
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 3. Read Sheet Data
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
    });

    const rows = readResponse.data.values || [];
    if (rows.length === 0) throw new Error('Sheet is empty');

    // 4. Find the Date Header Row
    // order.delivery_date is "YYYY-MM-DD"
    // We parse it manually to avoid timezone issues (e.g. 2025-08-15 -> Friday, August 15, 2025)
    // new Date('2025-08-15') is UTC, toLocaleDateString might be local or UTC depending on environment.
    // Let's force it to act as "local" 12:00 PM to avoid midnight rollover issues.

    const [y, m, d] = order.delivery_date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0); // Month is 0-indexed

    const sheetDateStr = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    console.log(`Looking for date header: "${sheetDateStr}"`);

    let dateRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][DATE_COLUMN_INDEX] && rows[i][DATE_COLUMN_INDEX].trim() === sheetDateStr) {
        dateRowIndex = i;
        break;
      }
    }

    if (dateRowIndex === -1) {
      console.error(`Date header "${sheetDateStr}" not found in sheet.`);
      return new Response(JSON.stringify({ error: `Date header "${sheetDateStr}" not found` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // 5. Define Block Range
    const dataStartRow = dateRowIndex + 2;
    let blockEndRow = rows.length;

    // Find block end (One-time Orders or next Date)
    for (let i = dataStartRow; i < rows.length; i++) {
      const cellD = rows[i][3];
      if (cellD && (cellD.toLowerCase().includes('one-time') || cellD.toLowerCase().includes('one time'))) {
        blockEndRow = i;
        break;
      }
      if (cellD && (cellD.includes('day, ') && cellD.match(/\d{4}/))) {
        blockEndRow = i;
        break;
      }
    }

    console.log(`Block range: ${dataStartRow + 1} to ${blockEndRow}`);

    // 6. Process Changes based on Proposal Lines
    // Since this is triggered AFTER acceptance, the order_lines DB is already updated.
    // BUT we should use the PROPOSAL lines to know what changed.

    // Check if whole order is cancelled (all lines removed or order status cancelled)
    const isOrderCancelled = order.status === 'cancelled';

    if (isOrderCancelled) {
      // Clear ALL rows for this customer
      console.log(`Order cancelled for ${order.customer_name}. Clearing all entries.`);
      for (let i = dataStartRow; i < blockEndRow; i++) {
        const row = rows[i];
        if (row[3] === order.customer_name) { // Col D is customer
           await clearSheetRow(sheets, i);
        }
      }
      return new Response(JSON.stringify({ success: true, action: 'cancelled' }), { headers: corsHeaders });
    }

    // Process individual lines
    for (const line of proposal.order_change_proposal_lines) {
      const customerName = order.customer_name;
      const productName = line.item_name;
      const changeType = line.change_type;

      // Values are in 'proposed_values' JSONB
      // Example: { quantity: 5, variant_code: 'L' }
      const newQty = line.proposed_values?.quantity;
      const newSize = line.proposed_values?.variant_code || 'L';

      // Find existing row
      let matchRowIndex = -1;
      let targetEmptyRowIndex = -1;

      for (let i = dataStartRow; i < blockEndRow; i++) {
        const row = rows[i] || [];
        const rowCustomer = row[3];
        const rowProduct = row[4];

        if (rowCustomer === customerName && rowProduct === productName) {
          matchRowIndex = i;
          break;
        }
        if (!rowCustomer && !rowProduct && targetEmptyRowIndex === -1) {
           targetEmptyRowIndex = i;
        }
      }

      if (changeType === 'add') {
        if (matchRowIndex !== -1) {
          console.log(`Add: Item exists at ${matchRowIndex + 1}, updating.`);
          await updateSheetCell(sheets, matchRowIndex, 5, newSize);
          await updateSheetCell(sheets, matchRowIndex, 6, newQty);
        } else if (targetEmptyRowIndex !== -1) {
          console.log(`Add: Inserting at ${targetEmptyRowIndex + 1}`);
          await updateSheetRow(sheets, targetEmptyRowIndex, [customerName, productName, newSize, newQty]);
          // Update local cache to prevent overwriting if multiple adds
          rows[targetEmptyRowIndex][3] = customerName;
          rows[targetEmptyRowIndex][4] = productName;
        } else {
          console.error('No empty rows to add item!');
        }
      } else if (changeType === 'modify') {
        if (matchRowIndex !== -1) {
          console.log(`Modify: Updating row ${matchRowIndex + 1}`);
          await updateSheetCell(sheets, matchRowIndex, 5, newSize);
          await updateSheetCell(sheets, matchRowIndex, 6, newQty);
        } else {
          console.warn(`Modify: Item not found for ${customerName} - ${productName}`);
          // Fallback to Add if missing?
          if (targetEmptyRowIndex !== -1) {
             console.log(`Modify fallback: Adding at ${targetEmptyRowIndex + 1}`);
             await updateSheetRow(sheets, targetEmptyRowIndex, [customerName, productName, newSize, newQty]);
             rows[targetEmptyRowIndex][3] = customerName;
             rows[targetEmptyRowIndex][4] = productName;
          }
        }
      } else if (changeType === 'remove') {
        if (matchRowIndex !== -1) {
          console.log(`Remove: Clearing row ${matchRowIndex + 1}`);
          await clearSheetRow(sheets, matchRowIndex);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Helper Functions
async function updateSheetRow(sheets: any, rowIndex: number, values: any[]) {
  const range = `${SHEET_NAME}!D${rowIndex + 1}:G${rowIndex + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] }
  });
}

async function updateSheetCell(sheets: any, rowIndex: number, colIndex: number, value: any) {
  const colLetter = String.fromCharCode(65 + colIndex);
  const range = `${SHEET_NAME}!${colLetter}${rowIndex + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] }
  });
}

async function clearSheetRow(sheets: any, rowIndex: number) {
  const range = `${SHEET_NAME}!D${rowIndex + 1}:G${rowIndex + 1}`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range
  });
}
