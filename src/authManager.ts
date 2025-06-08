import { supabase } from './supabaseClient.js';
import { tokenManager } from './tokenManager.js';

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

class AuthManager {
  private currentUser: GoogleUser | null = null;

  async signInWithGoogle(): Promise<GoogleUser> {
    try {
      // Use Chrome Identity API to get Google OAuth token
      const googleToken = await this.getGoogleToken();
      
      // Get user info from Google
      const userInfo = await this.getGoogleUserInfo(googleToken);
      
      // Sign in to Supabase with the Google token
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: googleToken,
        access_token: googleToken
      });

      if (error) {
        console.error('Supabase auth error:', error);
        // If Supabase auth fails, we can still proceed with Google-only auth
        // Store the Google token for API access
        await tokenManager.storeTokens({
          provider: 'google',
          accessToken: googleToken
        });
        
        this.currentUser = userInfo;
        return userInfo;
      }

      // Store both Supabase session and Google token
      if (data.session) {
        await tokenManager.storeTokens({
          provider: 'google',
          accessToken: googleToken
        });
      }

      this.currentUser = userInfo;
      return userInfo;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw new Error('Failed to sign in with Google');
    }
  }

  private async getGoogleToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error('Failed to get Google token'));
          return;
        }
        resolve(token);
      });
    });
  }

  private async getGoogleUserInfo(token: string): Promise<GoogleUser> {
    const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`);
    
    if (!response.ok) {
      throw new Error('Failed to get user info from Google');
    }

    const userInfo = await response.json();
    
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture
    };
  }

  async signOut(): Promise<void> {
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Revoke Google token
      const googleToken = await tokenManager.getGoogleToken();
      if (googleToken) {
        chrome.identity.removeCachedAuthToken({ token: googleToken.access_token }, () => {
          // Token removed from cache
        });
        
        // Revoke token with Google
        try {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${googleToken.access_token}`);
        } catch (error) {
          console.error('Error revoking Google token:', error);
        }
      }
      
      // Clear all stored tokens
      await tokenManager.deleteTokens();
      
      this.currentUser = null;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<GoogleUser | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      // Check if we have a valid Google token
      const googleToken = await tokenManager.getGoogleToken();
      if (googleToken && await tokenManager.isTokenValid(googleToken)) {
        // Get user info from Google
        this.currentUser = await this.getGoogleUserInfo(googleToken.access_token);
        return this.currentUser;
      }

      // Check Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.currentUser = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.email || '',
          picture: session.user.user_metadata?.avatar_url
        };
        return this.currentUser;
      }

      return null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  // Get Supabase session for backend API calls
  async getSupabaseSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  // Get Google token for Gmail API calls
  async getGoogleAccessToken(): Promise<string | null> {
    try {
      const tokenData = await tokenManager.getGoogleToken();
      return tokenData?.access_token || null;
    } catch (error) {
      console.error('Error getting Google access token:', error);
      return null;
    }
  }
}

export const authManager = new AuthManager();