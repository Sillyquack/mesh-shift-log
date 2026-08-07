import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRoutineLegacyHistorySummary, getRoutineV2HistoryRun, getRoutineV2HistoryTask, listRoutineLegacyHistory, listRoutineV2History, routineHistoryMutations } from "../api/routineHistoryClient.js";
import { useRoutineHistory } from "../hooks/useRoutineHistory.js";
import RoutineHistoryFilters from "./RoutineHistoryFilters.jsx";
import RoutineHistoryList from "./RoutineHistoryList.jsx";
import RoutineHistoryRunDetail from "./RoutineHistoryRunDetail.jsx";
import RoutineHistoryTaskDetail from "./RoutineHistoryTaskDetail.jsx";
import RoutineHistoryCorrectionDialog from "./RoutineHistoryCorrectionDialog.jsx";
import RoutineManagerOverrideDialog from "./RoutineManagerOverrideDialog.jsx";
import RoutineLegacyHistoryPanel from "./RoutineLegacyHistoryPanel.jsx";
import "./RoutineHistory.css";

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => { const value = new Date(); value.setDate(value.getDate() - 31); return value.toISOString().slice(0, 10); };

export default function RoutineHistoryWorkspace({ manager = false, loader = listRoutineV2History, runLoader = getRoutineV2HistoryRun, taskLoader = getRoutineV2HistoryTask,
  legacySummaryLoader = getRoutineLegacyHistorySummary, legacyLoader = listRoutineLegacyHistory, mutations = routineHistoryMutations }) {
  const [filters, setFilters] = useState({ dateFrom: monthAgo(), dateTo: today(), routineKey: "", status: "", hasDeviation: null, hasMismatch: null });
  const query = useMemo(() => filters, [filters.dateFrom, filters.dateTo, filters.routineKey, filters.status, filters.hasDeviation, filters.hasMismatch]);
  const history = useRoutineHistory({ filters: query, loader }); const [route, setRoute] = useState({ name: "list", id: null }); const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle"); const [dialog, setDialog] = useState(null); const [legacy, setLegacy] = useState({ summary: null, items: [] });
  const detailRequest = useRef(0); const legacyRequest = useRef(0);
  useEffect(() => () => { detailRequest.current += 1; legacyRequest.current += 1; }, []);
  const openRun = useCallback(async (item) => { if (item.sourceSystem === "legacy_shift_log") return; const current = ++detailRequest.current; setRoute({ name: "run", id: item.id }); setDetailState("loading"); try { const value = await runLoader(item.id); if (current === detailRequest.current) { setDetail(value); setDetailState("ready"); } } catch { if (current === detailRequest.current) setDetailState("error"); } }, [runLoader]);
  const openTask = useCallback(async (id) => { const current = ++detailRequest.current; setRoute({ name: "task", id }); setDetailState("loading"); try { const value = await taskLoader(id); if (current === detailRequest.current) { setDetail(value); setDetailState("ready"); } } catch { if (current === detailRequest.current) setDetailState("error"); } }, [taskLoader]);
  const loadLegacy = useCallback(async () => { const current = ++legacyRequest.current; const [summary, page] = await Promise.all([legacySummaryLoader(), legacyLoader(filters)]); if (current === legacyRequest.current) setLegacy({ summary, items: page.items || [] }); }, [filters, legacyLoader, legacySummaryLoader]);
  const closeDetail = useCallback(() => { detailRequest.current += 1; setRoute({ name: "list", id: null }); setDetail(null); setDialog(null); }, []);
  if (route.name !== "list") return <div className="rh-workspace">{detailState === "loading" ? <section className="rh-state" role="status">Loading immutable detail…</section> : detailState === "error" ? <section className="rh-state" role="alert"><h2>History detail unavailable</h2><button onClick={closeDetail}>Back</button></section> : route.name === "task" ? <RoutineHistoryTaskDetail detail={detail} onBack={() => openRun({ id: detail.task?.run_id })} /> : <RoutineHistoryRunDetail detail={detail} mutations={mutations} onBack={closeDetail} onOpenTask={openTask} onCorrection={() => setDialog("correction")} onOverride={() => setDialog("override")} onSaved={() => openRun({ id: detail.run.id })} />}
    {dialog === "correction" && <RoutineHistoryCorrectionDialog runId={detail.run.id} api={mutations.recordCorrection} onClose={() => setDialog(null)} onSaved={() => openRun({ id: detail.run.id })} />}{dialog === "override" && <RoutineManagerOverrideDialog run={detail.run} participants={detail.participants} api={mutations.createManagerOverride} onClose={() => setDialog(null)} onSaved={() => openRun({ id: detail.run.id })} />}</div>;
  return <div className="rh-workspace"><header className="rh-heading"><div><p className="eyebrow">{manager ? "Own-organization authoritative records" : "Only runs you participated in"}</p><h2>{manager ? "History" : "My history"}</h2><p>V2 audit history and legacy records remain clearly separated.</p></div><button type="button" onClick={history.refresh}>Refresh</button></header><RoutineHistoryFilters value={filters} onChange={setFilters} manager={manager} />
    <div className="rh-columns"><section aria-labelledby="history-list-title"><h3 id="history-list-title" className="sr-only">History results</h3>{history.status === "loading" && !history.data ? <div className="rh-state" role="status">Loading history…</div> : history.status === "error" && !history.data ? <div className="rh-state" role="alert">History could not be loaded.</div> : <RoutineHistoryList items={history.data?.items || []} selectedId={null} onSelect={openRun} />}</section>
      <aside className="rh-source-guide"><h3>Audit strength</h3><span className="rh-source v2">Routine Engine v2</span><p>Authoritative snapshots and immutable server events.</p>{manager && <><span className="rh-source legacy">Legacy shift log</span><p>Read-only records with explicitly unavailable fields.</p><button type="button" onClick={loadLegacy}>Load legacy records</button></>}</aside></div>
    {manager && legacy.summary && <RoutineLegacyHistoryPanel summary={legacy.summary} items={legacy.items} />}</div>;
}
