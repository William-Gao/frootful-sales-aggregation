// Import from the local supabaseClient
import { getSupabaseClient } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
  const googleSigninBtn = document.getElementById('google-signin');
  const loading = document.getElementById('loading');
  const errorDiv = document.getElementById('error');

  // Get extension ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const extensionId = urlParams.get('extensionId');

  if (!extensionId) {
    showError('Invalid request - missing extension ID');
    return;
  }

  googleSigninBtn.addEventListener('click', async () => {
    try {
      googleSigninBtn.style.display = 'none';
      loading.style.display = 'block';
      errorDiv.style.display = 'none';

      console.log('Initializing Supabase...');
      
      // Initialize Supabase
      const supabase = await getSupabaseClient();
      
      console.log('Supabase initialized, starting OAuth flow...');

      // Sign in with Google using Supabase Auth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `http://localhost:5173/auth/callback.html?extensionId=${extensionId}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly'
        }
      });

      if (error) {
        console.error('OAuth error:', error);
        throw error;
      }

      console.log('OAuth initiated successfully');
      // The redirect will happen automatically
    } catch (error) {
      console.error('Sign-in error:', error);
      showError(error.message || 'Failed to sign in with Google');
      
      googleSigninBtn.style.display = 'flex';
      loading.style.display = 'none';
    }
  });

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
});