// public/auth/supabaseClient.ts

export interface SupabaseUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type: string;
  user: SupabaseUser;
}

export interface SupabaseAuthResponse {
  data: { session: SupabaseSession | null };
  error: Error | null;
}

export interface SupabaseOAuthOptions {
  provider: 'google';
  options: {
    redirectTo: string;
    scopes?: string;
    queryParams?: Record<string, string>;
  };
}

interface SupabaseAuth {
  storeSession: (session: SupabaseSession) => Promise<void>;
  getStoredSession: () => Promise<SupabaseSession | null>;
  clearSession: () => Promise<void>;
  isSessionValid: (session: SupabaseSession) => boolean;
  signInWithOAuth: (options: SupabaseOAuthOptions) => Promise<{ data: null; error: null }>;
  getSession: () => Promise<SupabaseAuthResponse>;
  signOut: () => Promise<{ error: null }>;
}

interface SupabaseClient {
  auth: SupabaseAuth;
}

let supabase: SupabaseClient | null = null;

/**
 * Creates a Supabase-style client with a custom auth implementation
 * using the server-side code-grant (getSessionFromUrl) flow.
 */
function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  // Local container for auth methods
  const auth: SupabaseAuth = {} as SupabaseAuth;

  // Store a session (either in chrome.storage or localStorage)
  auth.storeSession = async (session: SupabaseSession): Promise<void> => {
    const data = JSON.stringify(session);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise<void>((resolve) => 
        chrome.storage.local.set({ supabase_session: data }, () => resolve())
      );
    } else {
      localStorage.setItem('supabase_session', data);
    }
  };

  // Retrieve a stored session
  auth.getStoredSession = async (): Promise<SupabaseSession | null> => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise<SupabaseSession | null>((resolve) => {
        chrome.storage.local.get(['supabase_session'], (result) => {
          resolve(result.supabase_session ? JSON.parse(result.supabase_session) : null);
        });
      });
    } else {
      const raw = localStorage.getItem('supabase_session');
      return raw ? JSON.parse(raw) : null;
    }
  };

  // Remove any stored session
  auth.clearSession = async (): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise<void>((resolve) => 
        chrome.storage.local.remove(['supabase_session'], () => resolve())
      );
    } else {
      localStorage.removeItem('supabase_session');
    }
  };

  // Simple expiry check
  auth.isSessionValid = (session: SupabaseSession): boolean => {
    if (!session?.expires_at) return true;
    return Math.floor(Date.now() / 1000) < session.expires_at;
  };

  /**
   * Initiate the OAuth flow by redirecting the browser
   * to Supabase's /authorize endpoint (code flow → refresh token).
   */
  auth.signInWithOAuth = async ({ provider, options }: SupabaseOAuthOptions): Promise<{ data: null; error: null }> => {
    const params = new URLSearchParams({
      provider,
      redirect_to: options.redirectTo,
    });
    
    if (options.scopes) params.append('scopes', options.scopes);
    if (options.queryParams) {
      Object.entries(options.queryParams).forEach(([k, v]) => {
        params.append(k, v);
      });
    }
    
    const authUrl = `${url}/auth/v1/authorize?${params.toString()}`;
    console.log('Redirecting to Supabase OAuth:', authUrl);
    window.location.href = authUrl;
    return { data: null, error: null };
  };

  /**
   * Reads the URL hash for an OAuth callback, exchanges it into
   * a full session (including fetching /auth/v1/user), and stores it.
   */
  auth.getSession = async (): Promise<SupabaseAuthResponse> => {
    try {
      // 1) Check URL hash for tokens
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      const tokenType = params.get('token_type') || 'bearer';

      if (accessToken) {
        // 2) Fetch the user record
        const resp = await fetch(`${url}/auth/v1/user`, {
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
            apikey: anonKey,
          },
        });
        
        if (!resp.ok) throw new Error('Failed to fetch user info');

        const user: SupabaseUser = await resp.json();
        const session: SupabaseSession = {
          access_token: accessToken,
          refresh_token: refreshToken || undefined,
          expires_at: expiresIn
            ? Math.floor(Date.now() / 1000) + parseInt(expiresIn, 10)
            : undefined,
          token_type: tokenType,
          user,
        };

        // 3) Store and clean up
        await auth.storeSession(session);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return { data: { session }, error: null };
      }

      // 4) No hash → try stored session
      const stored = await auth.getStoredSession();
      if (stored && auth.isSessionValid(stored)) {
        return { data: { session: stored }, error: null };
      } else if (stored) {
        await auth.clearSession();
      }

      return { data: { session: null }, error: null };
    } catch (error) {
      console.error('Error in getSession:', error);
      return { data: { session: null }, error: error as Error };
    }
  };

  // Sign out: clear stored session
  auth.signOut = async (): Promise<{ error: null }> => {
    await auth.clearSession();
    return { error: null };
  };

  return { auth };
}

/**
 * Lazy-init and cache the Supabase client.
 */
async function initializeSupabase(): Promise<SupabaseClient> {
  if (supabase) return supabase;
  
  const SUPA_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
  const PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';
  
  if (!SUPA_URL || !PUBLIC_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  
  supabase = createSupabaseClient(SUPA_URL, PUBLIC_KEY);
  console.log('Supabase client initialized');
  return supabase;
}

// Expose for both ES modules & global access
export async function getSupabaseClient(): Promise<SupabaseClient> {
  return await initializeSupabase();
}

// Global access for non-module contexts
declare global {
  interface Window {
    getSupabaseClient: () => Promise<SupabaseClient>;
  }
}

window.getSupabaseClient = initializeSupabase;