import { historySource } from "../data/routineHistoryModel.js";

export default function RoutineLegacyHistoryPanel({ summary, items = [] }) {
  const source = historySource("legacy_shift_log");
  return <section className="rh-section rh-legacy"><span className="rh-source legacy">{source.label}</span><h3>Read-only legacy adapter</h3><p>{source.confidence}. Template versions, snapshots, audit events, verification and Double Shift are unavailable and are never inferred.</p>
    {Number(summary?.unscopedLegacyCount || 0) > 0 && <div className="rh-callout warning" role="status"><strong>Unscoped legacy warning</strong><p>{summary.unscopedLegacyCount} row(s) have no organization. Only this aggregate is exposed; details are hidden and no automatic assignment occurs.</p></div>}
    <ul className="rh-data-list">{items.map((item) => <li key={item.id}><strong>{item.title || item.recordType}</strong><span>{item.operationalDate || item.recordDate} · {item.status || "Recorded"}</span></li>)}</ul>
  </section>;
}
