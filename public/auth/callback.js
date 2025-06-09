// Import from the local supabaseClient
import { getSupabaseClient } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loading-state');
  const successState = document.getElementById('success-state');
  const errorState = document.getElementById('error-state');
  const errorDiv = document.getElementById('error');
  const closeBtn = document.getElementById('close-btn');

  // Get extension ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const extensionId = urlParams.get('extensionId');

  if (!extensionId) {
    showError('Invalid callback - missing extension ID');
    return;
  }

  try {
    console.log('Callback page loaded, initializing Supabase...');
    
    // Initialize Supabase
    const supabase = await getSupabaseClient();
    
    console.log('Supabase initialized, processing OAuth callback...');

    // Get the session from the URL hash (Supabase OAuth callback)
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Session error:', error);
      throw error;
    }

    if (!session) {
      console.error('No session found in callback');
      throw new Error('No session found after authentication');
    }

    console.log('Session found for user:', session.user.email);

    // Prepare session data for the extension
    const sessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.email,
        picture: session.user.user_metadata?.avatar_url
      }
    };

    console.log('Sending session data to extension:', extensionId);

    // Send session data to Chrome extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage(extensionId, {
          action: 'authComplete',
          session: sessionData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to extension:', chrome.runtime.lastError);
            // Try postMessage fallback
            tryPostMessage(sessionData);
          } else {
            console.log('Successfully sent session to extension');
            showSuccess();
          }
        });
      } catch (chromeError) {
        console.error('Chrome runtime error:', chromeError);
        tryPostMessage(sessionData);
      }
    } else {
      tryPostMessage(sessionData);
    }

    function tryPostMessage(sessionData) {
      console.log('Using postMessage fallback...');
      if (window.opener) {
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