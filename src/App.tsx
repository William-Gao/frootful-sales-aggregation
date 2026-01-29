import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import AuthCallback from './pages/AuthCallback';
import Demo from './demo/Demo';
import Playground from './demo/Playground';
import Settings from './pages/Settings';
import DashboardTest from './pages/DashboardTest';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/admin" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/test" element={<DashboardTest />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/demo/playground" element={<Playground />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;