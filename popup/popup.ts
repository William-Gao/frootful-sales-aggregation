import { authenticateBusinessCentral, signOut, fetchCompanies, getSelectedCompanyId, setSelectedCompanyId, type Company } from '../src/businessCentralAuth.js';
import { hybridAuth } from '../src/hybridAuth.js';

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
  
  // Handle Google authentication using hybrid flow
  loginBtn.addEventListener('click', async () => {
    try {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Opening sign-in window...';
      
      const session = await hybridAuth.signInWithGoogle();
      
      updateUI(true);
      if (userEmail instanceof HTMLElement) {
        userEmail.textContent = session.user.email;
      }
      showSuccess('Successfully signed in with Google!');
    } catch (error) {
      console.error('Google auth error:', error);
      if (error instanceof Error && error.message.includes('popups')) {
        showError('Please allow popups for this extension to sign in');
      } else {
        showError('Failed to sign in with Google');
      }
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        Sign in with Google
      `;
    }
  });

  // Handle Business Central authentication
  bcLoginBtn.addEventListener('click', async () => {
    try {
      bcLoginBtn.disabled = true;
      bcLoginBtn.textContent = 'Connecting...';
      
      const token = await authenticateBusinessCentral();
      
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
        showError('Failed to connect to Business Central');
      }
    } finally {
      bcLoginBtn.disabled = false;
      bcLoginBtn.textContent = 'Connect to Business Central';
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
    try {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Signing out...';
      
      await hybridAuth.signOut();
      
      updateUI(false);
      // Reset BC connection state
      bcLoginBtn.classList.remove('hidden');
      bcConnected.classList.add('hidden');
      showSuccess('Successfully signed out!');
    } catch (error) {
      console.error('Logout error:', error);
      showError('Failed to sign out completely');
    } finally {
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
  
  // Check initial authentication state
  async function checkAuthState(): Promise<void> {
    try {
      const isAuthenticated = await hybridAuth.isAuthenticated();
      updateUI(isAuthenticated);
      
      if (isAuthenticated) {
        const user = await hybridAuth.getCurrentUser();
        if (user && userEmail instanceof HTMLElement) {
          userEmail.textContent = user.email;
        }
        
        // Check if Business Central is also connected
        try {
          const bcToken = await hybridAuth.getAccessToken();
          if (bcToken) {
            // Try to load companies to test BC connection
            const companies = await fetchCompanies(bcToken);
            if (companies.length > 0) {
              await loadCompanies(bcToken);
              bcLoginBtn.classList.add('hidden');
              bcConnected.classList.remove('hidden');
            }
          }
        } catch (error) {
          console.error('Error loading BC companies:', error);
          // BC not connected, show login button
          bcLoginBtn.classList.remove('hidden');
          bcConnected.classList.add('hidden');
        }
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
    if (isAuthenticated) {
      notAuthenticatedSection.classList.add('hidden');
      authenticatedSection.classList.remove('hidden');
    } else {
      notAuthenticatedSection.classList.remove('hidden');
      authenticatedSection.classList.add('hidden');
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
});