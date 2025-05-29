import { msalInstance, loginRequest } from './msalConfig';

export async function authenticateBusinessCentral(): Promise<string> {
  try {
    const accounts = msalInstance.getAllAccounts();
    
    if (accounts.length > 0) {
      const silentRequest = {
        ...loginRequest,
        account: accounts[0]
      };
      
      try {
        const response = await msalInstance.acquireTokenSilent(silentRequest);
        return response.accessToken;
      } catch (error) {
        // Silent token acquisition failed, fall back to interactive
        const response = await msalInstance.acquireTokenPopup(loginRequest);
        return response.accessToken;
      }
    } else {
      const response = await msalInstance.loginPopup(loginRequest);
      if (response.account) {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: response.account
        });
        return tokenResponse.accessToken;
      }
      throw new Error('Failed to get account after login');
    }
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    await msalInstance.logoutPopup({
      account: accounts[0]
    });
  }
}