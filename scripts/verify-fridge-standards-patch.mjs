import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORNERBAR_SAVED_STANDARD_INCOMPLETE,
  CORNERBAR_SAVED_STANDARD_INSTRUCTION,
  ESPRESSO_MACHINE_MILK_RESERVOIR_INSTRUCTION,
  SAVED_LOCATION_STANDARD_INCOMPLETE,
  WORKBAR_MILK_FRIDGE_STANDARD_KEY,
  WORKBAR_NON_ALCO_LOCATION_CODE,
  WORKBAR_NON_ALCO_LOCATION_KEY,
  WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION,
  cornerbarSavedLocationStandardBinding,
  fridgeReviewStandards,
  workbarNonAlcoSavedLocationStandardBinding,
  workbarMilkFridgeStandard,
} from "../src/data/fridgeOperationalStandards.js";
import { eventRigGuides, eventVisualReferenceKeys } from "../src/data/eventRigGuides.js";
import { eventTaskTemplates } from "../src/data/eventTaskTemplates.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const json = (path) => JSON.parse(read(path));
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => structuredClone(value);
const taskMap = (pack) => Object.fromEntries([...pack.opening.tasks, ...pack.closing.tasks].map((task) => [task.id, task]));
const standardMap = (pack) => Object.fromEntries(pack.standards.map((standard) => [standard.key, standard]));
const text = (value) => canonical(value);
const item = (task, key) => task.items.find((entry) => entry.key === key);

let passed = 0;
const check = (label, condition) => {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}`);
};

const historical = json("content/routine-engine/mesh-routine-content-v1-4r.json");
const pack = json("content/routine-engine/mesh-routine-content-v1-5r.json");
const historicalSql = read("supabase/phase10s_mesh_routine_content_pack_1_4r.sql");
const sql = read("supabase/phase10y_mesh_routine_content_pack_1_5r.sql");
const amendment = read("docs/routine-engine-v2-fridge-standards-amendment-2026-08-15.md");
const generator = read("scripts/generate-routine-content-pack.mjs");
const appAndReviewSources = [
  "src/data/fridgeOperationalStandards.js",
  "src/data/eventTaskTemplates.js",
  "src/data/eventRigGuides.js",
  "src/features/routines-v2/manager/RoutineReferenceManager.jsx",
  "src/testing/fridgeStandardsReviewHarnessEntry.jsx",
  "release-review-preview.html",
].map(read).join("\n");
const tasks = taskMap(pack);
const standards = standardMap(pack);

check("historical 1.4R pack remains byte-identical", historical.packVersion === "1.4R"
  && historical.packHash === "48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8"
  && digest(read("content/routine-engine/mesh-routine-content-v1-4r.json")) === "a69042a4e8f25d07e952821a0fdcadb24a8f1cb55a4e53044b6f28909ea8fba4");
check("historical Phase 10S provider remains 1.4R", historicalSql.includes(`$mesh_content$${JSON.stringify(historical)}$mesh_content$`));
check("new provider is additive 1.5R with an honest canonical hash", pack.packVersion === "1.5R" && (() => {
  const { packHash, ...withoutHash } = pack;
  return packHash === digest(canonical(withoutHash));
})());
check("1.5R adds exactly one focused source amendment", pack.sourceDocuments.length === historical.sourceDocuments.length + 1
  && canonical(pack.sourceDocuments.slice(0, -1)) === canonical(historical.sourceDocuments)
  && pack.sourceDocuments.at(-1).kind === "fridge_standards_amendment"
  && pack.sourceDocuments.at(-1).fileName === "routine-engine-v2-fridge-standards-amendment-2026-08-15.md");

const changedOpening = ["O08", "O09", "O13", "O23", "O29", "O35"];
const changedClosing = ["C08", "C09", "C10", "C28", "C29", "C30", "C33"];
const changedStandards = [WORKBAR_MILK_FRIDGE_STANDARD_KEY, "fridge-closing-rules", "cornerbar-operating-standard", "main-storage-express-shelf-refill"];
const addedLocations = ["main-storage-fridge", "main-storage-left-reserve", "main-storage-express-shelf", "main-storage-keg-storage"];
const addedReferences = ["main-storage-fridge", "main-storage-express-shelf"];
const topLevel14 = clone(historical);
const topLevel15 = clone(pack);
for (const candidate of [topLevel14, topLevel15]) {
  delete candidate.packVersion;
  delete candidate.packHash;
  delete candidate.sourceDocuments;
  delete candidate.standards;
  delete candidate.opening;
  delete candidate.closing;
  delete candidate.doubleShiftSteps;
}
const nonAlcoLocation14 = topLevel14.locations.find((entry) => entry.key === WORKBAR_NON_ALCO_LOCATION_KEY);
const nonAlcoLocation15 = topLevel15.locations.find((entry) => entry.key === WORKBAR_NON_ALCO_LOCATION_KEY);
const stableLocations = (locations) => locations
  .filter((entry) => !addedLocations.includes(entry.key))
  .map((entry) => ({ ...entry, sortOrder: 0, ...(entry.key === WORKBAR_NON_ALCO_LOCATION_KEY ? { name: "Workbar Non-Alco Fridge" } : {}) }));
const stableReferences = (references) => references.filter((entry) => !addedReferences.includes(entry.key));
delete topLevel14.locations;
delete topLevel15.locations;
const references14 = topLevel14.references;
const references15 = topLevel15.references;
delete topLevel14.references;
delete topLevel15.references;
check("1.4R to 1.5R top-level delta is refrigerator-only", canonical(topLevel14) === canonical(topLevel15)
  && nonAlcoLocation14?.name === "Workbar Non-Alcoholic Fridge"
  && nonAlcoLocation15?.name === "Workbar Non-Alco Fridge"
  && canonical(stableLocations(historical.locations)) === canonical(stableLocations(pack.locations))
  && canonical(stableReferences(references14)) === canonical(stableReferences(references15)));
check("only four operational standards change", canonical(historical.standards.filter((entry) => !changedStandards.includes(entry.key)))
  === canonical(pack.standards.filter((entry) => !changedStandards.includes(entry.key))));
check("only the six approved Opening tasks change", canonical(historical.opening.tasks.filter((entry) => !changedOpening.includes(entry.id)))
  === canonical(pack.opening.tasks.filter((entry) => !changedOpening.includes(entry.id))));
check("only the seven approved Closing tasks change", canonical(historical.closing.tasks.filter((entry) => !changedClosing.includes(entry.id)))
  === canonical(pack.closing.tasks.filter((entry) => !changedClosing.includes(entry.id))));
check("only Double Shift handover DS02 changes", canonical(historical.doubleShiftSteps.filter((entry) => entry.id !== "DS02"))
  === canonical(pack.doubleShiftSteps.filter((entry) => entry.id !== "DS02")));
check("Opening and Closing dependency graphs remain unchanged", canonical(historical.opening.dependencies) === canonical(pack.opening.dependencies)
  && canonical(historical.closing.dependencies) === canonical(pack.closing.dependencies));

const canonicalStandard = standards[WORKBAR_MILK_FRIDGE_STANDARD_KEY].currentRevision.value;
check("one canonical organization-owned Workbar Milk Fridge standard is shared", pack.standards.filter((entry) => entry.key === WORKBAR_MILK_FRIDGE_STANDARD_KEY).length === 1
  && canonical(canonicalStandard) === canonical(workbarMilkFridgeStandard)
  && ["O08", "O09", "O23", "O29", "O35"].every((id) => text(tasks[id]).includes(WORKBAR_MILK_FRIDGE_STANDARD_KEY))
  && ["C09", "C29", "C33"].every((id) => text(tasks[id]).includes(WORKBAR_MILK_FRIDGE_STANDARD_KEY))
  && text(pack.doubleShiftSteps.find((entry) => entry.id === "DS02")).includes("Workbar Milk Fridge"));
check("Workbar Milk Fridge exact top and exclusive lower shelves are permanent", canonicalStandard.topShelf.regularMilkCartons === 2
  && canonicalStandard.topShelf.oatlyCartons === 2
  && canonicalStandard.lowerShelves.exclusiveUse === "opened-wine-bottles"
  && canonicalStandard.lowerShelves.openedBottlesOnly
  && canonicalStandard.lowerShelves.visibleDateLabelRequired
  && !canonicalStandard.lowerShelves.unopenedWineAllowed
  && !canonicalStandard.lowerShelves.generalStorageAllowed
  && canonicalStandard.applicability.alwaysApplicable
  && canonicalStandard.applicability.notOverridableByEvent
  && !canonicalStandard.applicability.temporaryStorageOverrideAllowed
  && canonicalStandard.operatingState.poweredOn);
check("Workbar Milk Fridge provenance is operations-approved and organization-owned", canonicalStandard.ownership === "organization"
  && canonicalStandard.provenance === "Operations-approved standard · confirmed 15 August 2026");
check("full refrigerator compliance cannot be reduced to the 2 + 2 top shelf", ["O09", "O23", "O29", "O35", "C09", "C29", "C33"].every((id) => {
  const task = tasks[id];
  const completionCopy = `${task.instructions}\n${task.structuredItemsText}\n${task.doneCriteriaText}`;
  return text(task).includes("lower_shelves_opened_wine_only")
    || /lower shelves|below/i.test(completionCopy)
    || /full refrigerator standard[^.]*2 \+ 2[^.]*insufficient/i.test(completionCopy);
}));

check("espresso-machine reservoirs stay separate from carton storage", tasks.O08.instructions === ESPRESSO_MACHINE_MILK_RESERVOIR_INSTRUCTION
  && item(tasks.O08, "dairy_reservoir_regular_milk")
  && item(tasks.O08, "oat_reservoir_oatly")
  && /never treated as carton-storage or a Stock Count location/i.test(tasks.O08.deviationRulesText));
check("Double Shift reports four milk and fridge scopes separately", [
  "espresso-machine dairy and oat reservoirs",
  "self-service milk jug",
  "Workbar Milk Fridge top-shelf 2 + 2 reserve",
  "Workbar Milk Fridge lower shelves: opened, visibly date-labelled wine only",
].every((phrase) => pack.doubleShiftSteps.find((entry) => entry.id === "DS02").instructions.includes(phrase)));

const cornerbarTasks = [tasks.C10, tasks.C30];
const expectedCornerbarCodes = cornerbarSavedLocationStandardBinding.locationCodes;
check("Cornerbar Event and Closing resolve all three current manager-maintained location standards", cornerbarTasks.every((task) => {
  const dynamicItems = task.items.filter((entry) => entry.sourceKind === "inventory_readonly");
  return expectedCornerbarCodes.every((code) => dynamicItems.some((entry) => canonical(entry.sourceConfig) === canonical({ mode: "location_standards", locationCodes: [code], activeOnly: true })))
    && task.instructions.includes("current saved location standard")
    && task.deviationRulesText.includes(CORNERBAR_SAVED_STANDARD_INCOMPLETE);
}));
check("Cornerbar routines embed no product quantity and keep refrigerators and lights on", cornerbarTasks.every((task) => {
  const operationalCopy = `${task.instructions}\n${task.structuredItemsText}\n${task.doneCriteriaText}\n${task.deviationRulesText}`;
  return !/\b\d+\s+(?:bottles?|cans?|cartons?|units?|beers?|wines?|milks?|oatly)\b/i.test(operationalCopy)
    && /refrigerator(?:s)? and (?:its )?(?:internal )?light(?:s)? (?:remain|remains|stays?) on/i.test(operationalCopy)
    && !/turn off (?:a |the )?Cornerbar (?:refrigerator|fridge)|turn off (?:a |the )?Cornerbar (?:refrigerator|fridge) light/i.test(operationalCopy);
}));
check("Event templates use the saved-standard binding without embedded Cornerbar quantities", (() => {
  const template = eventTaskTemplates.find((entry) => entry.id === "cornerbar-event");
  const bound = template.tasks.filter((entry) => entry.standardBinding);
  return bound.length === 2
    && bound.every((entry) => canonical(entry.standardBinding) === canonical(cornerbarSavedLocationStandardBinding))
    && bound.every((entry) => entry.description.includes(CORNERBAR_SAVED_STANDARD_INSTRUCTION))
    && bound.every((entry) => !/\b\d+\s+(?:bottles?|cans?|cartons?|units?|beers?|wines?)\b/i.test(entry.description));
})());

const nonAlcoTaskIds = ["O13", "O23", "O29", "O35", "C08", "C28", "C33"];
const dynamicNonAlcoTaskIds = ["O13", "O23", "O29", "O35", "C08", "C28", "C33"];
const canonicalNonAlcoSource = {
  mode: "location_standards",
  locationCodes: [WORKBAR_NON_ALCO_LOCATION_CODE],
  activeOnly: true,
};
check("one canonical Workbar Non-Alco Fridge binding owns the legacy source interpretation", WORKBAR_NON_ALCO_LOCATION_KEY === "workbar-non-alcoholic-fridge"
  && WORKBAR_NON_ALCO_LOCATION_CODE === "WORKBAR_NON_ALCO_FRIDGE"
  && fridgeReviewStandards.workbarNonAlcoFridge.displayName === "Workbar Non-Alco Fridge"
  && canonical(workbarNonAlcoSavedLocationStandardBinding) === canonical({
    ...canonicalNonAlcoSource,
    resolution: "current-manager-maintained-location-standard",
    incompleteMessage: SAVED_LOCATION_STANDARD_INCOMPLETE,
    embeddedProductQuantitiesAllowed: false,
  })
  && fridgeReviewStandards.workbarNonAlcoFridge.key === WORKBAR_NON_ALCO_LOCATION_KEY
  && fridgeReviewStandards.workbarNonAlcoFridge.instruction === WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION);
check("Opening and Closing resolve the Workbar Non-Alco Fridge saved standard dynamically", dynamicNonAlcoTaskIds.every((id) => {
  const dynamicItems = tasks[id].items.filter((entry) => entry.sourceKind === "inventory_readonly");
  return (!["O13", "C08", "C28"].includes(id) || tasks[id].locationKey === WORKBAR_NON_ALCO_LOCATION_KEY)
    && dynamicItems.some((entry) => canonical(entry.sourceConfig) === canonical(canonicalNonAlcoSource)
      && entry.metadata?.locationKey === WORKBAR_NON_ALCO_LOCATION_KEY)
    && text(tasks[id]).includes(SAVED_LOCATION_STANDARD_INCOMPLETE);
}));
check("Opening, Daytime, Closing and Double Shift reuse the same Workbar Non-Alco Fridge", nonAlcoTaskIds.every((id) => text(tasks[id]).includes("Workbar Non-Alco Fridge"))
  && ["O13", "O23", "O29", "O35", "C08", "C28", "C33"].every((id) => text(tasks[id]).includes(WORKBAR_NON_ALCO_LOCATION_KEY))
  && text(pack.doubleShiftSteps.find((entry) => entry.id === "DS02")).includes("Workbar Non-Alco Fridge actual saved-standard status"));
check("Workbar Non-Alco Fridge completion is clean, rotated, fronted, closed, on and normal", ["O13", "O29", "O35", "C08", "C28", "C33"].every((id) => {
  const operationalCopy = `${tasks[id].instructions}\n${tasks[id].doneCriteriaText}\n${tasks[id].deviationRulesText}`;
  return /clean/i.test(operationalCopy)
    && /dates?/i.test(operationalCopy)
    && /FIFO/.test(operationalCopy)
    && /placement/i.test(operationalCopy)
    && /front/i.test(operationalCopy)
    && /(?:door (?:is )?closed|close the door)/i.test(operationalCopy)
    && /refrigerator and (?:its )?internal light remain on/i.test(operationalCopy)
    && /operating normally/i.test(operationalCopy);
}));
check("Workbar Non-Alco Fridge Event work is one Workbar-scoped canonical task", (() => {
  const general = eventTaskTemplates.find((entry) => entry.id === "general-event-routine");
  const matching = eventTaskTemplates.flatMap((template) => template.tasks).filter((entry) => entry.id === "after-workbar-non-alco-fridge");
  const eventTask = general?.tasks.find((entry) => entry.id === "after-workbar-non-alco-fridge");
  const cornerbar = eventTaskTemplates.find((entry) => entry.id === "cornerbar-event");
  return matching.length === 1
    && eventTask?.zone === "workbar"
    && eventTask.locationKey === WORKBAR_NON_ALCO_LOCATION_KEY
    && canonical(eventTask.standardBinding) === canonical(workbarNonAlcoSavedLocationStandardBinding)
    && eventTask.description.includes(WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION)
    && !cornerbar.tasks.some((entry) => entry.locationKey === WORKBAR_NON_ALCO_LOCATION_KEY);
})());
const nonAlcoOperationalCopy = text({
  dedicatedTasks: ["O13", "C08", "C28"].map((id) => tasks[id]),
  aggregateItems: ["O23", "O29", "O35", "C33"].flatMap((id) => tasks[id].items.filter((entry) => entry.metadata?.locationKey === WORKBAR_NON_ALCO_LOCATION_KEY)),
  doubleShift: `${pack.doubleShiftSteps.find((entry) => entry.id === "DS02").instructions}\n${pack.doubleShiftSteps.find((entry) => entry.id === "DS02").doneCriteriaText}`
    .split("\n").filter((line) => /Workbar Non-Alco Fridge/i.test(line)),
  event: eventTaskTemplates.flatMap((template) => template.tasks).filter((entry) => entry.locationKey === WORKBAR_NON_ALCO_LOCATION_KEY),
});
check("Workbar Non-Alco routine, handover and Event copy embeds no product quantities", !/\b\d+\s+(?:bottles?|cans?|cartons?|units?|beers?|wines?|milks?|oatly|products?)\b/i.test(nonAlcoOperationalCopy));
check("Workbar Non-Alco routines cannot switch off the refrigerator or light", !/(?:turn|switch)(?:ing)? off[^.\n]{0,80}(?:Workbar Non-Alco Fridge|refrigerator|internal light)/i.test(nonAlcoOperationalCopy));
check("routine compliance and Stock Count completion remain separate", canonicalStandard.stockCount.routineCompletionCompletesStockCount === false
  && canonicalStandard.stockCount.regularMilk.policy === "routine_only"
  && canonicalStandard.stockCount.regularMilk.quantity === 2
  && canonicalStandard.stockCount.regularMilk.createsStockCountLine === false
  && canonicalStandard.stockCount.oatly.policy === "routine_only"
  && canonicalStandard.stockCount.oatly.quantity === 2
  && canonicalStandard.stockCount.oatly.createsStockCountLine === false
  && canonicalStandard.stockCount.openedWine.policy === "actual_physical_quantity"
  && canonicalStandard.stockCount.openedWine.configuredLineCount === 10
  && canonicalStandard.stockCount.openedWine.exactStandardQuantity === null
  && canonicalStandard.stockCount.openedWine.partialBottleRulesRemainAuthoritative
  && canonicalStandard.stockCount.preserveCountsNotesAndDeviations
  && canonicalStandard.stockCount.fastStandardPathAllowed === false
  && canonicalStandard.stockCount.protectedBelowMarketWinesRemainPhysicalUnitsUntilMillumExport);
check("Workbar Non-Alco completion preserves location-scoped Stock Count state", ["O13", "C08", "C28"].every((id) => /does not complete Stock Count/i.test(tasks[id].doneCriteriaText))
  && ["O13", "C08", "C28"].every((id) => /Counts, notes, zeroes, deviations and targetless Stock Count lines remain separate and must never be overwritten/i.test(tasks[id].deviationRulesText)));

const guide = eventRigGuides.find((entry) => entry.key === "workbar-milk-fridge-standard");
check("Workbar Milk Fridge visual standard is a written-only default restore", guide?.guideType === "default_restore"
  && guide.selectionKind === "default_target"
  && guide.sourceStatus === "operations_approved_image_awaiting_upload"
  && canonical(guide.zones.map((zone) => zone.key)) === canonical(["full-refrigerator", "top-shelf", "lower-shelves"])
  && guide.zones.every((zone) => zone.angles.length === 0)
  && !eventVisualReferenceKeys.some((key) => key.startsWith("workbar-milk-fridge")));
check("visual standard claims no image upload and no person-owned provenance", /image awaiting upload/i.test(`${guide.notes}\n${guide.source?.note}`)
  && !/Julie|Bobby|Robert/i.test(text(guide)));
const nonAlcoGuide = eventRigGuides.find((entry) => entry.key === "workbar-non-alcoholic-fridge-standard");
check("Workbar Non-Alco Fridge has one written-only canonical visual reference", nonAlcoGuide?.title === "Workbar Non-Alco Fridge"
  && nonAlcoGuide.guideType === "default_restore"
  && nonAlcoGuide.selectionKind === "default_target"
  && nonAlcoGuide.sourceStatus === "saved_location_standard_image_awaiting_upload"
  && nonAlcoGuide.source?.title === "Current saved location standard · image awaiting upload"
  && canonical(nonAlcoGuide.zones.map((zone) => zone.key)) === canonical(["full-refrigerator"])
  && nonAlcoGuide.zones[0].angles.length === 0
  && !eventVisualReferenceKeys.some((key) => key.startsWith("workbar-non-alcoholic-fridge"))
  && !/Julie|Bobby|Robert/i.test(text(nonAlcoGuide)));

check("regression negative: no Cornerbar fridge switch-off instruction", !/Turn off the Cornerbar fridges/i.test(text({ pack, eventTaskTemplates })));
const frontlineInstructions = [
  ...eventTaskTemplates.flatMap((template) => template.tasks.map((entry) => entry.description)),
  ...Object.values(tasks).map((task) => task.instructions),
].join("\n");
check("regression negative: no Cornerbar refrigerator-light switch-off instruction", !/(?:^|[.!?]\s+)(?:turn|switch) off (?:a |the |every )?Cornerbar[^.\n]{0,60}(?:refrigerator|fridge)[^.\n]{0,40}(?:internal )?light/i.test(frontlineInstructions));
check("regression negative: lower shelves are never general storage", canonicalStandard.lowerShelves.generalStorageAllowed === false && canonicalStandard.forbiddenItemCategories.includes("general temporary storage"));
check("regression negative: unopened wine and unlabelled opened wine are forbidden below", canonicalStandard.lowerShelves.unopenedWineAllowed === false
  && canonicalStandard.lowerShelves.visibleDateLabelRequired
  && canonicalStandard.forbiddenItemCategories.includes("opened bottles without a visible date label"));
check("regression negative: extra milk and event products are forbidden below", canonicalStandard.forbiddenItemCategories.includes("additional milk cartons")
  && canonicalStandard.forbiddenItemCategories.includes("unrelated event products"));
check("regression negative: Event Mode cannot override the Workbar Milk Fridge", canonicalStandard.applicability.appliesDuring.includes("Event Mode")
  && canonicalStandard.applicability.notOverridableByEvent
  && /does not change for events/i.test(canonicalStandard.mainInstruction));
check("regression negative: opened wine has no fabricated exact quantity", canonicalStandard.stockCount.openedWine.exactStandardQuantity === null);
check("regression negative: routine completion cannot complete Stock Count", canonicalStandard.stockCount.routineCompletionCompletesStockCount === false
  && ["O09", "C09"].every((id) => /does not complete any Stock Count|never completes a Stock Count/i.test(text(tasks[id]))));
check("regression negative: operational ownership copy contains no personal name", !/(?:Bobby|Robert|Julie)(?:’s|'s)?\s+(?:standard|source|operational|event set)|(?:Bobby|Robert|Julie)-approved/i.test(appAndReviewSources));
check("regression negative: no operational salad-fridge identity or light-switch rule", !/(?:Workbar salad fridge|workbar-salad-fridge-internal-light|after-workbar-salad-fridge-light|cornerbar-workbar-salad-fridge-light|WORKBAR_SALAD_FRIDGE|internal light only|switch off the internal light|light-bulb control)/i.test(text({ pack, eventTaskTemplates, eventRigGuides, fridgeReviewStandards })));
check("regression positive: approved organization terminology is present", appAndReviewSources.toLowerCase().includes("current saved location standard")
  && appAndReviewSources.toLowerCase().includes("current manager-maintained location standard")
  && appAndReviewSources.includes("Operations-approved standard")
  && appAndReviewSources.includes("Organization-owned operational standard"));

check("focused source reconciliation preserves fire, evacuation and Shopbox as unresolved", amendment.includes("CONFIRMED OPERATIONS STANDARDS — 15 AUGUST 2026")
  && /legacy source alias [“\"]salad fridge[”\"] maps to the existing canonical Workbar Non-Alco Fridge/i.test(amendment)
  && amendment.includes(WORKBAR_NON_ALCO_LOCATION_KEY)
  && /earlier separate refrigerator and internal-light interpretation is superseded/i.test(amendment)
  && /Workbar Non-Alco Fridge and its internal light remain on/i.test(amendment)
  && /fire and evacuation-plan content remains unresolved and unchanged/i.test(amendment)
  && /Shopbox test-sale, customer-creation and subscription-field content remains unresolved and unchanged/i.test(amendment)
  && canonical(pack.unresolvedRequirements) === canonical(historical.unresolvedRequirements));
check("generator explicitly creates the additive 1.5R provider", generator.includes('packVersion: "1.5R"')
  && generator.includes("phase10y_mesh_routine_content_pack_1_5r.sql")
  && generator.includes("fridge_standards_amendment")
  && !existsSync(resolve(ROOT, "content/routine-engine/mesh-routine-content-v1-6r.json"))
  && !existsSync(resolve(ROOT, "supabase/phase10z_mesh_routine_content_pack_1_6r.sql")));
check("Phase 10Y embeds the exact 1.5R provider payload", sql.includes(`$mesh_content$${JSON.stringify(pack)}$mesh_content$`));
check("Phase 10Y is provider-only and performs no operational write", /^begin;/i.test(sql.trim())
  && /commit;\s*$/i.test(sql.trim())
  && /create or replace function public\.routine_mesh_content_pack_v1\(\)/i.test(sql)
  && !/^(?!\s*--).*\b(?:insert\s+into|update\s+|delete\s+from|truncate\s+|merge\s+into)\b/im.test(sql)
  && !/(?:perform|select)\s+public\.(?:install_mesh_routine_content_pack_v1|publish_routine_template_versions|create_or_get_routine_run|create_or_get_double_shift_bundle)/i.test(sql)
  && !/set\s+(?:mode|ui_release_stage)\s*=/i.test(sql));

console.log(`Fridge standards patch verification: ${passed}/${passed} passed; provider ${pack.packVersion} ${pack.packHash}.`);
