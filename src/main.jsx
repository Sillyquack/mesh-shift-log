import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import WorkbarGuideOverlay from './WorkbarGuideOverlay.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <WorkbarGuideOverlay />
  </React.StrictMode>,
);
