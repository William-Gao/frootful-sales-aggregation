// Google OAuth callback handler
document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loading-state');
  const successState = document.getElementById('success-state');
  const errorState = document.getElementById('error-state');
  const errorDiv = document.getElementById('error');
  const closeBtn = document.getElementById('close-btn');

  // Get extension ID from session storage
  const extensionId = sessionStorage.getItem('extension_id');
  const storedState = sessionStorage.getItem('oauth_state');

  if (!extensionId) {
    showError('Invalid callback - missing extension ID');
    return;
  }

  try {
    console.log('Processing Google OAuth callback...');
    console.log('Full URL:', window.location.href);
    
    // Parse parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for error first
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (error) {
      throw new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`);
    }
    
    // Get authorization code and state
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (!code) {
      throw new Error('No authorization code received from Google');
    }
    
    if (state !== storedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }
    
    console.log('Authorization code received, exchanging for tokens...');
    
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: '930825445704-od6kb7h9h2a07kog5gg5l5c7kdfrbova.apps.googleusercontent.com',
        client_secret: '', // For public clients, this might be empty
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: `${window.location.origin}/auth/callback.html`
      })
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
    }
    
    const tokens = await tokenResponse.json();
    console.log('Tokens received:', { 
      access_token: !!tokens.access_token,
      refresh_token: !!tokens.refresh_token,
      expires_in: tokens.expires_in
    });

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });
    
    if (!userResponse.ok) {
      throw new Error(`Failed to get user info: ${userResponse.status}`);
    }

    const userInfo = await userResponse.json();
    console.log('User info retrieved:', userInfo);

    const sessionData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + parseInt(tokens.expires_in) : null,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        picture: userInfo.picture
      }
    };

    console.log('Sending session data to extension:', extensionId);

    // Send to Chrome extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage(extensionId, {
          action: 'authComplete',
          session: sessionData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            tryPostMessage(sessionData);
          } else {
            console.log('Successfully sent to extension');
            showSuccess();
          }
        });
      } catch (chromeError) {
        console.error('Chrome API error:', chromeError);
        tryPostMessage(sessionData);
      }
    } else {
      tryPostMessage(sessionData);
    }

    function tryPostMessage(sessionData) {
      console.log('Trying postMessage fallback...');
      if (window.opener) {
        window.opener.postMessage({
          action: 'authComplete',
          session: sessionData
        }, '*');
        showSuccess();
      } else {
        showError('Unable to communicate with extension. Please close this window and try again.');
      }
    }

  } catch (error) {
    console.error('Callback processing error:', error);
    showError(error.message || 'Authentication failed');
  }

  function showSuccess() {
    loadingState.style.display = 'none';
    successState.style.display = 'block';
    
    // Clean up session storage
    sessionStorage.removeItem('extension_id');
    sessionStorage.removeItem('oauth_state');
    
    // Auto-close after 3 seconds
    setTimeout(() => {
      window.close();
    }, 3000);
  }

  function showError(message) {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    closeBtn.style.display = 'inline-block';
    
    // Clean up session storage
    sessionStorage.removeItem('extension_id');
    sessionStorage.removeItem('oauth_state');
  }

  closeBtn.addEventListener('click', () => {
    window.close();
  });
});