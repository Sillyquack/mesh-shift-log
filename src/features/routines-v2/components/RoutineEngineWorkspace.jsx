import { lazy, Suspense, useState } from "react";
import RoutineEngineBootstrapGate from "./RoutineEngineBootstrapGate.jsx";
import RoutineChunkErrorBoundary from "./RoutineChunkErrorBoundary.jsx";
import "./RoutineEngineShell.css";
import "./RoutineExperience.css";

const RoutineManagerWorkspace = lazy(() => import("../manager/RoutineManagerWorkspace.jsx"));
const RoutineManagerErrorBoundary = lazy(() => import("../manager/RoutineManagerErrorBoundary.jsx"));
const RoutineEmployeeWorkspace = lazy(() => import("../employee/RoutineEmployeeWorkspace.jsx"));
const RoutineEmployeeErrorBoundary = lazy(() => import("../employee/RoutineEmployeeErrorBoundary.jsx"));

export default function RoutineEngineWorkspace({
  user,
  onBack,
  onLogout,
  bootstrapLoader,
  managerLoader,
  employeeLoader,
  operatorApi,
  subscribe,
}) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const activeLabel = managerOpen ? "Manager" : employeeOpen ? "Shift" : "Home";

  return (
    <div className="routine-shell mesh-workspace-shell">
      <header className="routine-shell-header mesh-workspace-topbar">
        <div className="mesh-workspace-brand">
          <span className="mesh-workspace-brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>Mesh Shift Log</strong>
            <small>{activeLabel} · Youngstorget</small>
          </span>
          <span className="sr-only">Routine Engine v2 · Isolated preview shell</span>
        </div>
        <nav className="mesh-workspace-actions" aria-label="Routine Engine actions">
          <button type="button" onClick={onBack} aria-label="Back to shift log">← Back</button>
          <button type="button" onClick={onLogout} aria-label="Log out">Log out</button>
        </nav>
      </header>

      {managerOpen ? (
        <Suspense fallback={<main className="routine-shell-centered"><section className="routine-state-card" role="status">Opening Manager workspace…</section></main>}>
          <RoutineManagerErrorBoundary onBack={() => setManagerOpen(false)}>
            <RoutineChunkErrorBoundary onBack={() => setManagerOpen(false)}>
              <RoutineManagerWorkspace loader={managerLoader} onBack={() => setManagerOpen(false)} />
            </RoutineChunkErrorBoundary>
          </RoutineManagerErrorBoundary>
        </Suspense>
      ) : employeeOpen ? (
        <Suspense fallback={<main className="routine-shell-centered"><section className="routine-state-card" role="status">Opening Shift Mode…</section></main>}>
          <RoutineEmployeeErrorBoundary onBack={() => setEmployeeOpen(false)}>
            <RoutineChunkErrorBoundary onBack={() => setEmployeeOpen(false)}>
              <RoutineEmployeeWorkspace loader={employeeLoader} subscribe={subscribe} onBack={() => setEmployeeOpen(false)} />
            </RoutineChunkErrorBoundary>
          </RoutineEmployeeErrorBoundary>
        </Suspense>
      ) : (
        <RoutineEngineBootstrapGate
          user={user}
          open
          loader={bootstrapLoader}
          operatorApi={operatorApi}
          subscribe={subscribe}
          onBack={onBack}
          onOpenEmployee={() => setEmployeeOpen(true)}
          onOpenManager={() => setManagerOpen(true)}
        />
      )}
    </div>
  );
}
