import assert from "node:assert/strict";
import { eventTaskTemplates } from "../src/data/eventTaskTemplates.js";
import { eventRigGuides, rigGuidesForSignals } from "../src/data/eventRigGuides.js";
import { knowledgeBase } from "../src/data/routines.js";

const byTemplateId = new Map(eventTaskTemplates.map((template) => [template.id, template]));
const guideIds = new Set(eventRigGuides.map((guide) => guide.id));
const knowledgeGuideIds = new Set(knowledgeBase.map((guide) => guide.id));

assert.equal(byTemplateId.size, eventTaskTemplates.length, "Template IDs must be unique");
assert.equal(guideIds.size, eventRigGuides.length, "Rig guide IDs must be unique");

for (const template of eventTaskTemplates) {
  assert.ok(template.tasks.length > 0, `${template.id} must include tasks`);
  const ids = new Set(template.tasks.map((item) => item.id));
  assert.equal(ids.size, template.tasks.length, `${template.id} task IDs must be unique`);

  for (const item of template.tasks) {
    const hasStartTiming = Number.isFinite(item.offsetMinutesFromStart);
    const hasEndTiming = Number.isFinite(item.offsetMinutesFromEnd);
    assert.notEqual(hasStartTiming, hasEndTiming, `${template.id}/${item.id} must have exactly one timing anchor`);
    if (item.rigRef) assert.ok(guideIds.has(item.rigRef), `${template.id}/${item.id} has unknown rigRef ${item.rigRef}`);
    if (item.guideRef) assert.ok(knowledgeGuideIds.has(item.guideRef), `${template.id}/${item.id} has unknown guideRef ${item.guideRef}`);
    assert.ok(item.title && item.description && item.zone, `${template.id}/${item.id} is incomplete`);
  }
}

const atrium = byTemplateId.get("atrium-bar-event");
const cornerbar = byTemplateId.get("cornerbar-event");
assert.ok(atrium, "Atrium template missing");
assert.ok(cornerbar, "Cornerbar template missing");
assert.equal(atrium.source?.system, "notion", "Atrium source metadata missing");
assert.equal(cornerbar.source?.system, "notion", "Cornerbar source metadata missing");
assert.ok(atrium.tasks.length >= 20, "Atrium routine must retain the full Julie workflow");
assert.ok(cornerbar.tasks.length >= 20, "Cornerbar routine must retain the full Julie workflow");

const atriumText = atrium.tasks.map((item) => `${item.title} ${item.description}`).join(" ").toLowerCase();
const cornerbarText = cornerbar.tasks.map((item) => `${item.title} ${item.description}`).join(" ").toLowerCase();
for (const required of ["next event", "15 minutes", "allergen", "two hours", "lost property", "alarm codes"]) {
  assert.ok(atriumText.includes(required), `Atrium routine missing: ${required}`);
}
for (const required of ["pre-event product count", "chairs on tables", "front bank-terminal display", "fridges", "sliced fruit", "one night only", "alarm codes"]) {
  assert.ok(cornerbarText.includes(required), `Cornerbar routine missing: ${required}`);
}

const allDescriptions = eventTaskTemplates
  .flatMap((template) => template.tasks)
  .map((item) => item.description)
  .join("\n");
assert.doesNotMatch(allDescriptions, /https?:\/\//i, "Task text must not contain expiring or external URLs");
assert.doesNotMatch(allDescriptions, /\b(?:pin|code|alarm code)\s*[:=-]\s*\d{4,8}\b/i, "Task text must not contain an alarm code");

for (const guide of eventRigGuides) {
  assert.ok(Array.isArray(guide.imageRefs), `${guide.id} imageRefs must remain compatible`);
  assert.ok(Array.isArray(guide.captions), `${guide.id} captions must remain compatible`);
}

const atriumGuideIds = new Set(rigGuidesForSignals({ venues: ["atrium"], keywords: [], zones: [] }).map((guide) => guide.id));
assert.ok(atriumGuideIds.has("atrium-standard-rig"), "Atrium venue guide missing from signal selection");
assert.ok(atriumGuideIds.has("atrium-stage-tech-default"), "Atrium tech guide missing from signal selection");

const workbar = eventRigGuides.find((guide) => guide.id === "workbar-conference-setup");
assert.match(workbar.notes, /Notion page named Workbar Photos is empty/i, "Empty Workbar source must remain explicit");

console.log(`Verified ${eventTaskTemplates.length} event templates, ${eventTaskTemplates.reduce((sum, template) => sum + template.tasks.length, 0)} tasks, and ${eventRigGuides.length} rig guides.`);
