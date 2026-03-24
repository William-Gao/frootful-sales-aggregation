import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

const ADMIN_EMAIL = 'orders.frootful@gmail.com';

const MetricsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const client = supabaseClient as any;
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        navigate('/login/admin');
        return;
      }
      if (session.user.email !== ADMIN_EMAIL) {
        navigate('/login/admin');
        return;
      }
      setIsAuthorized(true);
    } catch {
      navigate('/login/admin');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Admin
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-lg font-semibold text-gray-900">Business Metrics</h1>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AnalyticsDashboard />
      </div>
    </div>
  );
};

export default MetricsDashboard;
