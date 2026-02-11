import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Settings } from 'lucide-react';
import Dashboard from '../components/Dashboard';

const MOCK_USER = {
  name: 'Test User',
  email: 'test@frootful.com',
};

const MOCK_ORG = {
  id: 'test-org-id',
  name: 'Boston Microgreens',
};

const DashboardDemo: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold" style={{ color: '#53AD6D' }}>
                Frootful
              </h1>
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-50 rounded-lg border border-green-200">
                <Building2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-900">{MOCK_ORG.name}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{MOCK_USER.name}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-medium">
                  {MOCK_USER.name.charAt(0)}
                </div>
              </div>
              <div className="relative group">
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <button
                    onClick={() => navigate('/settings')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <Dashboard organizationId={MOCK_ORG.id} layout="sidebar" />
    </div>
  );
};

export default DashboardDemo;
