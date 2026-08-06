import { useState } from "react";
import RoutineDialogSurface from "./RoutineDialogSurface.jsx";
import { routineItemDraftValue, validateRoutineItemDraft } from "../data/routineTaskViewModel.js";

export default function RoutineCompletionDialog({ context, itemDrafts = {}, onClose, onSubmit, pending }) {
  const task = context.task ?? {}; const critical = context.criticality === "critical"; const [note, setNote] = useState(""); const [confirmed, setConfirmed] = useState(false);
  const incomplete = (context.items ?? []).filter((item) => {
    if (!(item.required_snapshot ?? item.required) || ["completed", "not_applicable"].includes(item.status)) return false;
    const draft = itemDrafts[item.id] ?? routineItemDraftValue(item); const type = item.item_type_snapshot ?? item.itemType;
    return Boolean(validateRoutineItemDraft(item, draft)) || draft == null || draft === "" || (type === "check" && draft !== true);
  });
  const blockers = context.activeDeviations?.filter((deviation) => deviation.severity === "critical" && deviation.status === "open") ?? [];
  return <RoutineDialogSurface title="Complete task" description={task.title_snapshot ?? task.title} onClose={onClose}>
    <dl className="employee-summary-list"><div><dt>Done when</dt><dd>{task.done_when_snapshot ?? task.completion_criteria_snapshot ?? "All required checks meet the server contract."}</dd></div>
      <div><dt>Required items</dt><dd>{incomplete.length ? `${incomplete.length} incomplete` : "Ready for atomic save/completion"}</dd></div><div><dt>Open blockers</dt><dd>{blockers.length}</dd></div>
      <div><dt>Initial assessment</dt><dd>{context.initialAssessmentPolicy?.result ?? "Not required"}</dd></div><div><dt>Timing</dt><dd>{context.timing?.live?.phase ?? "Server controlled"}</dd></div>
      <div><dt>Verification</dt><dd>{context.verificationPolicy ?? "none"}</dd></div></dl>
    {context.activeOverride && <p className="employee-warning">Active manager override: {context.activeOverride.reason}</p>}
    <label>Completion note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
    {critical && <label className="employee-critical-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I physically checked this critical task and confirm the completion.</label>}
    <div className="employee-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="employee-primary" disabled={pending || incomplete.length > 0 || blockers.length > 0 || (critical && !confirmed)}
      onClick={() => onSubmit?.({ completionNote: note, criticalConfirmation: confirmed })}>Complete task</button></div>
  </RoutineDialogSurface>;
}
