import { routineRpcClient } from "./routineRpcClient.js";
import { applyRoutineBatchValidations, classifyManagerError } from "../data/routineManagerModel.js";

export class RoutineManagerRequestError extends Error { constructor(kind, cause) { super(cause?.message || "Routine Manager request failed."); this.name="RoutineManagerRequestError"; this.kind=kind; this.cause=cause; } }
export async function managerRpc(name, payload = {}) {
  const { data, error } = await routineRpcClient.request(name, payload, { operatorSession: false });
  if (error) throw new RoutineManagerRequestError(classifyManagerError(error), error);
  return data;
}

export async function getRoutineManagerControlCenter() {
  const workspace = await managerRpc("get_routine_manager_control_center");
  const versionIds = (workspace.templates || []).map((template) => template.activeDraft?.id).filter(Boolean);
  if (!versionIds.length) return workspace;
  const preview = await managerRpc("preview_routine_template_publication_batch", { input_version_ids: versionIds });
  return applyRoutineBatchValidations(workspace, preview);
}
export const getRoutineFoundationEditorWorkspace = () => managerRpc("get_routine_foundation_editor_workspace");
export async function getRoutineTemplateEditorWorkspace(templateId, versionId = null) {
  const [workspace, controlCenter] = await Promise.all([
    managerRpc("get_routine_template_editor_workspace", { input_template_id: templateId, input_version_id: versionId }),
    getRoutineManagerControlCenter(),
  ]);
  const template = (controlCenter.templates || []).find((entry) => entry.id === templateId);
  return template?.activeDraft?.id === workspace.version?.id
    ? { ...workspace, validation: template.validation, publicationValidationContext: controlCenter.publicationValidationContext }
    : workspace;
}
export const getRoutineTemplateVersionDiff = (fromVersionId, toVersionId) => managerRpc("get_routine_template_version_diff", { input_from_version_id: fromVersionId, input_to_version_id: toVersionId });
export const previewRoutineTemplatePublicationBatch = (versionIds) => managerRpc("preview_routine_template_publication_batch", { input_version_ids: versionIds });
export const getRoutineReferenceManagerWorkspace = () => managerRpc("get_routine_reference_manager_workspace");
export const getRoutineReleaseReadiness = () => managerRpc("get_routine_release_readiness");
export const previewMeshRoutineContentPack = () => managerRpc("preview_mesh_routine_content_pack_v1");
export const installMeshRoutineContentPack = (payload) => managerRpc("install_mesh_routine_content_pack_v1", {
  input_expected_organization_state_hash: payload.expectedOrganizationStateHash,
  input_install_note: payload.installNote,
  input_idempotency_key: payload.idempotencyKey,
});
export const getMeshRoutineContentPackAudit = () => managerRpc("get_mesh_routine_content_pack_audit");
