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

  let isAuthenticating = false;
  
  // Handle Google authentication - redirect to hosted login page
  loginBtn.addEventListener('click', async () => {
    if (isAuthenticating) {
      console.log('Authentication already in progress');
      return;
    }

    try {
      isAuthenticating = true;
      loginBtn.disabled = true;
      loginBtn.textContent = 'Opening login page...';
      
      console.log('Redirecting to hosted login page...');
      
      // Get extension ID for callback
      const extensionId = chrome.runtime.id;
      
      // Open the hosted login page in a new tab
      const loginUrl = `http://localhost:5173/login?extensionId=${extensionId}`;
      chrome.tabs.create({ url: loginUrl });
      
      // Close the popup
      window.close();
      
    } catch (error) {
      console.error('Login redirect error:', error);
      showError('Failed to open login page: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      isAuthenticating = false;
      loginBtn.disabled = false;
      loginBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        Sign In
      `;
    }
  });

  // Handle Business Central authentication
  bcLoginBtn.addEventListener('click', async () => {
    if (isAuthenticating) {
      console.log('Authentication already in progress');
      return;
    }

    try {
      isAuthenticating = true;
      bcLoginBtn.disabled = true;
      bcLoginBtn.textContent = 'Connecting...';
      
      console.log('Starting Business Central authentication...');
      
      // Clear any existing BC tokens to force fresh authentication
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove(['bc_tokens']);
        console.log('Cleared existing BC tokens to force fresh auth');
      }
      
      const token = await authenticateBusinessCentral();
      
      console.log('Business Central authentication successful, loading companies...');
      // Load companies after successful authentication
      await loadCompanies(token);
      bcLoginBtn.classList.add('hidden');
      bcConnected.classList.remove('hidden');
      showSuccess('Successfully connected to Business Central!');
    } catch (error) {
      console.error('BC auth error:', error);
      if (error instanceof Error && error.message.includes('sign in with Google')) {
        showError('Please sign in with Google first before connecting to Business Central');
      } else {
        showError('Failed to connect to Business Central: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    } finally {
      isAuthenticating = false;
      bcLoginBtn.disabled = false;
      bcLoginBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
        </svg>
        Connect to Business Central
      `;
    }
  });

  // Handle company selection
  companySelect.addEventListener('change', async (e) => {
    const selectedCompanyId = (e.target as HTMLSelectElement).value;
    if (selectedCompanyId) {
      try {
        await setSelectedCompanyId(selectedCompanyId);
        showSuccess('Company selected successfully!');
      } catch (error) {
        console.error('Error setting company:', error);
        showError('Failed to select company');
      }
    }
  });

  // Handle logout
  logoutBtn.addEventListener('click', async () => {
    if (isAuthenticating) {
      console.log('Authentication in progress, cannot logout');
      return;
    }

    try {
      isAuthenticating = true;
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Signing out...';
      
      console.log('Starting sign out process...');
      
      // Clear session from localStorage (SPA auth)
      await clearSPASession();
      
      // Also clear any extension-specific auth
      await signOut();
      
      console.log('Sign out successful, updating UI...');
      updateUI(false);
      // Reset BC connection state
      bcLoginBtn.classList.remove('hidden');
      bcConnected.classList.add('hidden');
      showSuccess('Successfully signed out!');
    } catch (error) {
      console.error('Logout error:', error);
      showError('Failed to sign out completely');
    } finally {
      isAuthenticating = false;
      logoutBtn.disabled = false;
      logoutBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        Sign out
      `;
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

  // Check Business Central connection status
  async function checkBusinessCentralConnection(): Promise<void> {
    try {
      console.log('Checking Business Central connection status...');
      
      // Check if we have stored BC tokens
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['bc_tokens']);
        if (result.bc_tokens) {
          const tokenData = JSON.parse(result.bc_tokens);
          
          // Check if token is still valid
          if (tokenData.expires_at && Date.now() < tokenData.expires_at) {
            console.log('Found valid Business Central token, testing connection...');
            
            try {
              const companies = await fetchCompanies(tokenData.access_token);
              if (companies.length > 0) {
                console.log('Business Central already connected, loading companies...');
                await loadCompanies(tokenData.access_token);
                bcLoginBtn.classList.add('hidden');
                bcConnected.classList.remove('hidden');
                return;
              }
            } catch (error) {
              console.log('Business Central token invalid or expired:', error);
              // Clear invalid token
              await chrome.storage.local.remove(['bc_tokens']);
            }
          } else {
            console.log('Business Central token expired, clearing...');
            await chrome.storage.local.remove(['bc_tokens']);
          }
        }
      }
      
      // BC not connected or token invalid
      console.log('Business Central not connected');
      bcLoginBtn.classList.remove('hidden');
      bcConnected.classList.add('hidden');
    } catch (error) {
      console.log('Error checking Business Central connection:', error);
      bcLoginBtn.classList.remove('hidden');
      bcConnected.classList.add('hidden');
    }
  }

  // Check SPA authentication state
  async function checkSPAAuthState(): Promise<{ isAuthenticated: boolean; user?: any }> {
    try {
      // Check if we have session data stored by the SPA
      const result = await chrome.storage.local.get(['frootful_session', 'frootful_user']);
      
      if (result.frootful_session && result.frootful_user) {
        const session = JSON.parse(result.frootful_session);
        const user = JSON.parse(result.frootful_user);
        
        // Check if session is expired
        if (session.expires_at && Date.now() / 1000 > session.expires_at) {
          console.log('SPA session expired');
          await clearSPASession();
          return { isAuthenticated: false };
        }
        
        console.log('Found valid SPA session for user:', user.email);
        return { isAuthenticated: true, user };
      }
      
      console.log('No SPA session found');
      return { isAuthenticated: false };
    } catch (error) {
      console.error('Error checking SPA auth state:', error);
      return { isAuthenticated: false };
    }
  }

  // Clear SPA session
  async function clearSPASession(): Promise<void> {
    try {
      await chrome.storage.local.remove(['frootful_session', 'frootful_user']);
      console.log('Cleared SPA session');
    } catch (error) {
      console.error('Error clearing SPA session:', error);
    }
  }
  
  // Check initial authentication state
  async function checkAuthState(): Promise<void> {
    try {
      console.log('Checking initial authentication state...');
      const { isAuthenticated, user } = await checkSPAAuthState();
      console.log('Authentication state:', isAuthenticated);
      
      updateUI(isAuthenticated);
      
      if (isAuthenticated && user) {
        if (userEmail instanceof HTMLElement) {
          userEmail.textContent = user.email;
        }
        
        // Check if Business Central is also connected
        await checkBusinessCentralConnection();
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      updateUI(false);
    }
  }
  
  // Initialize auth state check
  checkAuthState();
  
  // Update UI based on authentication state
  function updateUI(isAuthenticated: boolean): void {
    console.log('Updating UI, authenticated:', isAuthenticated);
    if (isAuthenticated) {
      notAuthenticatedSection.classList.add('hidden');
      authenticatedSection.classList.remove('hidden');
    } else {
      notAuthenticatedSection.classList.remove('hidden');
      authenticatedSection.classList.add('hidden');
      // Reset BC state when not authenticated
      bcLoginBtn.classList.remove('hidden');
      bcConnected.classList.add('hidden');
    }
  }
  
  // Show success message
  function showSuccess(message: string): void {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.backgroundColor = '#DEF7EC';
    successDiv.style.color = '#03543F';
    successDiv.style.padding = '12px';
    successDiv.style.borderRadius = '6px';
    successDiv.style.marginBottom = '16px';
    successDiv.style.fontSize = '14px';
    successDiv.textContent = message;
    
    const content = document.querySelector('.content');
    if (content) {
      content.prepend(successDiv);
    }
    
    // Remove after 3 seconds
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
    errorDiv.style.fontSize = '14px';
    errorDiv.textContent = message;
    
    const content = document.querySelector('.content');
    if (content) {
      content.prepend(errorDiv);
    }
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  // Listen for auth state changes from other parts of the extension
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Popup received message:', message);
      
      if (message.action === 'authStateChanged') {
        console.log('Received auth state change:', message.isAuthenticated);
        updateUI(message.isAuthenticated);
        if (message.isAuthenticated && message.user) {
          if (userEmail instanceof HTMLElement) {
            userEmail.textContent = message.user.email;
          }
        }
      }
      
      if (message.action === 'authComplete') {
        console.log('Received auth complete message');
        
        // Store session data from SPA
        if (message.session) {
          chrome.storage.local.set({
            frootful_session: JSON.stringify(message.session),
            frootful_user: JSON.stringify(message.session.user)
          });
        }
        
        updateUI(true);
        if (message.session?.user && userEmail instanceof HTMLElement) {
          userEmail.textContent = message.session.user.email;
        }
        checkBusinessCentralConnection();
      }
    });
  }
});