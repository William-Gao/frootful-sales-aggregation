// Main content script for Frootful Gmail Extension

import { authManager } from '../src/authManager.js';

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
  
  // Check authentication state using authManager
  checkAuthState();
}

// Check authentication state
async function checkAuthState(): Promise<void> {
  try {
    isAuthenticated = await authManager.isAuthenticated();
    init();
  } catch (error) {
    console.error('Error checking auth state:', error);
    isAuthenticated = false;
    init();
  }
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
  } else if (currentEmailId && !isAuthenticated) {
    // Show a different button that prompts for authentication
    const parent = senderSpan.parentElement;
    if (parent) {
      injectSignInButton(parent);
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

// Inject sign-in button when user is not authenticated
function injectSignInButton(container: Element): void {
  if (container.querySelector('.frootful-extract-btn')) return;

  extractButton = document.createElement('div');
  extractButton.className = 'frootful-extract-btn';
  extractButton.innerHTML = `
    <div class="frootful-btn-container">
      <button class="frootful-btn frootful-signin-btn" title="Sign in to use Frootful">
        <span class="frootful-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
        </span>
        <span class="frootful-text">Sign in</span>
      </button>
    </div>
  `;

  extractButton.addEventListener('click', handleSignInClick);
  container.appendChild(extractButton);
}

// Handle sign-in button click
function handleSignInClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  
  // Open the extension popup
  chrome.runtime.sendMessage({ action: 'openPopup' });
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

  // Remove existing sidebar for new extraction
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
    showErrorNotification(response.error || 'Failed to extract email');
  }
}

// Show error notification
function showErrorNotification(message: string): void {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #fee2e2;
    color: #991b1b;
    padding: 12px 16px;
    border-radius: 6px;
    border: 1px solid #fecaca;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 300px;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
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