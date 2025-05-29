import { msalInstance, loginRequest } from './msalConfig';

export async function authenticateBusinessCentral(): Promise<string> {
  try {
    await msalInstance.initialize()
    console.log("Hello! Made it inside here")
    // Always force interactive login
    const response = await msalInstance.loginPopup({
      ...loginRequest,
      prompt: 'select_account' // Force account selection
    });
    
    if (response.account) {
      const tokenResponse = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account: response.account
      });
      return tokenResponse.accessToken;
    }
    throw new Error('Failed to get account after login');
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    await msalInstance.logoutPopup({
      account: accounts[0],
      postLogoutRedirectUri: chrome.identity.getRedirectURL()
    });
    // Clear session storage
    sessionStorage.clear();
  }
}