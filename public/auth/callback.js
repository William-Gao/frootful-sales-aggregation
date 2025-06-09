// Callback handler for Supabase OAuth - No external dependencies
document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loading-state');
  const successState = document.getElementById('success-state');
  const errorState = document.getElementById('error-state');
  const errorDiv = document.getElementById('error');
  const closeBtn = document.getElementById('close-btn');

  // Get extension ID from session storage (set during login)
  const extensionId = sessionStorage.getItem('extension_id');

  if (!extensionId) {
    showError('Invalid callback - missing extension ID');
    return;
  }

  try {
    console.log('Callback page loaded, processing Supabase OAuth response...');
    
    // Check URL for session data (Supabase redirects with hash fragments)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlParams = new URLSearchParams(window.location.search);
    
    // Look for access token in hash or query parameters
    let accessToken = hashParams.get('access_token') || urlParams.get('access_token');
    let refreshToken = hashParams.get('refresh_token') || urlParams.get('refresh_token');
    let expiresIn = hashParams.get('expires_in') || urlParams.get('expires_in');
    let tokenType = hashParams.get('token_type') || urlParams.get('token_type');
    
    console.log('URL hash:', window.location.hash);
    console.log('URL search:', window.location.search);
    console.log('Access token found:', !!accessToken);

    if (!accessToken) {
      // Try to get session from Supabase API directly
      console.log('No access token in URL, trying to fetch session from Supabase...');
      
      try {
        // Make a request to Supabase to get the current session
        const response = await fetch('https://zkglvdfppodwlgzhfgqs.supabase.co/auth/v1/user', {
          method: 'GET',
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg',
            'Authorization': `Bearer ${accessToken || ''}`
          }
        });

        if (response.ok) {
          const userData = await response.json();
          console.log('User data from Supabase:', userData);
        }
      } catch (apiError) {
        console.error('Supabase API error:', apiError);
      }
      
      throw new Error('No access token found in OAuth callback');
    }

    console.log('Processing OAuth tokens...');

    // Get user info from Google using the access token
    const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
    
    if (!userResponse.ok) {
      throw new Error('Failed to get user info from Google');
    }

    const userInfo = await userResponse.json();
    console.log('User info from Google:', userInfo);

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

    console.log('Sending session data to extension...');

    // Send session data to Chrome extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage(extensionId, {
          action: 'authComplete',
          session: sessionData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to extension:', chrome.runtime.lastError);
            showError('Failed to communicate with extension');
            return;
          }
          
          console.log('Successfully sent session to extension');
          // Show success and close window
          showSuccess();
        });
      } catch (chromeError) {
        console.error('Chrome runtime error:', chromeError);
        showError('Failed to communicate with extension');
      }
    } else {
      // Fallback: try to communicate via postMessage to opener window
      if (window.opener) {
        console.log('Using postMessage fallback...');
        window.opener.postMessage({
          action: 'authComplete',
          session: sessionData
        }, '*');
        
        showSuccess();
      } else {
        showError('Unable to communicate with extension');
      }
    }
  } catch (error) {
    console.error('Callback error:', error);
    showError(error.message || 'Authentication failed');
  }

  function showSuccess() {
    loadingState.style.display = 'none';
    successState.style.display = 'block';
    
    // Auto-close window after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
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