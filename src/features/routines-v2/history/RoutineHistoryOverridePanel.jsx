export default function RoutineHistoryOverridePanel({ overrides = [], onCreate }) {
  return <section className="rh-section"><div className="rh-section-heading"><div><h3>Manager overrides</h3><p>Overrides are risk records and never count as standard met.</p></div>{onCreate && <button type="button" onClick={onCreate}>Record override</button>}</div>
    {overrides.length ? <ul className="rh-overrides">{overrides.map((item) => <li key={item.id}><strong>{item.override_type || "Manager override"}</strong><span>{item.reason}</span><span>Remaining risk: {item.remaining_risk}</span><span>Temporary measure: {item.temporary_measure}</span></li>)}</ul> : <p>No manager override was recorded.</p>}
  </section>;
}
