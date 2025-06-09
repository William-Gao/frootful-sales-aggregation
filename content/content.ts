// Main content script for Frootful Gmail Extension

import { hybridAuth } from '../src/hybridAuth.js';

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

let sidebarFrame: HTMLIFrameElement | null = null;
let extractButton: HTMLDivElement | null = null;
let currentEmailId: string | null = null;
let isAuthenticated = false;
let observer: MutationObserver | null = null;
let observerTimeout: number | null = null;
let lastUrl: string | null = null;

console.log('Frootful content script loaded');

// Initialize connection and check auth state
async function initializeAuth(): Promise<void> {
  console.log('Initializing authentication...');
  try {
    isAuthenticated = await hybridAuth.isAuthenticated();
    console.log('Authentication state:', isAuthenticated);
    init();
  } catch (error) {
    console.error('Error checking auth state:', error);
    isAuthenticated = false;
    init();
  }
}

// Initialize extension
function init(): void {
  console.log('Initializing extension, authenticated:', isAuthenticated);
  
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
    console.log('Observer attached to main content');
  } else {
    console.log('Main content not found, retrying in 1 second');
    setTimeout(init, 1000);
    return;
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
  console.log('Checking for email view...');
  
  if (extractButton) {
    extractButton.remove();
    extractButton = null;
  }

  const emailContainer = document.querySelector('[role="main"]');
  if (!emailContainer) {
    console.log('Email container not found');
    return;
  }

  const messageIdElement = emailContainer.querySelector('[data-legacy-message-id]');
  if (!messageIdElement) {
    console.log('Message ID element not found');
    return;
  }

  currentEmailId = messageIdElement.getAttribute('data-legacy-message-id');
  if (!currentEmailId) {
    console.log('Current email ID not found');
    return;
  }

  console.log('Found email ID:', currentEmailId);

  const senderSpan = emailContainer.querySelector('.gD');
  if (!senderSpan) {
    console.log('Sender span not found');
    return;
  }

  console.log('Found sender span, authenticated:', isAuthenticated);

  if (currentEmailId && isAuthenticated) {
    const parent = senderSpan.parentElement;
    if (parent) {
      console.log('Injecting extract button');
      injectExtractButton(parent);
    }
  } else if (currentEmailId && !isAuthenticated) {
    // Show a different button that prompts for authentication
    const parent = senderSpan.parentElement;
    if (parent) {
      console.log('Injecting sign-in button');
      injectSignInButton(parent);
    }
  }
}

// Inject the extract button into Gmail UI
function injectExtractButton(container: Element): void {
  if (container.querySelector('.frootful-extract-btn')) {
    console.log('Extract button already exists');
    return;
  }

  console.log('Creating extract button');
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
  console.log('Extract button injected successfully');
}

// Inject sign-in button when user is not authenticated
function injectSignInButton(container: Element): void {
  if (container.querySelector('.frootful-extract-btn')) {
    console.log('Sign-in button already exists');
    return;
  }

  console.log('Creating sign-in button');
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
  console.log('Sign-in button injected successfully');
}

// Handle sign-in button click
async function handleSignInClick(e: MouseEvent): Promise<void> {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('Sign-in button clicked');
  
  try {
    // Show loading state
    if (extractButton) {
      extractButton.classList.add('loading');
      const textElement = extractButton.querySelector('.frootful-text');
      if (textElement) {
        textElement.textContent = 'Signing in...';
      }
    }

    // Use hybrid auth to sign in
    await hybridAuth.signInWithGoogle();
    
    // Update authentication state
    isAuthenticated = true;
    
    // Refresh the UI
    checkForEmailView();
    
    showSuccessNotification('Successfully signed in! You can now extract emails.');
  } catch (error) {
    console.error('Sign-in error:', error);
    if (error instanceof Error && error.message.includes('popups')) {
      showErrorNotification('Please allow popups to sign in with Google');
    } else {
      showErrorNotification('Failed to sign in. Please try again.');
    }
    
    // Reset button state
    if (extractButton) {
      extractButton.classList.remove('loading');
      const textElement = extractButton.querySelector('.frootful-text');
      if (textElement) {
        textElement.textContent = 'Sign in';
      }
    }
  }
}

// Handle extract button click
async function handleExtractClick(e: MouseEvent): Promise<void> {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('Extract button clicked, email ID:', currentEmailId);
  
  if (!currentEmailId) {
    console.error('No current email ID');
    return;
  }
  
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
  
  try {
    console.log('Getting auth token...');
    // Get auth token
    const authToken = await hybridAuth.getAccessToken();
    if (!authToken) {
      throw new Error('Not authenticated');
    }

    console.log('Making request to extract email...');
    // Call backend to extract email
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        emailId: currentEmailId
      })
    });

    console.log('Response status:', response.status);
    const result = await response.json();
    console.log('Response result:', result);

    if (result.success && result.data) {
      console.log('Email extracted successfully, showing sidebar');
      showSidebar(result.data);
    } else {
      throw new Error(result.error || 'Failed to extract email');
    }
  } catch (error) {
    console.error('Error extracting email:', error);
    showErrorNotification(error instanceof Error ? error.message : 'Failed to extract email');
  } finally {
    // Reset button state
    if (extractButton) {
      extractButton.classList.remove('loading');
      const textElement = extractButton.querySelector('.frootful-text');
      if (textElement) {
        textElement.textContent = 'Extract';
      }
    }
  }
}

// Show success notification
function showSuccessNotification(message: string): void {
  console.log('Showing success notification:', message);
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #ecfdf5;
    color: #065f46;
    padding: 12px 16px;
    border-radius: 6px;
    border: 1px solid #d1fae5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.remove();
  }, 4000);
}

// Show error notification
function showErrorNotification(message: string): void {
  console.log('Showing error notification:', message);
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
    animation: slideIn 0.3s ease-out;
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
  console.log('Showing sidebar with email data:', emailData);
  
  // Create sidebar if it doesn't exist
  if (!sidebarFrame) {
    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'frootful-sidebar';
    sidebarFrame.src = chrome.runtime.getURL('sidebar/sidebar.html');
    document.body.appendChild(sidebarFrame);
    
    // Wait for iframe to load before sending data
    sidebarFrame.onload = () => {
      console.log('Sidebar iframe loaded, sending email data');
      if (sidebarFrame && sidebarFrame.contentWindow) {
        sidebarFrame.contentWindow.postMessage({
          action: 'loadEmailData',
          data: emailData
        }, '*');
      }
    };
  } else {
    // Sidebar already exists, just send new data
    console.log('Sidebar exists, sending new email data');
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
      console.log('URL changed from', lastUrl, 'to', currentUrl);
      lastUrl = currentUrl;
      checkForEmailView();
    }
  }, 500);
}

// Remove sidebar from DOM
function removeSidebar(): void {
  if (sidebarFrame) {
    console.log('Removing sidebar');
    sidebarFrame.remove();
    sidebarFrame = null;
  }
}

// Listen for messages from sidebar
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.action === 'closeSidebar') {
    console.log('Received close sidebar message');
    removeSidebar();
  }
});

// Initialize when script loads
console.log('Starting initialization...');
initializeAuth();