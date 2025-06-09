// Direct Google OAuth with authorization code flow
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

      console.log('Starting Google OAuth with authorization code flow...');
      
      // Generate state parameter for security
      const state = generateRandomString(32);
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('extension_id', extensionId);
      
      // Use Supabase OAuth endpoint which handles the code flow properly
      const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
      const redirectUri = `${window.location.origin}/auth/callback.html`;
      
      // Construct Supabase OAuth URL with proper parameters
      const params = new URLSearchParams({
        provider: 'google',
        redirect_to: redirectUri,
        scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly'
      });
      
      const authUrl = `${supabaseUrl}/auth/v1/authorize?${params.toString()}`;
      
      console.log('Redirecting to Supabase OAuth:', authUrl);
      
      // Redirect to Supabase OAuth URL (which will handle the code flow)
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
  
  function generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
});