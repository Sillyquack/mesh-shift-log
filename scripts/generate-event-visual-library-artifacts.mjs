import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  eventVisualAngles,
  eventVisualReferenceKeys,
  eventVisualVenues,
} from "../src/data/eventRigGuides.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_PATH = resolve(ROOT, "supabase/phase10x_event_visual_library_expansion.sql");
const MANIFEST_PATH = resolve(ROOT, "docs/production/event-visual-library-upload-manifest.md");
const mode = process.argv[2] || "--check";

assert.ok(["--check", "--write"].includes(mode), "Use --check or --write.");

const sqlKeys = eventVisualReferenceKeys.map((key) => `    '${key}'`).join(",\n");
const migration = `-- Phase 10X: canonical Event visual-library expansion and Event Ops privilege repair.
--
-- Generated from src/data/eventRigGuides.js. This migration is additive: it
-- replaces only the immutable visual-key allowlist, fixes one trigger-function
-- search_path, and removes unintended anonymous Event Ops function execution.
-- It performs no content installation, publication, mode change, table DML,
-- Storage upload, migration-ledger repair, or destructive schema operation.

-- Fail closed unless the reviewed Phase 10W metadata boundary is already
-- installed. Phase 10X must never become a standalone substitute for 10W.
do $$
begin
  if to_regprocedure('public.event_visual_current_user_can_read()') is null
    or to_regprocedure('public.get_event_visual_references(text[])') is null then
    raise exception 'Phase 10X requires Phase 10W Event visual-reference bridge';
  end if;
end;
$$;

create or replace function public.event_visual_reference_key_allowed(
  input_reference_key text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(coalesce(input_reference_key, '')) = any (array[
${sqlKeys}
  ]::text[]);
$$;

revoke all on function public.event_visual_reference_key_allowed(text)
  from public, anon, authenticated;

-- Supabase advisor repair: this trigger body needs only pg_catalog.now().
alter function public.set_updated_at() set search_path = pg_catalog;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Repair only functions present in the target schema so a clean partial replay
-- remains possible. Internal helpers lose all client execution. Client RPCs
-- retain authenticated execution and their existing in-function role checks.
-- The historical four-argument task-status overload is repaired when present.
do $$
declare
  v_signature text;
  v_client_boundary boolean;
begin
  for v_signature, v_client_boundary in
    select repair.signature, repair.client_boundary
    from (values
      ('public.current_user_can_manage_event_ops()', false),
      ('public.same_event_ops_organization(uuid)', false),
      ('public.event_ops_event_belongs_to_current_org(uuid)', false),
      ('public.enforce_event_run_sheet_plan_organization()', false),
      ('public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)', true),
      ('public.update_event_task_status(uuid,text,text,text,text)', true),
      ('public.update_event_task_status(uuid,text,text,text)', true),
      ('public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)', true),
      ('public.link_calendar_event_to_event_operation(uuid,uuid)', true),
      ('public.create_event_operation_from_calendar_event(uuid)', true)
    ) as repair(signature, client_boundary)
  loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', v_signature);
      if v_client_boundary then
        execute format('grant execute on function %s to authenticated', v_signature);
      end if;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
`;

const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const rows = eventVisualVenues.flatMap((venue) => venue.guides.flatMap((guide) =>
  guide.zones.flatMap((zone) => {
    if (!zone.angles.length) {
      const sourceStatus = guide.sourceStatus === "operations_approved_image_awaiting_upload"
        ? "Operations-approved standard · image awaiting upload"
        : "source empty / existing guidance preserved";
      return [`| — | ${escapeCell(venue.label)} | ${escapeCell(guide.title)} | ${escapeCell(zone.label)} | Written standard only | — | — | ${escapeCell(zone.description)} | ${escapeCell(zone.description)} | awaiting production upload | required | ${sourceStatus} |`];
    }
    return zone.angles.map((angle) =>
      `| \`${angle.stableKey}\` | ${escapeCell(venue.label)} | ${escapeCell(guide.title)} | ${escapeCell(zone.label)} | ${escapeCell(angle.label)} | \`${angle.suggestedFileName}\` | ${escapeCell(angle.caption)} | ${escapeCell(angle.altText)} | ${escapeCell(angle.proves)} | ${angle.uploadStatus.replaceAll("_", " ")} | ${angle.required ? "required" : "optional"} | ${escapeCell(angle.sourceStatus.replaceAll("_", " "))} |`,
    );
  }),
));

const manifest = `# Event visual-library upload manifest

> Generated from \`src/data/eventRigGuides.js\` by \`scripts/generate-event-visual-library-artifacts.mjs\`. Do not edit the table by hand.

- Schema: \`phase10x-v1\`
- Canonical keys: ${eventVisualReferenceKeys.length}
- Binary files committed: **0**
- Production uploads performed: **0**
- Current received-image metadata: ${eventVisualAngles.filter((angle) => angle.sourceStatus === "received_outside_codex").length} angles, all awaiting production upload
- Safety: filenames are suggestions only; no signed URLs, credentials, alarm details, personal phone data or production object paths are recorded here

| Stable key | Venue | Guide | Zone | Angle | Suggested file | Caption | Alt text | What the angle proves | Upload status | Requirement | Source status |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Upload rule

Images must be screened locally for credentials, alarm information, personal data and unintended customer information. Upload through the authenticated manager workflow only after the production cutover is separately authorized. A placeholder remains valid and honest until then.
`;

const artifacts = [
  [MIGRATION_PATH, migration],
  [MANIFEST_PATH, manifest],
];

if (mode === "--write") {
  artifacts.forEach(([path, content]) => writeFileSync(path, content));
  console.log(`Generated Phase 10X and ${eventVisualReferenceKeys.length}-key upload manifest.`);
} else {
  artifacts.forEach(([path, expected]) => assert.equal(readFileSync(path, "utf8"), expected, `${path} is not generated from the canonical visual library`));
  console.log(`Verified Phase 10X and upload manifest match ${eventVisualReferenceKeys.length} canonical keys.`);
}
