export default function RoutineHistoryDoubleShiftPanel({ records = [] }) {
  return <section className="rh-section"><h3>Double Shift</h3>{records.length ? <ul className="rh-data-list">{records.map((item, index) => <li key={item.bundle?.id || index}><strong>{item.phase || "Bundle phase"}</strong><span>{item.bundle?.status || "Recorded"} · DS01–DS04 evidence retained</span></li>)}</ul> : <p>No Double Shift bundle is linked.</p>}</section>;
}
