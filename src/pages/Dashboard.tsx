import React, { useEffect, useState } from 'react';
import { CheckCircle, ExternalLink, Settings, Zap, Building2, Database, ArrowRight, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    checkAuthState();
    checkERPConnections();
  }, []);

  const checkAuthState = async () => {
    try {
      // Check if we have a session from URL hash (OAuth callback)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      
      if (accessToken) {
        // We have tokens from OAuth callback, get user info
        const providerToken = params.get('provider_token') || accessToken;
        const userResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${providerToken}`);
        const userInfo = await userResponse.json();
        setUser(userInfo);
        
        // Store session and notify extension
        await storeSession(accessToken, params, userInfo);
        
        // Clear hash from URL
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else {
        // Check for existing session in localStorage
        const sessionData = localStorage.getItem('frootful_session');
        const userData = localStorage.getItem('frootful_user');
        
        if (sessionData && userData) {
          const session = JSON.parse(sessionData);
          const user = JSON.parse(userData);
          
          // Check if session is expired
          if (session.expires_at && Date.now() / 1000 > session.expires_at) {
            console.log('Session expired');
            clearSession();
            window.location.href = '/login';
            return;
          }
          
          setUser(user);
        } else {
          // No valid session, redirect to login
          window.location.href = '/login';
          return;
        }
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  };

  const checkERPConnections = async () => {
    try {
      // Check ERP connection status
      // For now, just check if we have BC tokens stored
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['bc_tokens']);
        if (result.bc_tokens) {
          const tokenData = JSON.parse(result.bc_tokens);
          if (tokenData.expires_at && Date.now() < tokenData.expires_at) {
            setErpConnections(prev => prev.map(erp => {
              if (erp.provider === 'business_central') {
                return {
                  ...erp,
                  status: 'connected',
                  companyName: tokenData.company_name
                };
              }
              return erp;
            }));
          }
        }
      }
    } catch (error) {
      console.error('Error checking ERP connections:', error);
    }
  };

  const storeSession = async (accessToken: string, params: URLSearchParams, userInfo: any) => {
    try {
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      const providerToken = params.get('provider_token');
      const providerRefreshToken = params.get('provider_refresh_token');

      const sessionData = {
        access_token: accessToken,
        refresh_token: refreshToken || '',
        expires_at: expiresIn ? Math.floor(Date.now() / 1000) + parseInt(expiresIn, 10) : undefined,
        user: userInfo,
        provider_token: providerToken || accessToken,
        provider_refresh_token: providerRefreshToken || refreshToken || ''
      };

      // Store in localStorage
      localStorage.setItem('frootful_session', JSON.stringify(sessionData));
      localStorage.setItem('frootful_user', JSON.stringify(userInfo));

      // Also store in chrome.storage for extension access
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({
          frootful_session: JSON.stringify(sessionData),
          frootful_user: JSON.stringify(userInfo)
        });
      }

      // Notify extension
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        try {
          chrome.runtime.sendMessage({
            action: 'authComplete',
            session: sessionData
          });
        } catch (error) {
          console.warn('Could not notify extension:', error);
        }
      }
    } catch (error) {
      console.error('Error storing session:', error);
    }
  };

  const connectERP = async (provider: string) => {
    try {
      setConnectingProvider(provider);
      
      if (provider === 'business_central') {
        // For now, just show a message that BC integration is handled by the extension
        alert('Please use the Chrome extension popup to connect to Business Central. Click the extension icon in your browser toolbar.');
      } else {
        // Handle other ERP providers
        alert(`${provider} integration coming soon!`);
      }
    } catch (error) {
      console.error('Error connecting ERP:', error);
      alert('Failed to connect to ERP. Please try again.');
    } finally {
      setConnectingProvider(null);
    }
  };

  const openGmail = () => {
    window.open('https://mail.google.com', '_blank');
  };

  const clearSession = () => {
    localStorage.removeItem('frootful_session');
    localStorage.removeItem('frootful_user');
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(['frootful_session', 'frootful_user']);
    }
  };

  const handleSignOut = () => {
    clearSession();
    window.location.href = '/login';
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
                    <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
                    <p className="text-xs text-gray-500">Connected to Gmail</p>
                  </div>
                  {user.picture && (
                    <img
                      src={user.picture}
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
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sign Out
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
                  
                  {erp.provider === 'business_central' ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> Use the Chrome extension popup to connect to Business Central. 
                        Click the extension icon in your browser toolbar.
                      </p>
                    </div>
                  ) : null}
                  
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
              <span className="text-gray-700">Connect your ERP system using the Chrome extension popup</span>
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