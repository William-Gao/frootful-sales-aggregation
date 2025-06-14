import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { getSupabaseClient } from 'supabaseClient.ts'

const AuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    handleAuthCallback();
  }, []);

  const handleAuthCallback = async () => {
    try {
      console.log('Auth success handler called, processing session...');
      // Get URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const extensionId = urlParams.get('extensionId');
      
      // Get session from URL hash (Supabase OAuth callback)
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const expiresIn = hashParams.get('expires_in');
      const providerToken = hashParams.get('provider_token');
      const providerRefreshToken = hashParams.get('provider_refresh_token');

    
      // Initialize Supabase
      const supabase = await getSupabaseClient();

      console.log('This is hash inside the AuthCallback.tsx: ', hash);
      console.log('This is supabase inside the AuthCallback.tsx: ', supabase);

      const { data: { session }, error } = await supabaseClient.auth.getSession();
      console.log('This is session data from supabase get session: ', session);

      if (!accessToken) {
        throw new Error('No access token found in callback');
      }

      console.log('Processing auth callback with tokens, first trying to store the session using the supabase method');

      
            
      // Set the supabase session'
      const sessionData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user, // Keep full user object
        provider_token: providerToken || session.access_token, // Fallback to access_token
        provider_refresh_token: providerRefreshToken || session.refresh_token || ''
      };
      await supabase.storeSession(sessionData);
      // Get user info from Google
      const userResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${providerToken || accessToken}`);
      
      if (!userResponse.ok) {
        throw new Error('Failed to get user information');
      }
      
      const userInfo = await userResponse.json();
      console.log('Got user info:', userInfo.email);

      // Store session in localStorage for SPA
      localStorage.setItem('frootful_session', JSON.stringify(sessionData));
      localStorage.setItem('frootful_user', JSON.stringify(userInfo));
      console.log('Stored session in localStorage');

      // Notify extension if extension ID is provided
      if (extensionId) {
        console.log('Notifying extension:', extensionId);
        
        try {
          // Try chrome.runtime.sendMessage first
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage(extensionId, {
              action: 'authComplete',
              session: sessionData
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('Chrome runtime error:', chrome.runtime.lastError);
              } else {
                console.log('Successfully notified extension via chrome.runtime');
              }
            });
          }

          // Also store in chrome.storage for the extension to access
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({
              frootful_session: JSON.stringify(sessionData),
              frootful_user: JSON.stringify(userInfo)
            }, () => {
              console.log('Stored session in chrome.storage for extension');
            });
          }
        } catch (error) {
          console.warn('Could not notify extension:', error);
        }
      }

      setStatus('success');
      setMessage('Authentication successful! Redirecting to dashboard...');

      // Clear hash from URL
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (error) {
      console.error('Auth callback error:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Processing...</h2>
            </>
          )}
          
          {status === 'success' && (
            <>
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Success!</h2>
            </>
          )}
          
          {status === 'error' && (
            <>
              <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
            </>
          )}
          
          <p className="text-gray-600">{message}</p>
          
          {status === 'error' && (
            <button
              onClick={() => window.location.href = '/login'}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;