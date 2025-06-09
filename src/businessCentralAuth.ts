import { supabaseClient } from './supabaseClient.js';
import { providerTokenManager } from './tokenManager.js';

const CLIENT_ID = '4c92a998-6af5-4c2a-b16e-80ba1c6b9b3b';
const TENANT_ID = 'common';
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPE = 'https://api.businesscentral.dynamics.com/user_impersonation offline_access';

export interface Company {
  id: string;
  name: string;
  displayName: string;
  businessProfileId: string;
}

export async function authenticateBusinessCentral(): Promise<string> {
  try {
    // First check if user is authenticated with Google using Supabase
    const supabase = await supabaseClient;
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (!session || error) {
      throw new Error('Please sign in with Google first before connecting to Business Central');
    }

    console.log('Google authentication verified via Supabase session');

    // Check if we have a valid Business Central token stored
    const storedToken = await getBusinessCentralToken();
    if (storedToken && await isTokenValid(storedToken)) {
      return storedToken.access_token;
    }

    // If we have a refresh token, try to refresh
    if (storedToken?.refresh_token) {
      try {
        return await refreshToken(storedToken.refresh_token);
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

    // Parse and store tenant ID from the token
    const tenantId = await parseTenantIdFromToken(tokens.access_token);
    
    // Store tokens securely in local storage
    await storeBusinessCentralTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      tenant_id: tenantId
    });

    // Also store in backend using token manager
    try {
      await providerTokenManager.storeTokens({
        provider: 'business_central',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
        tenantId: tenantId
      });
      console.log('Successfully stored Business Central tokens in backend');
    } catch (backendError) {
      console.warn('Failed to store tokens in backend, using local storage only:', backendError);
    }

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

  // Parse and store tenant ID from the refreshed token
  const tenantId = await parseTenantIdFromToken(tokens.access_token);

  // Update stored tokens locally
  await storeBusinessCentralTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    tenant_id: tenantId
  });

  // Update tokens in backend
  try {
    await providerTokenManager.updateTokens('business_central', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      tenantId: tenantId
    });
    console.log('Successfully updated Business Central tokens in backend');
  } catch (backendError) {
    console.warn('Failed to update tokens in backend:', backendError);
  }

  return tokens.access_token;
}

// Parse tenant ID from JWT token
async function parseTenantIdFromToken(token: string): Promise<string> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const tokenData = JSON.parse(decodedPayload);
    
    const tenantId = tokenData.tid;
    if (!tenantId) {
      throw new Error('Tenant ID not found in token');
    }
    
    return tenantId;
  } catch (error) {
    console.error('Error parsing tenant ID from token:', error);
    throw new Error('Failed to parse tenant ID from token');
  }
}

// Store Business Central tokens locally
async function storeBusinessCentralTokens(tokenData: any): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.set({
      bc_tokens: JSON.stringify(tokenData)
    });
  }
}

// Get stored Business Central tokens
async function getBusinessCentralToken(): Promise<any> {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const result = await chrome.storage.local.get(['bc_tokens']);
    return result.bc_tokens ? JSON.parse(result.bc_tokens) : null;
  }
  return null;
}

// Check if token is valid
async function isTokenValid(tokenData: any): Promise<boolean> {
  if (!tokenData.expires_at) return true;
  return Date.now() < tokenData.expires_at;
}

export async function getTenantId(): Promise<string> {
  const tokenData = await getBusinessCentralToken();
  if (!tokenData?.tenant_id) {
    throw new Error('Tenant ID not found. Please re-authenticate with Business Central.');
  }
  return tokenData.tenant_id;
}

export async function fetchCompanies(token: string): Promise<Company[]> {
  try {
    const response = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch companies');
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
}

export async function getSelectedCompanyId(): Promise<string> {
  const tokenData = await getBusinessCentralToken();
  return tokenData?.company_id || '45dbc5d1-5408-f011-9af6-6045bde9c6b1'; // fallback
}

export async function getSelectedCompanyName(): Promise<string> {
  const tokenData = await getBusinessCentralToken();
  return tokenData?.company_name || 'My Company'; // fallback
}

export async function setSelectedCompanyId(companyId: string): Promise<void> {
  try {
    const token = await authenticateBusinessCentral();
    const companies = await fetchCompanies(token);
    const selectedCompany = companies.find(c => c.id === companyId);
    
    const tokenData = await getBusinessCentralToken();
    if (tokenData) {
      tokenData.company_id = companyId;
      tokenData.company_name = selectedCompany?.displayName || selectedCompany?.name || 'My Company';
      await storeBusinessCentralTokens(tokenData);

      // Update in backend too
      try {
        await providerTokenManager.updateTokens('business_central', {
          companyId: companyId,
          companyName: selectedCompany?.displayName || selectedCompany?.name || 'My Company'
        });
        console.log('Successfully updated company info in backend');
      } catch (backendError) {
        console.warn('Failed to update company info in backend:', backendError);
      }
    }
  } catch (error) {
    console.error('Error setting company info:', error);
    throw error;
  }
}

export async function signOut(): Promise<void> {
  // Clear local storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.remove(['bc_tokens']);
  }

  // Clear from backend
  try {
    await providerTokenManager.deleteTokens('business_central');
    console.log('Successfully cleared Business Central tokens from backend');
  } catch (error) {
    console.warn('Failed to clear Business Central tokens from backend:', error);
  }
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

export async function fetchCustomers(token: string): Promise<any[]> {
  try {
    const companyId = await getSelectedCompanyId();
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch customers');
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
}

export async function fetchItems(token: string): Promise<any[]> {
  try {
    const companyId = await getSelectedCompanyId();
    const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/items`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch items');
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching items:', error);
    throw error;
  }
}

export async function analyzeEmailContent(emailBody: string, items: any[]): Promise<any[]> {
  try {
    const response = await fetch('https://zkglvdfppodwlgzhfgqs.supabase.co/functions/v1/analyze-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ 
        emailContent: emailBody,
        items: items
      })
    });

    if (!response.ok) {
      throw new Error('Failed to analyze email content');
    }

    const data = await response.json();
    return data.analysis || [];
  } catch (error) {
    console.error('Error analyzing email:', error);
    throw error;
  }
}