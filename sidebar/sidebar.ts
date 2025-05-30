// Sidebar script for Frootful

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

interface Item {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-btn');
  const emailInfo = document.getElementById('email-info');
  const emailMetadata = document.getElementById('email-metadata');
  const emailBody = document.getElementById('email-body');
  const emailFrom = document.getElementById('email-from');
  const emailSubject = document.getElementById('email-subject');
  const emailDate = document.getElementById('email-date');
  const addItemBtn = document.getElementById('add-item-btn');
  const itemsContainer = document.getElementById('items-container');
  const importErpBtn = document.getElementById('import-erp-btn') as HTMLButtonElement;
  
  let items: Item[] = [];
  
  if (!closeBtn || !emailInfo || !emailMetadata || !emailBody || !emailFrom || 
      !emailSubject || !emailDate || !addItemBtn || !itemsContainer || !importErpBtn) {
    console.error('Required elements not found');
    return;
  }
  
  // Handle close button click
  closeBtn.addEventListener('click', () => {
    window.parent.postMessage({ action: 'closeSidebar' }, '*');
  });
  
  // Handle add item button click
  addItemBtn.addEventListener('click', () => {
    addItem();
  });

  // Handle import to ERP button click
  importErpBtn.addEventListener('click', async () => {
    try {
      importErpBtn.disabled = true;
      importErpBtn.textContent = 'Importing...';

      // Get the token from storage
      const { bcAccessToken } = await chrome.storage.local.get(['bcAccessToken']);
      
      if (!bcAccessToken) {
        throw new Error('Not authenticated with Business Central');
      }

      const response = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(45dbc5d1-5408-f011-9af6-6045bde9c6b1)/salesOrders/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bcAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderDate: "2015-12-31",
          customerNumber: "C04417",
          currencyCode: "USD"
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to import to ERP: ${response.statusText}`);
      }

      const result = await response.json();
      showSuccess('Successfully imported to ERP');
    } catch (error) {
      console.error('Error importing to ERP:', error);
      showError(error instanceof Error ? error.message : 'Failed to import to ERP');
    } finally {
      importErpBtn.disabled = false;
      importErpBtn.textContent = 'Import to ERP';
    }
  });
  
  // Handle messages from content script
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.data.action === 'loadEmailData') {
      await displayEmailData(event.data.data);
    }
  });
  
  // Add new item
  function addItem(item?: Item): void {
    const newItem = item || {
      id: generateId(),
      name: '',
      quantity: 1,
      price: 0
    };
    
    items.push(newItem);
    
    const itemElement = createItemElement(newItem);
    itemsContainer.appendChild(itemElement);
  }
  
  // Create item element
  function createItemElement(item: Item): HTMLDivElement {
    const itemBox = document.createElement('div');
    itemBox.className = 'item-box';
    itemBox.dataset.itemId = item.id;
    
    itemBox.innerHTML = `
      <div class="item-header">
        <span class="item-title">Item #${items.length}</span>
        <button class="delete-item-btn">Delete</button>
      </div>
      <div class="item-fields">
        <div class="item-field">
          <label for="item-name-${item.id}">Item Name</label>
          <input type="text" id="item-name-${item.id}" value="${item.name}" placeholder="Enter item name">
        </div>
        <div class="item-field">
          <label for="item-quantity-${item.id}">Quantity</label>
          <input type="number" id="item-quantity-${item.id}" value="${item.quantity}" min="1">
        </div>
        <div class="item-field">
          <label for="item-price-${item.id}">Price</label>
          <input type="number" id="item-price-${item.id}" value="${item.price}" min="0" step="0.01">
        </div>
      </div>
    `;
    
    // Add event listeners
    const deleteBtn = itemBox.querySelector('.delete-item-btn');
    deleteBtn?.addEventListener('click', () => deleteItem(item.id));
    
    const inputs = itemBox.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('change', () => updateItem(item.id));
    });
    
    return itemBox;
  }
  
  // Delete item
  function deleteItem(itemId: string): void {
    const index = items.findIndex(item => item.id === itemId);
    if (index !== -1) {
      items.splice(index, 1);
      const itemElement = itemsContainer.querySelector(`[data-item-id="${itemId}"]`);
      itemElement?.remove();
    }
  }
  
  // Update item
  function updateItem(itemId: string): void {
    const itemElement = itemsContainer.querySelector(`[data-item-id="${itemId}"]`);
    if (!itemElement) return;
    
    const nameInput = itemElement.querySelector(`#item-name-${itemId}`) as HTMLInputElement;
    const quantityInput = itemElement.querySelector(`#item-quantity-${itemId}`) as HTMLInputElement;
    const priceInput = itemElement.querySelector(`#item-price-${itemId}`) as HTMLInputElement;
    
    const index = items.findIndex(item => item.id === itemId);
    if (index !== -1) {
      items[index] = {
        ...items[index],
        name: nameInput.value,
        quantity: parseInt(quantityInput.value) || 1,
        price: parseFloat(priceInput.value) || 0
      };
    }
  }
  
  // Generate unique ID
  function generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
  
  // Display email data in sidebar
  async function displayEmailData(emailData: EmailData | undefined): Promise<void> {
    if (!emailData) {
      showError('No email data available');
      return;
    }
    
    // Update metadata
    if (emailFrom instanceof HTMLElement) {
      emailFrom.textContent = formatEmailAddress(emailData.from);
    }
    if (emailSubject instanceof HTMLElement) {
      emailSubject.textContent = emailData.subject;
    }
    if (emailDate instanceof HTMLElement) {
      emailDate.textContent = formatDate(emailData.date);
    }
    
    // Show the sections
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
    emailMetadata.classList.remove('hidden');
    emailBody.classList.remove('hidden');
    
    // Extract items from email content
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          emailContent: emailData.body || emailData.snippet
        })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze email');
      }

      const result = await response.json();
      
      if (result.success && result.analysis) {
        // Clear existing items
        items = [];
        itemsContainer.innerHTML = '';
        
        // Add extracted items
        result.analysis.forEach((item: any) => {
          addItem({
            id: generateId(),
            name: item.itemName,
            quantity: item.quantity,
            price: item.unitPrice
          });
        });
      }
    } catch (error) {
      console.error('Error analyzing email:', error);
    }
  }
  
  // Format email address
  function formatEmailAddress(address: string): string {
    if (!address) return '';
    
    const match = address.match(/(.+) <(.+)>/);
    if (match) {
      return match[1]; // Just return the name part
    }
    
    return address;
  }
  
  // Format date
  function formatDate(dateString: string): string {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
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
    
    const content = document.querySelector('.content');
    if (content) {
      content.prepend(errorDiv);
    }
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  // Show success message
  function showSuccess(message: string): void {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.backgroundColor = '#DCFCE7';
    successDiv.style.color = '#166534';
    successDiv.style.padding = '12px';
    successDiv.style.borderRadius = '6px';
    successDiv.style.marginBottom = '16px';
    successDiv.textContent = message;
    
    const content = document.querySelector('.content');
    if (content) {
      content.prepend(successDiv);
    }
    
    setTimeout(() => {
      successDiv.remove();
    }, 5000);
  }
});