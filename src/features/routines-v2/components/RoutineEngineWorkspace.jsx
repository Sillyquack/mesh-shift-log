import { lazy, Suspense, useState } from "react";
import RoutineEngineBootstrapGate from "./RoutineEngineBootstrapGate.jsx";
import "./RoutineEngineShell.css";

const RoutineManagerWorkspace = lazy(() => import("../manager/RoutineManagerWorkspace.jsx"));
const RoutineManagerErrorBoundary = lazy(() => import("../manager/RoutineManagerErrorBoundary.jsx"));
const RoutineEmployeeWorkspace = lazy(() => import("../employee/RoutineEmployeeWorkspace.jsx"));
const RoutineEmployeeErrorBoundary = lazy(() => import("../employee/RoutineEmployeeErrorBoundary.jsx"));

export default function RoutineEngineWorkspace({ user, onBack, onLogout, bootstrapLoader, managerLoader, employeeLoader, operatorApi, subscribe }) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  return (
    <div className="routine-shell">
      <header className="routine-shell-header">
        <div><span className="routine-shell-mark" aria-hidden="true">R2</span><span><strong>Routine Engine v2</strong><small>Isolated preview shell</small></span></div>
        <nav aria-label="Routine Engine actions"><button type="button" className="ghost-button" onClick={onBack}>Back to shift log</button>
          <button type="button" className="ghost-button" onClick={onLogout}>Log out</button></nav>
      </header>
      {managerOpen ? (
        <Suspense fallback={<main className="routine-shell-centered"><section className="routine-state-card" role="status">Loading Manager Control Center…</section></main>}>
          <RoutineManagerErrorBoundary onBack={() => setManagerOpen(false)}>
            <RoutineManagerWorkspace loader={managerLoader} onBack={() => setManagerOpen(false)} />
          </RoutineManagerErrorBoundary>
        </Suspense>
      ) : employeeOpen ? (
        <Suspense fallback={<main className="routine-shell-centered"><section className="routine-state-card" role="status">Loading Operations Preview…</section></main>}>
          <RoutineEmployeeErrorBoundary onBack={() => setEmployeeOpen(false)}>
            <RoutineEmployeeWorkspace loader={employeeLoader} subscribe={subscribe} onBack={() => setEmployeeOpen(false)} />
          </RoutineEmployeeErrorBoundary>
        </Suspense>
      ) : (
        <RoutineEngineBootstrapGate user={user} open loader={bootstrapLoader} operatorApi={operatorApi} subscribe={subscribe}
          onBack={onBack} onOpenEmployee={() => setEmployeeOpen(true)} onOpenManager={() => setManagerOpen(true)} />
      )}
    </div>
  );
}
