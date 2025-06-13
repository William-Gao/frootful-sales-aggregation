import { supabaseClient } from './supabaseClient.js';
import { providerTokenManager } from './tokenManager.js';

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: any; // Keep as any to preserve flexibility
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
  private authWindow: Window | null = null;
  private supabase: any = null;
  private authInProgress: boolean = false;

  static getInstance(): HybridAuthManager {
    if (!HybridAuthManager.instance) {
      HybridAuthManager.instance = new HybridAuthManager();
    }
    return HybridAuthManager.instance;
  }

  constructor() {
    console.log('HybridAuthManager constructor called');
    
    // Listen for messages from auth callback
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessageExternal.addListener(
        (message: AuthMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
          if (message.action === 'authComplete') {
            this.handleAuthComplete(message.session);
            sendResponse({ success: true });
          }
        }
      );
    }

    // Also listen for postMessage events (fallback)
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
        if (event.data.action === 'authComplete') {
          this.handleAuthComplete(event.data.session);
        }
      });
    }

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

  // Main authentication method - automatically chooses best available method
  async signInWithGoogle(): Promise<AuthSession> {
    if (this.authInProgress) {
      throw new Error('Authentication already in progress');
    }

    this.authInProgress = true;
    
    try {
      if (this.canUseWindowAuth()) {
        console.log('Using window-based authentication');
        return await this.signInWithGoogleWindow();
      } else if (this.canUseChromeIdentity()) {
        console.log('Using Chrome Identity API authentication');
        return await this.signInWithChromeIdentity();
      } else {
        throw new Error('No authentication method available');
      }
    } finally {
      this.authInProgress = false;
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
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!token) {
          reject(new Error('Failed to get auth token'));
          return;
        }

        try {
          // Get user info from Google
          const userResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
          const userInfo = await userResponse.json();

          // Create session object
          const session: AuthSession = {
            access_token: token,
            user: userInfo,
            provider_token: token,
            provider_refresh_token: ''
          };

          // Set the supabase session if available
          if (this.supabase) {
            try {
              await this.supabase.auth.signInWithIdToken({
                provider: 'google',
                token: token
              });
              console.log('Successfully set Supabase session via Chrome Identity');
            } catch (supabaseError) {
              console.warn('Failed to set Supabase session, continuing with Chrome token:', supabaseError);
            }
          }
          
          // Store the session locally
          this.currentSession = session;
          await this.storeSession(session);
          
          // Store the provider tokens in backend
          try {
            await providerTokenManager.storeTokens({
              provider: 'google',
              accessToken: token,
              refreshToken: '',
              expiresAt: undefined
            });
            console.log('Successfully stored provider tokens in backend');
          } catch (error) {
            console.warn('Failed to store provider tokens in backend:', error);
          }
          
          resolve(session);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Window-based authentication (for content scripts and popups)
  async signInWithGoogleWindow(): Promise<AuthSession> {
    return new Promise<AuthSession>((resolve, reject) => {
      try {
        // Use localhost URL since you're serving with npx serve
        const loginUrl = 'http://localhost:5173/auth/login.html';
        
        console.log('Opening auth window:', loginUrl);
        
        // Open popup window with specific dimensions
        const width = 500;
        const height = 600;
        const left = Math.round((screen.width - width) / 2);
        const top = Math.round((screen.height - height) / 2);
        
        this.authWindow = window.open(
          loginUrl,
          'frootful-auth',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no`
        );

        if (!this.authWindow) {
          reject(new Error('Failed to open authentication window. Please allow popups for this site.'));
          return;
        }

        // Set up success handler
        const successHandler: AuthSuccessHandler = async (session: AuthSession) => {
          try {          
            // Set the supabase session  
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
            
            // Notify other parts of the extension about auth state change
            this.notifyAuthStateChange(true, session.user);
            
            resolve(session);
          } catch (error) {
            console.error('Error during auth completion:', error);
            // Still resolve with session even if backend storage fails
            resolve(session);
          } finally {
            // Don't close the auth window immediately - let it close naturally
            // or keep it open for debugging
            this.cleanup(false);
          }
        };

        // Set up error handler
        const errorHandler: AuthErrorHandler = (error: string) => {
          reject(new Error(error));
          this.cleanup(true);
        };

        // Store handlers for callback
        if (typeof window !== 'undefined') {
          window.frootfulAuthSuccess = successHandler;
          window.frootfulAuthError = errorHandler;
        }

        // Check if window was closed manually
        const checkClosed = setInterval(() => {
          if (this.authWindow?.closed) {
            clearInterval(checkClosed);
            reject(new Error('Authentication window was closed'));
            this.cleanup(true);
          }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
          if (this.authWindow && !this.authWindow.closed) {
            this.authWindow.close();
            reject(new Error('Authentication timeout'));
            this.cleanup(true);
          }
        }, 300000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleAuthComplete(session: AuthSession): void {
    console.log('Auth complete received:', session.user?.email || 'Unknown user');
    if (typeof window !== 'undefined' && window.frootfulAuthSuccess) {
      window.frootfulAuthSuccess(session);
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
        // Fallback to localStorage
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
        // Fallback to localStorage
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
    
    // Then check Supabase session
    try {
      if (this.supabase) {
        const { data: { session }, error } = await this.supabase.auth.getSession();
        const isSupabaseAuth = session !== null && !error;
        console.log('Supabase authentication status:', isSupabaseAuth);
        return isSupabaseAuth;
      }
    } catch (error) {
      console.warn('Failed to check Supabase session:', error);
    }
    
    console.log('No valid authentication found');
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
      
      // Revoke Google token if available
      const session = await this.getCurrentSession();
      if (session?.provider_token || session?.access_token) {
        try {
          const tokenToRevoke = session.provider_token || session.access_token;
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokenToRevoke}`);
          console.log('Successfully revoked Google token');
        } catch (error) {
          console.error('Failed to revoke Google token:', error);
        }
      }
      
      // Notify other parts of the extension about auth state change
      this.notifyAuthStateChange(false, null);
      
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
        // Fallback to localStorage
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

  private cleanup(closeWindow: boolean = true): void {
    // Only close window if explicitly requested
    if (closeWindow && this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }
    
    // Clean up global handlers
    if (typeof window !== 'undefined') {
      delete window.frootfulAuthSuccess;
      delete window.frootfulAuthError;
    }
  }

  // Notify other parts of the extension about auth state changes
  private notifyAuthStateChange(isAuthenticated: boolean, user: any): void {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          action: 'authStateChanged',
          isAuthenticated: isAuthenticated,
          user: user
        });
        console.log('Notified extension about auth state change:', isAuthenticated);
      } catch (error) {
        console.warn('Failed to notify extension about auth state change:', error);
      }
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