// Main content script for Frootful Gmail Extension

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

interface Port {
  postMessage: (message: any) => void;
  onMessage: {
    addListener: (callback: (message: any) => void) => void;
  };
}

let sidebarFrame: HTMLIFrameElement | null = null;
let extractButton: HTMLDivElement | null = null;
let currentEmailId: string | null = null;
let isAuthenticated = false;
let port: Port | null = null;
let observer: MutationObserver | null = null;
let observerTimeout: number | null = null;
let lastUrl: string | null = null;

// Initialize connection to background script
function initializeConnection(): void {
  console.log('This is port at the very beginning of the file: ', port);
  if (port) {
    try {
      port.postMessage({ action: 'ping' });
      console.log('pinged port');
    } catch (e) {
      // Port is disconnected, create new connection
      port = null;
      console.log('port is disconnected');
    }
  }
  console.log('Initializing connection to background script');
  if (!port) {
    console.log('Adding some listeners');
    port = chrome.runtime.connect({ name: 'frootful-content' });
    
    port.onMessage.addListener((message: any) => {
      if (message.action === 'authStateChanged') {
        isAuthenticated = message.isAuthenticated;
        init();
      }
      
      if (message.action === 'extractEmail') {
        handleExtractResponse(message);
      }
      
      if (message.action === 'checkAuthState') {
        console.log('listener for checkAuthState event in content.ts');
        console.log('This is message: ', message);
        isAuthenticated = message.isAuthenticated;
        init();
      }
    });
  }
  console.log('THis is port right before postMessage to checkAuthState: ', port);
  // Check if user is authenticated
  port.postMessage({ action: 'checkAuthState' });
}

// Initialize connection when script loads
initializeConnection();

// Initialize extension
function init(): void {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (observerTimeout) clearTimeout(observerTimeout);
    observerTimeout = window.setTimeout(() => {
      checkForEmailView();
    }, 100);
  });

  const mainContent = document.querySelector('[role="main"]');
  if (mainContent) {
    observer.observe(mainContent, { childList: true, subtree: true });
  }

  // URL polling fallback
  startUrlWatcher();

  // Initial check
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    checkForEmailView();
  }
}

// Check if an email is currently being viewed
function checkForEmailView(): void {
  if (extractButton) {
    extractButton.remove();
    extractButton = null;
  }

  const emailContainer = document.querySelector('[role="main"]');
  if (!emailContainer) return;

  const messageIdElement = emailContainer.querySelector('[data-legacy-message-id]');
  if (!messageIdElement) return;

  currentEmailId = messageIdElement.getAttribute('data-legacy-message-id');
  if (!currentEmailId) return;

  const senderSpan = emailContainer.querySelector('.gD');
  if (!senderSpan) return;

  if (currentEmailId && isAuthenticated) {
    const parent = senderSpan.parentElement;
    if (parent) {
      injectExtractButton(parent);
    }
  }
}

// Inject the extract button into Gmail UI
function injectExtractButton(container: Element): void {
  if (container.querySelector('.frootful-extract-btn')) return;

  extractButton = document.createElement('div');
  extractButton.className = 'frootful-extract-btn';
  extractButton.innerHTML = `
    <div class="frootful-btn-container">
      <button class="frootful-btn" title="Extract with Frootful">
        <span class="frootful-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a9 9 0 0 1 9 9v4a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6v-4a9 9 0 0 1 9-9Z"></path>
            <path d="M9 16V8a3 3 0 0 1 6 0v8"></path>
          </svg>
        </span>
        <span class="frootful-text">Extract</span>
      </button>
    </div>
  `;

  extractButton.addEventListener('click', handleExtractClick);
  container.appendChild(extractButton);
}

// Handle extract button click
function handleExtractClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  
  // Ensure connection is active
  initializeConnection();
  
  if (!port || !currentEmailId) return;
  
  // Show loading state
  if (extractButton) {
    extractButton.classList.add('loading');
    const textElement = extractButton.querySelector('.frootful-text');
    if (textElement) {
      textElement.textContent = 'Analyzing...';
    }
  }

  // Remove existing sidebar for new extraction
  removeSidebar();
  
  // Request comprehensive email analysis
  port.postMessage({
    action: 'extractEmail',
    emailId: currentEmailId
  });
}

// Handle extract response - now handles comprehensive analysis data
function handleExtractResponse(response: { success: boolean; data?: ComprehensiveAnalysisData; error?: string }): void {
  // Reset button state
  if (extractButton) {
    extractButton.classList.remove('loading');
    const textElement = extractButton.querySelector('.frootful-text');
    if (textElement) {
      textElement.textContent = 'Extract';
    }
  }
  
  if (response.success && response.data) {
    console.log('Received comprehensive analysis data:', {
      email: response.data.email.subject,
      customers: response.data.customers.length,
      items: response.data.items.length,
      analyzedItems: response.data.analyzedItems.length,
      matchingCustomer: response.data.matchingCustomer?.displayName || 'None'
    });
    
    showSidebar(response.data);
  } else {
    console.error('Error in comprehensive analysis:', response.error || 'Unknown error');
    showError('Failed to analyze email: ' + (response.error || 'Unknown error'));
  }
}

// Show sidebar with comprehensive analysis data
function showSidebar(analysisData: ComprehensiveAnalysisData): void {
  // Create sidebar if it doesn't exist
  if (!sidebarFrame) {
    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'frootful-sidebar';
    sidebarFrame.src = chrome.runtime.getURL('sidebar/sidebar.html');
    document.body.appendChild(sidebarFrame);
    
    // Wait for iframe to load before sending data
    sidebarFrame.onload = () => {
      if (sidebarFrame && sidebarFrame.contentWindow) {
        sidebarFrame.contentWindow.postMessage({
          action: 'loadComprehensiveData',
          data: analysisData
        }, '*');
      }
    };
  } else {
    // Sidebar already exists, just send new data
    if (sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage({
        action: 'loadComprehensiveData',
        data: analysisData
      }, '*');
    }
    
    // Make sure sidebar is visible
    sidebarFrame.classList.remove('hidden');
  }
}

function startUrlWatcher(): void {
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      checkForEmailView();
    }
  }, 500);
}

// Remove sidebar from DOM
function removeSidebar(): void {
  if (sidebarFrame) {
    sidebarFrame.remove();
    sidebarFrame = null;
  }
}

// Show error notification
function showError(message: string): void {
  const notification = document.createElement('div');
  notification.className = 'frootful-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Listen for messages from sidebar
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.action === 'closeSidebar') {
    removeSidebar();
  }
});