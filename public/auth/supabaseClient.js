// Direct Google OAuth client for auth pages
// This bypasses Supabase OAuth and uses Google OAuth directly

let googleOAuthClient = null;

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '930825445704-od6kb7h9h2a07kog5gg5l5c7kdfrbova.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'email profile https://www.googleapis.com/auth/gmail.readonly';

// Create a minimal client that mimics Supabase interface but uses Google OAuth directly
function createGoogleOAuthClient() {
  return {
    auth: {
      signInWithOAuth: async (options) => {
        const { provider, options: authOptions } = options;
        
        if (provider !== 'google') {
          throw new Error('Only Google OAuth is supported');
        }
        
        // Generate state parameter for security
        const state = generateRandomString(32);
        sessionStorage.setItem('oauth_state', state);
        
        // Construct Google OAuth URL directly
        const params = new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          response_type: 'token',
          scope: authOptions.scopes || GOOGLE_SCOPES,
          redirect_uri: authOptions.redirectTo,
          state: state,
          include_granted_scopes: 'true'
        });
        
        // Add additional query params
        if (authOptions.queryParams) {
          Object.entries(authOptions.queryParams).forEach(([key, value]) => {
            params.append(key, value);
          });
        }
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        
        console.log('Redirecting to Google OAuth:', authUrl);
        
        // Redirect to Google OAuth URL
        window.location.href = authUrl;
        
        return { data: null, error: null };
      },
      
      getSession: async () => {
        try {
          // Check URL hash for OAuth response
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const expiresIn = hashParams.get('expires_in');
          const state = hashParams.get('state');
          const error = hashParams.get('error');
          
          // Check for OAuth errors
          if (error) {
            throw new Error(`OAuth error: ${error}`);
          }
          
          // Verify state parameter
          const storedState = sessionStorage.getItem('oauth_state');
          if (state && storedState && state !== storedState) {
            throw new Error('Invalid state parameter');
          }
          
          if (accessToken) {
            console.log('Found access token in URL hash');
            
            // Get user info from Google
            const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
            
            if (!userResponse.ok) {
              throw new Error('Failed to get user info from Google');
            }
            
            const userInfo = await userResponse.json();
            
            const session = {
              access_token: accessToken,
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
            
            // Store session
            await this.storeSession(session);
            
            // Clean up URL hash
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            }
            
            return { data: { session }, error: null };
          }
          
          // Check stored session
          const storedSession = await this.getStoredSession();
          if (storedSession) {
            // Verify token is still valid
            if (storedSession.expires_at && Date.now() / 1000 > storedSession.expires_at) {
              // Token expired, remove it
              await this.clearSession();
              return { data: { session: null }, error: null };
            }
            return { data: { session: storedSession }, error: null };
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
            chrome.storage.local.get(['google_oauth_session'], (result) => {
              resolve(result.google_oauth_session ? JSON.parse(result.google_oauth_session) : null);
            });
          } else {
            const stored = localStorage.getItem('google_oauth_session');
            resolve(stored ? JSON.parse(stored) : null);
          }
        });
      },
      
      storeSession: async (session) => {
        return new Promise((resolve) => {
          const sessionData = JSON.stringify(session);
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ google_oauth_session: sessionData }, () => {
              resolve();
            });
          } else {
            localStorage.setItem('google_oauth_session', sessionData);
            resolve();
          }
        });
      },
      
      clearSession: async () => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove(['google_oauth_session'], () => {
              resolve();
            });
          } else {
            localStorage.removeItem('google_oauth_session');
            resolve();
          }
        });
      }
    }
  };
}

// Generate random string for state parameter
function generateRandomString(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Initialize Google OAuth client
async function initializeGoogleOAuth() {
  if (googleOAuthClient) return googleOAuthClient;

  try {
    console.log('Initializing Google OAuth client...');
    
    googleOAuthClient = createGoogleOAuthClient();
    
    console.log('Google OAuth client initialized successfully');
    return googleOAuthClient;
  } catch (error) {
    console.error('Failed to initialize Google OAuth:', error);
    throw error;
  }
}

// Export function to get the initialized client (mimics Supabase interface)
window.getSupabaseClient = initializeGoogleOAuth;

// For module imports
export async function getSupabaseClient() {
  return await initializeGoogleOAuth();
}