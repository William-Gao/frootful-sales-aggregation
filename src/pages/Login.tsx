import React, { useEffect, useState } from 'react';
import { LogIn, Shield, Zap } from 'lucide-react';
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
      const extensionId = urlParams.get('extensionId');

      // Redirect to Supabase OAuth with proper callback
      const SUPA_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
      const callback = `${window.location.origin}/auth/callback${extensionId ? `?extensionId=${extensionId}` : ''}`;
      const encoded = encodeURIComponent(callback);

      const authUrl =
        `${SUPA_URL}/auth/v1/authorize` +
        `?provider=google` +
        `&redirect_to=${encoded}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&scopes=email profile https://www.googleapis.com/auth/gmail.readonly`;

      console.log('Redirecting to Google OAuth:', authUrl);

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Sign in error:', error);
      setError('Failed to initiate sign in. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo and Header */}
          <div className="flex justify-center">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
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
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Zap className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">ERP Integration</h3>
                    <p className="text-sm text-gray-500">Direct connection to Business Central and more</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <LogIn className="w-4 h-4 text-purple-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">One-Click Processing</h3>
                    <p className="text-sm text-gray-500">Transform emails into orders instantly</p>
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
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
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

            {/* Privacy Notice */}
            <div className="mt-6">
              <div className="text-xs text-gray-500 text-center">
                By signing in, you agree to our{' '}
                <a href="/privacy" className="text-indigo-600 hover:text-indigo-500">
                  Privacy Policy
                </a>{' '}
                and{' '}
                <a href="/terms" className="text-indigo-600 hover:text-indigo-500">
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;