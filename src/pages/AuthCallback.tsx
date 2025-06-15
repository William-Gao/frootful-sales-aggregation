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
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');
      
      console.log('Extension ID from URL:', extensionId);
      console.log('OAuth code present:', !!code);
      console.log('OAuth state present:', !!state);

      // Check for OAuth errors
      if (error) {
        throw new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`);
      }

      // Handle Business Central OAuth callback
      if (code && state) {
        console.log('Processing Business Central OAuth callback...');
        await handleBusinessCentralCallback(code, state);
        return;
      }

      // Handle Google OAuth callback (existing logic)
      const { data: { session }, error: supabaseError } = await supabaseClient.auth.getSession();
      
      console.log('Supabase session:', session ? 'Found' : 'Not found');
      console.log('Supabase error:', supabaseError);

      if (supabaseError) {
        throw new Error(`Supabase auth error: ${supabaseError.message}`);
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
        } catch (chromeError) {
          console.warn('Chrome runtime error:', chromeError);
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

  const handleBusinessCentralCallback = async (code: string, state: string) => {
    try {
      console.log('Processing Business Central OAuth callback...');
      
      // Verify state parameter
      const storedState = sessionStorage.getItem('bc_state');
      if (state !== storedState) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }

      // Get stored PKCE values
      const codeVerifier = sessionStorage.getItem('bc_code_verifier');
      if (!codeVerifier) {
        throw new Error('Code verifier not found');
      }

      // Clean up session storage
      sessionStorage.removeItem('bc_state');
      sessionStorage.removeItem('bc_code_verifier');

      // Exchange code for tokens
      const CLIENT_ID = '4c92a998-6af5-4c2a-b16e-80ba1c6b9b3b';
      const TENANT_ID = 'common';
      const REDIRECT_URI = `${window.location.origin}/auth/callback`;

      console.log('Exchanging code for tokens...');

      const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', tokenResponse.status, errorText);
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const tokens = await tokenResponse.json();
      
      if (!tokens.access_token) {
        console.error('Token exchange failed:', tokens);
        throw new Error('Failed to get access token');
      }

      console.log('Business Central tokens received successfully');

      // Parse tenant ID from the token
      const tenantId = await parseTenantIdFromToken(tokens.access_token);
      
      // Get current user session
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated with Supabase');
      }

      // Store tokens in database using token-manager edge function
      console.log('Storing Business Central tokens in database...');
      
      const storeResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'business_central',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
          tenantId: tenantId
        })
      });

      if (!storeResponse.ok) {
        const errorText = await storeResponse.text();
        console.error('Failed to store tokens:', errorText);
        throw new Error('Failed to store Business Central tokens');
      }

      console.log('Business Central tokens stored successfully');

      setStatus('success');
      setMessage('Business Central connected successfully! Redirecting to dashboard...');

      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (error) {
      console.error('Business Central callback error:', error);
      throw error;
    }
  };

  // Parse tenant ID from JWT token
  const parseTenantIdFromToken = async (token: string): Promise<string> => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }

      const payload = parts[1];
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
      const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
      const tokenData = JSON.parse(decodedPayload);
      
      const tenantId = tokenData.tid;
      if (!tenantId) {
        throw new Error('Tenant ID not found in token');
      }
      
      return tenantId;
    } catch (error) {
      console.error('Error parsing tenant ID from token:', error);
      throw new Error('Failed to parse tenant ID from token');
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
              onClick={() => window.location.href = '/dashboard'}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;