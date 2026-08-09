import { isRoutineReadOnlyPreview } from "../data/routineApplicationModel.js";
import RoutineIdentityBadge from "./RoutineIdentityBadge.jsx";
import RoutineSyncStatus from "./RoutineSyncStatus.jsx";

function CountCard({ label, value }) {
  if (value == null) return null;
  return <div className="routine-count-card"><strong>{value}</strong><span>{label}</span></div>;
}

export default function RoutineEnginePreviewHome({ bootstrap, syncStatus, onEndSession, onSwitchOperator, onOpenEmployee, onOpenManager }) {
  const summaries = bootstrap.summaries;
  const noRunnableContent = summaries.publishedTemplateCount === 0 && summaries.visibleRunCount === 0;
  const installedDrafts = Number(summaries.draftTemplateCount || 0);
  return (
    <main className="routine-shell-main" id="routine-preview-home">
      <section className="routine-hero">
        <div>
          <p className="eyebrow">{bootstrap.mode} · {bootstrap.uiReleaseStage.replaceAll("_", " ")}</p>
          <h1>Routine Engine v2</h1>
          <p className="routine-lead">A server-controlled preview of the next shift workflow. Today&apos;s legacy shift log remains active.</p>
        </div>
        <RoutineIdentityBadge identity={bootstrap.identity} />
      </section>

      <section className="routine-context-grid" aria-label="Routine preview status">
        <article className="routine-context-card">
          <span>Operational date</span><strong>{bootstrap.serverClock.operationalDate || "Not available"}</strong>
          <small>{bootstrap.serverClock.timezone} · cutoff {bootstrap.serverClock.cutoff || "server controlled"}</small>
        </article>
        <article className="routine-context-card">
          <span>Server clock</span><strong>{bootstrap.serverClock.serverNow ? new Date(bootstrap.serverClock.serverNow).toLocaleString() : "Not available"}</strong>
          <small>Display only; the server remains authoritative</small>
        </article>
        <RoutineSyncStatus sync={bootstrap.sync} status={syncStatus} />
      </section>

      {isRoutineReadOnlyPreview(bootstrap) && (
        <p className="routine-preview-banner" role="status">Read-only preview. No run or task can be changed in this release.</p>
      )}

      {bootstrap.identity.actorSource === "shared_device_operator" && (
        <section className="routine-session-actions" aria-label="Operator session actions">
          <span><strong>Server-controlled operator session</strong><small>
            {bootstrap.identity.session?.expiresAt
              ? `Expires ${new Date(bootstrap.identity.session.expiresAt).toLocaleString()} · ${bootstrap.identity.session.credentialFresh ? "credential fresh" : "reauthentication may be required"}`
              : "Expiry is verified using server time."}
          </small></span>
          <div><button type="button" className="ghost-button" onClick={onSwitchOperator}>Switch operator</button>
            <button type="button" className="ghost-button" onClick={onEndSession}>End session</button></div>
        </section>
      )}

      <section className="routine-count-grid" aria-label="Routine summaries">
        <CountCard label="Published templates" value={summaries.publishedTemplateCount} />
        <CountCard label="Draft templates" value={summaries.draftTemplateCount} />
        <CountCard label="Visible runs" value={summaries.visibleRunCount} />
        <CountCard label="Visible bundles" value={summaries.visibleBundleCount} />
        <CountCard label="Open deviations" value={summaries.openDeviationCount} />
      </section>

      {noRunnableContent ? (
        <section className="routine-empty-state">
          <div className="routine-empty-mark" aria-hidden="true">R2</div>
          <div><h2>No published or runnable routine content yet</h2><p>{installedDrafts > 0
            ? `${installedDrafts} editable draft${installedDrafts === 1 ? " is" : "s are"} installed. Publishing and operative work remain separate, controlled actions.`
            : "No published template or visible run is available. Opening, Closing, Event Operations and Stock Count continue in the current app."}</p></div>
        </section>
      ) : (
        <section className="routine-empty-state"><div><h2>Preview data is available</h2><p>Operational controls intentionally remain unavailable in Phase 10K1.</p></div></section>
      )}

      <section className="routine-manager-note"><p className="eyebrow">Employee preview</p><h2>Operations Preview</h2>
        <p>Open the mobile employee workspace for runs, task execution, handovers, transfers and Double Shift. Operational actions remain server-blocked in shadow.</p>
        <button type="button" className="primary-button" onClick={onOpenEmployee}>Open Operations Preview</button></section>

      {bootstrap.managerPreviewAllowed && (
        <section className="routine-manager-note"><p className="eyebrow">Manager preview</p><h2>Manager Control Center</h2><p>Configure foundations, versioned templates, references, operators, pilot access and release readiness. Operative run and task controls remain unavailable.</p><button type="button" className="primary-button" onClick={onOpenManager}>Open Manager Control Center</button></section>
      )}
    </main>
  );
}
