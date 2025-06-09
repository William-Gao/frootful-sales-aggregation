// public/auth/callback.ts

import { getSupabaseClient, type SupabaseSession } from './supabaseClient.js';

interface ExtensionSessionData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
}

document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
  const loadingState = document.getElementById('loading-state') as HTMLElement;
  const successState = document.getElementById('success-state') as HTMLElement;
  const errorState = document.getElementById('error-state') as HTMLElement;
  const errorDiv = document.getElementById('error') as HTMLElement;
  const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;

  if (!loadingState || !successState || !errorState || !errorDiv || !closeBtn) {
    console.error('Required DOM elements not found');
    return;
  }

  // Get extension ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const extensionId = urlParams.get('extensionId');
  console.log('Callback page loaded, location:', window.location.href);

  try {
    console.log('Initializing Supabase...');
    
    // Initialize Supabase
    const supabase = await getSupabaseClient();
    
    console.log('Processing OAuth callback...');

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
    const sessionData: ExtensionSessionData = {
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

    console.log('Sending session data to extension...');

    // Send session data to Chrome extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage(extensionId || chrome.runtime.id, {
          action: 'authComplete',
          session: sessionData
        }, (response: any) => {
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

    function tryPostMessage(sessionData: ExtensionSessionData): void {
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
    showError(error instanceof Error ? error.message : 'Authentication failed');
  }

  function showSuccess(): void {
    loadingState.style.display = 'none';
    successState.style.display = 'block';
    
    // Auto-close window after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
  }

  function showError(message: string): void {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    closeBtn.style.display = 'inline-block';
  }

  closeBtn.addEventListener('click', (): void => {
    window.close();
  });
});