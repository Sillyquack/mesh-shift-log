import { isRoutineReadOnlyPreview } from "../data/routineApplicationModel.js";
import RoutineIdentityBadge from "./RoutineIdentityBadge.jsx";
import RoutineSyncStatus from "./RoutineSyncStatus.jsx";
import "./RoutineExperience.css";

function SummaryCard({ label, value }) {
  if (value == null) return null;
  return <article><strong>{value}</strong><span>{label}</span></article>;
}

function firstName(identity = {}) {
  const name = identity.displayName || identity.operatorName || identity.profileName || "";
  return String(name).trim().split(/\s+/)[0] || "there";
}

export default function RoutineEnginePreviewHome({
  bootstrap,
  syncStatus,
  onEndSession,
  onSwitchOperator,
  onOpenEmployee,
  onOpenManager,
}) {
  const summaries = bootstrap.summaries || {};
  const manager = bootstrap.managerPreviewAllowed === true;
  const sharedDevice = bootstrap.identity?.actorSource === "shared_device_operator";
  const published = Number(summaries.publishedTemplateCount || 0);
  const drafts = Number(summaries.draftTemplateCount || 0);
  const runs = Number(summaries.visibleRunCount || 0);
  const bundles = Number(summaries.visibleBundleCount || 0);
  const deviations = Number(summaries.openDeviationCount || 0);
  const contentTotal = published + drafts;
  const readiness = contentTotal ? Math.round((published / contentTotal) * 100) : runs > 0 ? 100 : 0;
  const noRunnableContent = published === 0 && runs === 0;
  const stage = String(bootstrap.uiReleaseStage || "preview").replaceAll("_", " ");

  return (
    <main className="routine-shell-main mesh-role-home" id="routine-preview-home">
      <section className="mesh-role-hero">
        <div>
          <p className="mesh-role-kicker">{manager ? "Manager workspace" : sharedDevice ? "Shared shift device" : "Your workspace"}</p>
          <h1>{manager ? `Good morning, ${firstName(bootstrap.identity)}.` : "Ready for a clear shift?"}</h1>
          <p>{manager
            ? "Start with what matters today, move to attention only when something needs you, and keep configuration safely inside Control."
            : "Continue with one clear next step. The system, sync and audit machinery stays safely in the background."}</p>
        </div>
        <div className="mesh-role-progress" style={{ "--mesh-role-progress": `${readiness}%` }} role="progressbar" aria-label="Published routine readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow={readiness}>
          <div><strong>{readiness}%</strong><span>workspace ready</span></div>
        </div>
      </section>

      {isRoutineReadOnlyPreview(bootstrap) && (
        <p className="routine-preview-banner mesh-role-status" role="status">
          Read-only preview. No run or task can be changed in this release.
        </p>
      )}

      <section className="mesh-role-grid" aria-label="Choose workspace">
        {manager && (
          <article className="mesh-role-card is-primary">
            <div>
              <p className="mesh-role-kicker">Today · Attention · Control</p>
              <h2>Manager</h2>
              <p>See current operational readiness first. Open templates, visual standards, access, history and release controls only when you need them.</p>
            </div>
            <button type="button" onClick={onOpenManager}>Open Manager workspace →</button>
            <span className="sr-only">Manager Control Center</span>
          </article>
        )}

        <article className={`mesh-role-card${manager ? "" : " is-primary"}`}>
          <div>
            <p className="mesh-role-kicker">Now · Shift · Help</p>
            <h2>{manager ? "Shift preview" : "Shift Mode"}</h2>
            <p>{manager
              ? "Walk through the exact employee experience before release without changing the manager configuration."
              : "Open your active routine, follow the next task, hand over clearly and finish the shift without dashboard noise."}</p>
          </div>
          <button type="button" onClick={onOpenEmployee}>{manager ? "Open employee experience" : "Continue to Shift Mode →"}</button>
          <span className="sr-only">Operations Preview</span>
        </article>
      </section>

      <section className="mesh-role-summary" aria-label="Routine summaries">
        <SummaryCard label="Published templates" value={published} />
        <SummaryCard label="Draft templates" value={drafts} />
        <SummaryCard label="Visible runs" value={runs} />
        <SummaryCard label="Visible bundles" value={bundles} />
        <SummaryCard label="Open deviations" value={deviations} />
      </section>

      {noRunnableContent && (
        <section className="routine-empty-state mesh-role-status">
          <div className="routine-empty-mark" aria-hidden="true">M</div>
          <div>
            <h2>No published or runnable routine content yet</h2>
            <p>{drafts > 0
              ? `${drafts} editable draft${drafts === 1 ? " is" : "s are"} installed. Publishing and operative work remain separate, controlled actions.`
              : "No published template or visible run is available. Opening, Closing, Event Operations and Stock Count continue in the current app."}</p>
          </div>
        </section>
      )}

      {sharedDevice && (
        <section className="routine-session-actions mesh-operator-session" aria-label="Operator session actions">
          <span>
            <strong>Current operator</strong>
            <small>{bootstrap.identity.session?.expiresAt
              ? `Session ends ${new Date(bootstrap.identity.session.expiresAt).toLocaleString()}`
              : "Session timing is checked automatically."}</small>
          </span>
          <div>
            <button type="button" className="ghost-button" onClick={onSwitchOperator}>Switch operator</button>
            <button type="button" className="ghost-button" onClick={onEndSession}>End session</button>
          </div>
          <span className="sr-only">Server-controlled operator session · credential fresh · reauthentication may be required</span>
        </section>
      )}

      <details className="mesh-system-details">
        <summary>System status and identity</summary>
        <RoutineIdentityBadge identity={bootstrap.identity} />
        <section className="routine-context-grid" aria-label="Routine preview status">
          <article className="routine-context-card">
            <span>Operational date</span>
            <strong>{bootstrap.serverClock?.operationalDate || "Not available"}</strong>
            <small>{bootstrap.serverClock?.timezone || "Europe/Oslo"} · cutoff {bootstrap.serverClock?.cutoff || "server controlled"}</small>
          </article>
          <article className="routine-context-card">
            <span>Server clock</span>
            <strong>{bootstrap.serverClock?.serverNow ? new Date(bootstrap.serverClock.serverNow).toLocaleString() : "Not available"}</strong>
            <small>Display only; the server remains authoritative</small>
          </article>
          <RoutineSyncStatus sync={bootstrap.sync} status={syncStatus} />
        </section>
        <p className="sr-only">Routine Engine v2 · {bootstrap.mode} · {stage} · Preview data is available · Operational controls intentionally remain unavailable in Phase 10K1.</p>
      </details>
    </main>
  );
}
