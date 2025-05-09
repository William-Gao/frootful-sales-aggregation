import { PublicClientApplication } from '@azure/msal-browser';

interface Port {
  postMessage: (message: any) => void;
  onMessage: {
    addListener: (callback: (message: any) => void) => void;
  };
}

// MSAL configuration
const msalConfig = {
  auth: {
    clientId: 'YOUR_CLIENT_ID', // Replace with your Azure AD app client ID
    authority: 'https://login.microsoftonline.com/YOUR_TENANT_ID', // Replace with your tenant ID
    redirectUri: chrome.identity.getRedirectURL(),
  }
};

const msalInstance = new PublicClientApplication(msalConfig);

document.addEventListener('DOMContentLoaded', () => {
  const notAuthenticatedSection = document.getElementById('not-authenticated');
  const authenticatedSection = document.getElementById('authenticated');
  const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
  const msLoginBtn = document.getElementById('ms-login-btn') as HTMLButtonElement;
  const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
  const bcConnectBtn = document.getElementById('bc-connect-btn') as HTMLButtonElement;
  const bcStatus = document.getElementById('bc-status');
  const userEmail = document.querySelector('.user-email');
  
  if (!notAuthenticatedSection || !authenticatedSection || !loginBtn || !logoutBtn || !userEmail || !msLoginBtn || !bcConnectBtn || !bcStatus) {
    console.error('Required elements not found');
    return;
  }
  
  // Initialize connection to background script
  const port: Port = chrome.runtime.connect({ name: 'frootful-popup' });
  
  // Handle messages from background script
  port.onMessage.addListener(async (message: any) => {
    if (message.action === 'checkAuthState') {
      updateUI(message.isAuthenticated);
      
      if (message.isAuthenticated) {
        fetchUserInfo();
        checkBCAuthStatus();
      }
    }
    
    if (message.action === 'authenticate') {
      handleAuthResponse(message);
    }
    
    if (message.action === 'revokeAuthentication') {
      handleLogoutResponse(message);
    }
  });
  
  // Check initial auth state
  port.postMessage({ action: 'checkAuthState' });
  
  // Handle login button click
  loginBtn.addEventListener('click', () => {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    port.postMessage({ action: 'authenticate' });
  });
  
  // Handle Microsoft login button click
  msLoginBtn.addEventListener('click', async () => {
    try {
      msLoginBtn.disabled = true;
      msLoginBtn.textContent = 'Connecting...';
      
      const response = await msalInstance.loginPopup({
        scopes: ['https://api.businesscentral.dynamics.com/user_impersonation']
      });
      
      if (response) {
        // Store the token in chrome.storage
        chrome.storage.local.set({ 
          bcToken: response.accessToken,
          bcTokenExpiry: response.expiresOn.getTime()
        }, () => {
          updateBCStatus(true);
        });
      }
    } catch (error) {
      console.error('BC auth error:', error);
      showError('Failed to connect to Business Central');
    } finally {
      msLoginBtn.disabled = false;
      msLoginBtn.textContent = 'Connect Business Central';
    }
  });
  
  // Handle BC connect button click
  bcConnectBtn.addEventListener('click', async () => {
    try {
      bcConnectBtn.disabled = true;
      bcConnectBtn.textContent = 'Connecting...';
      
      const response = await msalInstance.loginPopup({
        scopes: ['https://api.businesscentral.dynamics.com/user_impersonation']
      });
      
      if (response) {
        chrome.storage.local.set({ 
          bcToken: response.accessToken,
          bcTokenExpiry: response.expiresOn.getTime()
        }, () => {
          updateBCStatus(true);
        });
      }
    } catch (error) {
      console.error('BC auth error:', error);
      showError('Failed to connect to Business Central');
    } finally {
      bcConnectBtn.disabled = false;
      bcConnectBtn.textContent = 'Connect Business Central';
    }
  });
  
  // Handle logout button click
  logoutBtn.addEventListener('click', () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Signing out...';
    
    // Sign out from both services
    Promise.all([
      new Promise(resolve => {
        port.postMessage({ action: 'revokeAuthentication' });
        resolve(true);
      }),
      msalInstance.logout()
    ]).then(() => {
      chrome.storage.local.remove(['bcToken', 'bcTokenExpiry'], () => {
        updateUI(false);
        updateBCStatus(false);
      });
    }).catch(error => {
      console.error('Logout error:', error);
      showError('Failed to sign out completely');
    });
  });
  
  // Update UI based on authentication state
  function updateUI(isAuthenticated: boolean): void {
    if (isAuthenticated) {
      notAuthenticatedSection.classList.add('hidden');
      authenticatedSection.classList.remove('hidden');
    } else {
      notAuthenticatedSection.classList.remove('hidden');
      authenticatedSection.classList.add('hidden');
    }
  }
  
  // Update Business Central connection status
  function updateBCStatus(isConnected: boolean): void {
    const statusText = bcStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = `Business Central: ${isConnected ? 'Connected' : 'Not connected'}`;
    }
    bcConnectBtn.style.display = isConnected ? 'none' : 'block';
  }
  
  // Check Business Central auth status
  function checkBCAuthStatus(): void {
    chrome.storage.local.get(['bcToken', 'bcTokenExpiry'], (result) => {
      const isConnected = result.bcToken && result.bcTokenExpiry && result.bcTokenExpiry > Date.now();
      updateBCStatus(isConnected);
    });
  }
  
  // Handle auth response
  function handleAuthResponse(message: { success: boolean }): void {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
        <polyline points="10 17 15 12 10 7"></polyline>
        <line x1="15" y1="12" x2="3" y2="12"></line>
      </svg>
      Sign in with Google
    `;
    
    if (message.success) {
      updateUI(true);
      fetchUserInfo();
      checkBCAuthStatus();
    } else {
      showError('Failed to authenticate. Please try again.');
    }
  }
  
  // Handle logout response
  function handleLogoutResponse(message: { success: boolean }): void {
    logoutBtn.disabled = false;
    logoutBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
      Sign out
    `;
    
    if (message.success) {
      updateUI(false);
      updateBCStatus(false);
    } else {
      showError('Failed to sign out. Please try again.');
    }
  }
  
  // Fetch user info
  function fetchUserInfo(): void {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
      if (userInfo && userInfo.email && userEmail instanceof HTMLElement) {
        userEmail.textContent = userInfo.email;
      } else if (userEmail instanceof HTMLElement) {
        userEmail.textContent = 'Gmail User';
      }
    });
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
    }, 3000);
  }
});