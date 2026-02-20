import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../components/Dashboard';

const MOCK_USER = {
  id: 'demo-user',
  email: 'test@frootful.com',
  user_metadata: {
    full_name: 'Test User',
  },
};

const MOCK_ORG = {
  id: 'test-org-id',
  name: 'Boston Microgreens',
};

const DashboardDemo: React.FC = () => {
  const navigate = useNavigate();

  return (
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
  );
};

export default DashboardDemo;
