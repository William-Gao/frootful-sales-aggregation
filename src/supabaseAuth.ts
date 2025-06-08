import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  email: string;
  created_at: string;
}

class SupabaseAuth {
  async signInWithGoogle(): Promise<{ user: User | null; error: string | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: chrome.identity.getRedirectURL(),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });

      if (error) {
        return { user: null, error: error.message };
      }

      // Get the current user after sign in
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        return { user: null, error: userError?.message || 'Failed to get user' };
      }

      return { 
        user: {
          id: user.id,
          email: user.email || '',
          created_at: user.created_at
        }, 
        error: null 
      };
    } catch (error) {
      return { 
        user: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async signOut(): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      return { error: error?.message || null };
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email || '',
        created_at: user.created_at
      };
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  async getSession() {
    return await supabase.auth.getSession();
  }

  onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        callback({
          id: session.user.id,
          email: session.user.email || '',
          created_at: session.user.created_at
        });
      } else {
        callback(null);
      }
    });
  }
}

export const supabaseAuth = new SupabaseAuth();