import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../components/Dashboard';
import { CrowProvider, CrowCopilot } from '@usecrow/ui';

const MOCK_USER = {
  id: 'demo-user',
  email: 'test@frootful.com',
  user_metadata: {
    full_name: 'Test User',
  },
};

const MOCK_ORG = {
  id: 'test-org-id',
  name: 'Frootful Demo',
};

const DashboardDemo: React.FC = () => {
  const navigate = useNavigate();

  return (
    <CrowProvider
      productId="user_39xWZizccQqg4vXiweMc7EI9jp9"
      apiUrl="https://api.usecrow.org"
    >
      <div className="flex h-screen">
        <main className="flex-1 overflow-hidden">
          <Dashboard
            organizationId={MOCK_ORG.id}
            layout="sidebar"
            headerContent={{
              organization: MOCK_ORG,
              user: MOCK_USER,
              isSigningOut: false,
              onSignOut: () => navigate('/login'),
              onNavigateSettings: () => navigate('/settings'),
            }}
          />
        </main>
        <CrowCopilot
          productId="user_39xWZizccQqg4vXiweMc7EI9jp9"
          apiUrl="https://api.usecrow.org"
          title="Fru"
          position="right"
          width={400}
          variant="floating"
          defaultOpen={false}
        />
      </div>
    </CrowProvider>
  );
};

export default DashboardDemo;
