// Enhanced callback handler with better error handling
document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loading-state');
  const successState = document.getElementById('success-state');
  const errorState = document.getElementById('error-state');
  const errorDiv = document.getElementById('error');
  const closeBtn = document.getElementById('close-btn');

  // Get extension ID from session storage
  const extensionId = sessionStorage.getItem('extension_id');

  if (!extensionId) {
    showError('Invalid callback - missing extension ID');
    return;
  }

  try {
    console.log('Processing Supabase OAuth callback...');
    console.log('Full URL:', window.location.href);
    console.log('Hash:', window.location.hash);
    console.log('Search:', window.location.search);
    
    // Parse tokens from URL hash (Supabase uses hash fragments)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for error first
    const error = hashParams.get('error') || urlParams.get('error');
    const errorDescription = hashParams.get('error_description') || urlParams.get('error_description');
    
    if (error) {
      throw new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`);
    }
    
    // Get tokens from hash or query parameters
    let accessToken = hashParams.get('access_token') || urlParams.get('access_token');
    let refreshToken = hashParams.get('refresh_token') || urlParams.get('refresh_token');
    let expiresIn = hashParams.get('expires_in') || urlParams.get('expires_in');
    let tokenType = hashParams.get('token_type') || urlParams.get('token_type');
    
    console.log('Tokens found:', {
      accessToken: !!accessToken,
      refreshToken: !!refreshToken,
      expiresIn,
      tokenType
    });

    if (!accessToken) {
      // Check if we have a session token instead
      const sessionToken = hashParams.get('session') || urlParams.get('session');
      if (sessionToken) {
        console.log('Found session token, parsing...');
        try {
          const sessionData = JSON.parse(atob(sessionToken));
          accessToken = sessionData.access_token;
          refreshToken = sessionData.refresh_token;
          expiresIn = sessionData.expires_in;
        } catch (parseError) {
          console.error('Failed to parse session token:', parseError);
        }
      }
    }

    if (!accessToken) {
      throw new Error('No access token found in OAuth callback. Please check Supabase OAuth configuration.');
    }

    console.log('Getting user info from Google...');

    // Get user info from Google
    const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      throw new Error(`Failed to get user info: ${userResponse.status} - ${errorText}`);
    }

    const userInfo = await userResponse.json();
    console.log('User info retrieved:', userInfo);

    const sessionData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresIn ? Math.floor(Date.now() / 1000) + parseInt(expiresIn) : null,
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
            // Try postMessage fallback
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
  }

  closeBtn.addEventListener('click', () => {
    window.close();
  });
});