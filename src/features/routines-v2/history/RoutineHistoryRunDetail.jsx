import RoutineHistoryTimeline from "./RoutineHistoryTimeline.jsx";
import RoutineHistoryDeliveryPanel from "./RoutineHistoryDeliveryPanel.jsx";
import RoutineHistoryComparisonPanel from "./RoutineHistoryComparisonPanel.jsx";
import RoutineHistoryDoubleShiftPanel from "./RoutineHistoryDoubleShiftPanel.jsx";
import RoutineHistoryOverridePanel from "./RoutineHistoryOverridePanel.jsx";
import RoutineHistoryManagerActions from "./RoutineHistoryManagerActions.jsx";

export default function RoutineHistoryRunDetail({ detail, mutations, onBack, onOpenTask, onCorrection, onOverride, onSaved }) {
  const run = detail.run || {};
  return <article className="rh-detail"><header><button type="button" onClick={onBack}>← History</button><span className="rh-source v2">Routine Engine v2 · authoritative</span><h2>{run.routine_key || "Routine"} · {run.operational_date}</h2><p>Status {run.status} · template v{run.template_version_number_snapshot ?? "—"} · finish sequence {run.current_finish_sequence ?? 0}</p><code>{run.snapshot_hash || "Snapshot hash unavailable"}</code></header>
    <section className="rh-section"><h3>Participants and actual identity source</h3><ul className="rh-data-list">{detail.participants.map((item) => <li key={item.id}><strong>{item.display_name_snapshot || item.identity_type}</strong><span>{item.identity_type} {item.operator_id ? "· shared-device operator" : "· personal auth"}</span></li>)}</ul></section>
    <section className="rh-section"><h3>Task outcomes</h3><ul className="rh-task-list">{detail.tasks.map((task) => <li key={task.id}><button type="button" onClick={() => onOpenTask(task.id)}><strong>{task.title_snapshot || task.task_key_snapshot}</strong><span>{task.status} · {task.outcome || "No outcome"}</span></button></li>)}</ul></section>
    <RoutineHistoryTimeline run={detail} /><RoutineHistoryDeliveryPanel deliveries={detail.deliveries} /><RoutineHistoryComparisonPanel comparisons={detail.comparisons} /><RoutineHistoryDoubleShiftPanel records={detail.doubleShift} />
    <RoutineHistoryOverridePanel overrides={detail.managerOverrides} onCreate={detail.actions.canCreateManagerOverride ? onOverride : null} />
    <RoutineHistoryManagerActions detail={detail} mutations={mutations} onSaved={onSaved} />
    {detail.actions.canRecordCorrection && <section className="rh-section rh-manager-actions"><h3>History correction</h3><p>Original history remains immutable. A correction is an explicit, separate record.</p><button type="button" onClick={onCorrection}>Record history correction</button></section>}
  </article>;
}
