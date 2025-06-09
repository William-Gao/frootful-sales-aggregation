// Supabase client for auth pages
// This version uses the actual Supabase Auth API

let supabase = null;

// Create a proper Supabase client that works with OAuth
function createSupabaseClient(url, key) {
  return {
    auth: {
      signInWithOAuth: async (options) => {
        const { provider, options: authOptions } = options;
        
        // Construct Supabase OAuth URL
        const params = new URLSearchParams({
          provider: provider,
          redirect_to: authOptions.redirectTo
        });
        
        // Add scopes if provided
        if (authOptions.scopes) {
          params.append('scopes', authOptions.scopes);
        }
        
        // Add query params for Google OAuth
        if (authOptions.queryParams) {
          Object.entries(authOptions.queryParams).forEach(([key, value]) => {
            params.append(key, value);
          });
        }
        
        const authUrl = `${url}/auth/v1/authorize?${params.toString()}`;
        
        console.log('Redirecting to Supabase OAuth:', authUrl);
        
        // Redirect to Supabase OAuth URL
        window.location.href = authUrl;
        
        return { data: null, error: null };
      },
      
      getSession: async () => {
        try {
          // First check URL hash for fresh tokens from OAuth callback
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const expiresIn = hashParams.get('expires_in');
          const tokenType = hashParams.get('token_type');
          
          if (accessToken) {
            console.log('Found tokens in URL hash');
            
            // Get user info using Supabase user endpoint
            const userResponse = await fetch(`${url}/auth/v1/user`, {
              headers: {
                'Authorization': `${tokenType || 'Bearer'} ${accessToken}`,
                'apikey': key
              }
            });
            
            if (!userResponse.ok) {
              throw new Error('Failed to get user info from Supabase');
            }
            
            const user = await userResponse.json();
            
            const session = {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresIn ? Math.floor(Date.now() / 1000) + parseInt(expiresIn) : null,
              token_type: tokenType || 'bearer',
              user: user
            };
            
            // Store the session
            await this.storeSession(session);
            
            // Clear the hash to prevent reprocessing
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, null, window.location.pathname + window.location.search);
            }
            
            return { data: { session }, error: null };
          }
          
          // Check for stored session
          const storedSession = await this.getStoredSession();
          if (storedSession) {
            // Validate stored session
            if (this.isSessionValid(storedSession)) {
              return { data: { session: storedSession }, error: null };
            } else {
              // Session expired, clear it
              await this.clearSession();
            }
          }
          
          return { data: { session: null }, error: null };
        } catch (error) {
          console.error('Error getting session:', error);
          return { data: { session: null }, error };
        }
      },
      
      getStoredSession: async () => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['supabase_session'], (result) => {
              resolve(result.supabase_session ? JSON.parse(result.supabase_session) : null);
            });
          } else {
            const stored = localStorage.getItem('supabase_session');
            resolve(stored ? JSON.parse(stored) : null);
          }
        });
      },
      
      storeSession: async (session) => {
        return new Promise((resolve) => {
          const sessionData = JSON.stringify(session);
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ supabase_session: sessionData }, () => {
              resolve();
            });
          } else {
            localStorage.setItem('supabase_session', sessionData);
            resolve();
          }
        });
      },
      
      clearSession: async () => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove(['supabase_session'], () => {
              resolve();
            });
          } else {
            localStorage.removeItem('supabase_session');
            resolve();
          }
        });
      },
      
      isSessionValid: (session) => {
        if (!session.expires_at) return true;
        return Math.floor(Date.now() / 1000) < session.expires_at;
      },
      
      signOut: async () => {
        await this.clearSession();
        return { error: null };
      }
    }
  };
}

// Initialize Supabase client
async function initializeSupabase() {
  if (supabase) return supabase;

  try {
    console.log('Initializing Supabase client...');
    
    const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    
    console.log('Supabase client initialized successfully');
    return supabase;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    throw error;
  }
}

// Export function to get the initialized client
window.getSupabaseClient = initializeSupabase;

// For module imports
export async function getSupabaseClient() {
  return await initializeSupabase();
}