import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
  customerPricingGroup?: string;
  customerPricingGroupName?: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
  customerPrice?: number; // Price specific to customer's pricing group
}

interface CustomerPricingGroup {
  id: string;
  code: string;
  displayName: string;
}

interface SalesPrice {
  itemNumber: string;
  customerPricingGroup: string;
  unitPrice: number;
  minimumQuantity: number;
  startingDate?: string;
  endingDate?: string;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        userId = user.id;
      } else {
        throw new Error('Invalid Supabase token');
      }
    } catch (supabaseError) {
      // Fallback to Google token verification
      try {
        const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
        
        if (!tokenInfoResponse.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid token' }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          );
        }

        const tokenInfo = await tokenInfoResponse.json();
        userId = tokenInfo.sub;
      } catch (googleError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token verification failed' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        );
      }
    }

    const url = new URL(req.url);
    const dataType = url.searchParams.get('type'); // 'customers', 'items', or 'pricing-groups'
    const customerNumber = url.searchParams.get('customerNumber'); // For customer-specific pricing

    if (!dataType || !['customers', 'items', 'pricing-groups'].includes(dataType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid data type. Use "customers", "items", or "pricing-groups"' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get Business Central token from stored tokens
    const bcToken = await getBusinessCentralToken(userId);
    if (!bcToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Business Central token not found. Please connect to Business Central first.' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get company ID
    const companyId = await getCompanyId(userId);
    if (!companyId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Company ID not found. Please select a company first.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    let data;
    if (dataType === 'customers') {
      data = await fetchCustomersWithPricingGroups(bcToken, companyId);
    } else if (dataType === 'items') {
      if (customerNumber) {
        // Fetch items with customer-specific pricing
        data = await fetchItemsWithCustomerPricing(bcToken, companyId, customerNumber);
      } else {
        // Fetch items with standard pricing
        data = await fetchItems(bcToken, companyId);
      }
    } else if (dataType === 'pricing-groups') {
      data = await fetchCustomerPricingGroups(bcToken, companyId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: data
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error fetching Business Central data:', error);
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

async function getBusinessCentralToken(userId: string): Promise<string | null> {
  try {
    // Get Business Central token from user_tokens table
    const { data, error } = await supabase
      .from('user_tokens')
      .select('encrypted_access_token')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data?.encrypted_access_token) {
      console.error('No Business Central token found for user:', userId);
      return null;
    }

    // Decrypt the token
    const decryptedToken = await decrypt(data.encrypted_access_token);
    return decryptedToken;
  } catch (error) {
    console.error('Error getting Business Central token:', error);
    return null;
  }
}

async function getCompanyId(userId: string): Promise<string | null> {
  try {
    // Get company ID from user_tokens table
    const { data, error } = await supabase
      .from('user_tokens')
      .select('company_id')
      .eq('user_id', userId)
      .eq('provider', 'business_central')
      .single();

    if (error || !data?.company_id) {
      console.error('No company ID found for user:', userId);
      return null;
    }

    return data.company_id;
  } catch (error) {
    console.error('Error getting company ID:', error);
    return null;
  }
}

async function decrypt(encryptedText: string): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
  
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Decode from base64
  const combined = new Uint8Array(
    atob(encryptedText).split('').map(char => char.charCodeAt(0))
  );
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  // Import the decryption key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

async function fetchCustomersWithPricingGroups(token: string, companyId: string): Promise<Customer[]> {
  try {
    console.log('Fetching customers with pricing groups...');
    
    // Fetch customers with expanded customerPricingGroup
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers?$expand=customerPricingGroup`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch customers with pricing groups: ${response.status} ${response.statusText}`);
      // Fallback to basic customer fetch
      return await fetchCustomers(token, companyId);
    }

    const data = await response.json();
    const customers = data.value || [];
    
    console.log(`Fetched ${customers.length} customers with pricing group information`);
    
    return customers.map((customer: any) => ({
      id: customer.id,
      number: customer.number,
      displayName: customer.displayName,
      email: customer.email,
      customerPricingGroup: customer.customerPricingGroup?.code || customer.customerPricingGroupCode,
      customerPricingGroupName: customer.customerPricingGroup?.displayName || customer.customerPricingGroupCode
    }));
  } catch (error) {
    console.error('Error fetching customers with pricing groups:', error);
    // Fallback to basic customer fetch
    return await fetchCustomers(token, companyId);
  }
}

async function fetchCustomers(token: string, companyId: string): Promise<Customer[]> {
  try {
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch customers: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
}

async function fetchItemsWithCustomerPricing(token: string, companyId: string, customerNumber: string): Promise<Item[]> {
  try {
    console.log(`Fetching items with customer-specific pricing for customer: ${customerNumber}`);
    
    // First, get the customer's pricing group
    const customerResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers?$filter=number eq '${customerNumber}'&$expand=customerPricingGroup`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let customerPricingGroup = null;
    if (customerResponse.ok) {
      const customerData = await customerResponse.json();
      const customer = customerData.value?.[0];
      customerPricingGroup = customer?.customerPricingGroup?.code || customer?.customerPricingGroupCode;
      console.log(`Customer ${customerNumber} has pricing group: ${customerPricingGroup || 'None'}`);
    }

    // Fetch all items
    const itemsResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/items`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch items: ${itemsResponse.status} ${itemsResponse.statusText}`);
    }

    const itemsData = await itemsResponse.json();
    const items = itemsData.value || [];

    // If customer has a pricing group, fetch sales prices for that group
    if (customerPricingGroup) {
      try {
        const salesPricesResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesPrices?$filter=customerPricingGroup eq '${customerPricingGroup}'`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (salesPricesResponse.ok) {
          const salesPricesData = await salesPricesResponse.json();
          const salesPrices = salesPricesData.value || [];
          
          console.log(`Found ${salesPrices.length} special prices for pricing group ${customerPricingGroup}`);
          
          // Create a map of item number to customer price
          const customerPriceMap = new Map<string, number>();
          salesPrices.forEach((price: SalesPrice) => {
            // Use the most recent price if multiple exist
            if (!customerPriceMap.has(price.itemNumber) || 
                (price.startingDate && new Date(price.startingDate) > new Date())) {
              customerPriceMap.set(price.itemNumber, price.unitPrice);
            }
          });

          // Apply customer-specific pricing to items
          return items.map((item: any) => ({
            id: item.id,
            number: item.number,
            displayName: item.displayName,
            unitPrice: item.unitPrice,
            customerPrice: customerPriceMap.get(item.number) || item.unitPrice
          }));
        }
      } catch (priceError) {
        console.warn('Error fetching customer-specific prices:', priceError);
      }
    }

    // Return items with standard pricing if no customer pricing group or prices found
    return items.map((item: any) => ({
      id: item.id,
      number: item.number,
      displayName: item.displayName,
      unitPrice: item.unitPrice,
      customerPrice: item.unitPrice // Same as standard price
    }));

  } catch (error) {
    console.error('Error fetching items with customer pricing:', error);
    throw error;
  }
}

async function fetchItems(token: string, companyId: string): Promise<Item[]> {
  try {
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/items`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch items: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching items:', error);
    throw error;
  }
}

async function fetchCustomerPricingGroups(token: string, companyId: string): Promise<CustomerPricingGroup[]> {
  try {
    console.log('Fetching customer pricing groups...');
    
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customerPricingGroups`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch customer pricing groups: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const pricingGroups = data.value || [];
    
    console.log(`Fetched ${pricingGroups.length} customer pricing groups`);
    
    return pricingGroups.map((group: any) => ({
      id: group.id,
      code: group.code,
      displayName: group.displayName || group.code
    }));
  } catch (error) {
    console.error('Error fetching customer pricing groups:', error);
    return [];
  }
}