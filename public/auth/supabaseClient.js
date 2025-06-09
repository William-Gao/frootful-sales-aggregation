// Supabase client for auth pages with proper OAuth handling
let supabaseClient = null;

// Initialize Supabase client
async function initializeSupabase() {
  if (supabaseClient) return supabaseClient;

  try {
    console.log('Initializing Supabase client...');
    
    // Load Supabase from CDN if not already loaded
    if (!window.supabase) {
      await loadSupabaseScript();
    }

    const { createClient } = window.supabase;
    
    const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

    // Chrome extension storage adapter for Supabase
    const chromeStorageAdapter = {
      getItem: (key) => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get([key], (result) => {
              resolve(result[key] || null);
            });
          } else {
            // Fallback to localStorage for web environments
            resolve(localStorage.getItem(key));
          }
        });
      },
      setItem: (key, value) => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ [key]: value }, () => {
              resolve();
            });
          } else {
            // Fallback to localStorage for web environments
            localStorage.setItem(key, value);
            resolve();
          }
        });
      },
      removeItem: (key) => {
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove([key], () => {
              resolve();
            });
          } else {
            // Fallback to localStorage for web environments
            localStorage.removeItem(key);
            resolve();
          }
        });
      }
    };

    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    console.log('Supabase client initialized successfully');
    return supabaseClient;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    throw error;
  }
}

// Load Supabase script dynamically
function loadSupabaseScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Export function to get the initialized client
window.getSupabaseClient = initializeSupabase;

// For module imports
export async function getSupabaseClient() {
  return await initializeSupabase();
}