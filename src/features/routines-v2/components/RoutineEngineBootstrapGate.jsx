import { useCallback, useEffect, useState } from "react";
import { ROUTINE_UI_ACCESS_STATES } from "../data/routineApplicationModel.js";
import { useRoutineApplicationBootstrap } from "../hooks/useRoutineApplicationBootstrap.js";
import { useRoutineEngineSync } from "../hooks/useRoutineEngineSync.js";
import { endRoutineOperatorSession } from "../api/routineOperatorClient.js";
import { clearRoutineOperatorSession } from "../auth/routineOperatorSession.js";
import RoutineEnginePreviewHome from "./RoutineEnginePreviewHome.jsx";
import SharedDeviceOperatorGate from "./SharedDeviceOperatorGate.jsx";

export default function RoutineEngineBootstrapGate({ user, open = true, loader, operatorApi, subscribe, onBack, onOpenManager }) {
  const bootstrap = useRoutineApplicationBootstrap({ enabled: open, loader });
  const [endingSession, setEndingSession] = useState(false);
  const refresh = useCallback(() => bootstrap.refresh(), [bootstrap.refresh]);
  const syncStatus = useRoutineEngineSync({ open: open && !endingSession, bootstrap: bootstrap.data, onRefresh: refresh, subscribe });
  useEffect(() => {
    if (bootstrap.status === "error" && bootstrap.error?.kind === "operator_auth_required") clearRoutineOperatorSession();
  }, [bootstrap.error, bootstrap.status]);
  const endSharedSession = useCallback(async (reason) => {
    setEndingSession(true);
    try {
      const endSession = operatorApi?.endSession ?? endRoutineOperatorSession;
      await endSession(reason, globalThis.crypto.randomUUID());
    } finally {
      clearRoutineOperatorSession();
      await bootstrap.refresh();
      setEndingSession(false);
    }
  }, [bootstrap.refresh, operatorApi]);

  if (["loading", "idle"].includes(bootstrap.status)) return (
    <main className="routine-shell routine-shell-centered"><section className="routine-state-card" role="status" aria-live="polite" aria-busy="true">
      <p className="eyebrow">Routine Engine v2</p><h1>Checking server access…</h1><p>Your role, release stage and operational date are verified by the server.</p>
    </section></main>
  );
  if (bootstrap.status === "error" && bootstrap.error?.kind === "operator_auth_required") return (
    <SharedDeviceOperatorGate organizationId={user?.organizationId || user?.organization_id}
      deviceAuthUserId={user?.authUserId || user?.backendUserId} onAuthenticated={bootstrap.refresh} operatorApi={operatorApi} />
  );
  if (bootstrap.status === "error") return (
    <main className="routine-shell routine-shell-centered"><section className="routine-state-card" role="alert"><p className="eyebrow">Legacy app remains available</p>
      <h1>Routine preview unavailable</h1><p>{bootstrap.error?.kind === "network" ? "The network is unavailable. Reconnect and try again." : "The Routine Engine backend is not ready for this account."}</p>
      <div className="routine-gate-actions"><button type="button" className="primary-button" onClick={bootstrap.refresh}>Try again</button><button type="button" className="ghost-button" onClick={onBack}>Back to shift log</button></div>
    </section></main>
  );
  if (bootstrap.data?.accessState === ROUTINE_UI_ACCESS_STATES.OPERATOR_REQUIRED) return (
    <SharedDeviceOperatorGate organizationId={bootstrap.data.organizationId || user?.organizationId || user?.organization_id}
      deviceAuthUserId={user?.authUserId || user?.backendUserId} onAuthenticated={bootstrap.refresh} operatorApi={operatorApi} />
  );
  if (!bootstrap.data?.previewAllowed) return (
    <main className="routine-shell routine-shell-centered"><section className="routine-state-card"><p className="eyebrow">Routine Engine v2</p>
      <h1>Preview access is not available</h1><p>Your server-controlled pilot membership does not currently allow this preview.</p>
      <button type="button" className="primary-button" onClick={onBack}>Back to shift log</button></section></main>
  );
  return <RoutineEnginePreviewHome bootstrap={bootstrap.data} syncStatus={syncStatus} onOpenManager={onOpenManager}
    onEndSession={() => endSharedSession("Operator ended the Routine Engine session.")}
    onSwitchOperator={() => endSharedSession("Operator switched in the Routine Engine UI.")} />;
}
