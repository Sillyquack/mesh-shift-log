import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ProductionCandidateOrchestrator from './experience/ProductionCandidateOrchestrator.jsx';
import './styles.css';
import './design-system/MeshExperienceSystem.css';
import './components/EventOperatorExperience.css';
import './components/EventOperatorEventPicker.css';
import './experience/ProductionCandidateExperience.css';
import './experience/RoutineStudioExperience.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProductionCandidateOrchestrator />
    <App />
  </React.StrictMode>,
);
