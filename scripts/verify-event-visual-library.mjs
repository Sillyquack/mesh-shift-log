import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  eventRigGuides,
  eventVisualAngles,
  eventVisualLibrary,
  eventVisualReferenceKeys,
  eventVisualVenues,
} from "../src/data/eventRigGuides.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
let passed = 0;
const check = (label, condition) => {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}`);
};

const guideKeys = new Set(eventRigGuides.map((guide) => guide.key));
const zoneIds = eventRigGuides.flatMap((guide) => guide.zones.map((zone) => `${guide.key}/${zone.key}`));
const receivedByGuide = new Map(eventRigGuides.map((guide) => [
  guide.key,
  guide.zones.flatMap((zone) => zone.angles).filter((angle) => angle.sourceStatus === "received_outside_codex").length,
]));

check("canonical guide keys are unique", guideKeys.size === eventRigGuides.length);
check("canonical guide-zone paths are unique", new Set(zoneIds).size === zoneIds.length);
check("canonical angle keys are unique", new Set(eventVisualReferenceKeys).size === eventVisualAngles.length);
check("every angle carries Venue, Guide, Zone, role, order and operational meaning", eventVisualAngles.every((angle) =>
  angle.venueKey && angle.guideKey && angle.zoneKey && angle.imageRole && Number.isInteger(angle.sortOrder) && angle.operationalDescription,
));
check("all angles honestly await production upload", eventVisualAngles.every((angle) => angle.uploadStatus === "awaiting_production_upload"));
check("received binaries are metadata only and not claimed uploaded", eventVisualAngles.filter((angle) => angle.sourceStatus === "received_outside_codex").every((angle) => angle.sourceNote.includes("production upload is still pending")));
check("six canonical guide types are exact", JSON.stringify(eventVisualLibrary.guideTypes) === JSON.stringify([
  "default_restore", "customer_layout", "service_station", "stage_tech", "bar_ready", "closing_reset",
]));
check("Atrium layout set is complete", [
  "atrium-cafe-default", "atrium-cinema-maximum", "atrium-group-tables", "atrium-classroom", "atrium-horseshoe", "atrium-buffet-table", "atrium-mingle-concert",
].every((key) => guideKeys.has(key)));
check("Cornerbar layout set is complete", [
  "cornerbar-default-restore", "cornerbar-cinema", "cornerbar-group-tables", "cornerbar-classroom", "cornerbar-horseshoe", "cornerbar-mingle-concert",
].every((key) => guideKeys.has(key)));
check("default restores and customer-selectable venue layouts cannot be confused", eventRigGuides.filter((guide) => guide.guideType === "default_restore").every((guide) => guide.selectionKind === "default_target") && eventRigGuides.filter((guide) => guide.guideType === "customer_layout" && ["atrium", "cornerbar"].includes(guide.venueKey)).every((guide) => guide.selectionKind === "customer_selectable"));
check("required operational guide set is complete", [
  "atrium-serving-stations", "cornerbar-serving-stations", "coffee-water-tea", "atrium-stage-tech-default", "cornerbar-stage-tech-default", "atrium-bar-ready-closed", "cornerbar-bar-ready", "cornerbar-bar-closing-reset", "used-dishes", "check-in", "food-allergen-stations", "water-mineral-water", "wine-beer",
].every((key) => guideKeys.has(key)));
check("received multi-angle set counts are preserved", JSON.stringify(Object.fromEntries([
  "atrium-cafe-default", "cornerbar-default-restore", "cornerbar-group-tables", "cornerbar-horseshoe", "coffee-water-tea",
].map((key) => [key, receivedByGuide.get(key)]))) === JSON.stringify({
  "atrium-cafe-default": 9,
  "cornerbar-default-restore": 5,
  "cornerbar-group-tables": 3,
  "cornerbar-horseshoe": 2,
  "coffee-water-tea": 1,
}));
check("Workbar empty source preserves the existing written standard", (() => {
  const workbar = eventRigGuides.find((guide) => guide.key === "workbar-conference-setup");
  return workbar?.sourceStatus === "source_empty_preserved" && workbar.zones.length === 1 && workbar.zones[0].angles.length === 0;
})());
check("Workbar Milk Fridge is a three-zone written-only operations-approved default restore", (() => {
  const fridge = eventRigGuides.find((guide) => guide.key === "workbar-milk-fridge-standard");
  return fridge?.guideType === "default_restore"
    && fridge.selectionKind === "default_target"
    && fridge.sourceStatus === "operations_approved_image_awaiting_upload"
    && JSON.stringify(fridge.zones.map((zone) => zone.key)) === JSON.stringify(["full-refrigerator", "top-shelf", "lower-shelves"])
    && fridge.zones.every((zone) => zone.angles.length === 0)
    && /Operations-approved standard/.test(fridge.source?.title)
    && !/Julie|Bobby|Robert/.test(JSON.stringify(fridge));
})());
check("Workbar Non-Alco Fridge is one canonical written-only saved-standard restore", (() => {
  const fridge = eventRigGuides.find((guide) => guide.key === "workbar-non-alcoholic-fridge-standard");
  const operationalCopy = JSON.stringify(fridge);
  return fridge?.guideType === "default_restore"
    && fridge.selectionKind === "default_target"
    && fridge.sourceStatus === "saved_location_standard_image_awaiting_upload"
    && fridge.title === "Workbar Non-Alco Fridge"
    && JSON.stringify(fridge.zones.map((zone) => zone.key)) === JSON.stringify(["full-refrigerator"])
    && fridge.zones[0].angles.length === 0
    && fridge.source?.title === "Current saved location standard · image awaiting upload"
    && /current manager-maintained saved location standard/i.test(operationalCopy)
    && /dates and FIFO/i.test(operationalCopy)
    && /placement and fronting/i.test(operationalCopy)
    && /door is closed/i.test(operationalCopy)
    && /refrigerator and (?:its )?internal light remain on/i.test(operationalCopy)
    && !/Julie|Bobby|Robert/.test(operationalCopy);
})());
check("latest Atrium stage conflict is resolved to two handheld and two headset", (() => {
  const stage = eventRigGuides.find((guide) => guide.key === "atrium-stage-tech-default");
  const facts = stage.operationalFacts.join(" | ").toLowerCase();
  return facts.includes("2 handheld") && facts.includes("2 headset") && !facts.includes("3 headset") && !facts.includes("throwable");
})());
check("venue, guide, zone and angle ordering is deterministic", eventVisualVenues.every((venue, venueIndex) => venue.sortOrder === venueIndex && venue.guides.every((guide) => guide.zones.every((zone, zoneIndex) => zone.sortOrder === zoneIndex && zone.angles.every((angle, angleIndex) => angle.sortOrder === angleIndex)))));

const serialized = JSON.stringify(eventVisualLibrary);
check("library contains no remote URLs, signed links, credentials, alarm details or phone-like personal data", !/https?:\\?\/\\?\/|x-amz-|service[_-]?role|bearer\s|alarm\s*(?:code|pin)|(?:\+47|0047)[\s-]*\d{8}/i.test(serialized));

const modal = read("src/components/EventVisualGuideModal.jsx");
const manager = read("src/features/routines-v2/manager/RoutineReferenceManager.jsx");
check("frontline guide is an ordered reconstruction journey with a local completion gate", /KNOW THE TARGET/.test(modal) && /REBUILD IN ORDER/.test(modal) && /FINAL WALK-THROUGH/.test(modal) && /restoredZones/.test(modal) && /disabled=\{!complete\}/.test(modal));
check("frontline guide keeps error, placeholder, keyboard trap and object URL cleanup", /Image unavailable/.test(modal) && /placeholderText/.test(modal) && /event\.key !== "Tab"/.test(modal) && /URL\.revokeObjectURL/.test(modal));
check("manager organizes readiness as Venue to Guide to Zone to Angle", /readinessTree/.test(manager) && /rm-visual-venue/.test(manager) && /rm-visual-guide/.test(manager) && /rm-visual-zone/.test(manager) && /rm-visual-angle-list/.test(manager));
check("manager reports guide, venue and overall required progress", /guide\.progress/.test(manager) && /venue\.progress/.test(manager) && /requiredReadiness/.test(manager));

const migration = read("supabase/phase10x_event_visual_library_expansion.sql");
const sqlKeys = [...(migration.match(/event_visual_reference_key_allowed[\s\S]*?any\s*\(array\[([\s\S]*?)\]::text\[\]\)/i)?.[1] || "").matchAll(/'([a-z0-9_-]+)'/g)].map((match) => match[1]);
check("Phase 10X SQL allowlist exactly equals the ordered frontend manifest", JSON.stringify(sqlKeys) === JSON.stringify(eventVisualReferenceKeys));
check("written-only Workbar fridge standards add no visual-reference allowlist keys", !eventVisualReferenceKeys.some((key) => key.startsWith("workbar-milk-fridge") || key.startsWith("workbar-non-alcoholic-fridge")));
check("Phase 10X fails closed unless the Phase 10W metadata boundary exists", /Phase 10X requires Phase 10W Event visual-reference bridge/.test(migration) && /event_visual_current_user_can_read\(\)/.test(migration) && /get_event_visual_references\(text\[\]\)/.test(migration));
check("Phase 10X is additive and contains no data or publication mutation", !/\bdrop\s+(?:table|schema|column)\b|\btruncate\b|\bdelete\s+from\b|\binsert\s+into\b|\bupdate\s+public\.|publish|install_content/i.test(migration));
check("Phase 10X removes anon Event Ops execution while preserving authenticated client boundaries", /from public, anon, authenticated/.test(migration) && /to authenticated/.test(migration) && /set_updated_at\(\) set search_path = pg_catalog/.test(migration));

const generated = spawnSync(process.execPath, ["scripts/generate-event-visual-library-artifacts.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
check("generated migration and upload manifest cannot drift from the model", generated.status === 0);
check("upload manifest states zero committed binaries and zero production uploads", /Binary files committed: \*\*0\*\*/.test(read("docs/production/event-visual-library-upload-manifest.md")) && /Production uploads performed: \*\*0\*\*/.test(read("docs/production/event-visual-library-upload-manifest.md")));
check("upload manifest labels all three fridge zones operations-approved and awaiting upload", (read("docs/production/event-visual-library-upload-manifest.md").match(/Workbar Milk Fridge.*Operations-approved standard · image awaiting upload/g) || []).length === 3);
check("upload manifest has one canonical Workbar Non-Alco Fridge row awaiting upload", (read("docs/production/event-visual-library-upload-manifest.md").match(/Workbar Non-Alco Fridge.*Current saved location standard · image awaiting upload/g) || []).length === 1);

console.log(`Event visual library verification: ${passed}/${passed} passed across ${eventRigGuides.length} guides and ${eventVisualAngles.length} angles.`);
