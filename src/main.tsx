import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import clarity from '@microsoft/clarity';
import App from './App.tsx';
import './index.css';

clarity.init('vt4bm61s32');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
