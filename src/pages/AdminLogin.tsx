import React, { useEffect, useState } from 'react';
import { Shield, Lock } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

const AdminLogin: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already authenticated
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (session && !error) {
        console.log('User already authenticated, redirecting to admin dashboard');
        window.location.href = '/admin';
        return;
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    }
  };

  const handleAdminSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const callback = `${window.location.origin}/auth/callback`;
      const encoded = encodeURIComponent(callback);

      // Admin login with full Gmail permissions for orders.frootful@gmail.com
      const authUrl =
        `${SUPA_URL}/auth/v1/authorize` +
        `?provider=google` +
        `&redirect_to=${encoded}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&scopes=email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels https://www.googleapis.com/auth/gmail.modify`;

      console.log('Admin login - redirecting to Google OAuth with full Gmail permissions');
      window.location.href = authUrl;
    } catch (error) {
      console.error('Admin sign in error:', error);
      setError('Failed to initiate admin sign in. Please try again.');
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

  React.useEffect(() => {
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        console.log('Admin user signed in, storing session...');
        await storeSupabaseSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo and Header */}
          <div className="flex justify-center">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-purple-600">
                Frootful Admin
              </h1>
            </div>
          </div>

          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Admin Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in as orders.frootful@gmail.com to manage email processing
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-purple-100">
            {/* Admin Notice */}
            <div className="mb-8 bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Lock className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-purple-900">Admin Access Required</h3>
                  <p className="text-sm text-purple-700 mt-1">
                    This login grants full Gmail permissions for the orders.frootful@gmail.com intake account.
                  </p>
                  <p className="text-sm text-purple-700 mt-2">
                    Regular users should use the <a href="/login" className="underline font-medium">standard login</a>.
                  </p>
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
                onClick={handleAdminSignIn}
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
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
                    <span>Sign in as Admin</span>
                  </div>
                )}
              </button>
            </div>

            {/* Back to Regular Login */}
            <div className="mt-6">
              <div className="text-center">
                <a
                  href="/login"
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  Back to regular login
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
