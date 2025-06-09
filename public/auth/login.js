// Direct Google OAuth - bypassing Supabase for Chrome extension
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

      console.log('Starting direct Google OAuth...');
      
      // Store extension ID for callback
      sessionStorage.setItem('extension_id', extensionId);
      
      // Direct Google OAuth configuration
      const clientId = '930825445704-od6kb7h9h2a07kog5gg5l5c7kdfrbova.apps.googleusercontent.com';
      const redirectUri = `${window.location.origin}/auth/callback.html`;
      const scope = 'email profile https://www.googleapis.com/auth/gmail.readonly';
      
      // Generate state for security
      const state = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('oauth_state', state);
      
      // Construct Google OAuth URL
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scope,
        state: state,
        access_type: 'offline',
        prompt: 'consent'
      });
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      
      console.log('Redirecting to Google OAuth:', authUrl);
      console.log('Redirect URI:', redirectUri);
      
      // Redirect to Google OAuth
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