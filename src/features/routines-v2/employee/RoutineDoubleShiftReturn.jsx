import { useState } from "react";

export default function RoutineDoubleShiftReturn({ context, pending, onReturn }) {
  const [reviewed, setReviewed] = useState(false); return <section className="employee-ds-card"><p className="eyebrow">DS03 · Return</p><h2>Return for Closing</h2>
    <dl className="employee-summary-list"><div><dt>Expected return</dt><dd>{context.expectedReturnAt ?? "—"}</dd></div><div><dt>Actual return</dt><dd>{context.actualReturnAt ?? "Recorded by server on return"}</dd></div>
      <div><dt>Interim owner</dt><dd>{context.bundle?.interimOwner?.displayName ?? "None"}</dd></div></dl>
    <label className="employee-critical-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the current feed hash and transition handover.</label>
    <button type="button" className="employee-primary" disabled={!context.actions?.canReturnDS03?.allowed || pending || !reviewed} onClick={onReturn}>Return, join Closing and accept handover</button></section>;
}
