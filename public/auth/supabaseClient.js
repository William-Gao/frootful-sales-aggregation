// public/auth/supabaseClient.js

let supabase = null;

/**
 * Creates a Supabase-style client with a custom auth implementation
 * using the server-side code-grant (getSessionFromUrl) flow.
 */
function createSupabaseClient(url, anonKey) {
  // Local container for auth methods
  const auth = {};

  // Store a session (either in chrome.storage or localStorage)
  auth.storeSession = async (session) => {
    const data = JSON.stringify(session);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((res) => chrome.storage.local.set({ supabase_session: data }, res));
    } else {
      localStorage.setItem('supabase_session', data);
    }
  };

  // Retrieve a stored session
  auth.getStoredSession = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((res) => {
        chrome.storage.local.get(['supabase_session'], (result) => {
          res(result.supabase_session ? JSON.parse(result.supabase_session) : null);
        });
      });
    } else {
      const raw = localStorage.getItem('supabase_session');
      return raw ? JSON.parse(raw) : null;
    }
  };

  // Remove any stored session
  auth.clearSession = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((res) => chrome.storage.local.remove(['supabase_session'], res));
    } else {
      localStorage.removeItem('supabase_session');
    }
  };

  // Simple expiry check
  auth.isSessionValid = (session) => {
    if (!session?.expires_at) return true;
    return Math.floor(Date.now() / 1000) < session.expires_at;
  };

  /**
   * Initiate the OAuth flow by redirecting the browser
   * to Supabase’s /authorize endpoint (code flow → refresh token).
   */
  auth.signInWithOAuth = async ({ provider, options }) => {
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
  auth.getSession = async () => {
    try {
      // 1) Check URL hash for tokens
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn   = params.get('expires_in');
      const tokenType   = params.get('token_type') || 'bearer';
      const providerToken = params.get('provider_token');
      const providerRefreshToken = params.get('provider_refresh_token');
      console.log('This is hash: ', hash);

      if (accessToken) {
        // 2) Fetch the user record
        const resp = await fetch(`${url}/auth/v1/user`, {
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
            apikey: anonKey,
          },
        });
        if (!resp.ok) throw new Error('Failed to fetch user info');

        const user = await resp.json();
        const session = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresIn
            ? Math.floor(Date.now() / 1000) + parseInt(expiresIn, 10)
            : null,
          token_type: tokenType,
          user,
          provider_token: providerToken,
          provider_refresh_token: providerRefreshToken
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
      return { data: { session: null }, error };
    }
  };

  // Sign out: clear stored session
  auth.signOut = async () => {
    await auth.clearSession();
    return { error: null };
  };

  return { auth };
}

/**
 * Lazy-init and cache the Supabase client.
 */
async function initializeSupabase() {
  if (supabase) return supabase;
  const SUPA_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
  const PUBLIC_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';
  if (!SUPA_URL || !PUBLIC_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  supabase = createSupabaseClient(SUPA_URL, PUBLIC_KEY);
  console.log('Supabase client initialized');
  return supabase;
}

// Expose for both ES modules & global access
export async function getSupabaseClient() {
  return await initializeSupabase();
}
window.getSupabaseClient = initializeSupabase;