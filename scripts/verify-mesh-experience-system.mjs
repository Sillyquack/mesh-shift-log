import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [main, tokens, documentation, home, workspace, offline, experienceStyles] = await Promise.all([
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/design-system/MeshExperienceSystem.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/mesh-experience-system.md", import.meta.url), "utf8"),
  readFile(new URL("../src/features/routines-v2/employee/RoutineEmployeeHome.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/routines-v2/employee/RoutineEmployeeWorkspace.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/routines-v2/employee/RoutineOfflineState.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/routines-v2/employee/RoutineEmployeeExperience.css", import.meta.url), "utf8"),
]);

assert.match(main, /design-system\/MeshExperienceSystem\.css/, "Shared experience tokens must load globally");

for (const token of [
  "--mesh-ink",
  "--mesh-cream",
  "--mesh-gold",
  "--mesh-green",
  "--mesh-red",
  "--mesh-touch-target: 48px",
]) {
  assert.ok(tokens.includes(token), `Missing shared experience token: ${token}`);
}
for (const primitive of [
  ".mesh-experience-shell",
  ".mesh-hero",
  ".mesh-progress-ring",
  ".mesh-focus-card",
  ".mesh-mission-map",
  ".mesh-bottom-nav",
]) {
  assert.ok(tokens.includes(primitive), `Missing shared experience primitive: ${primitive}`);
}
assert.match(tokens, /prefers-reduced-motion/, "Shared experience system must respect reduced motion");
assert.match(tokens, /@media \(max-width: 760px\)/, "Shared experience system must include mobile rules");

for (const role of [
  "Event Floor Manager",
  "Shift employee / shared-device operator",
  "Inventory counter",
  "Manager",
  "History and reporting",
  "Authentication and role selection",
]) {
  assert.ok(documentation.includes(role), `Role experience is not documented: ${role}`);
}
for (const principle of [
  "Role before feature",
  "One primary action per state",
  "Progressive disclosure",
  "Mobile is the operational default",
  "Safety and auditability remain intact",
]) {
  assert.ok(documentation.includes(principle), `Experience principle is not documented: ${principle}`);
}

for (const label of [
  "SHIFT MODE",
  "Your shift, without the noise.",
  "CONTINUE NOW",
  "SHIFT MAP",
  "Now",
  "Shift",
  "Help",
  "Everything in the right place.",
  "Get unstuck quickly.",
]) {
  assert.ok(home.includes(label), `Shift Mode is missing label: ${label}`);
}
for (const preservedAction of [
  "joinRoutineRun",
  "createOrGetRoutineRun",
  "doubleShiftApi.createOrGet",
  "onOpenHandover",
  "onOpenTransfer",
  "createAfterConflict",
]) {
  assert.ok(home.includes(preservedAction), `Shift Mode lost operational action: ${preservedAction}`);
}
for (const removedNoise of [
  "Server clock",
  "Server authoritative",
  "actor source",
  "release stage",
  "Realtime connected",
  "Cursor polling",
  "server cache confirmed",
]) {
  assert.ok(!home.includes(removedNoise), `Shift Mode still exposes technical noise: ${removedNoise}`);
  assert.ok(!offline.includes(removedNoise), `Work status still exposes technical noise: ${removedNoise}`);
}

assert.match(workspace, /RoutineEmployeeExperience\.css/, "Shift Mode styles must load after legacy employee styles");
assert.match(workspace, /onOpenHistory=\{\(\) => setRoute/, "History must be routed through Shift Mode");
assert.doesNotMatch(workspace, /employee-history-nav/, "The separate history navigation must be removed from the home surface");
assert.match(offline, /Everything is up to date/, "Calm current-work status is missing");
assert.match(offline, /Working offline/, "Human-readable offline status is missing");
assert.match(offline, /Needs your review|need review/, "Human-readable conflict status is missing");
assert.match(experienceStyles, /\.routine-experience-nav/, "Shift Mode bottom navigation is missing");
assert.match(experienceStyles, /position: fixed/, "Shift Mode mobile navigation must remain reachable");
assert.match(experienceStyles, /min-height: 44px/, "Shift Mode must use practical touch targets");

console.log("Verified the shared Mesh experience foundation and focused Shift Mode migration.");
