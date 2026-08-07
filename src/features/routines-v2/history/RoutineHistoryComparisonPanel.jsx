export default function RoutineHistoryComparisonPanel({ comparisons = [] }) {
  return <section className="rh-section"><h3>Opening comparison & reconciliation</h3>{comparisons.length ? comparisons.map((item) => <article key={item.id} className={`rh-callout ${item.comparison_result === "mismatch" ? "danger" : "success"}`}><strong>{item.comparison_result === "mismatch" ? "Mismatch" : "Matched"}</strong><p>Comparison sequence {item.comparison_sequence ?? "—"}. Reconciliation: {item.reconciliation_status || "not required"}.</p></article>) : <p>No comparison was generated.</p>}</section>;
}
