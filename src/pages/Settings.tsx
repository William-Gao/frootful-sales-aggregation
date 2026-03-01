import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Settings as SettingsIcon,
  Plug,
  Users,
  Webhook,
  Search,
} from 'lucide-react';
import { supabaseClient, getAccessToken } from '../supabaseClient';

interface Integration {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  logoUrl?: string;
  status: 'connected' | 'disconnected';
  provider: string;
  color: string;
  category: 'erp' | 'commerce' | 'edi';
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'integrations' | 'team'>('integrations');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [integrationSearch, setIntegrationSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const [integrations, setIntegrations] = useState<Integration[]>([
    // ── ERP Systems ──
    { id: 'justfood', name: 'JustFood', logoUrl: 'https://mma.prnewswire.com/media/641791/JustFood_JustFood_Releases_Next_Generation_ERP_and_Analytics_Sol.jpg?p=facebook', status: 'disconnected', provider: 'justfood', color: '#E85D04', category: 'erp' },
    { id: 'produce-pro', name: 'Produce Pro', logoUrl: 'https://fungtu.com/wp-content/uploads/2021/01/logo_1752_hd-1024x562.png', status: 'disconnected', provider: 'produce_pro', color: '#38A169', category: 'erp' },
    { id: 'business-central', name: 'Microsoft Business Central', logoUrl: 'https://logo.clearbit.com/microsoft.com', status: 'disconnected', provider: 'business_central', color: '#00A4EF', category: 'erp' },
    { id: 'dynamics-365', name: 'Dynamics 365 Sales', logoUrl: 'https://logo.clearbit.com/microsoft.com', status: 'disconnected', provider: 'dynamics_365', color: '#002050', category: 'erp' },
    { id: 'dynamics-365-finance', name: 'Dynamics 365 Finance', logoUrl: 'https://logo.clearbit.com/microsoft.com', status: 'disconnected', provider: 'dynamics_365_finance', color: '#0078D4', category: 'erp' },
    { id: 'dynamics-gp', name: 'Microsoft Dynamics GP', logoUrl: 'https://logo.clearbit.com/microsoft.com', status: 'disconnected', provider: 'dynamics_gp', color: '#7FBA00', category: 'erp' },
    { id: 'dynamics-nav', name: 'Microsoft Dynamics NAV', logoUrl: 'https://logo.clearbit.com/microsoft.com', status: 'disconnected', provider: 'dynamics_nav', color: '#00B294', category: 'erp' },
    { id: 'netsuite', name: 'Oracle NetSuite', logoUrl: 'https://logo.clearbit.com/oracle.com', status: 'disconnected', provider: 'netsuite', color: '#1A3D6D', category: 'erp' },
    { id: 'sap', name: 'SAP S/4HANA', logoUrl: 'https://logo.clearbit.com/sap.com', status: 'disconnected', provider: 'sap', color: '#008FD3', category: 'erp' },
    { id: 'sap-ecc', name: 'SAP ECC', logoUrl: 'https://logo.clearbit.com/sap.com', status: 'disconnected', provider: 'sap_ecc', color: '#006BA6', category: 'erp' },
    { id: 'sap-b1', name: 'SAP Business One', logoUrl: 'https://logo.clearbit.com/sap.com', status: 'disconnected', provider: 'sap_b1', color: '#0070AD', category: 'erp' },
    { id: 'oracle-fusion', name: 'Oracle Fusion Cloud', logoUrl: 'https://logo.clearbit.com/oracle.com', status: 'disconnected', provider: 'oracle_fusion', color: '#C74634', category: 'erp' },
    { id: 'oracle-jde', name: 'Oracle JD Edwards', logoUrl: 'https://logo.clearbit.com/oracle.com', status: 'disconnected', provider: 'oracle_jde', color: '#8B1A1A', category: 'erp' },
    { id: 'quickbooks', name: 'QuickBooks Online', logoUrl: 'https://logo.clearbit.com/quickbooks.intuit.com', status: 'disconnected', provider: 'quickbooks', color: '#2CA01C', category: 'erp' },
    { id: 'quickbooks-desktop', name: 'QuickBooks Desktop', logoUrl: 'https://logo.clearbit.com/quickbooks.intuit.com', status: 'disconnected', provider: 'quickbooks_desktop', color: '#108000', category: 'erp' },
    { id: 'odoo', name: 'Odoo', logoUrl: 'https://logo.clearbit.com/odoo.com', status: 'disconnected', provider: 'odoo', color: '#714B67', category: 'erp' },
    { id: 'sage', name: 'Sage Intacct', logoUrl: 'https://logo.clearbit.com/sage.com', status: 'disconnected', provider: 'sage_intacct', color: '#00DC00', category: 'erp' },
    { id: 'sage-x3', name: 'Sage X3', logoUrl: 'https://logo.clearbit.com/sage.com', status: 'disconnected', provider: 'sage_x3', color: '#00B140', category: 'erp' },
    { id: 'sage-100', name: 'Sage 100', logoUrl: 'https://logo.clearbit.com/sage.com', status: 'disconnected', provider: 'sage_100', color: '#00B451', category: 'erp' },
    { id: 'sage-300', name: 'Sage 300', logoUrl: 'https://logo.clearbit.com/sage.com', status: 'disconnected', provider: 'sage_300', color: '#00A344', category: 'erp' },
    { id: 'sage-50', name: 'Sage 50', logoUrl: 'https://logo.clearbit.com/sage.com', status: 'disconnected', provider: 'sage_50', color: '#009639', category: 'erp' },
    { id: 'acumatica', name: 'Acumatica', logoUrl: 'https://logo.clearbit.com/acumatica.com', status: 'disconnected', provider: 'acumatica', color: '#D71920', category: 'erp' },
    { id: 'epicor', name: 'Epicor Kinetic', logoUrl: 'https://logo.clearbit.com/epicor.com', status: 'disconnected', provider: 'epicor', color: '#003366', category: 'erp' },
    { id: 'infor', name: 'Infor CloudSuite', logoUrl: 'https://logo.clearbit.com/infor.com', status: 'disconnected', provider: 'infor', color: '#FFD100', category: 'erp' },
    { id: 'syspro', name: 'SYSPRO', logoUrl: 'https://logo.clearbit.com/syspro.com', status: 'disconnected', provider: 'syspro', color: '#E4002B', category: 'erp' },
    { id: 'ifs', name: 'IFS Cloud', logoUrl: 'https://logo.clearbit.com/ifs.com', status: 'disconnected', provider: 'ifs', color: '#FF0040', category: 'erp' },
    { id: 'workday', name: 'Workday Financial Management', logoUrl: 'https://logo.clearbit.com/workday.com', status: 'disconnected', provider: 'workday', color: '#0875E1', category: 'erp' },
    { id: 'xero', name: 'Xero', logoUrl: 'https://logo.clearbit.com/xero.com', status: 'disconnected', provider: 'xero', color: '#13B5EA', category: 'erp' },
    { id: 'freshbooks', name: 'FreshBooks', logoUrl: 'https://logo.clearbit.com/freshbooks.com', status: 'disconnected', provider: 'freshbooks', color: '#0075DD', category: 'erp' },
    { id: 'zoho-books', name: 'Zoho Books', logoUrl: 'https://logo.clearbit.com/zoho.com', status: 'disconnected', provider: 'zoho_books', color: '#DC2626', category: 'erp' },
    { id: 'unit4', name: 'Unit4', logoUrl: 'https://logo.clearbit.com/unit4.com', status: 'disconnected', provider: 'unit4', color: '#6D28D9', category: 'erp' },
    { id: 'priority', name: 'Priority Software', logoUrl: 'https://logo.clearbit.com/priority-software.com', status: 'disconnected', provider: 'priority', color: '#E87722', category: 'erp' },
    { id: 'plex', name: 'Plex (Rockwell)', logoUrl: 'https://logo.clearbit.com/plex.com', status: 'disconnected', provider: 'plex', color: '#E5A00D', category: 'erp' },
    { id: 'certinia', name: 'Certinia (FinancialForce)', logoUrl: 'https://logo.clearbit.com/certinia.com', status: 'disconnected', provider: 'certinia', color: '#0B5CAB', category: 'erp' },
    { id: 'deltek', name: 'Deltek Costpoint', logoUrl: 'https://logo.clearbit.com/deltek.com', status: 'disconnected', provider: 'deltek', color: '#005EB8', category: 'erp' },
    { id: 'blackbaud', name: 'Blackbaud Financial Edge', logoUrl: 'https://logo.clearbit.com/blackbaud.com', status: 'disconnected', provider: 'blackbaud', color: '#2BBD91', category: 'erp' },
    { id: 'yardi', name: 'Yardi Voyager', logoUrl: 'https://logo.clearbit.com/yardi.com', status: 'disconnected', provider: 'yardi', color: '#003A70', category: 'erp' },
    { id: 'viewpoint', name: 'Vista by Viewpoint', logoUrl: 'https://logo.clearbit.com/viewpoint.com', status: 'disconnected', provider: 'viewpoint', color: '#E87511', category: 'erp' },
    { id: 'eci', name: 'ECi Software Solutions', logoUrl: 'https://logo.clearbit.com/ecisolutions.com', status: 'disconnected', provider: 'eci', color: '#00A3E0', category: 'erp' },
    { id: 'webhook', name: 'Custom Webhook', icon: Webhook, status: 'disconnected', provider: 'webhook', color: '#6366F1', category: 'erp' },

    // ── Commerce / Supply-Chain Networks & Procurement Platforms ──
    { id: 'procurant', name: 'Procurant', logoUrl: 'https://logo.clearbit.com/procurant.com', status: 'disconnected', provider: 'procurant', color: '#1D4ED8', category: 'commerce' },
    { id: 'itradenetwork', name: 'iTradeNetwork', logoUrl: 'https://logo.clearbit.com/itradenetwork.com', status: 'disconnected', provider: 'itradenetwork', color: '#0E7C42', category: 'commerce' },
    { id: 'repositrak', name: 'ReposiTrak', logoUrl: 'https://logo.clearbit.com/repositrak.com', status: 'disconnected', provider: 'repositrak', color: '#2563EB', category: 'commerce' },
    { id: 'cheetah', name: 'Cheetah', logoUrl: 'https://logo.clearbit.com/gocheetah.com', status: 'disconnected', provider: 'cheetah', color: '#F59E0B', category: 'commerce' },
    { id: 'buyers-edge', name: 'Buyers Edge Platform', logoUrl: 'https://logo.clearbit.com/buyersedgeplatform.com', status: 'disconnected', provider: 'buyers_edge', color: '#1E3A5F', category: 'commerce' },
    { id: 'foodlogiq', name: 'FoodLogiQ', logoUrl: 'https://logo.clearbit.com/trustwell.com', status: 'disconnected', provider: 'foodlogiq', color: '#16A34A', category: 'commerce' },
    { id: 'tracegains', name: 'TraceGains', logoUrl: 'https://logo.clearbit.com/tracegains.com', status: 'disconnected', provider: 'tracegains', color: '#059669', category: 'commerce' },
    { id: '1worldsync', name: '1WorldSync', logoUrl: 'https://logo.clearbit.com/1worldsync.com', status: 'disconnected', provider: '1worldsync', color: '#0D47A1', category: 'commerce' },
    { id: 'sap-ariba', name: 'SAP Ariba', logoUrl: 'https://logo.clearbit.com/sap.com', status: 'disconnected', provider: 'sap_ariba', color: '#F0AB00', category: 'commerce' },
    { id: 'coupa', name: 'Coupa', logoUrl: 'https://logo.clearbit.com/coupa.com', status: 'disconnected', provider: 'coupa', color: '#0072CE', category: 'commerce' },
    { id: 'oracle-procurement', name: 'Oracle Procurement Cloud', logoUrl: 'https://logo.clearbit.com/oracle.com', status: 'disconnected', provider: 'oracle_procurement', color: '#C74634', category: 'commerce' },
    { id: 'jaggaer', name: 'Jaggaer', logoUrl: 'https://logo.clearbit.com/jaggaer.com', status: 'disconnected', provider: 'jaggaer', color: '#E31937', category: 'commerce' },
    { id: 'e2open', name: 'E2open', logoUrl: 'https://logo.clearbit.com/e2open.com', status: 'disconnected', provider: 'e2open', color: '#003366', category: 'commerce' },
    { id: 'elemica', name: 'Elemica', logoUrl: 'https://logo.clearbit.com/elemica.com', status: 'disconnected', provider: 'elemica', color: '#00508F', category: 'commerce' },
    { id: 'ghx', name: 'GHX', logoUrl: 'https://logo.clearbit.com/ghx.com', status: 'disconnected', provider: 'ghx', color: '#005A9C', category: 'commerce' },

    // ── EDI Providers / VANs / B2B Integration Suites ──
    { id: 'sps-commerce', name: 'SPS Commerce', logoUrl: 'https://logo.clearbit.com/spscommerce.com', status: 'disconnected', provider: 'sps_commerce', color: '#E31B23', category: 'edi' },
    { id: 'truecommerce', name: 'TrueCommerce', logoUrl: 'https://logo.clearbit.com/truecommerce.com', status: 'disconnected', provider: 'truecommerce', color: '#0054A6', category: 'edi' },
    { id: 'opentext', name: 'OpenText Trading Grid', logoUrl: 'https://logo.clearbit.com/opentext.com', status: 'disconnected', provider: 'opentext', color: '#1A1F71', category: 'edi' },
    { id: 'ibm-sterling', name: 'IBM Sterling B2B', logoUrl: 'https://logo.clearbit.com/ibm.com', status: 'disconnected', provider: 'ibm_sterling', color: '#054ADA', category: 'edi' },
    { id: 'cleo', name: 'Cleo', logoUrl: 'https://logo.clearbit.com/cleo.com', status: 'disconnected', provider: 'cleo', color: '#FF6B00', category: 'edi' },
    { id: 'seeburger', name: 'SEEBURGER', logoUrl: 'https://logo.clearbit.com/seeburger.com', status: 'disconnected', provider: 'seeburger', color: '#003F72', category: 'edi' },
    { id: 'descartes', name: 'Descartes', logoUrl: 'https://logo.clearbit.com/descartes.com', status: 'disconnected', provider: 'descartes', color: '#00447C', category: 'edi' },
    { id: 'boomi', name: 'Boomi', logoUrl: 'https://logo.clearbit.com/boomi.com', status: 'disconnected', provider: 'boomi', color: '#0072ED', category: 'edi' },
    { id: 'mulesoft', name: 'MuleSoft', logoUrl: 'https://logo.clearbit.com/mulesoft.com', status: 'disconnected', provider: 'mulesoft', color: '#00A0DF', category: 'edi' },
    { id: 'webmethods', name: 'webMethods (Software AG)', logoUrl: 'https://logo.clearbit.com/softwareag.com', status: 'disconnected', provider: 'webmethods', color: '#005B7F', category: 'edi' },
    { id: 'tibco', name: 'TIBCO', logoUrl: 'https://logo.clearbit.com/tibco.com', status: 'disconnected', provider: 'tibco', color: '#212D63', category: 'edi' },
    { id: 'informatica', name: 'Informatica', logoUrl: 'https://logo.clearbit.com/informatica.com', status: 'disconnected', provider: 'informatica', color: '#FF6D00', category: 'edi' },
    { id: 'orderful', name: 'Orderful', logoUrl: 'https://logo.clearbit.com/orderful.com', status: 'disconnected', provider: 'orderful', color: '#6C5CE7', category: 'edi' },
    { id: 'stedi', name: 'Stedi', logoUrl: 'https://logo.clearbit.com/stedi.com', status: 'disconnected', provider: 'stedi', color: '#4F46E5', category: 'edi' },
    { id: 'ezcom', name: 'eZCom', logoUrl: 'https://logo.clearbit.com/ezcomsoftware.com', status: 'disconnected', provider: 'ezcom', color: '#0098DB', category: 'edi' },
    { id: 'jitterbit', name: 'Jitterbit', logoUrl: 'https://logo.clearbit.com/jitterbit.com', status: 'disconnected', provider: 'jitterbit', color: '#00C389', category: 'edi' },
    { id: 'celigo', name: 'Celigo', logoUrl: 'https://logo.clearbit.com/celigo.com', status: 'disconnected', provider: 'celigo', color: '#FF5722', category: 'edi' },
    { id: 'babelway', name: 'Babelway', logoUrl: 'https://logo.clearbit.com/babelway.com', status: 'disconnected', provider: 'babelway', color: '#00A9E0', category: 'edi' },
    { id: 'snaplogic', name: 'SnapLogic', logoUrl: 'https://logo.clearbit.com/snaplogic.com', status: 'disconnected', provider: 'snaplogic', color: '#2196F3', category: 'edi' },
  ]);

  const categories = [
    { id: 'erp', label: 'ERP Systems', description: 'Enterprise resource planning and accounting systems' },
    { id: 'commerce', label: 'Commerce & Supply-Chain Networks', description: 'Procurement platforms, supplier portals, and supply-chain networks' },
    { id: 'edi', label: 'EDI / VAN / B2B Integration', description: 'Electronic data interchange providers, value-added networks, and B2B integration suites' },
  ] as const;

  useEffect(() => {
    checkAuthAndLoadSettings();
  }, []);

  const checkAuthAndLoadSettings = async () => {
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=business_central`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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

      const accessToken = await getAccessToken();

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager?provider=${provider}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
    }
  };

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const filteredIntegrations = integrationSearch.trim()
    ? integrations.filter(i => i.name.toLowerCase().includes(integrationSearch.toLowerCase()))
    : integrations;

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
    { id: 'team', label: 'Team', icon: Users },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <button
              onClick={() => navigate(-1)}
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
                  <h2 className="text-2xl font-bold text-gray-900">Integrations</h2>
                  <p className="text-gray-600 mt-1">
                    Connect your ERP, procurement portals, and EDI providers to automatically push extracted orders.
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

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search integrations..."
                    value={integrationSearch}
                    onChange={(e) => setIntegrationSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                {/* Integration Categories */}
                {categories.map((cat) => {
                  const catIntegrations = filteredIntegrations.filter(i => i.category === cat.id);
                  if (catIntegrations.length === 0) return null;
                  const isCollapsed = collapsedCategories.has(cat.id);

                  return (
                    <div key={cat.id}>
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        className="flex items-center gap-2 w-full text-left mb-3 group"
                      >
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{cat.label}</h3>
                        <span className="text-xs text-gray-400 font-normal normal-case tracking-normal">{cat.description}</span>
                        <span className="ml-auto text-xs text-gray-400">{catIntegrations.length}</span>
                      </button>
                      {!isCollapsed && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          {catIntegrations.map((integration) => {
                            const Icon = integration.icon;
                            const isSelected = selectedIntegration === integration.id;

                            return (
                              <div
                                key={integration.id}
                                className={`bg-white rounded-xl shadow-sm border-2 p-4 transition-all ${
                                  isSelected
                                    ? 'border-green-400 ring-2 ring-green-100'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <div className="flex items-center space-x-3">
                                  <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-100"
                                    style={{ backgroundColor: integration.logoUrl ? '#fff' : `${integration.color}15` }}
                                  >
                                    {integration.logoUrl ? (
                                      <img
                                        src={integration.logoUrl}
                                        alt={`${integration.name} logo`}
                                        className="w-full h-full object-contain p-1"
                                        onError={(e) => {
                                          const target = e.currentTarget;
                                          target.style.display = 'none';
                                          const parent = target.parentElement;
                                          if (parent) {
                                            parent.style.backgroundColor = `${integration.color}15`;
                                            parent.innerHTML = `<span style="color: ${integration.color}; font-weight: 700; font-size: 14px;">${integration.name.charAt(0)}</span>`;
                                          }
                                        }}
                                      />
                                    ) : Icon ? (
                                      <Icon className="w-5 h-5" style={{ color: integration.color }} />
                                    ) : (
                                      <span className="text-sm font-bold" style={{ color: integration.color }}>{integration.name.charAt(0)}</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-gray-900 truncate">{integration.name}</p>
                                      {isSelected && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 flex-shrink-0">
                                          <Check className="w-2.5 h-2.5 mr-0.5" />
                                          Default
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {integration.status === 'connected' ? (
                                        <span className="text-green-600">Connected</span>
                                      ) : (
                                        'Not connected'
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredIntegrations.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No integrations match "{integrationSearch}"
                  </div>
                )}

                {/* Help Section */}
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Need a different integration?</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    We're constantly adding new integrations. If you need a specific system that's not listed,
                    let us know and we'll prioritize it.
                  </p>
                  <button className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                    Request an Integration →
                  </button>
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

          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
