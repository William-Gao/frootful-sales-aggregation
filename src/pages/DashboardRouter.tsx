import React, { useEffect, useState } from 'react';
import clarity from '@microsoft/clarity';
import { supabaseClient } from '../supabaseClient';
import Dashboard from './Dashboard';
import DashboardGaitana from './DashboardGaitana';

const LA_GAITANA_ORG_ID = '81cf0716-45ee-4fe8-895f-d9af962f5fab';

const DashboardRouter: React.FC = () => {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolve = async () => {
      try {
        const sb = supabaseClient as any;
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.user?.id) {
          setLoading(false);
          return;
        }
        const { data } = await sb
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', session.user.id)
          .single();
        if (data) setOrgId(data.organization_id);
        clarity.identify(session.user.id, session.access_token, undefined, session.user.email);
      } catch {
        // fall through to default dashboard
      }
      setLoading(false);
    };
    resolve();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (orgId === LA_GAITANA_ORG_ID) return <DashboardGaitana />;
  return <Dashboard />;
};

export default DashboardRouter;
