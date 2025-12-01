import React, { useEffect, useState } from 'react';
import { LogIn, Shield } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already authenticated
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      // Check if user is already signed in using Supabase - single source of truth
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (session && !error) {
        console.log('User already authenticated, redirecting to dashboard');
        window.location.href = '/dashboard';
        return;
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get extension ID from URL params if available
      const urlParams = new URLSearchParams(window.location.search);

      // Redirect to Supabase OAuth with proper callback
      const SUPA_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
      const callback = `${window.location.origin}/auth/callback`;
      const encoded = encodeURIComponent(callback);
      console.log('This is the callback url: ', callback);
      // Regular user login - only request basic profile permissions
      // Users will forward emails to orders.frootful@gmail.com instead of using Gmail API
      const authUrl =
        `${SUPA_URL}/auth/v1/authorize` +
        `?provider=google` +
        `&redirect_to=${encoded}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&scopes=email profile`;

      console.log('Redirecting to Google OAuth:', authUrl);

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Sign in error:', error);
      setError('Failed to initiate sign in. Please try again.');
      setIsLoading(false);
    }
  };

  // Store Supabase session for Workspace Add-on access
  const storeSupabaseSession = async (session: any) => {
    try {
      console.log('Storing Supabase session for Workspace Add-on access...');
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'supabase_session',
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
          email: session.user.email
        })
      });

      if (response.ok) {
        console.log('Successfully stored Supabase session for Workspace Add-on');
      } else {
        const errorText = await response.text();
        console.warn('Failed to store Supabase session for Workspace Add-on:', errorText);
      }
    } catch (error) {
      console.warn('Error storing Supabase session for Workspace Add-on:', error);
    }
  };

  // Listen for auth state changes to store session
  React.useEffect(() => {
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        console.log('User signed in, storing session for Workspace Add-on...');
        await storeSupabaseSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo and Header */}
          <div className="flex justify-center">
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold" style={{ color: '#53AD6D' }}>
                Frootful
              </h1>
            </div>
          </div>
          
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Welcome to Frootful
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Transform your email orders into ERP entries in seconds
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-gray-100">
            {/* Features */}
            <div className="mb-8">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Shield className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Secure Gmail Integration</h3>
                    <p className="text-sm text-gray-500">AI-powered email analysis with enterprise security</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Shield className="w-4 h-4" style={{ color: '#53AD6D' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">One-Click Processing</h3>
                    <p className="text-sm text-gray-500">Transform emails into orders instantly</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <LogIn className="w-4 h-4" style={{ color: '#53AD6D' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Seamless ERP Integration</h3>
                    <p className="text-sm text-gray-500">Direct connection to your business systems</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-sm text-red-600">{error}</div>
              </div>
            )}

            {/* Sign In Button */}
            <div>
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                style={{ 
                  backgroundColor: '#53AD6D',
                  boxShadow: '0 4px 6px -1px rgba(83, 173, 109, 0.1), 0 2px 4px -1px rgba(83, 173, 109, 0.06)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4a9c63';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#53AD6D';
                }}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Connecting...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </div>
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;