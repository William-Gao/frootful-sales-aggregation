// Supabase client for auth pages
// This is a standalone version that doesn't rely on Vite imports

let supabase = null;

// Initialize Supabase client using CDN
async function initializeSupabase() {
  if (supabase) return supabase;

  try {
    // Load Supabase from CDN
    if (!window.supabase) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js';
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Access Supabase from global scope
    const { createClient } = window.supabase;
    
    // Use environment variables or fallback to hardcoded values
    const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Chrome extension storage adapter for Supabase
    const chromeStorageAdapter = {
      getItem: (key) => {
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
      setItem: (key, value) => {
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
      removeItem: (key) => {
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
        detectSessionInUrl: true
      }
    });

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