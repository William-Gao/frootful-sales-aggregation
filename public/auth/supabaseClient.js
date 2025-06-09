// Supabase client for auth pages
// This version uses a pre-bundled approach to avoid CSP issues

let supabase = null;

// Minimal Supabase client implementation for auth pages
function createMinimalSupabaseClient(url, key) {
  return {
    auth: {
      signInWithOAuth: async (options) => {
        const { provider, options: authOptions } = options;
        
        // Construct OAuth URL manually
        const params = new URLSearchParams({
          provider: provider,
          redirect_to: authOptions.redirectTo,
          scopes: authOptions.scopes || 'email profile'
        });
        
        // Add query params
        if (authOptions.queryParams) {
          Object.entries(authOptions.queryParams).forEach(([key, value]) => {
            params.append(key, value);
          });
        }
        
        const authUrl = `${url}/auth/v1/authorize?${params.toString()}`;
        
        // Redirect to OAuth URL
        window.location.href = authUrl;
        
        return { data: null, error: null };
      },
      
      getSession: async () => {
        try {
          // Check URL hash for session data
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const expiresIn = hashParams.get('expires_in');
          
          if (accessToken) {
            // Get user info from Google
            const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
            const userInfo = await userResponse.json();
            
            const session = {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresIn ? Math.floor(Date.now() / 1000) + parseInt(expiresIn) : null,
              user: {
                id: userInfo.id,
                email: userInfo.email,
                user_metadata: {
                  full_name: userInfo.name,
                  avatar_url: userInfo.picture
                }
              }
            };
            
            return { data: { session }, error: null };
          }
          
          // Check stored session
          const storedSession = await this.getStoredSession();
          if (storedSession) {
            return { data: { session: storedSession }, error: null };
          }
          
          return { data: { session: null }, error: null };
        } catch (error) {
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
      }
    }
  };
}

// Initialize Supabase client without CDN
async function initializeSupabase() {
  if (supabase) return supabase;

  try {
    console.log('Initializing minimal Supabase client...');
    
    // Use environment variables or fallback to hardcoded values
    const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    supabase = createMinimalSupabaseClient(supabaseUrl, supabaseAnonKey);
    
    console.log('Minimal Supabase client initialized successfully');
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