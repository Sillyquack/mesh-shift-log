import { formatHistoryDate, mergeHistoryTimeline } from "../data/routineHistoryModel.js";

const title = (entry) => entry.kind === "correction" ? "History correction" : entry.kind === "override" ? "Manager override" : String(entry.event_type || entry.eventType || "Routine event").replaceAll("_", " ");
export default function RoutineHistoryTimeline({ run, entries }) {
  const timeline = entries || mergeHistoryTimeline(run);
  return <section className="rh-section"><h3>Immutable timeline</h3><p className="rh-help">Events remain in server order. Corrections and overrides are shown as separate records.</p>
    <ol className="rh-timeline" aria-label="Chronological routine timeline">{timeline.length ? timeline.map((entry, index) => <li key={`${entry.kind}-${entry.id || index}`} className={`kind-${entry.kind}`}>
      <span className="rh-timeline-dot" aria-hidden="true" /><div><strong>{title(entry)}</strong><time dateTime={entry.at || entry.server_created_at || entry.created_at}>{formatHistoryDate(entry.at || entry.server_created_at || entry.created_at)}</time>
        <p>{entry.reason || entry.note || entry.details || entry.remaining_risk || "Server-recorded evidence"}</p><span className="sr-only">Timeline entry {index + 1} of {timeline.length}</span></div>
    </li>) : <li className="empty">No timeline entries were returned.</li>}</ol>
  </section>;
}
