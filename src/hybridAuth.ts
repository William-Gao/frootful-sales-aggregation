// Universal Authentication Manager for Chrome Extension
// Works in background scripts, content scripts, and popup scripts

import { supabaseClient } from './supabaseClient.js';
import { providerTokenManager } from './tokenManager.js';

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: any;
  provider_token: string;
  provider_refresh_token: string;
}

interface AuthMessage {
  action: 'authComplete';
  session: AuthSession;
}

interface AuthSuccessHandler {
  (session: AuthSession): void;
}

interface AuthErrorHandler {
  (error: string): void;
}

declare global {
  interface Window {
    frootfulAuthSuccess?: AuthSuccessHandler;
    frootfulAuthError?: AuthErrorHandler;
  }
}

class HybridAuthManager {
  private static instance: HybridAuthManager;
  private currentSession: AuthSession | null = null;
  private supabase: any = null;

  static getInstance(): HybridAuthManager {
    if (!HybridAuthManager.instance) {
      HybridAuthManager.instance = new HybridAuthManager();
    }
    return HybridAuthManager.instance;
  }

  constructor() {
    console.log('HybridAuthManager constructor called');
    this.initializeSupabase();
  }

  private async initializeSupabase() {
    try {
      this.supabase = supabaseClient;
      console.log('Supabase initialized in HybridAuthManager');
    } catch (error) {
      console.error('Failed to initialize Supabase in HybridAuthManager:', error);
    }
  }

  // Environment detection methods
  canUseWindowAuth(): boolean {
    return typeof window !== 'undefined' && typeof window.open === 'function';
  }

  canUseChromeIdentity(): boolean {
    return typeof chrome !== 'undefined' && 
           chrome.identity && 
           typeof chrome.identity.getAuthToken === 'function';
  }

  getAvailableAuthMethods(): string[] {
    const methods: string[] = [];
    if (this.canUseWindowAuth()) methods.push('window');
    if (this.canUseChromeIdentity()) methods.push('chrome-identity');
    return methods;
  }

  // Main sign-in method - automatically chooses best available method
  async signInWithGoogle(): Promise<AuthSession> {
    console.log('Available auth methods:', this.getAvailableAuthMethods());
    
    if (this.canUseWindowAuth()) {
      console.log('Using window-based authentication');
      return this.signInWithGoogleWindow();
    } else if (this.canUseChromeIdentity()) {
      console.log('Using Chrome Identity API authentication');
      return this.signInWithChromeIdentity();
    } else {
      throw new Error('No authentication method available in this environment');
    }
  }

  // Chrome Identity API method (for background scripts)
  async signInWithChromeIdentity(): Promise<AuthSession> {
    return new Promise<AuthSession>((resolve, reject) => {
      if (!this.canUseChromeIdentity()) {
        reject(new Error('Chrome Identity API not available'));
        return;
      }

      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!token) {
          reject(new Error('Failed to get auth token'));
          return;
        }

        try {
          // Get user info from Google
          const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!userResponse.ok) {
            throw new Error('Failed to get user info');
          }

          const userInfo = await userResponse.json();

          // Create session object
          const session: AuthSession = {
            access_token: token,
            user: {
              id: userInfo.id,
              email: userInfo.email,
              user_metadata: {
                full_name: userInfo.name,
                avatar_url: userInfo.picture
              }
            },
            provider_token: token,
            provider_refresh_token: ''
          };

          // Store session and tokens
          await this.handleAuthSuccess(session);
          resolve(session);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Window-based authentication (for content scripts/popups)
  async signInWithGoogleWindow(): Promise<AuthSession> {
    return new Promise<AuthSession>((resolve, reject) => {
      try {
        const loginUrl = 'http://localhost:5173/auth/login.html';
        
        console.log('Opening auth window:', loginUrl);
        
        const authWindow = window.open(
          loginUrl,
          '_blank',
          'width=500,height=600,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
        );

        if (!authWindow) {
          reject(new Error('Failed to open authentication window. Please allow popups for this site.'));
          return;
        }

        // Set up success handler
        const successHandler: AuthSuccessHandler = async (session: AuthSession) => {
          try {
            await this.handleAuthSuccess(session);
            resolve(session);
          } catch (error) {
            console.error('Error during auth completion:', error);
            resolve(session); // Still resolve even if backend storage fails
          } finally {
            this.cleanup();
          }
        };

        // Set up error handler
        const errorHandler: AuthErrorHandler = (error: string) => {
          reject(new Error(error));
          this.cleanup();
        };

        // Store handlers for callback
        window.frootfulAuthSuccess = successHandler;
        window.frootfulAuthError = errorHandler;

        // Check if window was closed manually
        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            reject(new Error('Authentication window was closed'));
            this.cleanup();
          }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
          if (authWindow && !authWindow.closed) {
            authWindow.close();
            reject(new Error('Authentication timeout'));
            this.cleanup();
          }
        }, 300000);

      } catch (error) {
        reject(error);
      }
    });
  }

  // Handle successful authentication (common logic)
  private async handleAuthSuccess(session: AuthSession): Promise<void> {
    try {
      // Set the supabase session if available
      if (this.supabase) {
        await this.supabase.auth.setSession(session);
        console.log('Successfully set Supabase session');
      }
      
      // Store the session locally
      this.currentSession = session;
      await this.storeSession(session);
      
      // Store the provider tokens in backend
      await providerTokenManager.storeTokens({
        provider: 'google',
        accessToken: session.provider_token || session.access_token,
        refreshToken: session.provider_refresh_token || session.refresh_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined
      });
      
      console.log('Successfully stored provider tokens in backend');
    } catch (error) {
      console.error('Error during auth success handling:', error);
      // Don't throw - we still want to complete authentication
    }
  }

  private async storeSession(session: AuthSession): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          frootful_session: JSON.stringify(session),
          frootful_session_expires: session.expires_at
        });
        console.log('Stored session in chrome.storage');
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem('frootful_session', JSON.stringify(session));
        if (session.expires_at) {
          localStorage.setItem('frootful_session_expires', session.expires_at.toString());
        }
        console.log('Stored session in localStorage');
      }
    } catch (error) {
      console.error('Failed to store session:', error);
    }
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    if (this.currentSession && this.isSessionValid(this.currentSession)) {
      return this.currentSession;
    }

    try {
      let sessionData: string | null = null;
      let expiresAt: number | null = null;

      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['frootful_session', 'frootful_session_expires']);
        sessionData = result.frootful_session;
        expiresAt = result.frootful_session_expires;
      } else if (typeof localStorage !== 'undefined') {
        sessionData = localStorage.getItem('frootful_session');
        const expiresStr = localStorage.getItem('frootful_session_expires');
        expiresAt = expiresStr ? parseInt(expiresStr, 10) : null;
      }

      if (!sessionData) {
        console.log('No session data found');
        return null;
      }

      const session: AuthSession = JSON.parse(sessionData);
      
      // Check if session is expired
      if (expiresAt && Date.now() / 1000 > expiresAt) {
        console.log('Session expired');
        await this.clearSession();
        return null;
      }

      this.currentSession = session;
      console.log('Retrieved valid session for user:', session.user?.email);
      return session;
    } catch (error) {
      console.error('Failed to retrieve session:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    console.log('Checking authentication status...');
    
    // First check local session
    const session = await this.getCurrentSession();
    if (session) {
      console.log('Found valid local session');
      return true;
    }

    // Then check Supabase session if available
    try {
      if (this.supabase) {
        const { data: { session: supabaseSession }, error } = await this.supabase.auth.getSession();
        console.log('Supabase session check:', supabaseSession ? 'Found' : 'Not found');
        return supabaseSession !== null && !error;
      }
    } catch (error) {
      console.error('Error checking Supabase session:', error);
    }

    console.log('No valid session found');
    return false;
  }

  async signOut(): Promise<void> {
    try {
      console.log('Signing out...');
      
      // Clear current session
      this.currentSession = null;
      
      // Clear stored session
      await this.clearSession();
      
      // Clear Supabase session
      if (this.supabase) {
        await this.supabase.auth.signOut();
        console.log('Successfully signed out from Supabase');
      }
      
      // Clear tokens using token manager (backend)
      try {
        await providerTokenManager.deleteTokens();
        console.log('Successfully cleared tokens from backend');
      } catch (error) {
        console.warn('Failed to clear tokens from backend:', error);
      }
      
      // Revoke Google token if available and Chrome Identity is available
      if (this.canUseChromeIdentity()) {
        try {
          chrome.identity.removeCachedAuthToken({ token: '' }, () => {
            console.log('Cleared Chrome Identity cache');
          });
        } catch (error) {
          console.error('Failed to clear Chrome Identity cache:', error);
        }
      }
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  private async clearSession(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove(['frootful_session', 'frootful_session_expires']);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('frootful_session');
        localStorage.removeItem('frootful_session_expires');
      }
      console.log('Session cleared');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  private isSessionValid(session: AuthSession): boolean {
    if (!session.expires_at) return true; // No expiry set
    const isValid = Date.now() / 1000 < session.expires_at;
    console.log('Session validity check:', isValid);
    return isValid;
  }

  private cleanup(): void {
    // Clean up global handlers (only if window is available)
    if (typeof window !== 'undefined') {
      delete window.frootfulAuthSuccess;
      delete window.frootfulAuthError;
    }
  }

  // Get access token for API calls - prioritize provider_token
  async getAccessToken(): Promise<string | null> {
    console.log('Getting access token...');
    const session = await this.getCurrentSession();
    const token = session?.provider_token || session?.access_token || null;
    console.log('Access token found:', token ? 'yes' : 'no');
    return token;
  }

  // Get user info
  async getCurrentUser(): Promise<AuthSession['user'] | null> {
    const session = await this.getCurrentSession();
    return session?.user || null;
  }
}

export const hybridAuth = HybridAuthManager.getInstance();