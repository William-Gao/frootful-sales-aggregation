// Token Manager for secure backend storage
// This module handles all token operations through Supabase Edge Functions

export interface TokenData {
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

class TokenManager {
  private supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  private supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  private async getAuthToken(): Promise<string> {
    // For Chrome extension, we'll use the Google OAuth token
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error('User not authenticated with Google'));
          return;
        }
        resolve(token);
      });
    });
  }

  private async authenticateUser(): Promise<string> {
    // Try to get existing token first
    try {
      return await this.getAuthToken();
    } catch (error) {
      // If no token exists, prompt for interactive authentication
      return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError || !token) {
            reject(new Error('Failed to authenticate user'));
            return;
          }
          resolve(token);
        });
      });
    }
  }

  async storeTokens(tokenData: TokenData): Promise<void> {
    try {
      const authToken = await this.authenticateUser();
      
      const response = await fetch(`${this.supabaseUrl}/functions/v1/token-manager`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tokenData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to store tokens: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to store tokens');
      }
    } catch (error) {
      console.error('Error storing tokens:', error);
      throw error;
    }
  }

  async getTokens(provider?: 'google' | 'business_central'): Promise<StoredToken[]> {
    try {
      const authToken = await this.getAuthToken();
      
      const url = new URL(`${this.supabaseUrl}/functions/v1/token-manager`);
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

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('User not authenticated');
        }
        const errorText = await response.text();
        throw new Error(`Failed to retrieve tokens: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to retrieve tokens');
      }

      return result.tokens || [];
    } catch (error) {
      console.error('Error retrieving tokens:', error);
      throw error;
    }
  }

  async updateTokens(provider: 'google' | 'business_central', updateData: Partial<TokenData>): Promise<void> {
    try {
      const authToken = await this.getAuthToken();
      
      const url = new URL(`${this.supabaseUrl}/functions/v1/token-manager`);
      url.searchParams.set('provider', provider);

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update tokens: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to update tokens');
      }
    } catch (error) {
      console.error('Error updating tokens:', error);
      throw error;
    }
  }

  async deleteTokens(provider?: 'google' | 'business_central'): Promise<void> {
    try {
      const authToken = await this.getAuthToken();
      
      const url = new URL(`${this.supabaseUrl}/functions/v1/token-manager`);
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete tokens: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete tokens');
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
      await this.getAuthToken();
      return true;
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

export const tokenManager = new TokenManager();