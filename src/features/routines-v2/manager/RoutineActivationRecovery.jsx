import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addJuliePilotMembership,
  applyActivationRecovery,
  attestActivationEvidence,
  getActivationControlState,
  promoteActivationPilotReady,
  publishActivationPilotContent,
  runActivationPublicationSafetyScan,
  startActivationPilot,
} from "../api/routineActivationRecoveryClient.js";
import {
  ACTIVATION_RECOVERY,
  activationEvidenceArtifactHash,
  isExactPhrase,
  validateActivationEvidence,
} from "../data/routineActivationRecoveryManifest.js";
import { createIdempotencyKey, managerErrorMessage, shortHash } from "../data/routineManagerModel.js";
import { Field, StatusPill } from "./RoutineManagerPrimitives.jsx";

function EvidenceList({ entries = [] }) {
  return entries.length ? <ul className="rm-issues">{entries.map((entry) => (
    <li key={`${entry.resourceType}-${entry.key}`}>
      <strong>{entry.key}</strong> · {entry.status}<br />
      <small>{entry.id} · {shortHash(entry.beforeHash)} → {shortHash(entry.afterHash || entry.targetHash)}</small>
    </li>
  ))}</ul> : <p className="rm-note">No evidence returned.</p>;
}

function ControlledAction({ title, description, phrase, value, onValue, disabled, busy, onRun, children }) {
  const inputId = `activation-${phrase.replaceAll(/\W+/g, "-").toLowerCase()}`;
  return <section className="rm-card rm-form">
    <header><div><h3>{title}</h3><p className="rm-note">{description}</p></div><StatusPill state={disabled ? "blocked" : "warning"}>{disabled ? "Locked" : "Controlled"}</StatusPill></header>
    {children}
    <Field id={inputId} label={`Type ${phrase}`} help="Exact, case-sensitive confirmation.">
      <input id={inputId} className="rm-code-input" value={value} onChange={(event) => onValue(event.target.value)} autoComplete="off" spellCheck="false" />
    </Field>
    <button type="button" className="primary-button" disabled={disabled || busy || !isExactPhrase(value, phrase)} onClick={onRun}>
      {busy ? "Submitting…" : title}
    </button>
  </section>;
}

export default function RoutineActivationRecovery({
  loader = getActivationControlState,
  recoveryApi = applyActivationRecovery,
  scanApi = runActivationPublicationSafetyScan,
  publicationApi = publishActivationPilotContent,
  membershipApi = addJuliePilotMembership,
  attestationApi = attestActivationEvidence,
  promotionApi = promoteActivationPilotReady,
  pilotApi = startActivationPilot,
}) {
  const [server, setServer] = useState(null);
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [installNote, setInstallNote] = useState("");
  const [preserveConfirmed, setPreserveConfirmed] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [evidenceErrors, setEvidenceErrors] = useState([]);
  const [preparationEvidence, setPreparationEvidence] = useState(null);
  const [phrases, setPhrases] = useState({ install: "", publish: "", julie: "", attest: "", promote: "", pilot: "" });
  const [keys] = useState(() => ({
    install: createIdempotencyKey(), publish: createIdempotencyKey(), julie: createIdempotencyKey(),
    attest: createIdempotencyKey(), promote: createIdempotencyKey(), pilot: createIdempotencyKey(),
  }));

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      setServer(await loader());
      setStatus("ready");
      setMessage("");
    } catch (error) {
      setStatus("error");
      setMessage(managerErrorMessage(error?.kind || "server"));
    }
  }, [loader]);
  useEffect(() => { refresh(); }, [refresh]);

  const execute = async (name, action, success) => {
    setBusy(name); setMessage("");
    try {
      const result = await action();
      setMessage(success);
      await refresh();
      return result;
    } catch (error) {
      setMessage(managerErrorMessage(error?.kind || "server"));
      return null;
    } finally { setBusy(""); }
  };

  const recovery = server?.recovery;
  const readiness = server?.readiness;
  const counts = recovery?.counts || {};
  const prepared = recovery?.operationAlreadyComplete === true;
  const preparationProof = preparationEvidence || recovery?.operationEvidence || null;
  const publishedVersions = recovery?.publishedTemplates || [];
  const installed = recovery?.installation1_5;
  const published = Number(counts.publications || 0) === 2
    && publishedVersions.length === 2
    && new Set(publishedVersions.map((version) => version.publicationGroupId)).size === 1
    && Boolean(publishedVersions[0]?.publicationGroupId)
    && publishedVersions.every((version) => version.publishNote === ACTIVATION_RECOVERY.notes.publish)
    && publishedVersions.some((version) => version.id === installed?.openingDraftVersionId
      && version.contentHash === installed?.summary?.openingDraftContentHash)
    && publishedVersions.some((version) => version.id === installed?.closingDraftVersionId
      && version.contentHash === installed?.summary?.closingDraftContentHash);
  const activeMemberships = recovery?.pilotMemberships || [];
  const julieAdded = Number(counts.pilotMemberships || 0) === 1
    && activeMemberships.length === 1
    && activeMemberships[0].identityType === "personal_profile"
    && activeMemberships[0].userProfileId === ACTIVATION_RECOVERY.profileIds.julie
    && activeMemberships[0].accessLevel === "participant"
    && activeMemberships[0].active === true
    && activeMemberships[0].validUntil == null
    && activeMemberships[0].profileRole === "event_floor_manager"
    && activeMemberships[0].profileIsSharedDevice === false;
  const attested = Number(counts.e2eAttestations || 0) > 0;
  const pilotReady = recovery?.settings?.stage === "pilot_ready";
  const pilotStarted = recovery?.settings?.mode === "pilot";
  const fullyReadOnly = pilotReady && pilotStarted;
  const providerExact = recovery?.provider?.packKey === ACTIVATION_RECOVERY.provider.key
    && recovery?.provider?.packVersion === ACTIVATION_RECOVERY.provider.version
    && recovery?.provider?.packHash === ACTIVATION_RECOVERY.provider.hash;
  const draftEvidence = recovery?.preservedDraftEvidence || {};
  const evidenceValidation = useMemo(() => evidence ? validateActivationEvidence(evidence) : { valid: false, errors: evidenceErrors }, [evidence, evidenceErrors]);

  const setPhrase = (key) => (value) => setPhrases((current) => ({ ...current, [key]: value }));
  const parseEvidence = async () => {
    try {
      const next = JSON.parse(evidenceText);
      const validation = validateActivationEvidence(next);
      if (validation.valid) {
        const computedHash = await activationEvidenceArtifactHash(next);
        if (computedHash !== next.artifactSha256) validation.errors.push("artifactSha256 does not match the canonical evidence payload.");
      }
      setEvidence(validation.errors.length === 0 ? next : null);
      setEvidenceErrors(validation.errors);
    } catch {
      setEvidence(null); setEvidenceErrors(["Evidence is not valid JSON."]);
    }
  };

  if (!server && status === "loading") return <section className="rm-card" role="status" aria-busy="true"><h2>Loading activation control…</h2></section>;
  if (!server) return <section className="rm-card" role="alert"><h2>Activation control unavailable</h2><p>{message}</p><button type="button" className="primary-button" onClick={refresh}>Try again</button></section>;

  return <div className="rm-stack rm-activation" data-activation-complete={fullyReadOnly ? "true" : "false"}>
    <header className="rm-section-heading" data-manager-profile-id={recovery?.actor?.profileId}><div><p className="eyebrow">Manager-authenticated exact workflow</p><h2>Activation</h2><p>{recovery?.actor?.displayName} · {recovery?.actor?.role}. Every write is separately confirmed, server-guarded, and read back before the next step unlocks.</p></div><button type="button" className="ghost-button" disabled={status === "loading" || Boolean(busy)} onClick={refresh}>{status === "loading" ? "Refreshing…" : "Refresh exact state"}</button></header>
    <section className="rm-hero-card"><div><p className="eyebrow">{recovery?.provider?.packKey} · {recovery?.provider?.packVersion}</p><h3>{prepared ? "1.5R preparation preserved" : "Controlled pilot preparation"}</h3><p>Provider SHA-256: <code>{recovery?.provider?.packHash}</code></p><p>State SHA-256: <code>{recovery?.stateHash}</code></p></div><StatusPill state={providerExact && recovery?.valid ? "ready" : "blocked"}>{recovery?.valid ? prepared ? "Prepared" : "Preflight green" : "Blocked"}</StatusPill></section>

    <section className="rm-metric-grid" aria-label="Activation state">
      <article><span>Mode</span><strong>{recovery?.settings?.mode}</strong></article>
      <article><span>Stage</span><strong>{recovery?.settings?.stage}</strong></article>
      <article><span>Publications</span><strong>{counts.publications || 0}/2</strong></article>
      <article><span>Pilot members</span><strong>{counts.pilotMemberships || 0}/1</strong></article>
      <article><span>E2E attestations</span><strong>{counts.e2eAttestations || 0}</strong></article>
      <article><span>Routine work</span><strong>{counts.activeRoutineWork || 0}</strong></article>
      <article><span>Stock Counts</span><strong>{counts.activeStockCounts || 0}</strong></article>
      <article><span>Shared device</span><strong>{recovery?.settings?.sharedDeviceEnabled ? "On" : "Off"}</strong></article>
    </section>

    {recovery?.publishedTemplates?.length || recovery?.pilotMemberships?.length ? <section className="rm-card"><h3>Published content and pilot access readback</h3>{(recovery.publishedTemplates || []).map((version) => <article className="rm-activation-record" key={version.id} data-published-template-id={version.id} data-published-content-hash={version.contentHash}><strong>Published template version {version.id}</strong><small>{version.templateId} · {version.contentHash}</small><small>Group {version.publicationGroupId} · {version.publishNote}</small></article>)}{(recovery.pilotMemberships || []).map((membership) => <article className="rm-activation-record" key={membership.id} data-pilot-membership-id={membership.id} data-pilot-profile-id={membership.userProfileId}><strong>Pilot membership {membership.id}</strong><small>{membership.userProfileId} · {membership.profileRole} · {membership.accessLevel}</small><small>{membership.validFrom} · shared device {membership.profileIsSharedDevice ? "yes" : "no"}</small></article>)}</section> : null}

    {recovery?.blockers?.length ? <section className="rm-conflict" role="alert"><h3>Server blockers</h3><pre className="rm-json">{JSON.stringify(recovery.blockers, null, 2)}</pre></section> : null}

    <div className="rm-split">
      <section className="rm-card"><h3>Reviewed drafts</h3>{[draftEvidence.opening, draftEvidence.closing].filter(Boolean).map((draft) => <article key={draft.draftId} className="rm-activation-record"><strong>{draft.draftId}</strong><small>{draft.state} · revision {draft.revision} · {draft.contentHash}</small><small>{JSON.stringify(draft.counts)}</small></article>)}</section>
      <section className="rm-card"><h3>Seven exact alignments</h3><EvidenceList entries={recovery?.resourceDifferences} /></section>
    </div>

    {!prepared ? <ControlledAction title="Prepare and install 1.5R" description="Atomically align exactly seven resources, preserve the reviewed drafts as discarded history, create fresh empty drafts, and invoke the normal installer." phrase={ACTIVATION_RECOVERY.phrases.install} value={phrases.install} onValue={setPhrase("install")} disabled={!recovery?.valid || !providerExact || !preserveConfirmed || installNote.trim().length < 8} busy={busy === "install"} onRun={() => execute("install", async () => { const result = await recoveryApi({ expectedStateHash: recovery.stateHash, note: installNote, idempotencyKey: keys.install }); setPreparationEvidence(result); return result; }, "1.5R was installed; the old drafts remain preserved and nothing was published.")}>
      <Field id="activation-install-note" label="Operation note" help="At least 8 characters; preserved after stale, network, or sign-in failure."><textarea id="activation-install-note" value={installNote} onChange={(event) => setInstallNote(event.target.value)} /></Field>
      <label className="rm-check"><input type="checkbox" checked={preserveConfirmed} onChange={(event) => setPreserveConfirmed(event.target.checked)} /> I confirm the current Opening and Closing drafts become preserved discarded history.</label>
    </ControlledAction> : <section className="rm-card"><header><h3>Preparation readback</h3><StatusPill state="ready">Complete</StatusPill></header><p>Operation <code>{preparationProof?.operationId || "Recorded in immutable manager audit"}</code><br />Installation <code>{recovery?.installation1_5?.id}</code></p><p>Opening <code>{recovery?.installation1_5?.openingDraftVersionId}</code><br />Closing <code>{recovery?.installation1_5?.closingDraftVersionId}</code></p><p>Preserved Opening <code>{draftEvidence.opening?.draftId}</code> · {shortHash(draftEvidence.opening?.contentHash)}<br />Preserved Closing <code>{draftEvidence.closing?.draftId}</code> · {shortHash(draftEvidence.closing?.contentHash)}</p>{preparationProof?.resourceEvidence?.length ? <EvidenceList entries={preparationProof.resourceEvidence.map((entry) => ({ ...entry, resourceType: "recovery", status: "aligned" }))} /> : null}<p className="rm-note">Publication, work, memberships, E2E, mode, and stage remained unchanged by preparation.</p></section>}

    {prepared && !published ? <section className="rm-card rm-form"><header><div><h3>Publication safety scan</h3><p className="rm-note">Loads the exact installed workspaces through normal manager RPCs, scans frontline text, and runs the authoritative batch preview.</p></div><button type="button" className="ghost-button" disabled={busy === "scan"} onClick={() => execute("scan", async () => { const result = await scanApi(recovery); setScanResult(result); return result; }, "Publication safety scan completed.")}>{busy === "scan" ? "Scanning…" : "Run exact scan"}</button></header>{scanResult ? <pre className="rm-json">{JSON.stringify({ valid: scanResult.valid, matches: scanResult.scan.matches, blockers: scanResult.publication.blockers || [] }, null, 2)}</pre> : null}</section> : null}

    {prepared && !published ? <ControlledAction title="Publish controlled pilot content" description="Publishes Opening and Closing together as one [pilot-approved] batch through the normal manager RPC." phrase={ACTIVATION_RECOVERY.phrases.publish} value={phrases.publish} onValue={setPhrase("publish")} disabled={!scanResult?.valid} busy={busy === "publish"} onRun={() => execute("publish", () => publicationApi({ scanResult, idempotencyKey: keys.publish }), "Opening and Closing were published together.")} /> : null}

    {published && !julieAdded ? <ControlledAction title="Add Julie as initial participant" description="Replaces the complete desired state with Julie’s one personal participant membership; no profile role changes." phrase={ACTIVATION_RECOVERY.phrases.julie} value={phrases.julie} onValue={setPhrase("julie")} disabled={recovery?.settings?.mode !== "shadow" || !readiness?.generatedAt} busy={busy === "julie"} onRun={() => execute("julie", () => membershipApi({ expectedRevision: recovery.settings.revision, idempotencyKey: keys.julie, validFrom: readiness.generatedAt }), "Julie is the only active participant.")} /> : null}

    {julieAdded && !attested ? <section className="rm-card rm-form"><h3>Chromium/WebKit production evidence</h3><Field id="activation-e2e-evidence" label="Validated evidence JSON" help="Generated by the focused headed production verifier; no credentials or tokens belong here."><textarea id="activation-e2e-evidence" className="rm-code-input" value={evidenceText} onChange={(event) => { setEvidenceText(event.target.value); setEvidence(null); }} /></Field><div className="rm-actions"><button type="button" className="ghost-button" onClick={parseEvidence}>Validate evidence</button><StatusPill state={evidenceValidation.valid ? "ready" : "blocked"}>{evidenceValidation.valid ? "Schema valid" : "Not validated"}</StatusPill></div>{evidenceValidation.errors?.length ? <ul className="rm-issues rm-blockers">{evidenceValidation.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}</section> : null}

    {julieAdded && !attested ? <ControlledAction title="Record E2E attestation" description="Records only the displayed, schema-valid production evidence through the existing attestation RPC." phrase={ACTIVATION_RECOVERY.phrases.attest} value={phrases.attest} onValue={setPhrase("attest")} disabled={!evidenceValidation.valid} busy={busy === "attest"} onRun={() => execute("attest", () => attestationApi({ evidence, idempotencyKey: keys.attest }), "Chromium and WebKit evidence was accepted.")}><pre className="rm-json">{evidence ? JSON.stringify(evidence, null, 2) : "Validate evidence before attestation."}</pre></ControlledAction> : null}

    {attested && !pilotReady ? <ControlledAction title="Promote to pilot_ready" description="Uses the current server readiness hash and settings revision. Mode remains Shadow." phrase={ACTIVATION_RECOVERY.phrases.promote} value={phrases.promote} onValue={setPhrase("promote")} disabled={!readiness?.ready || (readiness?.blockers || []).length > 0} busy={busy === "promote"} onRun={() => execute("promote", () => promotionApi({ expectedRevision: readiness.settingsRevision, expectedReadinessHash: readiness.readinessHash, idempotencyKey: keys.promote }), "Release stage is pilot_ready; mode remains Shadow.")}><pre className="rm-json">{JSON.stringify({ ready: readiness?.ready, readinessHash: readiness?.readinessHash, blockers: readiness?.blockers }, null, 2)}</pre></ControlledAction> : null}

    {pilotReady && !pilotStarted ? <ControlledAction title="Start pilot" description="Starts only the controlled Pilot mode. Active and production_ready are not exposed." phrase={ACTIVATION_RECOVERY.phrases.pilot} value={phrases.pilot} onValue={setPhrase("pilot")} disabled={recovery?.settings?.stage !== "pilot_ready"} busy={busy === "pilot"} onRun={() => execute("pilot", () => pilotApi({ expectedRevision: recovery.settings.revision, idempotencyKey: keys.pilot }), "Controlled Pilot mode started.")} /> : null}

    {fullyReadOnly ? <section className="rm-card"><header><h3>Controlled pilot evidence</h3><StatusPill state="ready">Read only</StatusPill></header><p>Stage <strong>pilot_ready</strong> · mode <strong>pilot</strong> · Julie only · shared device disabled.</p><p>No Routine run or Stock Count was created automatically. Active and production_ready remain unavailable.</p></section> : null}
    <p role={status === "error" ? "alert" : "status"} className={status === "error" ? "rm-inline-blocker" : "rm-note"}>{message}</p>
  </div>;
}
