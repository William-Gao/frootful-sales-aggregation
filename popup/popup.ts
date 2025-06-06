import { authenticateBusinessCentral, signOut, fetchCompanies, getSelectedCompanyId, setSelectedCompanyId, type Company } from '../src/businessCentralAuth.js';

interface Port {
  postMessage: (message: any) => void;
  onMessage: {
    addListener: (callback: (message: any) => void) => void;
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const notAuthenticatedSection = document.getElementById('not-authenticated');
  const authenticatedSection = document.getElementById('authenticated');
  const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
  const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
  const bcLoginBtn = document.getElementById('bc-login-btn') as HTMLButtonElement;
  const bcConnected = document.getElementById('bc-connected');
  const companySelect = document.getElementById('company-select') as HTMLSelectElement;
  const userEmail = document.querySelector('.user-email');
  
  if (!notAuthenticatedSection || !authenticatedSection || !loginBtn || !logoutBtn || 
      !bcLoginBtn || !bcConnected || !companySelect || !userEmail) {
    console.error('Required elements not found');
    return;
  }
  
  // Initialize connection to background script
  const port: Port = chrome.runtime.connect({ name: 'frootful-popup' });
  
  // Handle Business Central authentication
  bcLoginBtn.addEventListener('click', async () => {
    try {
      bcLoginBtn.disabled = true;
      bcLoginBtn.textContent = 'Connecting...';
      
      const token = await authenticateBusinessCentral();
      
      // Store the token and fetch companies ONLY after successful authentication
      chrome.storage.local.set({ bcAccessToken: token }, async () => {
        try {
          await loadCompanies(token);
          bcLoginBtn.classList.add('hidden');
          bcConnected.classList.remove('hidden');
        } catch (error) {
          console.error('Error loading companies:', error);
          showError('Connected but failed to load companies');
        }
      });
    } catch (error) {
      console.error('BC auth error:', error);
      showError('Failed to connect to Business Central');
    } finally {
      bcLoginBtn.disabled = false;
      bcLoginBtn.textContent = 'Connect to Business Central';
    }
  });

  // Handle company selection
  companySelect.addEventListener('change', async (e) => {
    const selectedCompanyId = (e.target as HTMLSelectElement).value;
    if (selectedCompanyId) {
      await setSelectedCompanyId(selectedCompanyId);
    }
  });

  // Load companies function - only called AFTER authentication
  async function loadCompanies(token: string): Promise<void> {
    try {
      companySelect.innerHTML = '<option value="">Loading companies...</option>';
      
      const companies = await fetchCompanies(token);
      const selectedCompanyId = await getSelectedCompanyId();
      
      companySelect.innerHTML = '<option value="">Select a company...</option>';
      
      companies.forEach((company: Company) => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = company.displayName || company.name;
        
        // Select the previously selected company or the first one as default
        if (company.id === selectedCompanyId || (!selectedCompanyId && companies.indexOf(company) === 0)) {
          option.selected = true;
          if (!selectedCompanyId) {
            setSelectedCompanyId(company.id);
          }
        }
        
        companySelect.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading companies:', error);
      companySelect.innerHTML = '<option value="">Failed to load companies</option>';
      throw error;
    }
  }
  
  // Check if already connected to BC - only try to load companies if we have a valid token
  chrome.storage.local.get(['bcAccessToken'], async (result) => {
    if (result.bcAccessToken) {
      try {
        // Test if the token is still valid by making a simple API call
        const testResponse = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies', {
          headers: {
            'Authorization': `Bearer ${result.bcAccessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (testResponse.ok) {
          await loadCompanies(result.bcAccessToken);
          bcLoginBtn.classList.add('hidden');
          bcConnected.classList.remove('hidden');
        } else {
          // Token is invalid, clear it and show login button
          chrome.storage.local.remove(['bcAccessToken', 'bcRefreshToken', 'bcTokenExpiry', 'selectedCompanyId']);
          bcLoginBtn.classList.remove('hidden');
          bcConnected.classList.add('hidden');
        }
      } catch (error) {
        console.error('Error validating BC token:', error);
        // Token might be expired, show login button
        bcLoginBtn.classList.remove('hidden');
        bcConnected.classList.add('hidden');
      }
    }
  });
  
  // Handle messages from background script
  port.onMessage.addListener((message: any) => {
    if (message.action === 'checkAuthState') {
      updateUI(message.isAuthenticated);
      
      if (message.isAuthenticated) {
        fetchUserInfo();
      }
    }
    
    if (message.action === 'authenticate') {
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
      } else {
        showError('Failed to authenticate. Please try again.');
      }
    }
    
    if (message.action === 'revokeAuthentication') {
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
        // Reset BC connection state
        bcLoginBtn.classList.remove('hidden');
        bcConnected.classList.add('hidden');
      } else {
        showError('Failed to sign out. Please try again.');
      }
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
  
  // Handle logout button click
  logoutBtn.addEventListener('click', () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Signing out...';
    
    port.postMessage({ action: 'revokeAuthentication' });
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
    
    // Remove after 3 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 3000);
  }
});