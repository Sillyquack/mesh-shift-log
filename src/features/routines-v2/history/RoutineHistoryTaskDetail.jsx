import RoutineHistoryTimeline from "./RoutineHistoryTimeline.jsx";
import RoutineHistoryOverridePanel from "./RoutineHistoryOverridePanel.jsx";

export default function RoutineHistoryTaskDetail({ detail, onBack }) {
  return <article className="rh-detail"><header><button type="button" onClick={onBack}>← Run history</button><span className="rh-source v2">Routine Engine v2</span><h2>{detail.task?.title_snapshot || "Task detail"}</h2><p>Status: {detail.task?.status || "Unknown"}</p></header>
    <section className="rh-section"><h3>Recorded items</h3><ul className="rh-data-list">{detail.items.map((item) => <li key={item.id}><strong>{item.label_snapshot || item.item_key_snapshot}</strong><span>{item.status || "Recorded"}</span></li>)}</ul></section>
    <RoutineHistoryOverridePanel overrides={detail.managerOverrides} /><RoutineHistoryTimeline entries={[...detail.events.map((item) => ({ ...item, kind: "event" })), ...detail.corrections.map((item) => ({ ...item, kind: "correction", at: item.created_at }))]} />
  </article>;
}
