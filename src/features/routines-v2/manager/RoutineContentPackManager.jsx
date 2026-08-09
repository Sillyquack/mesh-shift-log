import { useCallback, useEffect, useState } from "react";
import { getMeshRoutineContentPackAudit, installMeshRoutineContentPack, previewMeshRoutineContentPack } from "../api/routineManagerClient.js";
import { createIdempotencyKey, managerErrorMessage, shortHash } from "../data/routineManagerModel.js";
import { Field, StatusPill } from "./RoutineManagerPrimitives.jsx";
import RoutineProductionReadinessAmendment from "./RoutineProductionReadinessAmendment.jsx";

const formatResource = (entry) => `${entry.resourceType}: ${entry.key}`;

export default function RoutineContentPackManager({
  previewer = previewMeshRoutineContentPack,
  installer = installMeshRoutineContentPack,
  auditLoader = getMeshRoutineContentPackAudit,
  onOpenTemplates,
}) {
  const [preview, setPreview] = useState(null);
  const [audit, setAudit] = useState(null);
  const [status, setStatus] = useState("loading");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const next = await previewer();
      setPreview(next);
      setStatus("ready");
      setMessage("");
      try { setAudit(await auditLoader()); } catch { setAudit(null); }
    } catch (error) {
      setStatus("error");
      setMessage(managerErrorMessage(error?.kind || "server"));
    }
  }, [auditLoader, previewer]);

  useEffect(() => { refresh(); }, [refresh]);

  const install = async () => {
    if (!preview?.valid || !confirmed || note.trim().length < 8 || status === "installing") return;
    setStatus("installing");
    setMessage("");
    try {
      const installed = await installer({ expectedOrganizationStateHash: preview.organizationStateHash, installNote: note, idempotencyKey });
      setResult(installed);
      setConfirmed(false);
      setIdempotencyKey(createIdempotencyKey());
      setStatus("ready");
      setMessage("Editable Opening and Closing drafts were installed by the server. Nothing was published or made operational.");
      try {
        setPreview(await previewer());
        setAudit(await auditLoader());
      } catch { /* Installation already succeeded; preserve its server result. */ }
    } catch (error) {
      setStatus("error");
      setMessage(managerErrorMessage(error?.kind || "server"));
    }
  };

  if (!preview && status === "loading") return <section className="rm-card" role="status" aria-busy="true"><h2>Loading operational content preview…</h2></section>;
  if (!preview) return <section className="rm-card" role="alert"><h2>Operational content preview unavailable</h2><p>{message}</p><button type="button" className="primary-button" onClick={refresh}>Try preview again</button></section>;

  const metadata = preview.packMetadata || {};
  const counts = preview.counts || {};
  const installed = result || (preview.alreadyInstalled ? {
    installStatus: preview.installStatus,
    openingTemplateId: preview.existingTemplates?.openingTemplateId,
    openingDraftVersionId: preview.existingTemplates?.openingDraftVersionId,
    closingTemplateId: preview.existingTemplates?.closingTemplateId,
    closingDraftVersionId: preview.existingTemplates?.closingDraftVersionId,
  } : null);
  const noteError = note.length > 0 && note.trim().length < 8 ? "Use at least 8 non-space characters." : "";
  const canInstall = preview.valid && !preview.alreadyInstalled && confirmed && note.trim().length >= 8 && status !== "installing";

  return <section className="rm-stack" data-content-pack-state={preview.installStatus}>
    <header className="rm-section-heading"><div><p className="eyebrow">Operational content</p><h2>{metadata.name || "Mesh routine content"}</h2></div><StatusPill state={preview.valid ? (preview.alreadyInstalled ? "ready" : "warning") : "blocked"}>{preview.alreadyInstalled ? "Installed" : preview.valid ? "Ready to install" : "Conflict"}</StatusPill></header>
    <section className="rm-hero-card"><div><p className="eyebrow">{metadata.packKey} · v{metadata.packVersion}</p><h3>Editable content pack</h3><p>This installs editable drafts only. Nothing is published or operational.</p><p>Pack SHA-256: <code title={metadata.packHash}>{shortHash(metadata.packHash)}</code></p></div><button type="button" className="ghost-button" disabled={status === "loading" || status === "installing"} onClick={refresh}>{status === "loading" ? "Previewing…" : "Refresh preview"}</button></section>

    <section className="rm-metric-grid" aria-label="Canonical content counts">
      <article><span>Opening</span><strong>{counts.openingTasks}/37</strong></article>
      <article><span>Closing</span><strong>{counts.closingTasks}/46</strong></article>
      <article><span>Double Shift steps</span><strong>{counts.doubleShiftSteps}/4</strong></article>
      <article><span>Sections</span><strong>{counts.sections}</strong></article>
      <article><span>Task items</span><strong>{counts.items}</strong></article>
      <article><span>Relations</span><strong>{counts.relations}</strong></article>
      <article><span>References</span><strong>{counts.references}</strong></article>
    </section>

    <div className="rm-split">
      <section className="rm-card"><header><h3>Resources to create</h3><StatusPill state="warning">{preview.resourcesToCreate?.length || 0}</StatusPill></header>{preview.resourcesToCreate?.length ? <ul className="rm-issues">{preview.resourcesToCreate.map((entry, index) => <li key={`${entry.resourceType}-${entry.key}-${index}`}>{formatResource(entry)}</li>)}</ul> : <p className="rm-note">No new resources in the current preview.</p>}</section>
      <section className="rm-card"><header><h3>Resources to reuse</h3><StatusPill state="ready">{preview.resourcesToReuse?.length || 0}</StatusPill></header>{preview.resourcesToReuse?.length ? <ul className="rm-issues">{preview.resourcesToReuse.map((entry, index) => <li key={`${entry.resourceType}-${entry.key}-${index}`}>{formatResource(entry)}</li>)}</ul> : <p className="rm-note">No exact semantic matches will be reused.</p>}</section>
    </div>

    {preview.conflicts?.length ? <section className="rm-conflict" role="alert"><h3>Installation conflicts</h3><p>The atomic install is blocked. Existing manager content will not be overwritten.</p><ul className="rm-issues rm-blockers">{preview.conflicts.map((entry, index) => <li key={`${entry.resourceType}-${entry.key}-${index}`}>{formatResource(entry)} — {entry.reason}</li>)}</ul></section> : null}

    <section className="rm-card"><header><h3>Unresolved publication and readiness requirements</h3><StatusPill state="blocked">{preview.unresolvedRequirements?.length || 0} blockers</StatusPill></header><ul className="rm-issues rm-blockers">{preview.unresolvedRequirements?.map((entry) => <li key={entry.standardKey}><strong>{entry.label}</strong><br/><small>{entry.standardKey} · affects {entry.affectedTaskIds?.join(", ")}</small></li>)}</ul><p className="rm-note">These values remain genuinely unresolved. Installation is allowed, but publication and later readiness remain blocked.</p></section>

    <section className="rm-card"><h3>Readiness impact</h3><dl className="rm-evidence">{Object.entries(preview.readinessImpact || {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{String(value)}</dd></div>)}</dl></section>

    <RoutineProductionReadinessAmendment providerHash={metadata.packHash} onApplied={refresh} />

    {installed ? <section className="rm-card"><header><h3>Installed editable drafts</h3><StatusPill state="ready">{installed.installStatus || "installed"}</StatusPill></header><div className="rm-split"><article><h4>Opening</h4><p><code>{installed.openingDraftVersionId}</code></p><small>Template {installed.openingTemplateId}</small></article><article><h4>Closing</h4><p><code>{installed.closingDraftVersionId}</code></p><small>Template {installed.closingTemplateId}</small></article></div>{onOpenTemplates ? <button type="button" className="ghost-button" onClick={onOpenTemplates}>Open editable templates</button> : null}{audit?.semanticDivergence && (audit.semanticDivergence.opening || audit.semanticDivergence.closing) ? <p className="rm-inline-blocker">Changed from installed pack. Manager edits are preserved and will not be repaired automatically.</p> : null}</section> : null}

    {!preview.alreadyInstalled ? <section className="rm-card rm-form"><h3>Install editable drafts</h3><Field id="content-pack-note" label="Install note" help="Required for immutable installation evidence." error={noteError}><textarea id="content-pack-note" value={note} onChange={(event) => setNote(event.target.value)} /></Field><label className="rm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm that this creates editable drafts only and does not publish or start work.</label><div className="rm-actions"><button type="button" className="primary-button" disabled={!canInstall} onClick={install}>{status === "installing" ? "Installing…" : "Install editable drafts"}</button><span role={status === "error" ? "alert" : "status"}>{message}</span></div><p className="rm-note">The preview state hash and one stable idempotency key are sent to the server. Stale, network, authentication and validation failures preserve this note and preview without auto-rebasing.</p></section> : <p role="status">{message || "The pack is installed. Publishing remains a separate manager action."}</p>}
  </section>;
}
