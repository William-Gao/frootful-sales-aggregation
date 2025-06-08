// Supabase client configuration for Chrome Extension
// This file handles Supabase initialization with Chrome extension compatibility

let supabase: any = null;

// Initialize Supabase client lazily to avoid build issues
async function initializeSupabase() {
  if (supabase) return supabase;

  try {
    // Use CDN import for Chrome extension compatibility
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js';
    
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // Access Supabase from global scope
    const { createClient } = (window as any).supabase;
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    // Chrome extension storage adapter for Supabase
    const chromeStorageAdapter = {
      getItem: (key: string): Promise<string | null> => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get([key], (result) => {
              resolve(result[key] || null);
            });
          } else {
            // Fallback to localStorage for non-extension environments
            resolve(localStorage.getItem(key));
          }
        });
      },
      setItem: (key: string, value: string): Promise<void> => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ [key]: value }, () => {
              resolve();
            });
          } else {
            // Fallback to localStorage for non-extension environments
            localStorage.setItem(key, value);
            resolve();
          }
        });
      },
      removeItem: (key: string): Promise<void> => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove([key], () => {
              resolve();
            });
          } else {
            // Fallback to localStorage for non-extension environments
            localStorage.removeItem(key);
            resolve();
          }
        });
      }
    };

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });

    return supabase;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    // Return a mock client that gracefully handles failures
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        signInWithIdToken: () => Promise.resolve({ data: null, error: new Error('Supabase not available') }),
        signOut: () => Promise.resolve({ error: null })
      }
    };
  }
}

// Export a function that returns the initialized client
export async function getSupabaseClient() {
  return await initializeSupabase();
}

// For backward compatibility, export a promise that resolves to the client
export const supabasePromise = initializeSupabase();