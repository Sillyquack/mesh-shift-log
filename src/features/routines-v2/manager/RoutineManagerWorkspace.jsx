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
import "./RoutineManagerExperience.css";

const RoutineHistoryWorkspace = lazy(() => import("../history/RoutineHistoryWorkspace.jsx"));
const RoutineManagerReviewDashboard = lazy(() => import("../history/RoutineManagerReviewDashboard.jsx"));
const RoutineReleaseGate = lazy(() => import("../history/RoutineReleaseGate.jsx"));
const RoutineContentPackManager = lazy(() => import("./RoutineContentPackManager.jsx"));

const PRIMARY_VIEWS = Object.freeze([
  { id: "today", label: "Today" },
  { id: "attention", label: "Attention" },
  { id: "control", label: "Control" },
]);

const CONTROL_GROUPS = Object.freeze([
  {
    label: "Operational content",
    items: [
      { id: "content", kicker: "Pack", title: "Operational content", copy: "Review the installed content pack and move into template editing." },
      { id: "templates", kicker: "Build", title: "Templates", copy: "Edit versioned routines, tasks, timing, conditions and publication." },
      { id: "references", kicker: "Visual", title: "Visual standards", copy: "Upload the exact images employees can open inside tasks." },
    ],
  },
  {
    label: "People and access",
    items: [
      { id: "operators", kicker: "People", title: "Operators", copy: "Manage shared-device operators, credentials, sessions and lockouts." },
      { id: "pilot", kicker: "Access", title: "Pilot access", copy: "Choose exactly who may review or participate in the controlled rollout." },
    ],
  },
  {
    label: "System and release",
    items: [
      { id: "foundation", kicker: "Structure", title: "Foundation", copy: "Manage locations, location sets and operational standards." },
      { id: "release", kicker: "Go / no-go", title: "Production readiness", copy: "Review the server-authoritative gate before any release action." },
    ],
  },
  {
    label: "Records and review",
    items: [
      { id: "history", kicker: "Records", title: "History", copy: "Browse recent work, find a run and review immutable evidence." },
      { id: "review", kicker: "Exceptions", title: "Operational review", copy: "See deviations, mismatches, overrides and correction follow-up." },
    ],
  },
]);

function countReadiness(data = {}) {
  const categories = Object.values(data.readiness?.categories || {});
  return categories.reduce((totals, category) => ({
    blockers: totals.blockers + (Array.isArray(category?.blockers) ? category.blockers.length : 0),
    warnings: totals.warnings + (Array.isArray(category?.warnings) ? category.warnings.length : 0),
  }), { blockers: 0, warnings: 0 });
}

function AttentionHome({ data, onOpen }) {
  const references = Array.isArray(data.references?.references) ? data.references.references.filter((reference) => reference.active !== false) : [];
  const placeholders = references.filter((reference) => reference.current?.state !== "active_image").length;
  const foundationWarnings = Array.isArray(data.foundationWarnings) ? data.foundationWarnings.length : 0;
  const readiness = countReadiness(data);
  const draftTemplates = (Array.isArray(data.templates) ? data.templates : []).filter((template) => template.activeDraft || template.state === "draft").length;
  const total = placeholders + foundationWarnings + readiness.blockers + readiness.warnings;

  const cards = [
    {
      label: "Visual standards",
      title: placeholders ? `${placeholders} image${placeholders === 1 ? " is" : "s are"} still missing.` : "Every visual standard has an image.",
      copy: placeholders ? "Upload the photos you are reviewing so frontline tasks can show the exact expected result." : "No image work is waiting for you.",
      tone: placeholders ? "warning" : "clear",
      action: "Open visual standards",
      tool: "references",
    },
    {
      label: "Foundation",
      title: foundationWarnings ? `${foundationWarnings} structure warning${foundationWarnings === 1 ? " needs" : "s need"} review.` : "Foundation is clear.",
      copy: foundationWarnings ? "Review locations, sets or operational standards before publishing additional work." : "Locations and standards are not raising a warning.",
      tone: foundationWarnings ? "warning" : "clear",
      action: "Open foundation",
      tool: "foundation",
    },
    {
      label: "Release readiness",
      title: readiness.blockers ? `${readiness.blockers} release blocker${readiness.blockers === 1 ? " remains" : "s remain"}.` : readiness.warnings ? `${readiness.warnings} release warning${readiness.warnings === 1 ? " remains" : "s remain"}.` : "Release gate is clear.",
      copy: readiness.blockers ? "Do not promote or activate until the server-authoritative gate is green." : readiness.warnings ? "The gate is not blocked, but these warnings deserve a deliberate decision." : "No readiness blocker is currently reported.",
      tone: readiness.blockers ? "blocked" : readiness.warnings ? "warning" : "clear",
      action: "Open production readiness",
      tool: "release",
    },
    {
      label: "Content",
      title: draftTemplates ? `${draftTemplates} editable draft${draftTemplates === 1 ? " is" : "s are"} available.` : "No draft content is waiting.",
      copy: draftTemplates ? "Use templates when you are ready to review wording, sequence and visual links." : "Published content remains separated from draft work.",
      tone: "clear",
      action: "Open templates",
      tool: "templates",
    },
  ];

  return (
    <div className="rm-stack">
      <header className="mesh-manager-heading">
        <div>
          <p className="eyebrow">Attention</p>
          <h2>{total ? `${total} item${total === 1 ? " needs" : "s need"} you.` : "Nothing is asking for you."}</h2>
          <p>Only decisions, missing standards and release risks appear here. Everything else stays quiet.</p>
        </div>
      </header>
      <section className="mesh-attention-grid" aria-label="Manager attention items">
        {cards.map((card) => (
          <article key={card.tool} className={`mesh-attention-card is-${card.tone}`}>
            <div>
              <p className="eyebrow">{card.label}</p>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </div>
            <button type="button" onClick={() => onOpen(card.tool)}>{card.action}</button>
          </article>
        ))}
      </section>
      <section className="rm-card">
        <p className="eyebrow">Last 31 days</p>
        <h3>Operational exceptions</h3>
        <p>Overrides, deviations, mismatches and immutable corrections stay in the existing guarded review contract.</p>
        <Suspense fallback={<div className="routine-state-card" role="status">Loading operational review…</div>}>
          <RoutineManagerReviewDashboard />
        </Suspense>
      </section>
    </div>
  );
}

function ControlHome({ data, onOpen }) {
  const referenceCount = Array.isArray(data.references?.references) ? data.references.references.length : 0;
  return (
    <div className="rm-stack">
      <header className="mesh-manager-heading">
        <div>
          <p className="eyebrow">Control</p>
          <h2>Everything powerful. Nothing noisy.</h2>
          <p>Open one focused tool at a time. The configuration model is unchanged; only the path into it is calmer.</p>
        </div>
      </header>
      <div className="mesh-control-groups">
        {CONTROL_GROUPS.map((group) => (
          <section className="mesh-control-group" key={group.label}>
            <h3>{group.label}</h3>
            <div className="mesh-control-grid">
              {group.items.map((item) => (
                <button type="button" className="mesh-control-card" key={item.id} onClick={() => onOpen(item.id)}>
                  <span>{item.kicker}</span>
                  <strong>{item.title}</strong>
                  <small>{item.id === "references" ? `${referenceCount} logical reference${referenceCount === 1 ? "" : "s"} available. ` : ""}{item.copy}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
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
  const initialControl = initialTab !== "overview" ? initialTab : null;
  const [view, setView] = useState(initialControl ? "control" : "today");
  const [tool, setTool] = useState(initialControl);
  const primaryTabs = useRef([]);
  const controlTabs = useRef([]);

  if (workspace.status === "loading" && !workspace.data) {
    return <main className="routine-shell-centered"><section className="routine-state-card" role="status" aria-busy="true"><h1>Opening Manager workspace…</h1></section></main>;
  }
  if (workspace.status === "error" && !workspace.data) {
    return <main className="routine-shell-centered"><section className="routine-state-card" role="alert"><h1>Manager workspace unavailable</h1><p>Personal manager authentication and the 10K2 server contract are required.</p><button type="button" className="primary-button" onClick={workspace.refresh}>Try again</button></section></main>;
  }

  const data = workspace.data;
  const CONTROL_TABS = MANAGER_TABS.filter((item) => item.id !== "overview");

  const openTool = (id) => {
    setTool(id);
    setView("control");
  };

  const changePrimary = (index) => {
    const next = (index + PRIMARY_VIEWS.length) % PRIMARY_VIEWS.length;
    setView(PRIMARY_VIEWS[next].id);
    if (PRIMARY_VIEWS[next].id !== "control") setTool(null);
    primaryTabs.current[next]?.focus();
  };

  const changeControl = (index) => {
    const next = (index + CONTROL_TABS.length) % CONTROL_TABS.length;
    setTool(CONTROL_TABS[next].id);
    controlTabs.current[next]?.focus();
  };

  const panels = useMemo(() => ({
    foundation: <RoutineFoundationManager data={data} onRefresh={workspace.refresh} />,
    content: <RoutineContentPackManager onOpenTemplates={() => openTool("templates")} />,
    templates: <RoutineTemplatesManager templates={data.templates} onRefresh={workspace.refresh} />,
    references: <RoutineReferenceManager loader={referenceLoader} uploader={referenceUploader} />,
    operators: <RoutineOperatorAdmin loader={operatorLoader} api={operatorApi} profileChoices={data.profileChoices || []} />,
    pilot: <RoutinePilotAccessManager pilot={data.pilotAccess} settings={data.settings} onRefresh={workspace.refresh} />,
    history: <RoutineHistoryWorkspace manager />,
    review: <RoutineManagerReviewDashboard />,
    release: <RoutineReleaseGate />,
  }), [data, operatorApi, operatorLoader, referenceLoader, referenceUploader, workspace.refresh]);

  let content;
  if (view === "today") {
    content = <RoutineManagerOverview data={data} onRefresh={workspace.refresh} onOpenAttention={() => { setTool(null); setView("attention"); }} onOpenControl={() => { setTool(null); setView("control"); }} />;
  } else if (view === "attention") {
    content = <AttentionHome data={data} onOpen={openTool} />;
  } else if (!tool) {
    content = <ControlHome data={data} onOpen={openTool} />;
  } else {
    const active = CONTROL_TABS.find((item) => item.id === tool);
    content = (
      <div className="rm-stack">
        <header className="mesh-manager-tool-heading">
          <div><p className="eyebrow">Control</p><h2>{active?.label || "Manager tool"}</h2><p>One focused tool. Return to Control when the decision or edit is complete.</p></div>
          <button type="button" className="ghost-button" onClick={() => setTool(null)}>← Back to Control</button>
        </header>
        <nav className="mesh-control-tablist" role="tablist" aria-label="Manager Control Center sections">
          {CONTROL_TABS.map((item, index) => (
            <button
              ref={(node) => { controlTabs.current[index] = node; }}
              role="tab"
              type="button"
              key={item.id}
              aria-selected={tool === item.id}
              tabIndex={tool === item.id ? 0 : -1}
              onClick={() => setTool(item.id)}
              onKeyDown={(event) => {
                if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); changeControl(index + 1); }
                if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); changeControl(index - 1); }
                if (event.key === "Home") { event.preventDefault(); setTool(CONTROL_TABS[0].id); controlTabs.current[0]?.focus(); }
                if (event.key === "End") { event.preventDefault(); const last = CONTROL_TABS.length - 1; setTool(CONTROL_TABS[last].id); controlTabs.current[last]?.focus(); }
              }}
            >{item.label}</button>
          ))}
        </nav>
        <section className="rm-panel" role="tabpanel" tabIndex="0">
          <Suspense fallback={<div className="routine-state-card" role="status">Opening secure manager tool…</div>}>{panels[tool]}</Suspense>
        </section>
      </div>
    );
  }

  return (
    <main className="rm-workspace mesh-manager-experience">
      <header className="mesh-manager-topbar">
        <div><p className="eyebrow">Personal manager workspace</p><h1>Mesh Manager</h1></div>
        <button type="button" className="ghost-button" onClick={onBack}>← Workspace home</button>
      </header>
      <nav className="mesh-manager-nav" role="tablist" aria-label="Manager workspace">
        {PRIMARY_VIEWS.map((item, index) => (
          <button
            ref={(node) => { primaryTabs.current[index] = node; }}
            role="tab"
            type="button"
            key={item.id}
            aria-selected={view === item.id}
            tabIndex={view === item.id ? 0 : -1}
            onClick={() => { setView(item.id); if (item.id !== "control") setTool(null); }}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); changePrimary(index + 1); }
              if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); changePrimary(index - 1); }
              if (event.key === "Home") { event.preventDefault(); setView("today"); setTool(null); primaryTabs.current[0]?.focus(); }
              if (event.key === "End") { event.preventDefault(); setView("control"); primaryTabs.current[2]?.focus(); }
            }}
          >{item.label}</button>
        ))}
      </nav>
      <section className="mesh-manager-panel" role="tabpanel" tabIndex="0">{content}</section>
    </main>
  );
}
