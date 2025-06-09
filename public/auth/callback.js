// Callback handler for Supabase OAuth
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
    
    // Initialize Supabase client
    const supabase = await initializeSupabase();
    
    console.log('Supabase initialized, getting session...');

    // Get the session from Supabase (it handles the code exchange automatically)
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Session error:', error);
      throw error;
    }

    if (!session) {
      console.error('No session found');
      throw new Error('No session found after authentication');
    }

    console.log('Session found:', session.user.email);

    // Get user info
    const user = session.user;
    const accessToken = session.access_token;

    const sessionData = {
      access_token: accessToken,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email,
        picture: user.user_metadata?.avatar_url
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

// Initialize Supabase client for callback processing
async function initializeSupabase() {
  try {
    // Load Supabase from CDN
    if (!window.supabase) {
      await loadSupabaseScript();
    }

    const { createClient } = window.supabase;
    
    const supabaseUrl = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    return supabase;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    throw error;
  }
}

// Load Supabase script dynamically
function loadSupabaseScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}