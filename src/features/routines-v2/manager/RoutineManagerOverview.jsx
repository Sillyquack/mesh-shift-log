import { useMemo, useState } from "react";
import { setRoutineEngineMode } from "../api/routineApplicationClient.js";
import { createIdempotencyKey } from "../data/routineManagerModel.js";
import { Field, StatusPill } from "./RoutineManagerPrimitives.jsx";
import "./RoutineManagerExperience.css";

function readinessCounts(readiness = {}) {
  const categories = Object.values(readiness.categories || {});
  return categories.reduce((totals, category) => ({
    blockers: totals.blockers + (Array.isArray(category?.blockers) ? category.blockers.length : 0),
    warnings: totals.warnings + (Array.isArray(category?.warnings) ? category.warnings.length : 0),
  }), { blockers: 0, warnings: 0 });
}

export default function RoutineManagerOverview({
  data,
  onRefresh,
  onOpenAttention = () => {},
  onOpenControl = () => {},
  modeSetter = setRoutineEngineMode,
}) {
  const [mode, setMode] = useState(data.settings?.mode || "legacy");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const snapshot = useMemo(() => {
    const templates = Array.isArray(data.templates) ? data.templates : [];
    const references = Array.isArray(data.references?.references) ? data.references.references : [];
    const activeReferences = references.filter((reference) => reference.active !== false);
    const readyReferences = activeReferences.filter((reference) => reference.current?.state === "active_image");
    const placeholderReferences = activeReferences.length - readyReferences.length;
    const foundationWarnings = Array.isArray(data.foundationWarnings) ? data.foundationWarnings.length : 0;
    const readiness = readinessCounts(data.readiness);
    const attention = foundationWarnings + placeholderReferences + readiness.blockers + readiness.warnings;
    const referencePercent = activeReferences.length ? Math.round((readyReferences.length / activeReferences.length) * 100) : 100;
    const releaseReady = data.readiness?.ready === true;
    return {
      templates: templates.length,
      locations: Array.isArray(data.locations) ? data.locations.length : 0,
      activeSessions: Number(data.activeSessionSummary?.active || 0),
      readyReferences: readyReferences.length,
      totalReferences: activeReferences.length,
      placeholderReferences,
      attention,
      referencePercent,
      releaseReady,
      readiness,
      foundationWarnings,
    };
  }, [data]);

  const save = async () => {
    if (reason.trim().length < 8) {
      setMessage("Provide a short operational reason (at least 8 characters).");
      return;
    }
    setBusy(true);
    try {
      await modeSetter({
        mode,
        expectedRevision: data.settings.revision,
        reason,
        idempotencyKey: createIdempotencyKey(),
      });
      setMessage("Mode updated by the server.");
      setReason("");
      await onRefresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const nextTitle = snapshot.attention > 0
    ? `${snapshot.attention} item${snapshot.attention === 1 ? " needs" : "s need"} a decision.`
    : snapshot.activeSessions > 0
      ? `${snapshot.activeSessions} active session${snapshot.activeSessions === 1 ? " is" : "s are"} moving.`
      : "Everything is calm and ready.";
  const nextCopy = snapshot.attention > 0
    ? "Open Attention for only the items that can block quality, images or release readiness."
    : "No manager intervention is required right now. Control stays available when you need to prepare the next change.";

  return (
    <div className="rm-stack">
      <section className="mesh-manager-today-hero">
        <div>
          <p className="eyebrow">Today</p>
          <h2>See the operation clearly.</h2>
          <p>Active work, content readiness and visual standards are summarized here. Configuration stays out of the way until you deliberately open Control.</p>
        </div>
        <div className="mesh-manager-progress-ring" style={{ "--mesh-manager-progress": `${snapshot.referencePercent}%` }} role="progressbar" aria-label="Visual standards readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow={snapshot.referencePercent}>
          <div><strong>{snapshot.referencePercent}%</strong><span>visuals ready</span></div>
        </div>
      </section>

      <section className="mesh-manager-focus">
        <div>
          <p className="eyebrow">What matters now</p>
          <h3>{nextTitle}</h3>
          <p>{nextCopy}</p>
        </div>
        <div className="mesh-manager-focus-actions">
          <button type="button" onClick={snapshot.attention > 0 ? onOpenAttention : onOpenControl}>
            {snapshot.attention > 0 ? "Review attention" : "Open control"}
          </button>
          <button type="button" onClick={onRefresh}>Refresh today</button>
        </div>
      </section>

      <section className="mesh-manager-metrics" aria-label="Manager overview metrics">
        <article><strong>{snapshot.activeSessions}</strong><span>active sessions</span></article>
        <article><strong>{snapshot.templates}</strong><span>templates</span></article>
        <article><strong>{snapshot.readyReferences}/{snapshot.totalReferences}</strong><span>visual standards</span></article>
        <article><strong>{snapshot.attention}</strong><span>attention items</span></article>
      </section>

      <details className="mesh-manager-release-details">
        <summary>Release and system controls</summary>
        <div>
          <section className="rm-hero-card">
            <div>
              <p className="eyebrow">Release and system overview</p>
              <h2>Manager Control Center</h2>
              <p>Configure Routine Engine v2 independently from operative runs. Server state remains authoritative.</p>
            </div>
            <StatusPill state={snapshot.releaseReady ? "ready" : snapshot.readiness.blockers ? "blocked" : "warning"}>
              {data.settings.ui_release_stage?.replaceAll("_", " ") || "manager preview"}
            </StatusPill>
          </section>

          <section className="rm-card">
            <h3>Release mode</h3>
            <div className="rm-choice-grid">
              <button type="button" className={mode === "legacy" ? "selected" : ""} onClick={() => setMode("legacy")}>
                <strong>Legacy</strong><small>Routine Engine v2 is hidden.</small>
              </button>
              <button type="button" className={mode === "shadow" ? "selected" : ""} onClick={() => setMode("shadow")}>
                <strong>Shadow</strong><small>Manager and explicit preview members can see v2. No operative mutations.</small>
              </button>
            </div>
            <Field id="mode-reason" label="Reason" help="Required for the immutable mode audit.">
              <textarea id="mode-reason" value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby="mode-reason-help" />
            </Field>
            <div className="rm-actions">
              <button type="button" className="primary-button" disabled={busy || mode === data.settings.mode} onClick={save}>{busy ? "Saving…" : "Apply mode"}</button>
              <span role="status">{message}</span>
            </div>
            <p className="rm-note">Pilot and Active are deliberately unavailable in this release.</p>
          </section>
        </div>
      </details>
    </div>
  );
}
