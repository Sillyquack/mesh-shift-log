import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [operator, cockpit, styles, permissions] = await Promise.all([
  readFile(new URL("../src/components/EventOperatorExperience.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EventOperationsCockpit.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EventOperatorExperience.css", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/permissions.js", import.meta.url), "utf8"),
]);

assert.match(operator, /role\) === "event_floor_manager"/, "Event Mode must be role-gated");
assert.match(cockpit, /if \(operatorMode\)[\s\S]*<EventOperatorExperience/, "Operator role must branch away from the manager cockpit");
assert.match(cockpit, /Event Operations Cockpit/, "Manager cockpit must remain available");
assert.match(cockpit, /listImportedCalendarEvents/, "Manager planning integrations must remain available behind the operator view");
assert.match(cockpit, /event-operator-launcher/, "Operator home must use the focused launcher");

for (const label of [
  "UP NEXT",
  "MISSION MAP",
  "Focus",
  "Journey",
  "Help",
  "Complete task",
  "Need help with this step?",
  "Show visual guide",
  "MISSION COMPLETE",
]) {
  assert.ok(operator.includes(label), `Event Mode missing label: ${label}`);
}

for (const action of ["onTaskStatus", "onCreateLiveUpdate", "onOpenGuide"]) {
  assert.ok(operator.includes(action), `Event Mode missing operational action: ${action}`);
}

const forbiddenOperatorTerms = [
  "calendar import",
  "database",
  "backend",
  "supabase",
  "realtime",
  "readiness",
  "linked resources",
  "confidence",
];
for (const term of forbiddenOperatorTerms) {
  assert.ok(!operator.toLowerCase().includes(term), `Operator UI contains technical noise: ${term}`);
}

assert.doesNotMatch(operator, /[æøå]/i, "Operator UI must remain English");
assert.doesNotMatch(operator, /\b(?:pin|code|alarm code)\s*[:=-]\s*\d{4,8}\b/i, "Operator UI must not contain an alarm code");
assert.match(styles, /event-operator-session/, "Role-scoped home cleanup missing");
assert.match(styles, /event-operator-active/, "Focused Event Mode cleanup missing");
assert.match(styles, /:has\(> \.event-board-create-details\)/, "Event Floor Manager home must hide implementation surfaces");
assert.match(styles, /@media \(max-width: 760px\)/, "Mobile layout missing");
assert.match(styles, /prefers-reduced-motion/, "Reduced-motion support missing");
assert.match(permissions, /classList\.toggle\('event-operator-session'/, "Role class bridge missing");

console.log("Verified the role-gated, English, low-noise Event Mode and preserved Manager Cockpit.");
