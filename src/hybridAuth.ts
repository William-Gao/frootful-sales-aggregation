// Hybrid Authentication Manager for Chrome Extension
// Updated to work with localhost-served auth pages and proper TypeScript

import { tokenManager } from './tokenManager.js';
import { getSupabaseClient } from './supabaseClient.js';
import { SupabaseClient } from '@supabase/supabase-js';

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
  // private supabasePromise: Promise<SupabaseClient>;

  static getInstance(): HybridAuthManager {
    if (!HybridAuthManager.instance) {
      HybridAuthManager.instance = new HybridAuthManager();
    }
    return HybridAuthManager.instance;
  }

  constructor() {
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
    window.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
      if (event.data.action === 'authComplete') {
        this.handleAuthComplete(event.data.session);
      }
    });

    // this.supabaseClient = getSupabaseClient();
  }

  async signInWithGoogle(): Promise<AuthSession> {
    return new Promise<AuthSession>((resolve, reject) => {
      try {
        // Use localhost URL since you're serving with npx serve
        const loginUrl = 'http://localhost:5173/auth/login.html';
        
        console.log('Opening auth window:', loginUrl);
        
        // Open popup window
        this.authWindow = window.open(
          loginUrl,
          '_blank',
          'width=500,height=600,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
        );

        if (!this.authWindow) {
          reject(new Error('Failed to open authentication window. Please allow popups for this site.'));
          return;
        }

        // Set up success handler
        const successHandler: AuthSuccessHandler = async (session: AuthSession) => {
          try {
            console.log('Attempting to store session data now in AuthSuccessHandler: ', session);
            await this.storeSession(session);

            console.log('Inside HybridAuthManager, attempting to get supabase instance');
            const supabase = await getSupabaseClient();
            
            supabase.auth.setSession(session);
            console.log('Attempting to set supabase auth session within HybridAuthManager using auth.setSession');
            // Store tokens in backend using token manager
            console.log('Storing tokens in backend...', {
              provider_token: session.provider_token,
              provider_refresh_token: session.provider_refresh_token
            });
            
            await tokenManager.storeTokens({
              provider: 'google',
              accessToken: session.provider_token || session.access_token,
              refreshToken: session.provider_refresh_token || session.refresh_token,
              expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined
            });
            
            console.log('Successfully stored tokens in backend');
            resolve(session);
          } catch (error) {
            console.error('Error during auth completion:', error);
            // Still resolve with session even if backend storage fails
            resolve(session);
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
          if (this.authWindow?.closed) {
            clearInterval(checkClosed);
            reject(new Error('Authentication window was closed'));
            this.cleanup();
          }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
          if (this.authWindow && !this.authWindow.closed) {
            this.authWindow.close();
            reject(new Error('Authentication timeout'));
            this.cleanup();
          }
        }, 300000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleAuthComplete(session: AuthSession): void {
    console.log('Auth complete received:', session.user?.email || 'Unknown user');
    if (window.frootfulAuthSuccess) {
      window.frootfulAuthSuccess(session);
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
      } else {
        // Fallback to localStorage
        sessionData = localStorage.getItem('frootful_session');
        const expiresStr = localStorage.getItem('frootful_session_expires');
        expiresAt = expiresStr ? parseInt(expiresStr, 10) : null;
      }

      if (!sessionData) {
        return null;
      }

      const session: AuthSession = JSON.parse(sessionData);
      
      // Check if session is expired
      if (expiresAt && Date.now() / 1000 > expiresAt) {
        await this.clearSession();
        return null;
      }

      this.currentSession = session;
      return session;
    } catch (error) {
      console.error('Failed to retrieve session:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getCurrentSession();
    return session !== null;
  }

  async signOut(): Promise<void> {
    try {
      // Clear current session
      this.currentSession = null;
      
      // Clear stored session
      await this.clearSession();
      
      // Clear tokens using token manager (backend)
      try {
        await tokenManager.deleteTokens();
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
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  private async clearSession(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove(['frootful_session', 'frootful_session_expires']);
      } else {
        // Fallback to localStorage
        localStorage.removeItem('frootful_session');
        localStorage.removeItem('frootful_session_expires');
      }
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  private isSessionValid(session: AuthSession): boolean {
    if (!session.expires_at) return true; // No expiry set
    return Date.now() / 1000 < session.expires_at;
  }

  private cleanup(): void {
    // Keep window open for debugging - comment out to auto-close
    // if (this.authWindow) {
    //   this.authWindow.close();
    //   this.authWindow = null;
    // }
    
    // Clean up global handlers
    delete window.frootfulAuthSuccess;
    delete window.frootfulAuthError;
  }

  // Get access token for API calls - prioritize provider_token
  async getAccessToken(): Promise<string | null> {
    const session = await this.getCurrentSession();
    return session?.provider_token || session?.access_token || null;
  }

  // Get user info
  async getCurrentUser(): Promise<AuthSession['user'] | null> {
    const session = await this.getCurrentSession();
    return session?.user || null;
  }
}

export const hybridAuth = HybridAuthManager.getInstance();


// SOME OLD


// // Hybrid Authentication Manager for Chrome Extension
// // Updated to work with localhost-served auth pages and proper TypeScript

// import { tokenManager } from './tokenManager.js';
// import { getSupabaseClient } from './supabaseClient.js';

// export interface AuthSession {
//   access_token: string;
//   refresh_token?: string;
//   expires_at?: number;
//   user: any; // Keep as any to preserve flexibility
//   provider_token: string;
//   provider_refresh_token: string;
// }

// interface AuthMessage {
//   action: 'authComplete';
//   session: AuthSession;
// }

// interface AuthSuccessHandler {
//   (session: AuthSession): void;
// }

// interface AuthErrorHandler {
//   (error: string): void;
// }

// declare global {
//   interface Window {
//     frootfulAuthSuccess?: AuthSuccessHandler;
//     frootfulAuthError?: AuthErrorHandler;
//   }
// }

// class HybridAuthManager {
//   private static instance: HybridAuthManager;
//   private currentSession: AuthSession | null = null;
//   private authWindow: Window | null = null;

//   static getInstance(): HybridAuthManager {
//     if (!HybridAuthManager.instance) {
//       HybridAuthManager.instance = new HybridAuthManager();
//     }
//     return HybridAuthManager.instance;
//   }

//   constructor() {
//     // Listen for messages from auth callback
//     if (typeof chrome !== 'undefined' && chrome.runtime) {
//       chrome.runtime.onMessageExternal.addListener(
//         (message: AuthMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
//           if (message.action === 'authComplete') {
//             this.handleAuthComplete(message.session);
//             sendResponse({ success: true });
//           }
//         }
//       );
//     }

//     // Also listen for postMessage events (fallback)
//     window.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
//       if (event.data.action === 'authComplete') {
//         this.handleAuthComplete(event.data.session);
//       }
//     });
//   }

//   async signInWithGoogle(): Promise<AuthSession> {
//     return new Promise<AuthSession>((resolve, reject) => {
//       try {
//         // Use localhost URL since you're serving with npx serve
//         const loginUrl = 'http://localhost:5173/auth/login.html';
        
//         console.log('Opening auth window:', loginUrl);
        
//         // Open popup window
//         this.authWindow = window.open(
//           loginUrl,
//           '_blank',
//           'width=500,height=600,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
//         );

//         if (!this.authWindow) {
//           reject(new Error('Failed to open authentication window. Please allow popups for this site.'));
//           return;
//         }

//         // Set up success handler
//         const successHandler: AuthSuccessHandler = async (session: AuthSession) => {
//           try {
//             console.log('Attempting to store session data now in AuthSuccessHandler: ', session);
//             this.currentSession = session;
//             await this.storeSession(session);

//             console.log('Inside HybridAuthManager, attempting to get supabase instance');
//             const supabase = await getSupabaseClient();
            
//             supabase.auth.setSession(session);
//             console.log('Attempting to set supabase auth session within HybridAuthManager using auth.setSession');
//             // Store tokens in backend using token manager
//             console.log('Storing tokens in backend...', {
//               provider_token: session.provider_token,
//               provider_refresh_token: session.provider_refresh_token
//             });
            
//             await tokenManager.storeTokens({
//               provider: 'google',
//               accessToken: session.provider_token || session.access_token,
//               refreshToken: session.provider_refresh_token || session.refresh_token,
//               expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined
//             });
            
//             console.log('Successfully stored tokens in backend');
//             resolve(session);
//           } catch (error) {
//             console.error('Error during auth completion:', error);
//             // Still resolve with session even if backend storage fails
//             resolve(session);
//           } finally {
//             this.cleanup();
//           }
//         };

//         // Set up error handler
//         const errorHandler: AuthErrorHandler = (error: string) => {
//           reject(new Error(error));
//           this.cleanup();
//         };

//         // Store handlers for callback
//         window.frootfulAuthSuccess = successHandler;
//         window.frootfulAuthError = errorHandler;

//         // Check if window was closed manually
//         const checkClosed = setInterval(() => {
//           if (this.authWindow?.closed) {
//             clearInterval(checkClosed);
//             reject(new Error('Authentication window was closed'));
//             this.cleanup();
//           }
//         }, 1000);

//         // Timeout after 5 minutes
//         setTimeout(() => {
//           if (this.authWindow && !this.authWindow.closed) {
//             this.authWindow.close();
//             reject(new Error('Authentication timeout'));
//             this.cleanup();
//           }
//         }, 300000);

//       } catch (error) {
//         reject(error);
//       }
//     });
//   }

//   private handleAuthComplete(session: AuthSession): void {
//     console.log('Auth complete received:', session.user?.email || 'Unknown user');
//     if (window.frootfulAuthSuccess) {
//       window.frootfulAuthSuccess(session);
//     }
//   }

//   private async storeSession(session: AuthSession): Promise<void> {
//     try {
//       if (typeof chrome !== 'undefined' && chrome.storage) {
//         await chrome.storage.local.set({
//           frootful_session: JSON.stringify(session),
//           frootful_session_expires: session.expires_at
//         });
//         console.log('Stored session in chrome.storage');
//       } else {
//         // Fallback to localStorage
//         localStorage.setItem('frootful_session', JSON.stringify(session));
//         if (session.expires_at) {
//           localStorage.setItem('frootful_session_expires', session.expires_at.toString());
//         }
//         console.log('stored session in localstorage');
//       }

//     } catch (error) {
//       console.error('Failed to store session:', error);
//     }
//   }

//   async getCurrentSession(): Promise<AuthSession | null> {
//     if (this.currentSession && this.isSessionValid(this.currentSession)) {
//       return this.currentSession;
//     }

//     try {
//       let sessionData: string | null = null;
//       let expiresAt: number | null = null;

//       if (typeof chrome !== 'undefined' && chrome.storage) {
//         const result = await chrome.storage.local.get(['frootful_session', 'frootful_session_expires']);
//         sessionData = result.frootful_session;
//         expiresAt = result.frootful_session_expires;
//       } else {
//         // Fallback to localStorage
//         sessionData = localStorage.getItem('frootful_session');
//         const expiresStr = localStorage.getItem('frootful_session_expires');
//         expiresAt = expiresStr ? parseInt(expiresStr, 10) : null;
//       }

//       if (!sessionData) {
//         return null;
//       }

//       const session: AuthSession = JSON.parse(sessionData);
      
//       // Check if session is expired
//       if (expiresAt && Date.now() / 1000 > expiresAt) {
//         await this.clearSession();
//         return null;
//       }

//       this.currentSession = session;
//       return session;
//     } catch (error) {
//       console.error('Failed to retrieve session:', error);
//       return null;
//     }
//   }

//   async isAuthenticated(): Promise<boolean> {
//     const session = await this.getCurrentSession();
//     return session !== null;
//   }

//   async signOut(): Promise<void> {
//     try {
//       // Clear current session
//       this.currentSession = null;
      
//       // Clear stored session
//       await this.clearSession();
      
//       // Clear tokens using token manager (backend)
//       try {
//         await tokenManager.deleteTokens();
//         console.log('Successfully cleared tokens from backend');
//       } catch (error) {
//         console.warn('Failed to clear tokens from backend:', error);
//       }
      
//       // Revoke Google token if available
//       const session = await this.getCurrentSession();
//       if (session?.provider_token || session?.access_token) {
//         try {
//           const tokenToRevoke = session.provider_token || session.access_token;
//           await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokenToRevoke}`);
//           console.log('Successfully revoked Google token');
//         } catch (error) {
//           console.error('Failed to revoke Google token:', error);
//         }
//       }
//     } catch (error) {
//       console.error('Sign out error:', error);
//       throw error;
//     }
//   }

//   private async clearSession(): Promise<void> {
//     try {
//       if (typeof chrome !== 'undefined' && chrome.storage) {
//         await chrome.storage.local.remove(['frootful_session', 'frootful_session_expires']);
//       } else {
//         // Fallback to localStorage
//         localStorage.removeItem('frootful_session');
//         localStorage.removeItem('frootful_session_expires');
//       }
//     } catch (error) {
//       console.error('Failed to clear session:', error);
//     }
//   }

//   private isSessionValid(session: AuthSession): boolean {
//     if (!session.expires_at) return true; // No expiry set
//     return Date.now() / 1000 < session.expires_at;
//   }

//   private cleanup(): void {
//     // Keep window open for debugging - comment out to auto-close
//     // if (this.authWindow) {
//     //   this.authWindow.close();
//     //   this.authWindow = null;
//     // }
    
//     // Clean up global handlers
//     delete window.frootfulAuthSuccess;
//     delete window.frootfulAuthError;
//   }

//   // Get access token for API calls - prioritize provider_token
//   async getAccessToken(): Promise<string | null> {
//     const session = await this.getCurrentSession();
//     return session?.provider_token || session?.access_token || null;
//   }

//   // Get user info
//   async getCurrentUser(): Promise<AuthSession['user'] | null> {
//     const session = await this.getCurrentSession();
//     return session?.user || null;
//   }
// }

// export const hybridAuth = HybridAuthManager.getInstance();