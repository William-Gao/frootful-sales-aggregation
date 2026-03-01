// Supabase client configuration for Chrome Extension
// This file handles Supabase initialization with Chrome extension compatibility

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

// Initialize Supabase client lazily
function initializeSupabase() {
  if (supabase) return supabase;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log('Supabase client initialized successfully');
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
export const supabaseClient = initializeSupabase();

/**
 * Get a valid access token, refreshing the session if needed.
 * Throws if no valid session exists.
 */
export async function getAccessToken(): Promise<string> {
  const client = supabaseClient as SupabaseClient;
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) {
    const { data: { session: refreshed }, error: refreshError } = await client.auth.refreshSession();
    if (refreshError || !refreshed) {
      throw new Error('Not authenticated');
    }
    return refreshed.access_token;
  }
  return session.access_token;
}