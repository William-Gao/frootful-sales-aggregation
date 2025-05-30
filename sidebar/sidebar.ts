// Sidebar script for Frootful

import { authenticateBusinessCentral } from "../src/businessCentralAuth.js";

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

// Initialize DOM elements
const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;
const emailInfo = document.getElementById('email-info');
const emailMetadata = document.getElementById('email-metadata');
const emailBody = document.getElementById('email-body');
const emailFrom = document.getElementById('email-from');
const emailSubject = document.getElementById('email-subject');
const emailDate = document.getElementById('email-date');
const addItemBtn = document.getElementById('add-item-btn') as HTMLButtonElement;
const itemsContainer = document.getElementById('items-container');
const importErpBtn = document.getElementById('import-erp-btn') as HTMLButtonElement;
const importProgress = document.querySelector('.import-progress');
const createOrderStep = document.getElementById('create-order-step');
const addItemsStep = document.getElementById('add-items-step');

if (!closeBtn || !emailInfo || !emailMetadata || !emailBody || !emailFrom || 
    !emailSubject || !emailDate || !addItemBtn || !itemsContainer || !importErpBtn ||
    !importProgress || !createOrderStep || !addItemsStep) {
  console.error('Required elements not found');
  throw new Error('Required elements not found');
}

let currentOrderId: string | null = null;

// Close sidebar
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ action: 'closeSidebar' }, '*');
});

// Add item
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
        <label>Item Name</label>
        <input type="text" placeholder="Enter item name" class="item-name">
      </div>
      <div class="item-field">
        <label>Quantity</label>
        <input type="number" min="1" value="1" class="item-quantity">
      </div>
      <div class="item-field">
        <label>Price</label>
        <input type="number" min="0" step="0.01" value="0.00" class="item-price">
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

  itemsContainer.appendChild(itemBox);
});

// Handle email data
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.action === 'loadEmailData') {
    const emailData: EmailData = event.data.data;
    
    // Hide loading state
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) {
      loadingState.remove();
    }
    
    // Show metadata and body sections
    emailMetadata.classList.remove('hidden');
    emailBody.classList.remove('hidden');
    
    // Populate metadata
    if (emailFrom) emailFrom.textContent = emailData.from;
    if (emailSubject) emailSubject.textContent = emailData.subject;
    if (emailDate) emailDate.textContent = new Date(emailData.date).toLocaleString();
  }
});

function getItems(): OrderItem[] {
  const items: OrderItem[] = [];
  const itemBoxes = itemsContainer.querySelectorAll('.item-box');
  
  itemBoxes.forEach(box => {
    const nameInput = box.querySelector('.item-name') as HTMLInputElement;
    const quantityInput = box.querySelector('.item-quantity') as HTMLInputElement;
    const priceInput = box.querySelector('.item-price') as HTMLInputElement;
    
    if (nameInput && quantityInput && priceInput) {
      items.push({
        itemName: nameInput.value,
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

// Import to ERP functionality
importErpBtn.addEventListener('click', async () => {
  try {
    importErpBtn.disabled = true;
    importProgress.classList.remove('hidden');
    
    // Get items
    const items = getItems();
    if (items.length === 0) {
      throw new Error('Please add at least one item');
    }
    
    // Get a fresh token
    const token = await authenticateBusinessCentral();
    if (!token) {
      throw new Error('Not authenticated with Business Central');
    }

    // Step 1: Create Order (if not exists)
    if (!currentOrderId) {
      updateStepStatus(createOrderStep, 'loading');
      const orderResponse = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(45dbc5d1-5408-f011-9af6-6045bde9c6b1)/salesOrders/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderDate: new Date().toISOString().split('T')[0],
          customerNumber: "C04417",
          currencyCode: "USD"
        })
      });

      if (!orderResponse.ok) {
        throw new Error(`Failed to create order: ${orderResponse.statusText}`);
      }

      const order = await orderResponse.json();
      currentOrderId = order.id;
      updateStepStatus(createOrderStep, 'success');
    } else {
      updateStepStatus(createOrderStep, 'success');
    }

    // Step 2: Add Items
    updateStepStatus(addItemsStep, 'loading');
    for (const item of items) {
      const lineResponse = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(45dbc5d1-5408-f011-9af6-6045bde9c6b1)/salesOrders(${currentOrderId})/salesOrderLines`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          itemId: item.itemName, // This should be the actual item ID in production
          quantity: item.quantity,
          unitPrice: item.price
        })
      });

      if (!lineResponse.ok) {
        throw new Error(`Failed to add item: ${lineResponse.statusText}`);
      }
    }
    updateStepStatus(addItemsStep, 'success');

    showSuccess('Successfully imported to ERP');
  } catch (error) {
    console.error('Error importing to ERP:', error);
    if (createOrderStep.querySelector('.step-indicator.loading')) {
      updateStepStatus(createOrderStep, 'error');
    }
    if (addItemsStep.querySelector('.step-indicator.loading')) {
      updateStepStatus(addItemsStep, 'error');
    }
    showError(error instanceof Error ? error.message : 'Failed to import to ERP');
  } finally {
    importErpBtn.disabled = false;
    importErpBtn.textContent = 'Import to ERP';
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