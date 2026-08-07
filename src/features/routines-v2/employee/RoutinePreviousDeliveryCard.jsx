export default function RoutinePreviousDeliveryCard({ delivery, comparison }) {
  if (!delivery) return <aside className="employee-evidence"><strong>Previous Closing</strong><p>No previous delivery</p></aside>;
  return <aside className="employee-evidence"><p className="eyebrow">Previous Closing · {delivery.operationalDate ?? delivery.date}</p>
    <h4>{delivery.reportedStatus ?? delivery.status ?? "Delivered evidence"}</h4><dl><div><dt>Completed by</dt><dd>{delivery.completedBy ?? "—"}</dd></div>
      <div><dt>Verifier</dt><dd>{delivery.verifier ?? "—"}</dd></div><div><dt>Closing Responsible</dt><dd>{delivery.closingResponsible ?? "—"}</dd></div>
      <div><dt>Age</dt><dd>{delivery.ageOperationalDays ?? delivery.operationalAgeDays ?? 0} operational days</dd></div></dl>
    {delivery.override && <p className="employee-warning">Prior override: {delivery.override}</p>}{delivery.deviation && <p className="employee-warning">Prior deviation: {delivery.deviation}</p>}
    {Array.isArray(delivery.evidence) && delivery.evidence.length > 0 && <ul>{delivery.evidence.map((entry, index) => <li key={entry.id ?? index}>{entry.summary ?? entry.label ?? entry}</li>)}</ul>}
    {comparison && <p className="employee-comparison"><strong>Comparison:</strong> {comparison.result ?? comparison.status ?? "not comparable"}</p>}</aside>;
}
