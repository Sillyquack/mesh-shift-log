import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRoutineLegacyHistorySummary,
  getRoutineV2HistoryRun,
  getRoutineV2HistoryTask,
  listRoutineLegacyHistory,
  listRoutineV2History,
  routineHistoryMutations,
} from "../api/routineHistoryClient.js";
import { useRoutineHistory } from "../hooks/useRoutineHistory.js";
import RoutineHistoryFilters from "./RoutineHistoryFilters.jsx";
import RoutineHistoryList from "./RoutineHistoryList.jsx";
import RoutineHistoryRunDetail from "./RoutineHistoryRunDetail.jsx";
import RoutineHistoryTaskDetail from "./RoutineHistoryTaskDetail.jsx";
import RoutineHistoryCorrectionDialog from "./RoutineHistoryCorrectionDialog.jsx";
import RoutineManagerOverrideDialog from "./RoutineManagerOverrideDialog.jsx";
import RoutineLegacyHistoryPanel from "./RoutineLegacyHistoryPanel.jsx";
import "./RoutineHistory.css";
import "./RoutineHistoryExperience.css";

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
  const value = new Date();
  value.setDate(value.getDate() - 31);
  return value.toISOString().slice(0, 10);
};

export default function RoutineHistoryWorkspace({
  manager = false,
  loader = listRoutineV2History,
  runLoader = getRoutineV2HistoryRun,
  taskLoader = getRoutineV2HistoryTask,
  legacySummaryLoader = getRoutineLegacyHistorySummary,
  legacyLoader = listRoutineLegacyHistory,
  mutations = routineHistoryMutations,
}) {
  const [filters, setFilters] = useState({
    dateFrom: monthAgo(),
    dateTo: today(),
    routineKey: "",
    status: "",
    hasDeviation: null,
    hasMismatch: null,
  });
  const [view, setView] = useState("recent");
  const query = useMemo(
    () => filters,
    [filters.dateFrom, filters.dateTo, filters.routineKey, filters.status, filters.hasDeviation, filters.hasMismatch],
  );
  const history = useRoutineHistory({ filters: query, loader });
  const [route, setRoute] = useState({ name: "list", id: null });
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [dialog, setDialog] = useState(null);
  const [legacy, setLegacy] = useState({ summary: null, items: [] });
  const detailRequest = useRef(0);
  const legacyRequest = useRef(0);
  const navRefs = useRef([]);

  useEffect(() => () => {
    detailRequest.current += 1;
    legacyRequest.current += 1;
  }, []);

  const openRun = useCallback(async (item) => {
    if (item.sourceSystem === "legacy_shift_log") return;
    const current = ++detailRequest.current;
    setRoute({ name: "run", id: item.id });
    setDetailState("loading");
    try {
      const value = await runLoader(item.id);
      if (current === detailRequest.current) {
        setDetail(value);
        setDetailState("ready");
      }
    } catch {
      if (current === detailRequest.current) setDetailState("error");
    }
  }, [runLoader]);

  const openTask = useCallback(async (id) => {
    const current = ++detailRequest.current;
    setRoute({ name: "task", id });
    setDetailState("loading");
    try {
      const value = await taskLoader(id);
      if (current === detailRequest.current) {
        setDetail(value);
        setDetailState("ready");
      }
    } catch {
      if (current === detailRequest.current) setDetailState("error");
    }
  }, [taskLoader]);

  const loadLegacy = useCallback(async () => {
    const current = ++legacyRequest.current;
    const [summary, page] = await Promise.all([legacySummaryLoader(), legacyLoader(filters)]);
    if (current === legacyRequest.current) setLegacy({ summary, items: page.items || [] });
  }, [filters, legacyLoader, legacySummaryLoader]);

  const closeDetail = useCallback(() => {
    detailRequest.current += 1;
    setRoute({ name: "list", id: null });
    setDetail(null);
    setDialog(null);
  }, []);

  if (route.name !== "list") {
    return (
      <div className="rh-workspace mesh-history-experience">
        {detailState === "loading" ? (
          <section className="rh-state" role="status">Loading immutable detail…</section>
        ) : detailState === "error" ? (
          <section className="rh-state" role="alert"><h2>History detail unavailable</h2><button onClick={closeDetail}>Back</button></section>
        ) : route.name === "task" ? (
          <RoutineHistoryTaskDetail detail={detail} onBack={() => openRun({ id: detail.task?.run_id })} />
        ) : (
          <RoutineHistoryRunDetail
            detail={detail}
            mutations={mutations}
            onBack={closeDetail}
            onOpenTask={openTask}
            onCorrection={() => setDialog("correction")}
            onOverride={() => setDialog("override")}
            onSaved={() => openRun({ id: detail.run.id })}
          />
        )}
        {dialog === "correction" && <RoutineHistoryCorrectionDialog runId={detail.run.id} api={mutations.recordCorrection} onClose={() => setDialog(null)} onSaved={() => openRun({ id: detail.run.id })} />}
        {dialog === "override" && <RoutineManagerOverrideDialog run={detail.run} participants={detail.participants} api={mutations.createManagerOverride} onClose={() => setDialog(null)} onSaved={() => openRun({ id: detail.run.id })} />}
      </div>
    );
  }

  const views = manager
    ? [{ id: "recent", label: "Recent" }, { id: "find", label: "Find" }, { id: "review", label: "Review" }]
    : [{ id: "recent", label: "Recent" }, { id: "find", label: "Find" }];
  const changeView = (index) => {
    const next = (index + views.length) % views.length;
    setView(views[next].id);
    navRefs.current[next]?.focus();
  };
  const list = history.status === "loading" && !history.data
    ? <div className="rh-state" role="status">Loading history…</div>
    : history.status === "error" && !history.data
      ? <div className="rh-state" role="alert">History could not be loaded.</div>
      : <RoutineHistoryList items={history.data?.items || []} selectedId={null} onSelect={openRun} />;

  return (
    <div className="rh-workspace mesh-history-experience">
      <header className="mesh-history-hero">
        <div>
          <p className="eyebrow">{manager ? "Authoritative records" : "Your completed work"}</p>
          <h2>{manager ? "History without the noise." : "Your shift history."}</h2>
          <p>Start with recent work, search only when you need to, and keep audit-source review separate from everyday browsing.</p>
        </div>
        <button type="button" onClick={history.refresh}>Refresh</button>
      </header>

      <nav className="mesh-history-nav" role="tablist" aria-label="History views">
        {views.map((item, index) => (
          <button
            ref={(node) => { navRefs.current[index] = node; }}
            role="tab"
            type="button"
            key={item.id}
            aria-selected={view === item.id}
            tabIndex={view === item.id ? 0 : -1}
            onClick={() => setView(item.id)}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); changeView(index + 1); }
              if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); changeView(index - 1); }
              if (event.key === "Home") { event.preventDefault(); setView("recent"); navRefs.current[0]?.focus(); }
              if (event.key === "End") { event.preventDefault(); const last = views.length - 1; setView(views[last].id); navRefs.current[last]?.focus(); }
            }}
          >{item.label}</button>
        ))}
      </nav>

      {view === "recent" && (
        <section className="mesh-history-recent" role="tabpanel">
          <header className="mesh-history-intro">
            <div><p className="eyebrow">Recent</p><h3>Last 31 days</h3><p>Open a run to see its immutable snapshot, task evidence, deviations and permitted manager actions.</p></div>
          </header>
          <section aria-labelledby="history-list-title"><h3 id="history-list-title" className="sr-only">History results</h3>{list}</section>
        </section>
      )}

      {view === "find" && (
        <section className="mesh-history-find" role="tabpanel">
          <header className="mesh-history-intro"><div><p className="eyebrow">Find</p><h3>Search the record</h3><p>Choose dates, routine, status or exception filters. The same guarded history contract remains authoritative.</p></div></header>
          <RoutineHistoryFilters value={filters} onChange={setFilters} manager={manager} />
          <section aria-labelledby="history-find-results"><h3 id="history-find-results" className="sr-only">Filtered history results</h3>{list}</section>
        </section>
      )}

      {manager && view === "review" && (
        <section className="mesh-history-review" role="tabpanel">
          <header className="mesh-history-intro"><div><p className="eyebrow">Review</p><h3>Know the strength of the record</h3><p>Routine Engine v2 and legacy history remain visibly separate. No old record is upgraded or rewritten.</p></div></header>
          <div className="mesh-history-review-grid">
            <article className="mesh-history-review-card">
              <p className="eyebrow">Authoritative</p>
              <h3>Routine Engine v2</h3>
              <p>Versioned snapshots, immutable server events and explicit corrections.</p>
              <span className="rh-source v2">Routine Engine v2</span>
            </article>
            <article className="mesh-history-review-card">
              <p className="eyebrow">Read only</p>
              <h3>Legacy shift log</h3>
              <p>Older records remain readable with unavailable evidence clearly identified.</p>
              <span className="rh-source legacy">Legacy shift log</span>
              <button type="button" onClick={loadLegacy}>Load legacy records</button>
            </article>
          </div>
          {legacy.summary && <RoutineLegacyHistoryPanel summary={legacy.summary} items={legacy.items} />}
        </section>
      )}

      <span className="sr-only">{manager ? "Own-organization authoritative records" : "Only runs you participated in"} · V2 audit history and legacy records remain clearly separated. · Audit strength</span>
    </div>
  );
}
