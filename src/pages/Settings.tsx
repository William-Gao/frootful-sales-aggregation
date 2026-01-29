import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Database,
  Check,
  ChevronRight,
  Loader2,
  Settings as SettingsIcon,
  Plug,
  Bell,
  Users,
  Shield,
  Globe,
  Webhook,
  FileSpreadsheet,
  Truck,
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

interface ERPIntegration {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  logoUrl?: string;
  status: 'connected' | 'disconnected' | 'coming_soon';
  provider: string;
  color: string;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'integrations' | 'notifications' | 'team' | 'security'>('integrations');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const [integrations, setIntegrations] = useState<ERPIntegration[]>([
    {
      id: 'justfood',
      name: 'JustFood',
      logoUrl: 'https://mma.prnewswire.com/media/641791/JustFood_JustFood_Releases_Next_Generation_ERP_and_Analytics_Sol.jpg?p=facebook',
      status: 'disconnected',
      provider: 'justfood',
      color: '#E85D04',
    },
    {
      id: 'produce-pro',
      name: 'Produce Pro',
      logoUrl: 'https://fungtu.com/wp-content/uploads/2021/01/logo_1752_hd-1024x562.png',
      status: 'disconnected',
      provider: 'produce_pro',
      color: '#38A169',
    },
    {
      id: 'business-central',
      name: 'Microsoft Business Central',
      icon: Building2,
      status: 'disconnected',
      provider: 'business_central',
      color: '#00A4EF',
    },
    {
      id: 'dynamics-365',
      name: 'Dynamics 365 Sales',
      icon: Database,
      status: 'disconnected',
      provider: 'dynamics_365',
      color: '#002050',
    },
    {
      id: 'netsuite',
      name: 'Oracle NetSuite',
      icon: Globe,
      status: 'coming_soon',
      provider: 'netsuite',
      color: '#1A3D6D',
    },
    {
      id: 'sap',
      name: 'SAP S/4HANA',
      icon: FileSpreadsheet,
      status: 'coming_soon',
      provider: 'sap',
      color: '#008FD3',
    },
    {
      id: 'quickbooks',
      name: 'QuickBooks Online',
      icon: FileSpreadsheet,
      status: 'coming_soon',
      provider: 'quickbooks',
      color: '#2CA01C',
    },
    {
      id: 'webhook',
      name: 'Custom Webhook',
      icon: Webhook,
      status: 'coming_soon',
      provider: 'webhook',
      color: '#6366F1',
      features: ['REST API', 'Custom Payloads', 'Real-time Delivery', 'Retry Logic'],
    },
  ]);

  useEffect(() => {
    checkAuthAndLoadSettings();
  }, []);

  const checkAuthAndLoadSettings = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      // Check for existing BC connection
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
          if (!bcToken.token_expires_at || new Date(bcToken.token_expires_at) > new Date()) {
            setIntegrations(prev => prev.map(int =>
              int.provider === 'business_central' ? { ...int, status: 'connected' } : int
            ));
            setSelectedIntegration('business-central');
          }
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    if (provider !== 'business_central') {
      return;
    }

    try {
      setConnectingProvider(provider);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: 'business_central' })
      });

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth');
      }

      const result = await response.json();
      if (result.success && result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch (error) {
      console.error('Error connecting:', error);
      alert('Failed to connect. Please try again.');
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (!confirm('Are you sure you want to disconnect this integration? You will need to reconnect to push orders to this system.')) {
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=${provider}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setIntegrations(prev => prev.map(int =>
          int.provider === provider ? { ...int, status: 'disconnected' } : int
        ));
        if (selectedIntegration === integrations.find(i => i.provider === provider)?.id) {
          setSelectedIntegration(null);
        }
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  const handleSelectDefault = (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (integration?.status === 'connected') {
      setSelectedIntegration(integrationId);
      // In a real app, you'd save this preference to the database
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'security', label: 'Security', icon: Shield },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mr-6"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <SettingsIcon className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Settings</h1>
                <p className="text-sm text-gray-500">Manage your integrations and preferences</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">ERP Integrations</h2>
                  <p className="text-gray-600 mt-1">
                    Connect your ERP system to automatically push extracted orders. Select a default integration for seamless order processing.
                  </p>
                </div>

                {/* Connected Integration Banner */}
                {selectedIntegration && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-green-900">
                          Default Integration: {integrations.find(i => i.id === selectedIntegration)?.name}
                        </p>
                        <p className="text-sm text-green-700">
                          Orders will be pushed to this system automatically
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Integration Cards */}
                <div className="grid gap-4">
                  {integrations.map((integration) => {
                    const Icon = integration.icon;
                    const isSelected = selectedIntegration === integration.id;
                    const isConnecting = connectingProvider === integration.provider;

                    return (
                      <div
                        key={integration.id}
                        className={`bg-white rounded-xl shadow-sm border-2 p-6 transition-all ${
                          isSelected
                            ? 'border-green-400 ring-2 ring-green-100'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-4">
                            <div
                              className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
                              style={{ backgroundColor: integration.logoUrl ? '#fff' : `${integration.color}15` }}
                            >
                              {integration.logoUrl ? (
                                <img
                                  src={integration.logoUrl}
                                  alt={`${integration.name} logo`}
                                  className="w-full h-full object-contain"
                                />
                              ) : Icon ? (
                                <Icon
                                  className="w-7 h-7"
                                  style={{ color: integration.color }}
                                />
                              ) : null}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {integration.name}
                                </h3>
                                {isSelected && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <Check className="w-3 h-3 mr-1" />
                                    Default
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Help Section */}
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Need a different integration?</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    We're constantly adding new integrations. If you need a specific ERP system that's not listed,
                    let us know and we'll prioritize it.
                  </p>
                  <button className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                    Request an Integration →
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Notification Settings</h2>
                  <p className="text-gray-600 mt-1">
                    Configure how and when you receive notifications about orders and system events.
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">New Order Alerts</p>
                        <p className="text-sm text-gray-500">Get notified when new orders are extracted</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Processing Errors</p>
                        <p className="text-sm text-gray-500">Alert when an order fails to process</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Daily Summary</p>
                        <p className="text-sm text-gray-500">Receive a daily digest of order activity</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">ERP Sync Status</p>
                        <p className="text-sm text-gray-500">Notify when orders are pushed to ERP</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'team' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Team Management</h2>
                  <p className="text-gray-600 mt-1">
                    Manage team members and their access to your organization.
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-medium text-gray-900">Team Members</h3>
                    <button
                      className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                      style={{ backgroundColor: '#53AD6D' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4a9c63'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#53AD6D'}
                    >
                      Invite Member
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <img
                          src="https://ui-avatars.com/api/?name=Demo+User&background=53AD6D&color=fff"
                          alt="Demo User"
                          className="w-10 h-10 rounded-full"
                        />
                        <div>
                          <p className="font-medium text-gray-900">Demo User</p>
                          <p className="text-sm text-gray-500">demo@frootful.ai</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        Admin
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Security Settings</h2>
                  <p className="text-gray-600 mt-1">
                    Manage your security preferences and authentication settings.
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                        <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                      </div>
                      <button className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        Enable
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">API Keys</p>
                        <p className="text-sm text-gray-500">Manage API keys for external integrations</p>
                      </div>
                      <button className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        Manage Keys
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">Session Management</p>
                        <p className="text-sm text-gray-500">View and manage active sessions</p>
                      </div>
                      <button className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        View Sessions
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
