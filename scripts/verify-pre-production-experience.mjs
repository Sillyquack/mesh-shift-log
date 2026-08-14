import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const launcher = read("src/features/routines-v2/components/RoutineEngineLauncher.jsx");
const workspace = read("src/features/routines-v2/components/RoutineEngineWorkspace.jsx");
const home = read("src/features/routines-v2/components/RoutineEnginePreviewHome.jsx");
const manager = read("src/features/routines-v2/manager/RoutineManagerWorkspace.jsx");
const overview = read("src/features/routines-v2/manager/RoutineManagerOverview.jsx");
const references = read("src/features/routines-v2/manager/RoutineReferenceManager.jsx");
const history = read("src/features/routines-v2/history/RoutineHistoryWorkspace.jsx");
const release = read("src/features/routines-v2/history/RoutineReleaseGate.jsx");
const shellCss = read("src/features/routines-v2/components/RoutineExperience.css");
const managerCss = read("src/features/routines-v2/manager/RoutineManagerExperience.css");
const referenceCss = read("src/features/routines-v2/manager/RoutineVisualStandards.css");
const historyCss = read("src/features/routines-v2/history/RoutineHistoryExperience.css");
const main = read("src/main.jsx");

for (const label of ["Open workspace", "Manager workspace", "Your shift workspace", "Enable Shadow preview"]) {
  assert.ok(launcher.includes(label), `role launcher missing: ${label}`);
}
assert.match(workspace, /Mesh Shift Log/);
assert.match(workspace, /RoutineManagerWorkspace/);
assert.match(workspace, /RoutineEmployeeWorkspace/);
assert.match(workspace, /useState\(false\)/);
assert.match(workspace, /onBack=\{\(\) => setManagerOpen\(false\)\}/);
assert.match(workspace, /onBack=\{\(\) => setEmployeeOpen\(false\)\}/);

for (const label of ["Today · Attention · Control", "Now · Shift · Help", "Open Manager workspace", "Continue to Shift Mode"]) {
  assert.ok(home.includes(label), `role-aware home missing: ${label}`);
}
assert.match(home, /bootstrap\.managerPreviewAllowed/);
assert.match(home, /<details className="mesh-system-details">/);
assert.match(home, /Operational date/);
assert.match(home, /Server clock/);
assert.doesNotMatch(home.slice(home.indexOf("<section className=\"mesh-role-hero\""), home.indexOf("</section>", home.indexOf("<section className=\"mesh-role-hero\"")) + 10), /database|backend|RPC|Supabase|server clock/i);

for (const label of ["Today", "Attention", "Control", "Visual standards", "Production readiness", "Operational review"]) {
  assert.ok(manager.includes(label), `manager experience missing: ${label}`);
}
assert.match(manager, /role="tablist"/);
assert.match(manager, /ArrowRight/);
assert.match(manager, /RoutineFoundationManager/);
assert.match(manager, /RoutineTemplatesManager/);
assert.match(manager, /RoutineReferenceManager/);
assert.match(manager, /RoutineOperatorAdmin/);
assert.match(manager, /RoutinePilotAccessManager/);
assert.match(manager, /RoutineHistoryWorkspace/);
assert.match(manager, /RoutineReleaseGate/);

for (const label of ["What matters now", "Review attention", "Release and system controls", "Apply mode"]) {
  assert.ok(overview.includes(label), `manager today missing: ${label}`);
}
assert.match(overview, /expectedRevision: data\.settings\.revision/);
assert.match(overview, /idempotencyKey: createIdempotencyKey\(\)/);

for (const label of ["Show exactly what", "Choose an approved photo", "Prepare, upload and finalize", "Version history and task usage"]) {
  assert.ok(references.includes(label), `visual standards missing: ${label}`);
}
assert.match(references, /accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(references, /expectedReferenceRevision: selected\.revision/);
assert.match(references, /prepareIdempotencyKey/);
assert.match(references, /finalizeIdempotencyKey/);
assert.match(references, /cancelIdempotencyKey/);
assert.match(references, /URL\.revokeObjectURL/);

for (const label of ["Recent", "Find", "Review", "History without the noise", "Load legacy records"]) {
  assert.ok(history.includes(label), `history experience missing: ${label}`);
}
assert.match(history, /RoutineHistoryFilters/);
assert.match(history, /RoutineHistoryRunDetail/);
assert.match(history, /RoutineHistoryCorrectionDialog/);
assert.match(history, /RoutineManagerOverrideDialog/);
assert.match(history, /sourceSystem === "legacy_shift_log"/);

for (const label of ["Production readiness", "GO", "NO-GO", "Recompute readiness", "Controlled release actions"]) {
  assert.ok(release.includes(label), `release experience missing: ${label}`);
}
assert.match(release, /expectedReadinessHash: gate\.data\.readinessHash/);
assert.match(release, /expectedRevision: gate\.data\.settingsRevision/);
assert.match(release, /Promotion never changes mode/);

for (const css of [shellCss, managerCss, referenceCss, historyCss]) {
  assert.match(css, /@media \(max-width:/);
  assert.match(css, /min-height:\s*(?:48|50|52|54|56|58|68|72|76)px/);
}
assert.match(shellCss, /prefers-reduced-motion/);
assert.match(managerCss, /\.mesh-manager-nav/);
assert.match(referenceCss, /\.mesh-file-drop/);
assert.match(historyCss, /\.mesh-history-nav/);

for (const path of [
  "./features/routines-v2/components/RoutineExperience.css",
  "./features/routines-v2/manager/RoutineManagerExperience.css",
  "./features/routines-v2/manager/RoutineVisualStandards.css",
  "./features/routines-v2/history/RoutineHistoryExperience.css",
]) {
  assert.ok(main.includes(path), `browser entry does not preload ${path}`);
}

const combined = [launcher, workspace, home, manager, overview, references, history, release].join("\n");
assert.doesNotMatch(combined, /\b(?:pin|alarm code|code)\s*[:=-]\s*\d{4,8}\b/i);
assert.doesNotMatch(combined, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./);
assert.doesNotMatch(combined, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);

console.log("Verified role-aware entry, Today / Attention / Control, visual standards, Recent / Find / Review and guarded production readiness.");
