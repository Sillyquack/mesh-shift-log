export default function RoutineHistoryDeliveryPanel({ deliveries = [] }) {
  return <section className="rh-section"><h3>Closing delivery evidence</h3>{deliveries.length ? <ul className="rh-data-list">{deliveries.map((item) => <li key={item.id}><strong>Finish sequence {item.source_finish_sequence}</strong><span>{item.delivery_status || item.status || "Recorded"}</span></li>)}</ul> : <p>No delivery evidence for this run.</p>}</section>;
}
