import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

const AuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    handleAuthCallback();
  }, []);

  const handleAuthCallback = async () => {
    try {
      console.log('Auth callback processing started...');
      
      // Get URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const extensionId = urlParams.get('extensionId');
      
      console.log('Extension ID from URL:', extensionId);

      // Get session from Supabase (it should automatically detect the OAuth callback)
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      
      console.log('Supabase session:', session ? 'Found' : 'Not found');
      console.log('Supabase error:', error);

      if (error) {
        throw new Error(`Supabase auth error: ${error.message}`);
      }

      if (!session) {
        throw new Error('No session found after OAuth callback');
      }

      console.log('Processing auth callback for user:', session.user.email);

      // Prepare session data for the extension
      const sessionData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user,
        provider_token: session.provider_token || session.access_token,
        provider_refresh_token: session.provider_refresh_token || session.refresh_token || ''
      };

      console.log('Sending session data to extension...');

      // Send session data to Chrome extension
      if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
        console.log('Notifying extension:', extensionId);
        
        try {
          chrome.runtime.sendMessage(extensionId, {
            action: 'authComplete',
            session: sessionData
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('Chrome runtime error:', chrome.runtime.lastError);
            } else {
              console.log('Successfully sent session to extension');
            }
          });
        } catch (error) {
          console.warn('Could not send message to extension:', error);
        }

        // Also try sending to current extension context
        try {
          chrome.runtime.sendMessage({
            action: 'authComplete',
            session: sessionData
          });
        } catch (error) {
          console.warn('Could not send message to current extension context:', error);
        }
      }

      // Post message for content script communication
      window.postMessage({
        source: "frootful-auth",
        type: "SUPABASE_AUTH_SUCCESS",
        session: sessionData
      }, "*");

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