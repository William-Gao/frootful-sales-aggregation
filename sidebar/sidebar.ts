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
  requestedDeliveryDate?: string; // ISO date string
}

interface OrderItem {
  itemName: string;
  quantity: number;
  price?: number; // Optional - only include if price is available
}

interface OrderData {
  customerNumber: string;
  items: OrderItem[];
  requestedDeliveryDate?: string; // ISO date string
}

let customers: Customer[] = [];
let filteredCustomers: Customer[] = [];
let items: Item[] = [];
let currentCustomer: Customer | null = null;
let requestedDeliveryDate: string | null = null;

const PRICING_OVERRIDE_TOOLTIP_TEXT = "Click to manually set a price and override the pricing rules you have set in your ERP"
const REVERT_PRICING_OVERRIDE_TOOLTIP_TEXT = "Click to revert to the pricing rules set in your ERP"

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
          ${PRICING_OVERRIDE_TOOLTIP_TEXT}
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
      
      // Create price field with revert option
      const priceField = document.createElement('div');
      priceField.className = 'price-field';
      priceField.innerHTML = `
        <label>Custom Price</label>
        <input type="number" min="0" step="0.01" value="${basePrice}" class="item-price">
      `;
      
      // Create revert container
      const revertContainer = document.createElement('div');
      revertContainer.className = 'revert-pricing-container';
      revertContainer.innerHTML = `
        <a href="#" class="revert-pricing-link">
          Revert to default pricing
          <div class="revert-pricing-tooltip">
            Remove custom pricing and let Business Central use its default pricing.
          </div>
        </a>
      `;
      
      // Add revert functionality
      const revertLink = revertContainer.querySelector('.revert-pricing-link') as HTMLAnchorElement;
      revertLink.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove price field and revert container
        priceField.remove();
        revertContainer.remove();
        
        // Show override link again
        overrideContainer.style.display = 'block';
      });
      
      // Insert price field and revert option, hide override link
      itemFields.appendChild(priceField);
      itemFields.appendChild(revertContainer);
      overrideContainer.style.display = 'none';
    });
  }

  itemsContainer.appendChild(itemBox);
});

// Get auth token from Supabase session - FIXED VERSION
async function getAuthToken(): Promise<string | null> {
  try {
    console.log('Getting auth token for sidebar...');
    
    // First try to get session from Supabase
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (session && !error) {
      console.log('Found valid Supabase session');
      return session.access_token;
    }
    
    console.log('No Supabase session found, checking chrome storage...');
    
    // Fallback to chrome storage if available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get(['session']);
        if (result.session) {
          console.log('Found session in chrome storage, setting in Supabase...');
          
          // Set the session in Supabase
          await supabaseClient.auth.setSession(result.session);
          
          // Get the session again
          const { data: { session: newSession } } = await supabaseClient.auth.getSession();
          if (newSession) {
            console.log('Successfully restored session from chrome storage');
            return newSession.access_token;
          }
        }
      } catch (chromeError) {
        console.warn('Error accessing chrome storage:', chromeError);
      }
    }
    
    console.warn('No valid auth token found');
    return null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Handle comprehensive analysis data - now includes delivery date
window.addEventListener('message', async (event: MessageEvent) => {
  if (event.data.action === 'loadComprehensiveData') {
    const analysisData: ComprehensiveAnalysisData = event.data.data;
    
    console.log('Received comprehensive analysis data in sidebar:', {
      email: analysisData.email.subject,
      customers: analysisData.customers.length,
      items: analysisData.items.length,
      analyzedItems: analysisData.analyzedItems.length,
      matchingCustomer: analysisData.matchingCustomer?.displayName || 'None',
      requestedDeliveryDate: analysisData.requestedDeliveryDate || 'None'
    });
    
    // Store delivery date globally
    requestedDeliveryDate = analysisData.requestedDeliveryDate || null;
    
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

    // Add delivery date display if found
    if (requestedDeliveryDate) {
      addDeliveryDateDisplay(requestedDeliveryDate);
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
                  ${PRICING_OVERRIDE_TOOLTIP_TEXT}
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
              
              // Create price field with revert option
              const priceField = document.createElement('div');
              priceField.className = 'price-field';
              priceField.innerHTML = `
                <label>Custom Price</label>
                <input type="number" min="0" step="0.01" value="${basePrice}" class="item-price">
              `;
              
              // Create revert container
              const revertContainer = document.createElement('div');
              revertContainer.className = 'revert-pricing-container';
              revertContainer.innerHTML = `
                <a href="#" class="revert-pricing-link">
                  Revert to default pricing
                  <div class="revert-pricing-tooltip">
                    ${REVERT_PRICING_OVERRIDE_TOOLTIP_TEXT}
                  </div>
                </a>
              `;
              
              // Add revert functionality
              const revertLink = revertContainer.querySelector('.revert-pricing-link') as HTMLAnchorElement;
              revertLink.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove price field and revert container
                priceField.remove();
                revertContainer.remove();
                
                // Show override link again
                overrideContainer.style.display = 'block';
              });
              
              // Insert price field and revert option, hide override link
              itemFields.appendChild(priceField);
              itemFields.appendChild(revertContainer);
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

// Add delivery date display to the UI
function addDeliveryDateDisplay(deliveryDate: string): void {
  const deliveryDateBox = document.createElement('div');
  deliveryDateBox.className = 'content-box';
  deliveryDateBox.innerHTML = `
    <label>Requested Delivery Date</label>
    <input type="date" id="delivery-date-input" value="${deliveryDate}" class="delivery-date-input">
    <div class="delivery-date-note">
      <small>Extracted from email content. You can modify this date if needed.</small>
    </div>
  `;
  
  // Insert after customer selection
  const customerBox = document.querySelector('.content-box');
  if (customerBox && customerBox.parentNode) {
    customerBox.parentNode.insertBefore(deliveryDateBox, customerBox.nextSibling);
  }
  
  // Update global variable when date changes
  const dateInput = deliveryDateBox.querySelector('#delivery-date-input') as HTMLInputElement;
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      requestedDeliveryDate = (e.target as HTMLInputElement).value;
    });
  }
}

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

// Function to open popup window for Business Central order
function openOrderPopup(url: string, orderNumber: string): void {
  const width = 1200;
  const height = 800;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  const popup = window.open(
    url,
    `bc-order-${orderNumber}`,
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no`
  );
  
  if (!popup) {
    console.warn('Popup blocked, falling back to new tab');
    window.open(url, '_blank');
  }
}

// Export to ERP functionality - FIXED VERSION with proper authentication
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
    
    console.log('Getting auth token for ERP export...');
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('Authentication failed. Please sign in again and try again.');
    }

    console.log('Exporting order to ERP via edge function...');
    if (requestedDeliveryDate) {
      console.log('Including requested delivery date:', requestedDeliveryDate);
    }

    // Show both steps as loading
    updateStepStatus(createOrderStep, 'loading');
    updateStepStatus(addItemsStep, 'loading');

    // Prepare order data with optional delivery date
    const orderData: OrderData = {
      customerNumber: currentCustomer.number,
      items: items
    };

    // Include delivery date if available
    if (requestedDeliveryDate) {
      orderData.requestedDeliveryDate = requestedDeliveryDate;
    }

    console.log('Calling export-order-to-erp edge function with auth token...');

    // Call the export-order-to-erp edge function
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-order-to-erp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderData })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Export to ERP error response:', errorText);
      
      // Check if it's an authentication error
      if (response.status === 401) {
        throw new Error('Authentication expired. Please sign in again and try again.');
      }
      
      throw new Error(`Export failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Export returned error');
    }

    // Update step statuses to success
    updateStepStatus(createOrderStep, 'success');
    updateStepStatus(addItemsStep, 'success');

    // Add order link to step text with popup functionality
    if (result.deepLink && result.orderNumber) {
      const orderLink = document.createElement('a');
      orderLink.href = '#';
      orderLink.className = 'order-link';
      orderLink.textContent = `View Order #${result.orderNumber}`;
      
      // Add click handler for popup
      orderLink.addEventListener('click', (e) => {
        e.preventDefault();
        openOrderPopup(result.deepLink, result.orderNumber);
      });
      
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