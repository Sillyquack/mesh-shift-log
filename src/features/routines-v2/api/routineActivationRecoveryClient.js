import { managerRpc, getRoutineTemplateEditorWorkspace, previewRoutineTemplatePublicationBatch } from "./routineManagerClient.js";
import { routineTemplateClient } from "./routineTemplateClient.js";
import { getRoutinePilotAdminWorkspace, replaceRoutinePilotMemberships, setRoutineEngineMode } from "./routineApplicationClient.js";
import { getRoutinePilotReadiness, promoteRoutineUiReleaseStage, recordRoutineE2EVerificationAttestation } from "./routineReleaseClient.js";
import { ACTIVATION_RECOVERY, julieMembershipEntry, scanActivationWorkspace } from "../data/routineActivationRecoveryManifest.js";

export const previewActivationRecovery = () => managerRpc("preview_mesh_routine_content_1_5r_activation_recovery");
export const applyActivationRecovery = (payload) => managerRpc("apply_mesh_routine_content_1_5r_activation_recovery", {
  input_expected_state_hash: payload.expectedStateHash,
  input_operation_note: payload.note,
  input_idempotency_key: payload.idempotencyKey,
});

export async function getActivationControlState() {
  const [recovery, readiness, pilot] = await Promise.all([
    previewActivationRecovery(),
    getRoutinePilotReadiness(),
    getRoutinePilotAdminWorkspace(),
  ]);
  return { recovery, readiness, pilot };
}

export async function runActivationPublicationSafetyScan(recovery) {
  const installation = recovery?.installation1_5;
  if (!installation?.openingDraftVersionId || !installation?.closingDraftVersionId) throw new Error("Exact 1.5R installed drafts are required.");
  const [opening, closing] = await Promise.all([
    getRoutineTemplateEditorWorkspace(installation.openingTemplateId, installation.openingDraftVersionId),
    getRoutineTemplateEditorWorkspace(installation.closingTemplateId, installation.closingDraftVersionId),
  ]);
  const scan = await scanActivationWorkspace([opening, closing]);
  const versionIds = [installation.openingDraftVersionId, installation.closingDraftVersionId];
  const publication = await previewRoutineTemplatePublicationBatch(versionIds);
  const valid = scan.valid
    && publication?.valid === true
    && (publication.blockers || []).length === 0
    && (recovery?.provider?.packHash || recovery?.provider?.hash) === ACTIVATION_RECOVERY.provider.hash;
  return { valid, scan, publication, workspaces: { opening, closing }, versionIds };
}

export const publishActivationPilotContent = ({ scanResult, idempotencyKey }) => routineTemplateClient.publish({
  versionIds: scanResult.versionIds,
  expectedRevisions: Object.fromEntries(scanResult.versionIds.map((id) => {
    const workspace = id === scanResult.versionIds[0] ? scanResult.workspaces.opening : scanResult.workspaces.closing;
    return [id, workspace.version.revision];
  })),
  publishNote: ACTIVATION_RECOVERY.notes.publish,
  idempotencyKey,
});

export const addJuliePilotMembership = ({ expectedRevision, idempotencyKey, validFrom }) => replaceRoutinePilotMemberships({
  entries: [julieMembershipEntry(validFrom)],
  expectedSettingsRevision: expectedRevision,
  idempotencyKey,
});

export const attestActivationEvidence = ({ evidence, idempotencyKey }) => recordRoutineE2EVerificationAttestation({
  evidenceSnapshot: evidence,
  note: ACTIVATION_RECOVERY.notes.attestation,
  idempotencyKey,
});

export const promoteActivationPilotReady = ({ expectedRevision, expectedReadinessHash, idempotencyKey }) => promoteRoutineUiReleaseStage({
  expectedRevision,
  expectedReadinessHash,
  note: ACTIVATION_RECOVERY.notes.promote,
  idempotencyKey,
});

export const startActivationPilot = ({ expectedRevision, idempotencyKey }) => setRoutineEngineMode({
  mode: "pilot",
  expectedRevision,
  reason: ACTIVATION_RECOVERY.notes.pilot,
  idempotencyKey,
});
