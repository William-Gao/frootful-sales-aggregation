import React from 'react';
import ReactDOM from 'react-dom/client';
import DemoApp from './DemoApp';
import '../index.css';

// Standalone entry point for demo-only deployment
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
);
