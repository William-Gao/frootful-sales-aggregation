import React, { useEffect, useState } from 'react';
import { CheckCircle, ExternalLink, Settings, Zap, Building2, Database, ArrowRight, Loader2 } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

interface ERPConnection {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'connected' | 'disconnected' | 'connecting';
  provider: string;
  companyName?: string;
}

interface Company {
  id: string;
  name: string;
  displayName: string;
  businessProfileId: string;
}

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [erpConnections, setErpConnections] = useState<ERPConnection[]>([
    {
      id: 'business-central',
      name: 'Microsoft Business Central',
      description: 'Connect to your Business Central environment to create sales orders directly from emails.',
      icon: Building2,
      status: 'disconnected',
      provider: 'business_central'
    },
    {
      id: 'dynamics-365',
      name: 'Dynamics 365 Sales',
      description: 'Integrate with Dynamics 365 Sales for comprehensive CRM functionality.',
      icon: Database,
      status: 'disconnected',
      provider: 'dynamics_365'
    }
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [extensionLogoutInProgress, setExtensionLogoutInProgress] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  useEffect(() => {
    checkAuthState();
    checkERPConnections();
    
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

  const checkAuthState = async () => {
    try {
      // If extension logout is in progress, skip auth check
      if (extensionLogoutInProgress) {
        console.log('Extension logout in progress, skipping auth check');
        setIsLoading(false);
        return;
      }

      // Check Supabase session - this is our single source of truth
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      
      if (session && !error) {
        console.log('Found Supabase session for user:', session.user.email);
        setUser(session.user);
        
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

  const checkERPConnections = async () => {
    try {
      // Check if we have Business Central tokens in our database
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;

      // Call our token-manager edge function to check for BC tokens
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.tokens && result.tokens.length > 0) {
          const bcToken = result.tokens[0];
          
          // Check if token is still valid
          if (!bcToken.token_expires_at || new Date(bcToken.token_expires_at) > new Date()) {
            setErpConnections(prev => prev.map(erp => {
              if (erp.provider === 'business_central') {
                return {
                  ...erp,
                  status: 'connected',
                  companyName: bcToken.company_name
                };
              }
              return erp;
            }));

            // Load companies if connected
            await loadCompanies(bcToken.access_token);
            setSelectedCompanyId(bcToken.company_id || '');
          }
        }
      }
    } catch (error) {
      console.error('Error checking ERP connections:', error);
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

  const connectERP = async (provider: string) => {
    if (provider !== 'business_central') {
      alert(`${provider} integration coming soon!`);
      return;
    }

    try {
      setConnectingProvider(provider);
      
      console.log('Starting Business Central OAuth flow...');
      
      // Business Central OAuth configuration
      const CLIENT_ID = '4c92a998-6af5-4c2a-b16e-80ba1c6b9b3b';
      const TENANT_ID = 'common';
      const REDIRECT_URI = `https://use.frootful.ai/auth/callback`;
      const SCOPE = 'https://api.businesscentral.dynamics.com/user_impersonation offline_access';
      
      // Generate random state and code verifier for PKCE
      const state = generateRandomString(32);
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      
      // Store PKCE values for later verification
      sessionStorage.setItem('bc_state', state);
      sessionStorage.setItem('bc_code_verifier', codeVerifier);
      
      // Construct auth URL
      const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
        `client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256` +
        `&prompt=select_account` +
        `&response_mode=query`;

      console.log('Redirecting to Business Central OAuth:', authUrl);
      
      // Redirect to Microsoft OAuth
      window.location.href = authUrl;
      
    } catch (error) {
      console.error('Error connecting ERP:', error);
      alert('Failed to connect to ERP. Please try again.');
      setConnectingProvider(null);
    }
  };

  const loadCompanies = async (token: string) => {
    try {
      console.log('Loading Business Central companies...');
      
      const response = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch companies');
      }

      const data = await response.json();
      const companiesList = data.value || [];
      
      console.log(`Loaded ${companiesList.length} companies`);
      setCompanies(companiesList);
      
      return companiesList;
    } catch (error) {
      console.error('Error loading companies:', error);
      return [];
    }
  };

  const handleCompanySelection = async (companyId: string) => {
    try {
      const selectedCompany = companies.find(c => c.id === companyId);
      if (!selectedCompany) return;

      setSelectedCompanyId(companyId);

      // Update company selection in database
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyId: companyId,
          companyName: selectedCompany.displayName || selectedCompany.name
        })
      });

      if (response.ok) {
        console.log('Company selection updated successfully');
        
        // Update ERP connection display
        setErpConnections(prev => prev.map(erp => {
          if (erp.provider === 'business_central') {
            return {
              ...erp,
              companyName: selectedCompany.displayName || selectedCompany.name
            };
          }
          return erp;
        }));
      }
    } catch (error) {
      console.error('Error updating company selection:', error);
    }
  };

  const openGmail = () => {
    window.open('https://mail.google.com', '_blank');
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

  // Helper functions for PKCE
  const generateRandomString = (length: number): string => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const generateCodeChallenge = async (verifier: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Frootful
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {user && (
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{user.user_metadata?.full_name || user.email}</p>
                    <p className="text-xs text-gray-500">Connected to Gmail</p>
                  </div>
                  {user.user_metadata?.avatar_url && (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="Profile"
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                </div>
              )}
              <div className="relative group">
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <button
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSigningOut ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing out...</span>
                      </div>
                    ) : (
                      'Sign Out'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Frootful! 👋
          </h2>
          <p className="text-lg text-gray-600">
            Connect your ERP system to start transforming email orders into sales orders automatically.
          </p>
        </div>

        {/* Gmail Connection Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Gmail Connected</h3>
                <p className="text-gray-600">Ready to extract orders from your emails</p>
              </div>
            </div>
            <button
              onClick={openGmail}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <span>Open Gmail</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ERP Connections */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Connect Your ERP</h3>
          <div className="grid gap-6 md:grid-cols-2">
            {erpConnections.map((erp) => {
              const Icon = erp.icon;
              const isConnecting = connectingProvider === erp.provider;
              
              return (
                <div
                  key={erp.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        erp.status === 'connected' 
                          ? 'bg-green-100' 
                          : 'bg-gray-100'
                      }`}>
                        <Icon className={`w-6 h-6 ${
                          erp.status === 'connected' 
                            ? 'text-green-600' 
                            : 'text-gray-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">{erp.name}</h4>
                        {erp.status === 'connected' && erp.companyName && (
                          <p className="text-sm text-green-600">Connected to {erp.companyName}</p>
                        )}
                      </div>
                    </div>
                    
                    {erp.status === 'connected' && (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    )}
                  </div>
                  
                  <p className="text-gray-600 mb-4">{erp.description}</p>
                  
                  {/* Company Selection for Business Central */}
                  {erp.provider === 'business_central' && erp.status === 'connected' && companies.length > 0 && (
                    <div className="mb-4">
                      <label htmlFor="company-select" className="block text-sm font-medium text-gray-700 mb-2">
                        Select Company:
                      </label>
                      <select
                        id="company-select"
                        value={selectedCompanyId}
                        onChange={(e) => handleCompanySelection(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select a company...</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.displayName || company.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <button
                    onClick={() => connectERP(erp.provider)}
                    disabled={isConnecting || erp.status === 'connected'}
                    className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                      erp.status === 'connected'
                        ? 'bg-green-50 text-green-700 cursor-default'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : erp.status === 'connected' ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Connected</span>
                      </>
                    ) : (
                      <>
                        <span>Connect</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Next Steps</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                1
              </div>
              <span className="text-gray-700">Connect your ERP system above</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                2
              </div>
              <span className="text-gray-700">Open Gmail and find an email with order information</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                3
              </div>
              <span className="text-gray-700">Click the "Extract" button in the email toolbar</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                4
              </div>
              <span className="text-gray-700">Review and export the order to your ERP system</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;