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
  
  let items: Item[] = [];
  
  if (!closeBtn || !emailInfo || !emailMetadata || !emailBody || !emailFrom || 
      !emailSubject || !emailDate || !addItemBtn || !itemsContainer) {
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
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    emailInfo.appendChild(errorDiv);
  }
});