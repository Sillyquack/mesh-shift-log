import { useEffect, useState } from "react";
import { getRoutineManagerReviewDashboard, listRoutineHistoryCorrections, listRoutineOverrideFollowups } from "../api/routineHistoryClient.js";

export default function RoutineManagerReviewDashboard({ loader = getRoutineManagerReviewDashboard, followupLoader = listRoutineOverrideFollowups, correctionLoader = listRoutineHistoryCorrections }) {
  const [state, setState] = useState({ status: "loading", dashboard: null, followups: [], corrections: [], error: null });
  useEffect(() => { let active = true; const dateTo = new Date().toISOString().slice(0, 10); const from = new Date(); from.setDate(from.getDate() - 31); const dateFrom = from.toISOString().slice(0, 10);
    Promise.all([loader(dateFrom, dateTo), followupLoader(null), correctionLoader(dateFrom, dateTo)]).then(([dashboard, followups, corrections]) => { if (active) setState({ status: "ready", dashboard, followups, corrections, error: null }); }).catch((error) => { if (active) setState((value) => ({ ...value, status: "error", error })); }); return () => { active = false; }; }, [loader, followupLoader, correctionLoader]);
  if (state.status === "loading") return <section className="rh-state" role="status">Loading operational review…</section>;
  if (state.status === "error") return <section className="rh-state" role="alert"><h2>Operational review unavailable</h2><p>Personal manager authentication is required.</p></section>;
  const cards = [["Runs", state.dashboard.runs], ["Finished", state.dashboard.finishedRuns], ["Reopened", state.dashboard.reopenedRuns], ["Open deviations", state.dashboard.openDeviations], ["Mismatches", state.dashboard.mismatches], ["Corrections", state.dashboard.corrections]];
  return <div className="rh-workspace"><header className="rh-heading"><div><p className="eyebrow">Personal manager auth only</p><h2>Operational Review</h2><p>Exceptions, follow-up and immutable corrections across the selected period.</p></div></header><section className="rh-metrics" aria-label="Operational review totals">{cards.map(([label, value]) => <article key={label}><strong>{value ?? 0}</strong><span>{label}</span></article>)}</section>
    <section className="rh-section"><h3>Override follow-up</h3>{state.followups.length ? <ul className="rh-overrides">{state.followups.map((item) => <li key={item.id}><strong>{item.status}: {item.overrideType}</strong><span>{item.reason}</span><time>{item.followUpDueAt}</time></li>)}</ul> : <p>No override follow-up is due.</p>}</section>
    <section className="rh-section"><h3>History corrections</h3><p>{state.corrections.length} separate immutable correction record(s).</p></section></div>;
}
