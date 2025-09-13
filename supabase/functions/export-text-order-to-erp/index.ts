import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface OrderItem {
  itemName: string;
  quantity: number;
  price?: number;
}

interface OrderData {
  customerNumber: string;
  items: OrderItem[];
  requestedDeliveryDate?: string;
}

interface TokenData {
  id: string;
  user_id: string;
  provider: string;
  encrypted_access_token: string;
  encrypted_refresh_token?: string;
  token_expires_at?: string;
  tenant_id?: string;
  company_id?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
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
    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    let userId: string;

    // Verify token and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (user && !error) {
      userId = user.id;
    } else {
      throw new Error('Invalid Supabase token');
    }

    const { textOrderId, orderData }: { textOrderId: string; orderData: OrderData } = await req.json();

    if (!textOrderId || !orderData || !orderData.customerNumber || !orderData.items || orderData.items.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request. Text order ID, customer number and items are required.' 
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Exporting text order to ERP:', textOrderId);
    console.log('Order data:', {
      customer: orderData.customerNumber,
      items: orderData.items.length,
      deliveryDate: orderData.requestedDeliveryDate
    });

    // Verify the text order belongs to the user
    const { data: textOrder, error: fetchError } = await supabase
      .from('text_orders')
      .select('*')
      .eq('id', textOrderId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !textOrder) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text order not found or access denied.' 
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get valid Business Central token
    const bcToken = await getValidBusinessCentralToken(userId);
    if (!bcToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Business Central not connected or token expired. Please reconnect to Business Central.' 
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get company info
    const { companyId, companyName, tenantId } = await getCompanyInfo(userId);
    if (!companyId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Company not selected. Please select a company in Business Central settings.' 
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    console.log('Using company:', companyName, 'with ID:', companyId);

    // Step 1: Create Sales Order
    console.log('Creating sales order in Business Central...');
    
    const orderPayload: any = {
      orderDate: new Date().toISOString().split('T')[0],
      customerNumber: orderData.customerNumber,
      currencyCode: "USD"
    };

    // Add requested delivery date if provided
    if (orderData.requestedDeliveryDate) {
      orderPayload.requestedDeliveryDate = orderData.requestedDeliveryDate;
      console.log('Setting requested delivery date to:', orderData.requestedDeliveryDate);
    }

    const orderResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesOrders/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bcToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Failed to create order:', orderResponse.status, errorText);
      throw new Error(`Failed to create order: ${orderResponse.status} ${orderResponse.statusText}`);
    }

    const order = await orderResponse.json();
    const orderId = order.id;
    const orderNumber = order.number;
    
    console.log('Created order:', orderNumber, 'with ID:', orderId);

    // Step 2: Add Items to Order
    console.log('Adding', orderData.items.length, 'items to order...');
    const addedItems = [];
    
    for (const item of orderData.items) {
      try {
        const lineData: any = {
          lineObjectNumber: item.itemName,
          lineType: 'Item',
          quantity: item.quantity
        };

        if (item.price !== undefined && item.price > 0) {
          lineData.unitPrice = item.price;
          console.log(`Adding item ${item.itemName} with custom price: ${item.price}`);
        } else {
          console.log(`Adding item ${item.itemName} with default Business Central pricing`);
        }

        const lineResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesOrders(${orderId})/salesOrderLines`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${bcToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(lineData)
        });

        if (!lineResponse.ok) {
          const errorText = await lineResponse.text();
          console.error(`Failed to add item ${item.itemName}:`, lineResponse.status, errorText);
          throw new Error(`Failed to add item ${item.itemName}: ${lineResponse.status} ${lineResponse.statusText}`);
        }

        const addedItem = await lineResponse.json();
        addedItems.push({
          itemName: item.itemName,
          quantity: item.quantity,
          price: item.price || addedItem.unitPrice,
          lineId: addedItem.id
        });
        
        console.log(`Added item: ${item.itemName} (qty: ${item.quantity}, price: ${item.price || addedItem.unitPrice})`);
      } catch (itemError) {
        console.error(`Error adding item ${item.itemName}:`, itemError);
      }
    }

    // Step 3: Update text order with ERP information
    console.log('Updating text order with ERP information...');
    const { error: updateError } = await supabase
      .from('text_orders')
      .update({
        status: 'exported',
        erp_order_id: orderId,
        erp_order_number: orderNumber,
        exported_at: new Date().toISOString()
      })
      .eq('id', textOrderId);

    if (updateError) {
      console.warn('Failed to update text order status:', updateError);
      // Continue anyway - the ERP order was created successfully
    }

    // Generate deep link to the order
    const deepLink = `https://businesscentral.dynamics.com/${tenantId}/Production/?company=${encodeURIComponent(companyName)}&page=42&filter='Sales Header'.'No.' IS '${orderNumber}'`;

    console.log('Text order export completed successfully!');

    const successMessage = orderData.requestedDeliveryDate 
      ? `Successfully created order #${orderNumber} from text message with ${addedItems.length} items and delivery date ${orderData.requestedDeliveryDate}`
      : `Successfully created order #${orderNumber} from text message with ${addedItems.length} items`;

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: orderNumber,
        orderId: orderId,
        deepLink: deepLink,
        addedItems: addedItems,
        requestedDeliveryDate: orderData.requestedDeliveryDate,
        message: successMessage,
        textOrderId: textOrderId
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error exporting text order to ERP:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while exporting text order'
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

// Helper functions (reused from export-order-to-erp)
async function getValidBusinessCentralToken(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data) {
      return null;
    }

    const decryptedToken = await decrypt(data.encrypted_access_token);
    return decryptedToken;
  } catch (error) {
    console.error('Error getting Business Central token:', error);
    return null;
  }
}

async function getCompanyInfo(userId: string): Promise<{ companyId: string | null; companyName: string | null; tenantId: string | null }> {
  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('company_id, company_name, tenant_id')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data) {
      return { companyId: null, companyName: null, tenantId: null };
    }

    return {
      companyId: data.company_id,
      companyName: data.company_name,
      tenantId: data.tenant_id
    };
  } catch (error) {
    console.error('Error getting company info:', error);
    return { companyId: null, companyName: null, tenantId: null };
  }
}

async function decrypt(encryptedText: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = new Uint8Array(
    atob(encryptedText).split('').map(char => char.charCodeAt(0))
  );
  
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}