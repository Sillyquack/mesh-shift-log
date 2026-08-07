import { historySource } from "../data/routineHistoryModel.js";

export default function RoutineHistoryList({ items, selectedId, onSelect }) {
  if (!items.length) return <section className="rh-empty" role="status"><h3>No history in this range</h3><p>Adjust the dates or filters. Existing records are never rewritten.</p></section>;
  return <ol className="rh-list" aria-label="Routine history records">{items.map((item) => {
    const source = historySource(item.sourceSystem);
    return <li key={`${item.sourceSystem}-${item.id}`}><button type="button" className={selectedId === item.id ? "selected" : ""} onClick={() => onSelect(item)} aria-pressed={selectedId === item.id}>
      <span className={`rh-source ${item.sourceSystem === "legacy_shift_log" ? "legacy" : "v2"}`}>{source.label}</span>
      <strong>{item.title || item.routineKey || item.recordType || "Routine record"}</strong>
      <span>{item.operationalDate || item.recordDate || "Date unavailable"} · {item.status || "Recorded"}</span>
      <small>{source.confidence}</small>
    </button></li>;
  })}</ol>;
}
