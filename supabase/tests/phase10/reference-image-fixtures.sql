-- Disposable Phase 10C fixtures. Phase 10A and 10B fixtures are installed first.
begin;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

select public.create_routine_reference(
  'opening-main-floor',
  'Opening main floor setup',
  'Visual setup guidance for the main floor.',
  'Ingen referanse er lastet opp ennå.',
  '41000000-0000-4000-8000-000000000001'
);

select public.create_routine_reference(
  'closing-main-floor',
  'Closing main floor setup',
  null,
  null,
  '41000000-0000-4000-8000-000000000002'
);

select public.create_routine_reference(
  'upload-probe',
  'Upload lifecycle probe',
  null,
  null,
  '41000000-0000-4000-8000-000000000003'
);

select public.replace_routine_draft_task_reference_images(
  task.id,
  jsonb_build_array(jsonb_build_object(
    'referenceId', reference.id,
    'buttonLabel', 'Se korrekt oppsett',
    'contextNote', 'Bruk bildet som visuell støtte.',
    'sortOrder', 0,
    'active', true
  )),
  version.revision,
  '41000000-0000-4000-8000-000000000004'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'O01'
join public.routine_reference_images reference
  on reference.organization_id = version.organization_id
 and reference.reference_key = 'opening-main-floor'
where template.routine_key = 'opening' and version.state = 'draft';

reset role;
commit;
