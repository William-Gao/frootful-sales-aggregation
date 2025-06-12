import { supabaseClient } from "../src/supabaseClient.js";

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

interface ComprehensiveAnalysisData {
  email: EmailData;
  customers: Customer[];
  items: Item[];
  matchingCustomer?: Customer;
  analyzedItems: AnalyzedItem[];
}

interface OrderItem {
  itemName: string;
  quantity: number;
  price?: number; // Optional - only include if price is available
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

// Add item with simplified layout (no price initially)
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
    </div>
    <div class="override-pricing-container">
      <a href="#" class="override-pricing-link">
        Override pricing
        <div class="override-pricing-tooltip">
          Click to manually set a custom price for this item. Otherwise, Business Central will use its default pricing.
        </div>
      </a>
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

  // Add override pricing functionality
  const overrideLink = itemBox.querySelector('.override-pricing-link') as HTMLAnchorElement;
  const itemFields = itemBox.querySelector('.item-fields') as HTMLElement;
  const overrideContainer = itemBox.querySelector('.override-pricing-container') as HTMLElement;
  
  if (overrideLink) {
    overrideLink.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Get the current selected item's price
      const selectedOption = itemSelect.selectedOptions[0];
      const basePrice = selectedOption ? selectedOption.dataset.price || '0.00' : '0.00';
      
      // Create price field
      const priceField = document.createElement('div');
      priceField.className = 'price-field';
      priceField.innerHTML = `
        <label>Custom Price</label>
        <input type="number" min="0" step="0.01" value="${basePrice}" class="item-price">
      `;
      
      // Insert price field and hide override link
      itemFields.appendChild(priceField);
      overrideContainer.style.display = 'none';
    });
  }

  itemsContainer.appendChild(itemBox);
});

// Get auth token from Supabase session
async function getAuthToken(): Promise<string | null> {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  return session?.access_token ?? null;
}

// Handle comprehensive analysis data - replaces the old loadEmailData handler
window.addEventListener('message', async (event: MessageEvent) => {
  if (event.data.action === 'loadComprehensiveData') {
    const analysisData: ComprehensiveAnalysisData = event.data.data;
    
    console.log('Received comprehensive analysis data in sidebar:', {
      email: analysisData.email.subject,
      customers: analysisData.customers.length,
      items: analysisData.items.length,
      analyzedItems: analysisData.analyzedItems.length,
      matchingCustomer: analysisData.matchingCustomer?.displayName || 'None'
    });
    
    // Hide loading state and show sections
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) loadingState.remove();
    emailMetadata.classList.remove('hidden');
    emailBody.classList.remove('hidden');
    
    // Populate email metadata
    if (emailFrom) emailFrom.textContent = analysisData.email.from;
    if (emailSubject) emailSubject.textContent = analysisData.email.subject;
    if (emailDate) emailDate.textContent = new Date(analysisData.email.date).toLocaleString();
    
    // Store data globally
    customers = analysisData.customers;
    filteredCustomers = [...customers];
    items = analysisData.items;
    
    // Update customer dropdown
    updateCustomerSelect();
    
    // Set matching customer if found
    if (analysisData.matchingCustomer) {
      customerSelect.value = analysisData.matchingCustomer.number;
      currentCustomer = analysisData.matchingCustomer;
      console.log('Auto-selected matching customer:', analysisData.matchingCustomer.displayName);
    }

    // Clear existing items and add analyzed items
    itemsContainer.innerHTML = '';
    
    if (analysisData.analyzedItems && analysisData.analyzedItems.length > 0) {
      console.log('Adding', analysisData.analyzedItems.length, 'analyzed items to the form');
      
      analysisData.analyzedItems.forEach((analyzedItem: AnalyzedItem) => {
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
            </div>
            <div class="override-pricing-container">
              <a href="#" class="override-pricing-link">
                Override pricing
                <div class="override-pricing-tooltip">
                  Click to manually set a custom price for this item. Otherwise, Business Central will use its default pricing.
                </div>
              </a>
            </div>
          `;

          // Add delete functionality
          const deleteBtn = itemBox.querySelector('.delete-item-btn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
              itemBox.remove();
            });
          }

          // Add override pricing functionality
          const overrideLink = itemBox.querySelector('.override-pricing-link') as HTMLAnchorElement;
          const itemFields = itemBox.querySelector('.item-fields') as HTMLElement;
          const overrideContainer = itemBox.querySelector('.override-pricing-container') as HTMLElement;
          const itemSelect = itemBox.querySelector('.item-select') as HTMLSelectElement;
          
          if (overrideLink) {
            overrideLink.addEventListener('click', (e) => {
              e.preventDefault();
              
              // Get the current selected item's price
              const selectedOption = itemSelect.selectedOptions[0];
              const basePrice = selectedOption ? selectedOption.dataset.price || '0.00' : '0.00';
              
              // Create price field
              const priceField = document.createElement('div');
              priceField.className = 'price-field';
              priceField.innerHTML = `
                <label>Custom Price</label>
                <input type="number" min="0" step="0.01" value="${basePrice}" class="item-price">
              `;
              
              // Insert price field and hide override link
              itemFields.appendChild(priceField);
              overrideContainer.style.display = 'none';
            });
          }

          itemsContainer.appendChild(itemBox);
        }
      });
    }

    console.log(`Analysis complete! Loaded ${customers.length} customers, ${items.length} items, and ${analysisData.analyzedItems.length} analyzed items`);
    showSuccess('Email analyzed successfully!');
  }

  // Keep the old handler for backward compatibility
  if (event.data.action === 'loadEmailData') {
    console.warn('Using deprecated loadEmailData - please update to use comprehensive analysis');
    // Handle old format if needed for backward compatibility
  }
});

// Handle customer selection
customerSelect.addEventListener('change', (e) => {
  const selectedNumber = (e.target as HTMLSelectElement).value;
  currentCustomer = customers.find(c => c.number === selectedNumber) || null;
  
  if (currentCustomer) {
    console.log('Selected customer:', currentCustomer.displayName);
  }
});

function getItems(): OrderItem[] {
  const items: OrderItem[] = [];
  const itemBoxes = itemsContainer.querySelectorAll('.item-box');
  
  itemBoxes.forEach(box => {
    const itemSelect = box.querySelector('.item-select') as HTMLSelectElement;
    const quantityInput = box.querySelector('.item-quantity') as HTMLInputElement;
    const priceInput = box.querySelector('.item-price') as HTMLInputElement;
    
    if (itemSelect && quantityInput) {
      const orderItem: OrderItem = {
        itemName: itemSelect.value,
        quantity: parseInt(quantityInput.value, 10)
      };
      
      // Only include price if user has overridden it (price field exists and has value)
      if (priceInput && priceInput.value && parseFloat(priceInput.value) > 0) {
        orderItem.price = parseFloat(priceInput.value);
        console.log(`Item ${orderItem.itemName}: Using custom price ${orderItem.price}`);
      } else {
        console.log(`Item ${orderItem.itemName}: Using Business Central default pricing`);
      }
      
      items.push(orderItem);
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

// Export to ERP functionality using the new edge function (one-step process)
exportErpBtn.addEventListener('click', async () => {
  try {
    if (!currentCustomer) {
      throw new Error('Please select a customer');
    }
    
    exportErpBtn.disabled = true;
    exportErpBtn.textContent = 'Creating Order...';
    importProgress.classList.remove('hidden');
    
    const items = getItems();
    if (items.length === 0) {
      throw new Error('Please add at least one item');
    }
    
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('Not authenticated');
    }

    console.log('Exporting order to ERP via edge function...');

    // Show both steps as loading
    updateStepStatus(createOrderStep, 'loading');
    updateStepStatus(addItemsStep, 'loading');

    // Call the new export-order-to-erp edge function (one-step process)
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-order-to-erp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderData: {
          customerNumber: currentCustomer.number,
          items: items
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Export to ERP error response:', errorText);
      throw new Error(`Export failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Export returned error');
    }

    // Update step statuses to success
    updateStepStatus(createOrderStep, 'success');
    updateStepStatus(addItemsStep, 'success');

    // Add order link to step text
    if (result.deepLink && result.orderNumber) {
      const orderLink = document.createElement('a');
      orderLink.href = result.deepLink;
      orderLink.className = 'order-link';
      orderLink.target = '_blank';
      orderLink.textContent = `View Order #${result.orderNumber}`;
      
      const stepText = createOrderStep.querySelector('.step-text');
      if (stepText) {
        stepText.appendChild(orderLink);
      }
    }

    console.log('Order export successful:', result);
    showSuccess(result.message || `Successfully created order #${result.orderNumber}!`);

  } catch (error) {
    console.error('Error exporting to ERP:', error);
    
    // Update step statuses to error
    if (createOrderStep.querySelector('.step-indicator.loading')) {
      updateStepStatus(createOrderStep, 'error');
    }
    if (addItemsStep.querySelector('.step-indicator.loading')) {
      updateStepStatus(addItemsStep, 'error');
    }
    
    showError(error instanceof Error ? error.message : 'Failed to export order to ERP');
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