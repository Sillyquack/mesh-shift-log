import { managerRpc, getRoutineTemplateEditorWorkspace, getRoutineTemplateVersionDiff, previewRoutineTemplatePublicationBatch } from "./routineManagerClient.js";
export { getRoutineTemplateEditorWorkspace, getRoutineTemplateVersionDiff, previewRoutineTemplatePublicationBatch };
export const routineTemplateClient = Object.freeze({
  getWorkspace:getRoutineTemplateEditorWorkspace,
  getRoutineTemplateVersionDiff,
  previewPublication:previewRoutineTemplatePublicationBatch,
  setTemplateActive:(p)=>managerRpc("set_routine_template_active",{input_template_id:p.templateId,input_active:p.active,input_expected_revision:p.expectedRevision,input_reason:p.reason,input_idempotency_key:p.idempotencyKey}),
  createTemplate:(p)=>managerRpc("create_routine_template",{input_routine_key:p.routineKey,input_name:p.name,input_description:p.description||null,input_idempotency_key:p.idempotencyKey}),
  createDraft:(p)=>managerRpc("create_routine_template_draft",{input_template_id:p.templateId,input_based_on_version_id:p.basedOnVersionId||null,input_idempotency_key:p.idempotencyKey}),
  saveMetadata:(p)=>managerRpc("update_routine_draft_metadata",{input_version_id:p.versionId,input_name:p.name,input_description:p.description||null,input_expected_revision:p.expectedRevision}),
  saveSection:(p)=>managerRpc("upsert_routine_draft_section",{input_version_id:p.versionId,input_section_id:p.sectionId||null,input_section_key:p.sectionKey,input_title:p.title,input_description:p.description||null,input_phase_type:p.phaseType,input_sort_order:p.sortOrder,input_active:p.active,input_expected_section_revision:p.expectedSectionRevision??null,input_expected_version_revision:p.expectedVersionRevision}),
  reorderSections:(p)=>managerRpc("reorder_routine_draft_sections",{input_version_id:p.versionId,input_section_ids:p.sectionIds,input_expected_version_revision:p.expectedVersionRevision}),
  saveTask:(p)=>managerRpc("upsert_routine_draft_task",{input_version_id:p.versionId,input_section_id:p.sectionId,input_task_id:p.taskId||null,input_task:p.task,input_expected_task_revision:p.expectedTaskRevision??null,input_expected_version_revision:p.expectedVersionRevision}),
  reorderTasks:(p)=>managerRpc("reorder_routine_draft_tasks",{input_section_id:p.sectionId,input_task_ids:p.taskIds,input_expected_version_revision:p.expectedVersionRevision}),
  saveItem:(p)=>managerRpc("upsert_routine_draft_task_item",{input_version_id:p.versionId,input_task_id:p.taskId,input_item_id:p.itemId||null,input_item:p.item,input_expected_item_revision:p.expectedItemRevision??null,input_expected_version_revision:p.expectedVersionRevision}),
  reorderItems:(p)=>managerRpc("reorder_routine_draft_task_items",{input_task_id:p.taskId,input_item_ids:p.itemIds,input_expected_version_revision:p.expectedVersionRevision}),
  replaceDependencies:(p)=>managerRpc("replace_routine_draft_dependencies",{input_version_id:p.versionId,input_dependencies:p.dependencies,input_expected_version_revision:p.expectedVersionRevision}),
  replaceRelations:(p)=>managerRpc("replace_routine_draft_relations",{input_version_id:p.versionId,input_relations:p.relations,input_expected_version_revision:p.expectedVersionRevision}),
  validate:(p)=>managerRpc("validate_routine_template_version",{input_version_id:p.versionId,input_publication_version_ids:p.publicationVersionIds||[p.versionId]}),
  publish:(p)=>managerRpc("publish_routine_template_versions",{input_version_ids:p.versionIds,input_expected_revisions:p.expectedRevisions,input_publish_note:p.publishNote,input_idempotency_key:p.idempotencyKey}),
  discardDraft:(p)=>managerRpc("discard_routine_template_draft",{input_version_id:p.versionId,input_reason:p.reason,input_expected_revision:p.expectedRevision}),
});
