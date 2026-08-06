export default function RoutineDoubleShiftChangeFeed({ feed = {}, stale = false, onRefresh }) {
  const entries = feed.entries ?? []; return <section className={`employee-ds-card ${stale ? "employee-conflict" : ""}`}><p className="eyebrow">Change feed · {feed.hash ?? "waiting for server hash"}</p><h2>Changes since Opening</h2>
    {stale && <p role="alert">The feed changed. Review the current entries before returning.</p>}{entries.length ? <ol>{entries.map((entry) => <li key={entry.entryId ?? entry.id ?? entry.sequence}><strong>{entry.title ?? entry.type}</strong><span>{entry.summary}</span><small>{entry.serverTimestamp ?? entry.serverCreatedAt}</small></li>)}</ol> : <p>No changes reported.</p>}
    <button type="button" onClick={onRefresh}>Refresh change feed</button></section>;
}
