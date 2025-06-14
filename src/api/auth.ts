// Backend API simulation for authentication
// In a real app, this would be actual backend endpoints

interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: any;
  provider_token: string;
  provider_refresh_token: string;
}

class AuthAPI {
  private static SESSION_KEY = 'frootful_session';
  private static USER_KEY = 'frootful_user';

  // Store session in localStorage (in real app, this would be httpOnly cookies)
  static storeSession(session: AuthSession): void {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(this.USER_KEY, JSON.stringify(session.user));
  }

  // Get current session
  static getSession(): AuthSession | null {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      if (!sessionData) return null;
      
      const session = JSON.parse(sessionData);
      
      // Check if session is expired
      if (session.expires_at && Date.now() / 1000 > session.expires_at) {
        this.clearSession();
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  // Get current user
  static getUser(): any | null {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  // Clear session
  static clearSession(): void {
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  // Simulate API endpoints
  static async checkAuth(): Promise<{ isAuthenticated: boolean; user?: any }> {
    const session = this.getSession();
    const user = this.getUser();
    
    return {
      isAuthenticated: session !== null,
      user: user
    };
  }

  static async storeSessionAPI(sessionData: AuthSession): Promise<void> {
    this.storeSession(sessionData);
    
    // Notify extension about auth state change
    this.notifyExtension('authComplete', {
      session: sessionData
    });
  }

  static async getERPStatus(): Promise<{ connections: any[] }> {
    // In real app, this would check backend for ERP connections
    // For now, return empty connections
    return {
      connections: []
    };
  }

  static async getBusinessCentralAuthUrl(): Promise<{ authUrl: string }> {
    // In real app, this would generate proper BC auth URL
    // For now, return a placeholder
    return {
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?...'
    };
  }

  private static notifyExtension(action: string, data: any): void {
    try {
      // Try to send message to extension
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          action,
          ...data
        });
      }
    } catch (error) {
      console.warn('Could not notify extension:', error);
    }
  }
}

export default AuthAPI;