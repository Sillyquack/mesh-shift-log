export default function RoutineHistoryFilters({ value, onChange, manager = false }) {
  const field = (key, next) => onChange({ ...value, [key]: next });
  return <form className="rh-filters" onSubmit={(event) => event.preventDefault()} aria-label="History filters">
    <label>From<input type="date" value={value.dateFrom || ""} onChange={(event) => field("dateFrom", event.target.value)} /></label>
    <label>To<input type="date" value={value.dateTo || ""} onChange={(event) => field("dateTo", event.target.value)} /></label>
    <label>Routine<select value={value.routineKey || ""} onChange={(event) => field("routineKey", event.target.value)}><option value="">All routines</option><option value="opening">Opening</option><option value="closing">Closing</option><option value="double_shift">Double Shift</option></select></label>
    <label>Status<select value={value.status || ""} onChange={(event) => field("status", event.target.value)}><option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="finished">Finished</option><option value="cancelled">Cancelled</option></select></label>
    {manager && <><label className="rh-check"><input type="checkbox" checked={value.hasDeviation === true} onChange={(event) => field("hasDeviation", event.target.checked ? true : null)} />Has deviation</label><label className="rh-check"><input type="checkbox" checked={value.hasMismatch === true} onChange={(event) => field("hasMismatch", event.target.checked ? true : null)} />Has mismatch</label></>}
  </form>;
}
