import { lazy, Suspense, useRef, useState } from "react";
import { MANAGER_TABS } from "../data/routineManagerModel.js";
import { useRoutineManagerWorkspace } from "../hooks/useRoutineManagerWorkspace.js";
import RoutineManagerOverview from "./RoutineManagerOverview.jsx";
import RoutineFoundationManager from "./RoutineFoundationManager.jsx";
import RoutineTemplatesManager from "./RoutineTemplatesManager.jsx";
import RoutineReferenceManager from "./RoutineReferenceManager.jsx";
import RoutineOperatorAdmin from "./RoutineOperatorAdmin.jsx";
import RoutinePilotAccessManager from "./RoutinePilotAccessManager.jsx";
import "./RoutineManager.css";

const RoutineHistoryWorkspace = lazy(() => import("../history/RoutineHistoryWorkspace.jsx"));
const RoutineManagerReviewDashboard = lazy(() => import("../history/RoutineManagerReviewDashboard.jsx"));
const RoutineReleaseGate = lazy(() => import("../history/RoutineReleaseGate.jsx"));

export default function RoutineManagerWorkspace({ onBack, loader, initialTab = "overview", referenceLoader, referenceUploader, operatorLoader, operatorApi }) {
  const workspace = useRoutineManagerWorkspace({ loader });
  const [tab, setTab] = useState(initialTab);
  const tabs = useRef([]);
  if (workspace.status === "loading" && !workspace.data) return <main className="routine-shell-centered"><section className="routine-state-card" role="status" aria-busy="true"><h1>Loading Manager Control Center…</h1></section></main>;
  if (workspace.status === "error" && !workspace.data) return <main className="routine-shell-centered"><section className="routine-state-card" role="alert"><h1>Manager workspace unavailable</h1><p>Personal manager authentication and the 10K2 server contract are required.</p><button type="button" className="primary-button" onClick={workspace.refresh}>Try again</button></section></main>;
  const data = workspace.data;
  const changeTab = (index) => {
    const next = (index + MANAGER_TABS.length) % MANAGER_TABS.length;
    setTab(MANAGER_TABS[next].id);
    tabs.current[next]?.focus();
  };
  const panels = {
    overview: <RoutineManagerOverview data={data} onRefresh={workspace.refresh} />,
    foundation: <RoutineFoundationManager data={data} onRefresh={workspace.refresh} />,
    templates: <RoutineTemplatesManager templates={data.templates} onRefresh={workspace.refresh} />,
    references: <RoutineReferenceManager loader={referenceLoader} uploader={referenceUploader} />,
    operators: <RoutineOperatorAdmin loader={operatorLoader} api={operatorApi} profileChoices={data.profileChoices || []} />,
    pilot: <RoutinePilotAccessManager pilot={data.pilotAccess} settings={data.settings} onRefresh={workspace.refresh} />,
    history: <RoutineHistoryWorkspace manager />,
    review: <RoutineManagerReviewDashboard />,
    release: <RoutineReleaseGate />,
  };
  return <main className="rm-workspace"><header className="rm-topbar"><div><p className="eyebrow">Personal manager auth only</p><h1>Manager Control Center</h1></div><button type="button" className="ghost-button" onClick={onBack}>Back to preview home</button></header><nav className="rm-tabs" role="tablist" aria-label="Manager Control Center sections">{MANAGER_TABS.map((item,index)=><button ref={(node)=>{tabs.current[index]=node;}} role="tab" type="button" key={item.id} aria-selected={tab===item.id} tabIndex={tab===item.id?0:-1} onClick={()=>setTab(item.id)} onKeyDown={(event)=>{if(["ArrowRight","ArrowDown"].includes(event.key)){event.preventDefault();changeTab(index+1);}if(["ArrowLeft","ArrowUp"].includes(event.key)){event.preventDefault();changeTab(index-1);}if(event.key==="Home"){event.preventDefault();changeTab(0);}if(event.key==="End"){event.preventDefault();changeTab(MANAGER_TABS.length-1);}}}>{item.label}</button>)}</nav><section className="rm-panel" role="tabpanel" tabIndex="0"><Suspense fallback={<div className="routine-state-card" role="status">Loading secure manager section…</div>}>{panels[tab]}</Suspense></section></main>;
}
