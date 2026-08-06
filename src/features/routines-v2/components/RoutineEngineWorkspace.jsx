import RoutineEngineBootstrapGate from "./RoutineEngineBootstrapGate.jsx";
import "./RoutineEngineShell.css";

export default function RoutineEngineWorkspace({ user, onBack, onLogout, bootstrapLoader, operatorApi, subscribe }) {
  return (
    <div className="routine-shell">
      <header className="routine-shell-header">
        <div><span className="routine-shell-mark" aria-hidden="true">R2</span><span><strong>Routine Engine v2</strong><small>Isolated preview shell</small></span></div>
        <nav aria-label="Routine Engine actions"><button type="button" className="ghost-button" onClick={onBack}>Back to shift log</button>
          <button type="button" className="ghost-button" onClick={onLogout}>Log out</button></nav>
      </header>
      <RoutineEngineBootstrapGate user={user} open loader={bootstrapLoader} operatorApi={operatorApi} subscribe={subscribe} onBack={onBack} />
    </div>
  );
}
