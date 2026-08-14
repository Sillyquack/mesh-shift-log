import { lazy, Suspense, useMemo, useRef, useState } from "react";
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
const RoutineContentPackManager = lazy(() => import("./RoutineContentPackManager.jsx"));

const GROUPS = Object.freeze([
  { id: "today", label: "Today", caption: "Run the operation" },
  { id: "build", label: "Build", caption: "Content and standards" },
  { id: "people", label: "People", caption: "Access and devices" },
  { id: "history", label: "History", caption: "Completed work" },
  { id: "system", label: "System", caption: "Structure and publish" },
]);

function groupForTab(tabId) {
  return MANAGER_TABS.find((item) => item.id === tabId)?.group || "today";
}

export default function RoutineManagerWorkspace({
  onBack,
  loader,
  initialTab = "overview",
  referenceLoader,
  referenceUploader,
  operatorLoader,
  operatorApi,
}) {
  const workspace = useRoutineManagerWorkspace({ loader });
  const [tab, setTab] = useState(initialTab);
  const tabs = useRef([]);
  const activeGroup = groupForTab(tab);
  const visibleTabs = useMemo(
    () => MANAGER_TABS.filter((item) => item.group === activeGroup),
    [activeGroup],
  );

  if (workspace.status === "loading" && !workspace.data) {
    return (
      <main className="routine-shell-centered">
        <section className="routine-state-card" role="status" aria-busy="true">
          <p className="eyebrow">Operations Studio</p>
          <h1>Preparing your workspace…</h1>
        </section>
      </main>
    );
  }

  if (workspace.status === "error" && !workspace.data) {
    return (
      <main className="routine-shell-centered">
        <section className="routine-state-card" role="alert">
          <p className="eyebrow">Operations Studio</p>
          <h1>This workspace is unavailable</h1>
          <p>Your manager sign-in is required. No local draft has been removed.</p>
          <button type="button" className="primary-button" onClick={workspace.refresh}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  const data = workspace.data;
  const panels = {
    overview: <RoutineManagerOverview data={data} onRefresh={workspace.refresh} />,
    review: <RoutineManagerReviewDashboard />,
    content: <RoutineContentPackManager onOpenTemplates={() => setTab("templates")} />,
    templates: <RoutineTemplatesManager templates={data.templates} onRefresh={workspace.refresh} />,
    references: <RoutineReferenceManager loader={referenceLoader} uploader={referenceUploader} />,
    operators: (
      <RoutineOperatorAdmin
        loader={operatorLoader}
        api={operatorApi}
        profileChoices={data.profileChoices || []}
      />
    ),
    pilot: (
      <RoutinePilotAccessManager
        pilot={data.pilotAccess}
        settings={data.settings}
        onRefresh={workspace.refresh}
      />
    ),
    history: <RoutineHistoryWorkspace manager />,
    foundation: <RoutineFoundationManager data={data} onRefresh={workspace.refresh} />,
    release: <RoutineReleaseGate />,
  };

  const selectGroup = (groupId) => {
    const first = MANAGER_TABS.find((item) => item.group === groupId);
    if (first) setTab(first.id);
  };

  const changeTab = (index) => {
    const next = (index + visibleTabs.length) % visibleTabs.length;
    setTab(visibleTabs[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <main className="rm-workspace rm-experience-workspace">
      <header className="rm-topbar rm-experience-topbar">
        <div>
          <p className="eyebrow">Mesh Youngstorget</p>
          <h1>Operations Studio</h1>
          <small>Build the standard once. Make every shift easier.</small>
        </div>
        <button type="button" className="ghost-button" onClick={onBack}>
          Back
        </button>
      </header>

      <nav className="rm-experience-groups" aria-label="Operations Studio areas">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className={activeGroup === group.id ? "is-active" : ""}
            aria-current={activeGroup === group.id ? "page" : undefined}
            onClick={() => selectGroup(group.id)}
          >
            <span>{group.label}</span>
            <small>{group.caption}</small>
          </button>
        ))}
      </nav>

      {visibleTabs.length > 1 ? (
        <nav className="rm-tabs rm-experience-tabs" role="tablist" aria-label={`${activeGroup} sections`}>
          {visibleTabs.map((item, index) => (
            <button
              ref={(node) => {
                tabs.current[index] = node;
              }}
              role="tab"
              type="button"
              key={item.id}
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                if (["ArrowRight", "ArrowDown"].includes(event.key)) {
                  event.preventDefault();
                  changeTab(index + 1);
                }
                if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  changeTab(index - 1);
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  setTab(visibleTabs[0].id);
                }
                if (event.key === "End") {
                  event.preventDefault();
                  setTab(visibleTabs.at(-1).id);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="rm-panel rm-experience-panel" role="tabpanel" tabIndex="0">
        <Suspense
          fallback={(
            <div className="routine-state-card" role="status">
              Opening {MANAGER_TABS.find((item) => item.id === tab)?.label || "section"}…
            </div>
          )}
        >
          {panels[tab]}
        </Suspense>
      </section>
    </main>
  );
}
