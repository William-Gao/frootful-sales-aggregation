import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import Dashboard from '../components/Dashboard';

interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

interface Organization {
  id: string;
  name: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [extensionLogoutInProgress, setExtensionLogoutInProgress] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    checkAuthState();
    
    // Listen for extension logout messages
    const handleExtensionLogout = (event: MessageEvent) => {
      if (event.data.source === "frootful-extension" && event.data.type === "EXTENSION_LOGOUT") {
        console.log('🚪 Received logout message from extension, processing immediate logout...');
        setExtensionLogoutInProgress(true);
        handleExtensionSignOut();
      }
    };

    window.addEventListener('message', handleExtensionLogout);
    
    return () => {
      window.removeEventListener('message', handleExtensionLogout);
    };
  }, []);

  // PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!installPrompt) return;

    const result = await installPrompt.prompt();
    console.log('PWA install result:', result);
    
    setInstallPrompt(null);
    setIsInstallable(false);
  };

  // Handle sign out initiated by extension
  const handleExtensionSignOut = async () => {
    try {
      console.log('🚪 Processing extension-initiated sign out...');
      
      // Sign out from Supabase (this clears the session)
      await supabaseClient.auth.signOut();
      
      // Small delay to ensure cleanup is complete
      setTimeout(() => {
        console.log('🔄 Redirecting to login after extension logout');
        window.location.replace('/login');
      }, 100);
      
    } catch (error) {
      console.error('Error during extension sign out:', error);
      // Still redirect even if there were errors
      window.location.replace('/login');
    }
  };

  const fetchUserOrganization = async (userId: string) => {
    try {
      // Check if supabaseClient has the from method
      if (!('from' in supabaseClient)) {
        console.error('Supabase client not properly initialized');
        return;
      }

      const { data, error } = await supabaseClient
        .from('user_organizations')
        .select('organization_id, organizations(id, name)')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user organization:', error);
        return;
      }

      if (data && data.organizations) {
        const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
        setOrganization({
          id: org.id,
          name: org.name
        });
        console.log('User organization:', org.name);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
    }
  };

  const checkAuthState = async () => {
    try {
      // If extension logout is in progress, skip auth check
      if (extensionLogoutInProgress) {
        console.log('Extension logout in progress, skipping auth check');
        setIsLoading(false);
        return;
      }

      // Check Supabase session - this is our single source of truth
      const { data: { session: authSession }, error: authError } = await supabaseClient.auth.getSession();
      let session = authSession;
      let error = authError;

      // If no session found, check if we have tokens in the URL hash (direct navigation)
      if (!session && window.location.hash) {
        console.log('No session found, checking URL hash for tokens...');
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
          console.log('Found tokens in URL hash, setting session...');
          const { data, error: setError } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          });

          if (!setError && data.session) {
            session = data.session;
            error = null;

            // Clear hash from URL
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }

      if (session && !error) {
        console.log('Found Supabase session for user:', session.user.email);
        setUser(session.user);

        // Fetch user's organization
        await fetchUserOrganization(session.user.id);

        // Store Google provider tokens if we have them and they're not already stored
        await storeGoogleTokensIfNeeded(session);

        // Notify extension about the session if needed
        notifyExtensionOfAuthState(session);

      } else {
        // No valid session, redirect to login
        console.log('No valid session found, redirecting to login');
        window.location.href = '/login';
        return;
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  };

  const storeGoogleTokensIfNeeded = async (session: any) => {
    try {
      // Check if we already have Google tokens stored
      const checkResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=google`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (checkResponse.ok) {
        const result = await checkResponse.json();
        if (result.success && result.tokens && result.tokens.length > 0) {
          console.log('Google tokens already stored in database');
          return;
        }
      }

      // Store Google provider tokens if we have them
      if (session.provider_token || session.access_token) {
        console.log('Storing Google provider tokens in database...');
        
        const storeResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            provider: 'google',
            accessToken: session.provider_token || session.access_token,
            refreshToken: session.provider_refresh_token || session.refresh_token,
            expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined
          })
        });

        if (storeResponse.ok) {
          console.log('Successfully stored Google provider tokens in database');
        } else {
          const errorText = await storeResponse.text();
          console.warn('Failed to store Google tokens in database:', errorText);
        }
      }
    } catch (error) {
      console.warn('Error storing Google tokens:', error);
    }
  };

  const notifyExtensionOfAuthState = async (session: any) => {
    try {
      // Store minimal session data for extension access
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: session.user,
            provider_token: session.provider_token || session.access_token,
            provider_refresh_token: session.provider_refresh_token || session.refresh_token || ''
          }
        });
      }

      // Notify extension
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        try {
          chrome.runtime.sendMessage({
            action: 'authComplete',
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
              user: session.user,
              provider_token: session.provider_token || session.access_token,
              provider_refresh_token: session.provider_refresh_token || session.refresh_token || ''
            }
          });
        } catch (error) {
          console.warn('Could not notify extension:', error);
        }
      }
    } catch (error) {
      console.error('Error notifying extension:', error);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    
    try {
      setIsSigningOut(true);
      console.log('Starting sign out process...');
      
      // Sign out from Supabase - this is our single source of truth
      await supabaseClient.auth.signOut();
      
      // Clear chrome storage for extension
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove(['session', 'frootful_session', 'frootful_user']);
        console.log('Cleared session from chrome.storage');
      }
      localStorage.clear()

      // Notify extension about sign out
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        try {
          chrome.runtime.sendMessage({
            action: 'signOut'
          });
          console.log('Notified extension about sign out');
        } catch (error) {
          console.warn('Could not notify extension about sign out:', error);
        }
      }

      // Post message for content script communication
      try {
        window.postMessage({
          source: "frootful-auth",
          type: "SUPABASE_SIGN_OUT"
        }, "*");
        console.log('Posted sign out message to window');
      } catch (error) {
        console.warn('Could not post sign out message:', error);
      }

      // Small delay to ensure all cleanup is complete
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
      
    } catch (error) {
      console.error('Error during sign out:', error);
      // Still redirect even if there were errors
      window.location.href = '/login';
    } finally {
      setIsSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      organizationId={organization?.id || null}
      layout="sidebar"
      headerContent={{
        organization,
        user,
        isInstallable,
        isSigningOut,
        onInstallPWA: handleInstallPWA,
        onSignOut: handleSignOut,
        onNavigateSettings: () => navigate('/settings'),
      }}
    />
  );
};

export default Dashboard;