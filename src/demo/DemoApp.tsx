import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Demo from './Demo';
import Playground from './Playground';

// Standalone Demo App - can be deployed separately
function DemoApp() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Demo />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/demo/playground" element={<Playground />} />
        <Route path="/playground" element={<Playground />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default DemoApp;
