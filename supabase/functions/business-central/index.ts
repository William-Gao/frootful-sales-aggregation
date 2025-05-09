import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface PurchaseOrderLine {
  itemName: string;
  quantity: number;
  unitPrice: number;
}

interface PurchaseOrder {
  vendorEmail: string;
  orderLines: PurchaseOrderLine[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const { purchaseOrder } = await req.json() as { purchaseOrder: PurchaseOrder };
    
    // Business Central API endpoint
    const bcBaseUrl = Deno.env.get('BC_API_URL');
    const companyId = Deno.env.get('BC_COMPANY_ID');
    const apiVersion = 'v2.0';
    
    // Create purchase order in Business Central
    const response = await fetch(`${bcBaseUrl}/companies(${companyId})/purchaseOrders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('BC_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vendorId: await getVendorId(purchaseOrder.vendorEmail),
        purchaseOrderLines: purchaseOrder.orderLines.map(line => ({
          type: 'Item',
          no: await getItemNo(line.itemName),
          quantity: line.quantity,
          directUnitCost: line.unitPrice,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Business Central API error: ${response.statusText}`);
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({ 
        success: true, 
        purchaseOrderNo: result.number 
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  } catch (error) {
    console.error('Error creating purchase order:', error);
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

// Helper function to get vendor ID from email
async function getVendorId(email: string): Promise<string> {
  const bcBaseUrl = Deno.env.get('BC_API_URL');
  const companyId = Deno.env.get('BC_COMPANY_ID');
  
  const response = await fetch(
    `${bcBaseUrl}/companies(${companyId})/vendors?$filter=email eq '${email}'`,
    {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('BC_ACCESS_TOKEN')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Vendor not found');
  }

  const vendors = await response.json();
  return vendors.value[0]?.id || '';
}

// Helper function to get item number from name
async function getItemNo(itemName: string): Promise<string> {
  const bcBaseUrl = Deno.env.get('BC_API_URL');
  const companyId = Deno.env.get('BC_COMPANY_ID');
  
  const response = await fetch(
    `${bcBaseUrl}/companies(${companyId})/items?$filter=contains(description,'${itemName}')`,
    {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('BC_ACCESS_TOKEN')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Item not found');
  }

  const items = await response.json();
  return items.value[0]?.number || '';
}