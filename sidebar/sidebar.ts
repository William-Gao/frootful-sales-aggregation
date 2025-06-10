interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
}

interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

interface OrderItem {
  itemName: string;
  quantity: number;
  price: number;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
    unitPrice: number;
  };
}

interface AnalysisResponse {
  success: boolean;
  data?: {
    email: EmailData;
    customers: Customer[];
    items: Item[];
    matchingCustomer?: Customer;
    analyzedItems: AnalyzedItem[];
  };
  error?: string;
}

let customers: Customer[] = [];
let filteredCustomers: Customer[] = [];
let items: Item[] = [];
let currentCustomer: Customer | null = null;

// Initialize DOM elements
const customerSearch = document.getElementById('customer-search') as HTMLInputElement;
const customerSelect = document.getElementById('customer-select') as HTMLSelectElement;
const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;
const emailInfo = document.getElementById('email-info');
const emailMetadata = document.getElementById('email-metadata');
const emailBody = document.getElementById('email-body');
const emailFrom = document.getElementById('email-from');
const emailSubject = document.getElementById('email-subject');
const emailDate = document.getElementById('email-date');
const addItemBtn = document.getElementById('add-item-btn') as HTMLButtonElement;
const itemsContainer = document.getElementById('items-container');
const exportErpBtn = document.getElementById('export-erp-btn') as HTMLButtonElement;
const importProgress = document.querySelector('.import-progress');
const createOrderStep = document.getElementById('create-order-step');
const addItemsStep = document.getElementById('add-items-step');
const sidebarContainer = document.querySelector('.sidebar-container') as HTMLElement;
const header = document.querySelector('header') as HTMLElement;

if (!closeBtn || !emailInfo || !emailMetadata || !emailBody || !emailFrom || 
    !emailSubject || !emailDate || !addItemBtn || !itemsContainer || !exportErpBtn ||
    !importProgress || !createOrderStep || !addItemsStep || !customerSearch ||
    !sidebarContainer || !header) {
  console.error('Required elements not found');
  throw new Error('Required elements not found');
}

let currentOrderId: string | null = null;

// Make sidebar draggable
let isDragging = false;
let startX = 0;
let startY = 0;
let startLeft = 0;
let startTop = 0;

header.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  startLeft = sidebarContainer.offsetLeft;
  startTop = sidebarContainer.offsetTop;
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
});

function onDrag(e: MouseEvent) {
  if (!isDragging) return;
  
  const deltaX = e.clientX - startX;
  const deltaY = e.clientY - startY;
  
  sidebarContainer.style.left = `${startLeft + deltaX}px`;
  sidebarContainer.style.top = `${startTop + deltaY}px`;
}

function stopDrag() {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

// Customer search functionality
customerSearch.addEventListener('input', (e) => {
  const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
  
  filteredCustomers = customers.filter(customer => 
    customer.displayName.toLowerCase().includes(searchTerm) ||
    customer.email.toLowerCase().includes(searchTerm) ||
    customer.number.toLowerCase().includes(searchTerm)
  );
  
  updateCustomerSelect();
});

function updateCustomerSelect() {
  customerSelect.innerHTML = '<option value="">Select a customer...</option>';
  
  filteredCustomers.forEach(customer => {
    const option = document.createElement('option');
    option.value = customer.number;
    option.textContent = `${customer.displayName} (${customer.email})`;
    customerSelect.appendChild(option);
  });
}

// Close sidebar
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ action: 'closeSidebar' }, '*');
});

// Add item with search and autocomplete
addItemBtn.addEventListener('click', () => {
  const itemBox = document.createElement('div');
  itemBox.className = 'item-box';
  itemBox.innerHTML = `
    <div class="item-header">
      <span class="item-title">Item ${itemsContainer.children.length + 1}</span>
      <button class="delete-item-btn">Delete</button>
    </div>
    <div class="item-fields">
      <div class="item-field">
        <label>Search Item</label>
        <input type="text" class="item-search search-input" placeholder="Search items...">
        <label>Item Name</label>
        <select class="item-select">
          <option value="">Select an item...</option>
          ${items.map(item => `
            <option value="${item.number}" data-price="${item.unitPrice}">
              ${item.displayName}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="item-field">
        <label>Quantity</label>
        <input type="number" min="1" value="1" class="item-quantity">
      </div>
      <div class="item-field">
        <label>Price</label>
        <input type="number" min="0.00" step="0.01" value="0.00" class="item-price">
      </div>
    </div>
  `;

  // Add delete functionality
  const deleteBtn = itemBox.querySelector('.delete-item-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      itemBox.remove();
    });
  }

  // Add item search functionality
  const itemSearch = itemBox.querySelector('.item-search') as HTMLInputElement;
  const itemSelect = itemBox.querySelector('.item-select') as HTMLSelectElement;
  
  if (itemSearch && itemSelect) {
    itemSearch.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
      
      const filteredItems = items.filter(item =>
        item.displayName.toLowerCase().includes(searchTerm) ||
        item.number.toLowerCase().includes(searchTerm)
      );
      
      itemSelect.innerHTML = '<option value="">Select an item...</option>';
      filteredItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.number;
        option.dataset.price = item.unitPrice.toString();
        option.textContent = item.displayName;
        itemSelect.appendChild(option);
      });
    });
  }

  // Add item selection handler
  const priceInput = itemBox.querySelector('.item-price') as HTMLInputElement;
  
  if (itemSelect) {
    itemSelect.addEventListener('change', (e) => {
      const select = e.target as HTMLSelectElement;
      const option = select.selectedOptions[0];
      if (option && priceInput) {
        priceInput.value = option.dataset.price || '0.00';
      }
    });
  }

  itemsContainer.appendChild(itemBox);
});

// Get auth token from Supabase session
async function getAuthToken(): Promise<string | null> {
  try {
    // Get Supabase session from extension storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['frootful_session']);
      if (result.frootful_session) {
        const session = JSON.parse(result.frootful_session);
        return session.access_token;
      }
    }

    // Fallback to localStorage
    const sessionData = localStorage.getItem('frootful_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      return session.access_token;
    }

    return null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Handle email data - now calls comprehensive analyze-email endpoint
window.addEventListener('message', async (event: MessageEvent) => {
  if (event.data.action === 'loadEmailData') {
    const emailData: EmailData = event.data.data;
    
    // Hide loading state and show sections
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) loadingState.remove();
    emailMetadata.classList.remove('hidden');
    emailBody.classList.remove('hidden');
    
    // Populate metadata
    if (emailFrom) emailFrom.textContent = emailData.from;
    if (emailSubject) emailSubject.textContent = emailData.subject;
    if (emailDate) emailDate.textContent = new Date(emailData.date).toLocaleString();
    
    try {
      // Call comprehensive analyze-email endpoint
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      console.log('Calling comprehensive analyze-email endpoint...');
      
      const analysisResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emailId: emailData.id })
      });

      const analysisResult: AnalysisResponse = await analysisResponse.json();
      
      if (!analysisResult.success || !analysisResult.data) {
        throw new Error(analysisResult.error || 'Analysis failed');
      }

      const { customers: fetchedCustomers, items: fetchedItems, matchingCustomer, analyzedItems } = analysisResult.data;

      // Store data globally
      customers = fetchedCustomers;
      filteredCustomers = [...customers];
      items = fetchedItems;
      
      // Update customer dropdown
      updateCustomerSelect();
      
      // Set matching customer if found
      if (matchingCustomer) {
        customerSelect.value = matchingCustomer.number;
        currentCustomer = matchingCustomer;
        console.log('Auto-selected matching customer:', matchingCustomer.displayName);
      }

      // Clear existing items and add analyzed items
      itemsContainer.innerHTML = '';
      
      if (analyzedItems && analyzedItems.length > 0) {
        console.log('Adding', analyzedItems.length, 'analyzed items to the form');
        
        analyzedItems.forEach((analyzedItem: AnalyzedItem) => {
          if (analyzedItem.matchedItem) {
            const itemBox = document.createElement('div');
            itemBox.className = 'item-box';
            itemBox.innerHTML = `
              <div class="item-header">
                <span class="item-title">Item ${itemsContainer.children.length + 1}</span>
                <button class="delete-item-btn">Delete</button>
              </div>
              <div class="item-fields">
                <div class="item-field">
                  <label>Item Name</label>
                  <select class="item-select">
                    <option value="">Select an item...</option>
                    ${items.map(item => `
                      <option value="${item.number}" 
                              data-price="${item.unitPrice}"
                              ${item.number === analyzedItem.matchedItem?.number ? 'selected' : ''}>
                        ${item.displayName}
                      </option>
                    `).join('')}
                  </select>
                </div>
                <div class="item-field">
                  <label>Quantity</label>
                  <input type="number" min="1" value="${analyzedItem.quantity}" class="item-quantity">
                </div>
                <div class="item-field">
                  <label>Price</label>
                  <input type="number" min="0" step="0.01" value="${analyzedItem.matchedItem.unitPrice}" class="item-price">
                </div>
              </div>
            `;

            // Add delete functionality
            const deleteBtn = itemBox.querySelector('.delete-item-btn');
            if (deleteBtn) {
              deleteBtn.addEventListener('click', () => {
                itemBox.remove();
              });
            }

            // Add item selection handler
            const itemSelect = itemBox.querySelector('.item-select');
            const priceInput = itemBox.querySelector('.item-price') as HTMLInputElement;
            
            if (itemSelect) {
              itemSelect.addEventListener('change', (e) => {
                const select = e.target as HTMLSelectElement;
                const option = select.selectedOptions[0];
                if (option && priceInput) {
                  priceInput.value = option.dataset.price || '0.00';
                }
              });
            }

            itemsContainer.appendChild(itemBox);
          }
        });
      }

      console.log(`Analysis complete! Loaded ${customers.length} customers, ${items.length} items, and ${analyzedItems.length} analyzed items`);
      showSuccess('Email analyzed successfully!');
      
    } catch (error) {
      console.error('Error during comprehensive analysis:', error);
      showError('Failed to analyze email: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
});

// Handle customer selection
customerSelect.addEventListener('change', (e) => {
  const selectedNumber = (e.target as HTMLSelectElement).value;
  currentCustomer = customers.find(c => c.number === selectedNumber) || null;
});

function getItems(): OrderItem[] {
  const items: OrderItem[] = [];
  const itemBoxes = itemsContainer.querySelectorAll('.item-box');
  
  itemBoxes.forEach(box => {
    const itemSelect = box.querySelector('.item-select') as HTMLSelectElement;
    const quantityInput = box.querySelector('.item-quantity') as HTMLInputElement;
    const priceInput = box.querySelector('.item-price') as HTMLInputElement;
    
    if (itemSelect && quantityInput && priceInput) {
      items.push({
        itemName: itemSelect.value,
        quantity: parseInt(quantityInput.value, 10),
        price: parseFloat(priceInput.value)
      });
    }
  });
  
  return items;
}

function updateStepStatus(step: HTMLElement, status: 'loading' | 'success' | 'error'): void {
  const indicator = step.querySelector('.step-indicator');
  if (!indicator) return;
  
  indicator.className = 'step-indicator';
  
  if (status === 'loading') {
    indicator.classList.add('loading');
    indicator.innerHTML = '';
  } else if (status === 'success') {
    indicator.classList.add('success');
    indicator.innerHTML = '✓';
  } else if (status === 'error') {
    indicator.classList.add('error');
    indicator.innerHTML = '✕';
  }
}

// Export to ERP functionality using edge functions
exportErpBtn.addEventListener('click', async () => {
  try {
    if (!currentCustomer) {
      throw new Error('Please select a customer');
    }
    
    exportErpBtn.disabled = true;
    importProgress.classList.remove('hidden');
    
    const items = getItems();
    if (items.length === 0) {
      throw new Error('Please add at least one item');
    }
    
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('Not authenticated');
    }

    console.log('Getting Business Central token info via edge function...');

    // Get company info using edge function
    const companyResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    const companyResult = await companyResponse.json();
    if (!companyResult.success || !companyResult.tokens || companyResult.tokens.length === 0) {
      throw new Error('Business Central not connected');
    }

    const bcToken = companyResult.tokens[0];
    const companyId = bcToken.company_id;
    const companyName = bcToken.company_name;
    const tenantId = bcToken.tenant_id;

    console.log('Creating order in Business Central...');

    // Step 1: Create Order
    updateStepStatus(createOrderStep, 'loading');
    const orderResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesOrders/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bcToken.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderDate: new Date().toISOString().split('T')[0],
        customerNumber: currentCustomer.number,
        currencyCode: "USD"
      })
    });

    if (!orderResponse.ok) {
      throw new Error(`Failed to create order: ${orderResponse.statusText}`);
    }

    const order = await orderResponse.json();
    const orderId = order.id;
    const orderNumber = order.number;
    
    updateStepStatus(createOrderStep, 'success');
    
    // Add order link to step text
    const orderLink = document.createElement('a');
    orderLink.href = `https://businesscentral.dynamics.com/${tenantId}/Production/?company=${encodeURIComponent(companyName)}&page=42&filter='Sales Header'.'No.' IS '${orderNumber}'`;
    orderLink.className = 'order-link';
    orderLink.target = '_blank';
    orderLink.textContent = `View Order #${orderNumber}`;
    
    const stepText = createOrderStep.querySelector('.step-text');
    if (stepText) {
      stepText.appendChild(orderLink);
    }

    // Step 2: Add Items
    updateStepStatus(addItemsStep, 'loading');
    for (const item of items) {
      const lineResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/salesOrders(${orderId})/salesOrderLines`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bcToken.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lineObjectNumber: item.itemName,
          lineType: 'Item',
          quantity: item.quantity,
          unitPrice: item.price
        })
      });

      if (!lineResponse.ok) {
        throw new Error(`Failed to add item: ${lineResponse.statusText}`);
      }
    }
    updateStepStatus(addItemsStep, 'success');

    showSuccess('Successfully created order');
  } catch (error) {
    console.error('Error creating order:', error);
    if (createOrderStep.querySelector('.step-indicator.loading')) {
      updateStepStatus(createOrderStep, 'error');
    }
    if (addItemsStep.querySelector('.step-indicator.loading')) {
      updateStepStatus(addItemsStep, 'error');
    }
    showError(error instanceof Error ? error.message : 'Failed to create order');
  } finally {
    exportErpBtn.disabled = false;
    exportErpBtn.textContent = 'Export to ERP';
  }
});

// Show success message
function showSuccess(message: string): void {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.style.backgroundColor = '#DEF7EC';
  successDiv.style.color = '#03543F';
  successDiv.style.padding = '12px';
  successDiv.style.borderRadius = '6px';
  successDiv.style.marginBottom = '16px';
  successDiv.textContent = message;
  
  emailBody.prepend(successDiv);
  
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}

// Show error message
function showError(message: string): void {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.style.backgroundColor = '#FEE2E2';
  errorDiv.style.color = '#B91C1C';
  errorDiv.style.padding = '12px';
  errorDiv.style.borderRadius = '6px';
  errorDiv.style.marginBottom = '16px';
  errorDiv.textContent = message;
  
  emailBody.prepend(errorDiv);
  
  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}