import { useState } from "react";
import { useRoutineDoubleShiftWorkspace } from "../hooks/useRoutineDoubleShiftWorkspace.js";
import RoutineDoubleShiftPlan from "./RoutineDoubleShiftPlan.jsx";
import RoutineDoubleShiftTransition from "./RoutineDoubleShiftTransition.jsx";
import RoutineDoubleShiftChangeFeed from "./RoutineDoubleShiftChangeFeed.jsx";
import RoutineDoubleShiftReturn from "./RoutineDoubleShiftReturn.jsx";
import RoutineDoubleShiftReassignment from "./RoutineDoubleShiftReassignment.jsx";

export default function RoutineDoubleShiftWorkspace({ bundleId, onBack, onOpenRun, loader, api, refreshSignal }) {
  const workspace = useRoutineDoubleShiftWorkspace(bundleId, { loader, api, refreshSignal }); const [feedStale, setFeedStale] = useState(false);
  if (workspace.status === "error") return <main className="employee-workspace"><button type="button" onClick={onBack}>Back</button><p role="alert">Double Shift could not be loaded.</p></main>;
  if (workspace.status === "loading" || !workspace.data) return <main className="employee-workspace employee-loading" role="status">Loading Double Shift…</main>;
  const context = workspace.data; const bundle = context.bundle?.bundle ?? context.bundle; const participant = context.bundle?.currentParticipant;
  const common = { bundleId, bundleParticipantId: participant?.id, expectedBundleRevision: bundle.revision };
  return <main className="employee-workspace"><header className="employee-page-header"><button type="button" onClick={onBack}>← Operations</button><div><p className="eyebrow">Double Shift · {bundle.status}</p><h1>{bundle.operational_date ?? bundle.operationalDate}</h1></div></header>
    {context.readOnlyPreview && <p className="employee-readonly" role="status">Read-only preview — operational actions are not enabled</p>}
    <RoutineDoubleShiftPlan context={context} pending={workspace.pending} onOpenRun={onOpenRun} onConfirm={() => workspace.execute("confirmPlan", { ...common, expectedParticipantRevision: participant?.revision })} />
    <RoutineDoubleShiftTransition context={context} pending={workspace.pending} onSubmit={(values) => workspace.execute("completeOpeningTransition", { ...common, ...values, expectedParticipantRevision: participant?.revision })} />
    <RoutineDoubleShiftChangeFeed feed={context.changeFeed} stale={feedStale} onRefresh={async () => { const response = await workspace.execute("getChangeFeed", { bundleId, bundleParticipantId: participant?.id }); setFeedStale(response?.mode === "change_feed_updated"); }} />
    <RoutineDoubleShiftReturn context={context} pending={workspace.pending} onReturn={() => workspace.execute("returnToDoubleShift", { ...common, expectedParticipantRevision: participant?.revision, expectedChangeFeedHash: context.changeFeed?.hash })} />
    <RoutineDoubleShiftReassignment context={context} pending={workspace.pending} onReassign={(values) => workspace.execute("reassignClosing", { bundleId,
      fromBundleParticipantId: context.reassignmentState?.closingParticipantId, expectedBundleRevision: bundle.revision, ...values })} />
    {workspace.error && <p className="employee-warning" role="alert">{workspace.error.message ?? "The request failed. Local selections are preserved."}</p>}
    <section className="employee-ds-card"><p className="eyebrow">DS04 · System summary</p><h2>Contribution and outcome</h2><pre className="employee-json-summary">{JSON.stringify(context.ds04Summary, null, 2)}</pre>
      <p>Opening contribution remains attributed after reassignment. Closing contribution, deviations, overrides, event transfers and delivery are server generated.</p></section></main>;
}
