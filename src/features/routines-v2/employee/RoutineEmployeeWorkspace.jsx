import { useCallback, useMemo, useState } from "react";
import { useRoutineEmployeeHome } from "../hooks/useRoutineEmployeeHome.js";
import RoutineEmployeeHome from "./RoutineEmployeeHome.jsx";
import RoutineRunWorkspace from "./RoutineRunWorkspace.jsx";
import RoutineDoubleShiftWorkspace from "./RoutineDoubleShiftWorkspace.jsx";
import RoutineHandoverPanel from "./RoutineHandoverPanel.jsx";
import RoutineTransferPanel from "./RoutineTransferPanel.jsx";
import { useRoutinePendingOverlay } from "../hooks/useRoutinePendingOverlay.js";
import { useRoutineEngineSync } from "../hooks/useRoutineEngineSync.js";
import "./RoutineEmployee.css";

export default function RoutineEmployeeWorkspace({ onBack, loader, runLoader, taskLoader, bundleLoader, runApi, taskApi, doubleShiftApi, reauthApi, subscribe }) {
  const [route, setRoute] = useState({ name: "home", id: null }); const [syncRevision, setSyncRevision] = useState(0);
  const home = useRoutineEmployeeHome({ loader });
  const syncBootstrap = useMemo(() => home.data ? { previewAllowed: true, organizationId: home.data.identity?.organizationId,
    identity: home.data.identity, sync: { cursorPollingRequired: home.data.sync?.transport === "cursor_polling" } } : null,
  [home.data?.identity?.actorSource, home.data?.identity?.effectiveOperatorId, home.data?.identity?.operatorSessionId,
    home.data?.identity?.organizationId, home.data?.sync?.transport]);
  const refreshForSync = useCallback(async () => { await home.refresh(); setSyncRevision((value) => value + 1); }, [home.refresh]);
  const liveSync = useRoutineEngineSync({ open: Boolean(home.data), bootstrap: syncBootstrap, onRefresh: refreshForSync, subscribe });
  const overlay = useRoutinePendingOverlay({ identity: home.data?.identity, enabled: home.data?.operationalAllowed === true,
    onAuthoritativeRefresh: refreshForSync });
  if (route.name === "run") return <RoutineRunWorkspace runId={route.id} onBack={() => setRoute({ name: "home", id: null })} loader={runLoader} taskLoader={taskLoader} runApi={runApi} taskApi={taskApi} reauthApi={reauthApi} refreshSignal={syncRevision} overlay={overlay}
    online={globalThis.navigator?.onLine !== false && !["offline","disconnected","paused_auth"].includes(liveSync.status)} />;
  if (route.name === "bundle") return <RoutineDoubleShiftWorkspace bundleId={route.id} onBack={() => setRoute({ name: "home", id: null })} onOpenRun={(id) => setRoute({ name: "run", id })} loader={bundleLoader} api={doubleShiftApi} refreshSignal={syncRevision} />;
  if (route.name === "handover") return <main className="employee-workspace"><header className="employee-page-header"><button type="button" onClick={() => setRoute({ name: "home", id: null })}>← Operations</button><h1>Handover</h1></header><RoutineHandoverPanel handoverId={route.id} /></main>;
  if (route.name === "transfer") return <main className="employee-workspace"><header className="employee-page-header"><button type="button" onClick={() => setRoute({ name: "home", id: null })}>← Operations</button><h1>Transfer</h1></header><RoutineTransferPanel transferId={route.id} reauthApi={reauthApi} /></main>;
  if (!home.data && ["loading", "idle"].includes(home.status)) return <main className="employee-workspace employee-loading" role="status">Loading employee operations…</main>;
  if (!home.data) return <main className="employee-workspace employee-loading"><section role="alert"><h1>Operations Preview unavailable</h1><p>{home.error?.message ?? "The server context could not be loaded."}</p><button type="button" onClick={home.refresh}>Try again</button><button type="button" onClick={onBack}>Preview Home</button></section></main>;
  const employeeHome = { ...home.data, sync: { ...home.data.sync, status: liveSync.status, transport: liveSync.mode ?? home.data.sync?.transport } };
  return <RoutineEmployeeHome home={employeeHome} onBack={onBack} onRefresh={home.refresh} runApi={runApi} doubleShiftApi={doubleShiftApi}
    pendingOverlay={overlay} onOpenRun={(id) => setRoute({ name: "run", id })} onOpenBundle={(id) => setRoute({ name: "bundle", id })}
    onOpenHandover={(id) => setRoute({ name: "handover", id })} onOpenTransfer={(id) => setRoute({ name: "transfer", id })} />;
}
