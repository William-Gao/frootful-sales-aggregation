// Token Manager for secure backend storage
// This module handles all token operations through Supabase Edge Functions

import { supabaseClient } from './supabaseClient.js';

export interface ProviderTokenData {
  provider: 'google' | 'business_central';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tenantId?: string;
  companyId?: string;
  companyName?: string;
}

export interface StoredToken {
  id: string;
  provider: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
  tenant_id?: string;
  company_id?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
}

// This is for Provider Tokens
class ProviderTokenManager {
  private async getAuthToken(): Promise<string> {
    // First try to get token from Supabase session
    try {
      console.log('Trying to get supabase session in getAuthToken()');
      const supabase = await supabaseClient;
      console.log('Got supabase client in getAuthToken()');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('This is the session in getAuthToken() method in TokenManager: ', session);
      if (session?.access_token) {
        return session.access_token;
      }
    } catch (error) {
      console.warn('Failed to get Supabase session:', error);
    }

    // Fallback to Google OAuth token for Chrome extension
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.identity) {
        reject(new Error('Chrome Identity API not available'));
        return;
      }

      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error('User not authenticated'));
          return;
        }
        console.log('Got Chrome identity token as fallback');
        resolve(token);
      });
    });
  }

  async storeTokens(tokenData: ProviderTokenData): Promise<void> {
    try {
      // For Google tokens, we'll store them locally and in Supabase if authenticated
      if (tokenData.provider === 'google') {
        // Store Google token locally for immediate access
        if (typeof chrome !== 'undefined' && chrome.storage) {
          await chrome.storage.local.set({
            googleAccessToken: tokenData.accessToken,
            googleTokenExpiry: tokenData.expiresAt
          });
        }
      }

      // Try to store in Supabase backend if we have a session
      try {
        const supabaseAuthToken = await this.getAuthToken();
        console.log('This is auth Token within storeTokens method trying to store in backend: ', supabaseAuthToken);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAuthToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(tokenData)
        });

        if (!response.ok) {
          console.warn('Failed to store tokens in backend, using local storage');
        } else {
          console.log('Successfully stored tokens in backend');
        }
      } catch (error) {
        console.warn('Backend storage failed, using local storage:', error);
        // Store locally as fallback
        if (typeof chrome !== 'undefined' && chrome.storage) {
          await chrome.storage.local.set({
            [`${tokenData.provider}_token`]: JSON.stringify(tokenData)
          });
        }
      }
    } catch (error) {
      console.error('Error storing tokens:', error);
      throw error;
    }
  }

  async getTokens(provider?: 'google' | 'business_central'): Promise<StoredToken[]> {
    try {
      // Try backend first
      try {
        const authToken = await this.getAuthToken();
        
        const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`);
        if (provider) {
          url.searchParams.set('provider', provider);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            return result.tokens || [];
          }
        }
      } catch (error) {
        console.warn('Backend retrieval failed, using local storage:', error);
      }

      // Fallback to local storage
      const tokens: StoredToken[] = [];
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (!provider || provider === 'google') {
          const result = await chrome.storage.local.get(['googleAccessToken', 'googleTokenExpiry']);
          
          if (result.googleAccessToken) {
            tokens.push({
              id: 'google-local',
              provider: 'google',
              access_token: result.googleAccessToken,
              token_expires_at: result.googleTokenExpiry,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        }

        if (!provider || provider === 'business_central') {
          const result = await chrome.storage.local.get(['business_central_token']);
          
          if (result.business_central_token) {
            const tokenData = JSON.parse(result.business_central_token);
            tokens.push({
              id: 'bc-local',
              provider: 'business_central',
              access_token: tokenData.accessToken,
              refresh_token: tokenData.refreshToken,
              token_expires_at: tokenData.expiresAt,
              tenant_id: tokenData.tenantId,
              company_id: tokenData.companyId,
              company_name: tokenData.companyName,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        }
      }

      return tokens;
    } catch (error) {
      console.error('Error retrieving tokens:', error);
      throw error;
    }
  }

  async updateTokens(provider: 'google' | 'business_central', updateData: Partial<ProviderTokenData>): Promise<void> {
    try {
      // Try backend first
      try {
        const authToken = await this.getAuthToken();
        
        const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`);
        url.searchParams.set('provider', provider);

        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            console.log('Successfully updated tokens in backend');
            return;
          }
        }
      } catch (error) {
        console.warn('Backend update failed, using local storage:', error);
      }

      // Fallback to local storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (provider === 'google') {
          const updates: any = {};
          if (updateData.accessToken) updates.googleAccessToken = updateData.accessToken;
          if (updateData.expiresAt) updates.googleTokenExpiry = updateData.expiresAt;
          await chrome.storage.local.set(updates);
        } else if (provider === 'business_central') {
          const existing = await chrome.storage.local.get(['business_central_token']);
          const tokenData = existing.business_central_token ? JSON.parse(existing.business_central_token) : {};
          
          Object.assign(tokenData, updateData);
          await chrome.storage.local.set({
            business_central_token: JSON.stringify(tokenData)
          });
        }
      }
    } catch (error) {
      console.error('Error updating tokens:', error);
      throw error;
    }
  }

  async deleteTokens(provider?: 'google' | 'business_central'): Promise<void> {
    try {
      // Try backend first
      try {
        const authToken = await this.getAuthToken();
        
        const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`);
        if (provider) {
          url.searchParams.set('provider', provider);
        }

        const response = await fetch(url.toString(), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            console.log('Successfully deleted tokens from backend');
            // Also clear local storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
              if (!provider || provider === 'google') {
                await chrome.storage.local.remove(['googleAccessToken', 'googleTokenExpiry']);
              }
              if (!provider || provider === 'business_central') {
                await chrome.storage.local.remove(['business_central_token']);
              }
            }
            return;
          }
        }
      } catch (error) {
        console.warn('Backend deletion failed, clearing local storage:', error);
      }

      // Fallback to local storage cleanup
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (!provider) {
          await chrome.storage.local.clear();
        } else if (provider === 'google') {
          await chrome.storage.local.remove(['googleAccessToken', 'googleTokenExpiry']);
        } else if (provider === 'business_central') {
          await chrome.storage.local.remove(['business_central_token']);
        }
      }
    } catch (error) {
      console.error('Error deleting tokens:', error);
      throw error;
    }
  }

  // Helper methods for specific token operations
  async getBusinessCentralToken(): Promise<StoredToken | null> {
    try {
      const tokens = await this.getTokens('business_central');
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not authenticated')) {
        return null; // User not logged in, return null instead of throwing
      }
      throw error;
    }
  }

  async getGoogleToken(): Promise<StoredToken | null> {
    try {
      const tokens = await this.getTokens('google');
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not authenticated')) {
        return null; // User not logged in, return null instead of throwing
      }
      throw error;
    }
  }

  async isTokenValid(token: StoredToken): Promise<boolean> {
    if (!token.token_expires_at) return true; // No expiry set
    return new Date(token.token_expires_at) > new Date();
  }

  async isUserAuthenticated(): Promise<boolean> {
    try {
      // Check if we have a valid Google token
      const googleToken = await this.getGoogleToken();
      if (googleToken && await this.isTokenValid(googleToken)) {
        return true;
      }

      // Check Supabase session
      try {
        const supabase = await supabaseClient;
        const { data: { session } } = await supabase.auth.getSession();
        return session !== null;
      } catch (error) {
        console.warn('Supabase session check failed:', error);
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async refreshBusinessCentralToken(): Promise<string> {
    const tokenData = await this.getBusinessCentralToken();
    if (!tokenData?.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Implement token refresh logic here
    // This would call the Business Central token refresh endpoint
    // and update the stored tokens
    
    throw new Error('Token refresh not implemented yet');
  }
}

export const providerTokenManager = new ProviderTokenManager();