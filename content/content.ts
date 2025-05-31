// Background service worker for Frootful Gmail Extension

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

let currentEmailId: string | null = null;
let isAuthenticated = false;
let port: chrome.runtime.Port | null = null;
let observer: MutationObserver | null = null;
let observerTimeout: number | null = null;
let lastUrl: string | null = null;
let extractButton: HTMLDivElement | null = null;
let sidebarFrame: HTMLIFrameElement | null = null;

// Initialize connection to background script
function initializeConnection(): void {
  if (port) {
    try {
      port.postMessage({ action: 'ping' });
    } catch (e) {
      // Port is disconnected, create new connection
      port = null;
    }
  }

  if (!port) {
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
        isAuthenticated = message.isAuthenticated;
        init();
      }
    });
  }
  
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
      textElement.textContent = 'Extracting...';
    }
  }

  // Remove existing sidebar
  removeSidebar();
  
  // Request email extraction
  port.postMessage({
    action: 'extractEmail',
    emailId: currentEmailId
  });
}

// Handle extract response
function handleExtractResponse(response: { success: boolean; data?: EmailData; error?: string }): void {
  // Reset button state
  if (extractButton) {
    extractButton.classList.remove('loading');
    const textElement = extractButton.querySelector('.frootful-text');
    if (textElement) {
      textElement.textContent = 'Extract';
    }
  }
  
  if (response.success && response.data) {
    showSidebar(response.data);
  } else {
    console.error('Error extracting email:', response.error || 'Unknown error');
  }
}

// Show sidebar with email content
function showSidebar(emailData: EmailData): void {
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
          action: 'loadEmailData',
          data: emailData
        }, '*');
      }
    };
  } else {
    // Sidebar already exists, just send new data
    if (sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage({
        action: 'loadEmailData',
        data: emailData
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

// Listen for messages from sidebar
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.action === 'closeSidebar') {
    removeSidebar();
  }
});