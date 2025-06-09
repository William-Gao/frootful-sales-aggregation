// Direct Google OAuth with Supabase - Fixed redirect URI
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

      console.log('Starting Google OAuth with Supabase...');
      
      // Store extension ID for callback
      sessionStorage.setItem('extension_id', extensionId);
      
      // Use the correct Supabase OAuth URL format
      const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
      
      // The callback URL should be the Supabase callback endpoint
      const callbackUrl = `${window.location.origin}/auth/callback.html`;
      
      // Construct the OAuth URL with proper Supabase format
      const params = new URLSearchParams({
        provider: 'google',
        redirect_to: callbackUrl,
        scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly'
      });
      
      const authUrl = `${supabaseUrl}/auth/v1/authorize?${params.toString()}`;
      
      console.log('Redirecting to:', authUrl);
      console.log('Callback URL:', callbackUrl);
      
      // Redirect to Supabase OAuth
      window.location.href = authUrl;
      
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