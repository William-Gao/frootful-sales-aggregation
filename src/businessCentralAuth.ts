const CLIENT_ID = '4c92a998-6af5-4c2a-b16e-80ba1c6b9b3b';
const TENANT_ID = 'common';
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPE = 'https://api.businesscentral.dynamics.com/user_impersonation offline_access';

export async function authenticateBusinessCentral(): Promise<string> {
  try {
    // Check if we have a valid token
    const { bcAccessToken, bcTokenExpiry, bcRefreshToken } = await chrome.storage.local.get([
      'bcAccessToken',
      'bcTokenExpiry',
      'bcRefreshToken'
    ]);

    // If we have a valid token, return it
    if (bcAccessToken && bcTokenExpiry && Date.now() < bcTokenExpiry) {
      return bcAccessToken;
    }

    // If we have a refresh token, try to refresh
    if (bcRefreshToken) {
      try {
        return await refreshToken(bcRefreshToken);
      } catch (error) {
        console.error('Token refresh failed:', error);
        // If refresh fails, proceed with new authentication
      }
    }

    // Generate random state and code verifier for PKCE
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Construct auth URL
    const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
      `client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&state=${state}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256` +
      `&prompt=select_account`;

    // Launch auth flow
    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    // Extract code from redirect URL
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    if (!code || returnedState !== state) {
      throw new Error('Invalid auth response');
    }

    // Exchange code for token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier
      })
    });

    const tokens = await tokenResponse.json();
    
    if (!tokens.access_token) {
      throw new Error('Failed to get access token');
    }

    // Store tokens and expiry
    await chrome.storage.local.set({ 
      bcAccessToken: tokens.access_token,
      bcRefreshToken: tokens.refresh_token,
      bcTokenExpiry: Date.now() + (tokens.expires_in * 1000)
    });

    return tokens.access_token;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

async function refreshToken(refreshToken: string): Promise<string> {
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPE
    })
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const tokens = await response.json();

  // Store new tokens and expiry
  await chrome.storage.local.set({
    bcAccessToken: tokens.access_token,
    bcRefreshToken: tokens.refresh_token,
    bcTokenExpiry: Date.now() + (tokens.expires_in * 1000)
  });

  return tokens.access_token;
}

export async function signOut(): Promise<void> {
  await chrome.storage.local.remove(['bcAccessToken', 'bcRefreshToken', 'bcTokenExpiry']);
  
  // Clear session storage
  sessionStorage.clear();
  
  // Redirect to logout URL
  const logoutUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout?` +
    `client_id=${CLIENT_ID}` +
    `&post_logout_redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    
  await chrome.identity.launchWebAuthFlow({
    url: logoutUrl,
    interactive: false
  });
}

// Helper functions for PKCE
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}