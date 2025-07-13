import { supabaseClient } from "../src/supabaseClient.js";

interface Port {
  postMessage: (message: any) => void;
  onMessage: {
    addListener: (callback: (message: any) => void) => void;
  };
}

interface Company {
  id: string;
  name: string;
  displayName: string;
  businessProfileId: string;
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
      chrome.tabs.create({ url: loginUrl, active: true });
      
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

  // Handle Business Central authentication - redirect to dashboard
  bcLoginBtn.addEventListener('click', async () => {
    if (isAuthenticating) {
      console.log('Authentication already in progress');
      return;
    }

    try {
      isAuthenticating = true;
      bcLoginBtn.disabled = true;
      bcLoginBtn.textContent = 'Opening dashboard...';
      
      console.log('Redirecting to dashboard for Business Central connection...');
      
      // Open the dashboard in a new tab
      chrome.tabs.create({ url: 'https://use.frootful.ai/dashboard', active: true });
      
      // Close the popup
      window.close();
      
    } catch (error) {
      console.error('Dashboard redirect error:', error);
      showError('Failed to open dashboard: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
        // Update company selection via API
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            companyName: companySelect.options[companySelect.selectedIndex].text
          })
        });

        if (response.ok) {
          showSuccess('Company selected successfully!');
        } else {
          throw new Error('Failed to update company selection');
        }
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
      
      // Sign out from Supabase - this is our single source of truth
      await supabaseClient.auth.signOut();
      localStorage.clear();
      // Clear chrome storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove([
          'session', 
          'bc_tokens'
        ]);
        console.log('Cleared all session data from chrome.storage');
      }
      
      // Send sign out message to background script
      try {
        chrome.runtime.sendMessage({
          action: 'signOut'
        });
        console.log('Notified background script about sign out');
      } catch (error) {
        console.warn('Could not notify background script:', error);
      }
      
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

  // Load companies function - now loads from database
  async function loadCompanies(): Promise<void> {
    try {
      companySelect.innerHTML = '<option value="">Loading companies...</option>';
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get Business Central token and company info from database
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get Business Central token');
      }

      const result = await response.json();
      if (!result.success || !result.tokens || result.tokens.length === 0) {
        throw new Error('No Business Central token found');
      }

      const bcToken = result.tokens[0];
      
      // Fetch companies from Business Central API
      const companiesResponse = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies', {
        headers: {
          'Authorization': `Bearer ${bcToken.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!companiesResponse.ok) {
        throw new Error('Failed to fetch companies');
      }

      const companiesData = await companiesResponse.json();
      const companies = companiesData.value || [];
      
      companySelect.innerHTML = '<option value="">Select a company...</option>';
      
      companies.forEach((company: Company) => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = company.displayName || company.name;
        
        // Select the currently selected company
        if (company.id === bcToken.company_id) {
          option.selected = true;
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
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.log('No Supabase session, BC not connected');
        bcLoginBtn.classList.remove('hidden');
        bcConnected.classList.add('hidden');
        return;
      }

      // Check if we have Business Central tokens in database
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.tokens && result.tokens.length > 0) {
          const bcToken = result.tokens[0];
          
          // Check if token is still valid
          if (!bcToken.token_expires_at || new Date(bcToken.token_expires_at) > new Date()) {
            console.log('Business Central connected, loading companies...');
            await loadCompanies();
            bcLoginBtn.classList.add('hidden');
            bcConnected.classList.remove('hidden');
            return;
          } else {
            console.log('Business Central token expired');
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

  // Check SPA authentication state using Supabase as single source of truth
  async function checkSPAAuthState(): Promise<{ isAuthenticated: boolean; user?: any }> {
    try {
      // Check Supabase session - this is our single source of truth
      let { data: { session }, error } = await supabaseClient.auth.getSession();

      if (!session) {
        console.log('No supabase session detected, checking chrome storage');
        const storedSession = await chrome.storage.local.get('session');
        if (storedSession.session) {
          await supabaseClient.auth.setSession(storedSession.session);
          console.log("Found session in chrome storage, ✅ Supabase session hydrated");
          // Get the session again after setting it
          const { data: { session: newSession } } = await supabaseClient.auth.getSession();
          session = newSession;
        } else {
          console.warn("⚠️ No session found in chrome.storage.local or supabase. Unauthenticated");
          return { isAuthenticated: false };
        }
      } else {
        console.log('Found a session from supabase getSession() method: ', session);
      }
      
      return { isAuthenticated: true, user: session?.user };
    } catch (error) {
      console.error('Error checking SPA auth state:', error);
      return { isAuthenticated: false };
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
  console.log('About to start checking Auth state');
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
        } else {
          // Clear user info on sign out
          if (userEmail instanceof HTMLElement) {
            userEmail.textContent = 'user@example.com';
          }
          // Reset BC connection state
          bcLoginBtn.classList.remove('hidden');
          bcConnected.classList.add('hidden');
        }
      }
      
      if (message.action === 'authComplete') {
        console.log('Received auth complete message');
        console.log('updating UI with isAuthenticated to true now');
        updateUI(true);
        console.log('Finished the updateUI method');
        if (message.session?.user && userEmail instanceof HTMLElement) {
          userEmail.textContent = message.session.user.email;
        }
        checkBusinessCentralConnection();
      }
    });
  }
});