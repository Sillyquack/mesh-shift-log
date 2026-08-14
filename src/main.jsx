import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './design-system/MeshExperienceSystem.css';
import './components/EventOperatorExperience.css';
import './components/EventOperatorEventPicker.css';
import './features/routines-v2/components/RoutineExperience.css';
import './features/routines-v2/manager/RoutineManagerExperience.css';
import './features/routines-v2/manager/RoutineVisualStandards.css';
import './features/routines-v2/history/RoutineHistoryExperience.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
