import { eventTaskTemplates } from "./eventTaskTemplates.js";
import { eventRigGuides, rigGuidesForSignals } from "./eventRigGuides.js";
import { knowledgeBase } from "./routines.js";

const OSLO_TIME_ZONE = "Europe/Oslo";
const DEFAULT_PREP_MINUTES = 60;
const DEFAULT_CLOSE_MINUTES = 60;
const GUIDE_IDS = new Set(knowledgeBase.map((guide) => guide.id));
const RIG_GUIDE_IDS = new Set(eventRigGuides.map((guide) => guide.id));

const TEMPLATE_IDS = {
  general: "general-event-routine",
  conference: "conference-day",
  large: "large-event-runners",
  atrium: "atrium-bar-event",
  cornerbar: "cornerbar-event",
  afterwork: "afterwork-mingling",
  football: "football-night",
};

const keywordGroups = {
  conference: ["conference", "seminar", "workshop", "presentation", "meeting", "speaker", "projector", "screen"],
  catering: ["breakfast", "lunch", "dinner", "catering", "buffet", "food", "allergen"],
  social: ["afterwork", "mingle", "mingling", "networking", "party", "drinks", "beer", "wine", "cocktails"],
  tech: ["microphone", "mic", "projector", "screen", "technical", "sound", "stage", "presentation"],
  football: ["football", "screening", "match", "kick-off", "halftime"],
  rigging: ["rigging", "furniture", "stage build", "heavy setup", "room reset"],
};

function text(value) {
  return String(value || "").toLowerCase();
}

function addMinutes(iso, minutes) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function validDateTime(value) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function windowMinutes(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

export function deriveEventPlanOperationalWindow(
  eventOperation = {},
  setup = {},
  { recalculateBounds = false } = {},
) {
  const prepMinutesBefore = windowMinutes(setup.prepMinutesBefore, DEFAULT_PREP_MINUTES);
  const closeMinutesAfter = windowMinutes(setup.closeMinutesAfter, DEFAULT_CLOSE_MINUTES);
  const derivedPrepStartsAt = addMinutes(eventOperation?.startsAt, -prepMinutesBefore);
  const derivedCloseEndsAt = addMinutes(eventOperation?.endsAt, closeMinutesAfter);
  return {
    ...setup,
    prepMinutesBefore,
    closeMinutesAfter,
    prepStartsAt:
      !recalculateBounds && validDateTime(setup.prepStartsAt)
        ? new Date(setup.prepStartsAt).toISOString()
        : derivedPrepStartsAt,
    closeEndsAt:
      !recalculateBounds && validDateTime(setup.closeEndsAt)
        ? new Date(setup.closeEndsAt).toISOString()
        : derivedCloseEndsAt,
  };
}

function isAdvancePlanningItem(item) {
  return (
    item?.metadata?.advancePlanning === true ||
    item?.metadata?.timingScope === "advance_planning"
  );
}

function fittedPhaseTimes(indexedItems, startAt, endAt) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return new Map();
  const timedItems = indexedItems.filter(
    ({ item }) => validDateTime(item.dueAt) && !isAdvancePlanningItem(item),
  );
  if (!timedItems.length) return new Map();

  const durationMinutes = Math.max(0, Math.floor((end - start) / 60000));
  const maximumSpacing = timedItems.length > 1
    ? Math.floor(durationMinutes / (timedItems.length - 1))
    : 0;
  const spacingMinutes = timedItems.length <= 1
    ? 0
    : maximumSpacing < 5
      ? Math.max(0, maximumSpacing)
      : Math.min(15, Math.max(5, Math.floor(maximumSpacing / 5) * 5));
  const spacingMs = spacingMinutes * 60000;
  const updates = new Map();
  let previousTime = start - spacingMs;

  timedItems.forEach(({ item, index }, position) => {
    const remaining = timedItems.length - position - 1;
    const minimum = position === 0 ? start : previousTime + spacingMs;
    const maximum = Math.max(minimum, end - remaining * spacingMs);
    const existingTime = new Date(item.dueAt).getTime();
    const distributedTime = timedItems.length === 1
      ? Math.round((start + end) / 2)
      : start + Math.round(((end - start) * position) / (timedItems.length - 1));
    const targetTime = existingTime >= minimum && existingTime <= maximum
      ? existingTime
      : Math.min(maximum, Math.max(minimum, distributedTime));
    const originalReminderTime = validDateTime(item.remindAt)
      ? new Date(item.remindAt).getTime()
      : null;
    const delta = targetTime - existingTime;
    updates.set(index, {
      dueAt: new Date(targetTime).toISOString(),
      remindAt:
        originalReminderTime === null
          ? item.remindAt || ""
          : new Date(originalReminderTime + delta).toISOString(),
    });
    previousTime = targetTime;
  });

  return updates;
}

export function recalculateEventPlanTimes({
  planItems = [],
  eventOperation = {},
  setup = {},
} = {}) {
  const operationalWindow = deriveEventPlanOperationalWindow(eventOperation, setup);
  const indexedItems = planItems.map((item, index) => ({ item, index }));
  const phaseBounds = {
    before: [operationalWindow.prepStartsAt, eventOperation?.startsAt],
    during: [eventOperation?.startsAt, eventOperation?.endsAt],
    after: [eventOperation?.endsAt, operationalWindow.closeEndsAt],
  };
  const updates = new Map();

  Object.entries(phaseBounds).forEach(([phase, [startAt, endAt]]) => {
    fittedPhaseTimes(
      indexedItems.filter(({ item }) => (item.phase || "before") === phase),
      startAt,
      endAt,
    ).forEach((value, key) => updates.set(key, value));
  });

  return planItems.map((item, index) => ({
    ...item,
    ...(updates.get(index) || {}),
  }));
}

function osloMinutesSinceMidnight(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: OSLO_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function validGuideRef(value) {
  return GUIDE_IDS.has(value) ? value : "";
}

function validRigRef(value) {
  return RIG_GUIDE_IDS.has(value) ? value : "";
}

function normalizedMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function venueKeysFromText(value) {
  const normalized = text(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const venues = new Set();

  if (compact.includes("workbar")) venues.add("workbar");
  if (compact.includes("cornerbar")) {
    venues.add("cornerbar");
    venues.add("bar");
  }
  if (
    !compact.includes("workbar") &&
    !compact.includes("cornerbar") &&
    /(^|[^a-z0-9])bar([^a-z0-9]|$)/.test(normalized)
  )
    venues.add("bar");
  if (compact.includes("atrium")) venues.add("atrium");
  if (compact.includes("communitystage")) venues.add("communitystage");
  if (compact.includes("loungevenue")) venues.add("loungevenue");

  return venues;
}

function detectGuestCount(combinedText) {
  const match = combinedText.match(/\b(\d{2,4})\s*(guests|people|pax|persons|deltakere|gjester)\b/i);
  return match ? Number(match[1]) : null;
}

function templateById(id) {
  return eventTaskTemplates.find((template) => template.id === id) || eventTaskTemplates[0];
}

function detectSignals({ eventOperation, linkedCalendarEvents = [], calendarSources = [] }) {
  const linkedSourceIds = new Set(
    linkedCalendarEvents.map((event) => event.sourceId).filter(Boolean),
  );
  const linkedSources = linkedSourceIds.size
    ? calendarSources.filter((source) => linkedSourceIds.has(source.id))
    : [];
  const linkedText = linkedCalendarEvents
    .map((event) => [event.title, event.description, event.location, event.sourceName].join(" "))
    .join(" ");
  const combinedText = text([
    eventOperation?.title,
    eventOperation?.venue,
    eventOperation?.description,
    eventOperation?.notes,
    linkedText,
    linkedSources.map((source) => [source.name, source.calendarId].join(" ")).join(" "),
  ].join(" "));
  const venueCandidates = [
    eventOperation?.title,
    eventOperation?.venue,
    eventOperation?.description,
    ...linkedCalendarEvents.flatMap((event) => [
      event.title,
      event.description,
      event.location,
      event.sourceName,
    ]),
    ...linkedSources.flatMap((source) => [source.name, source.calendarId]),
  ];
  const venues = new Set();
  venueCandidates.forEach((candidate) => {
    venueKeysFromText(candidate).forEach((venue) => venues.add(venue));
  });
  const keywords = Object.fromEntries(
    Object.entries(keywordGroups).map(([group, words]) => [
      group,
      words.filter((word) => combinedText.includes(word)),
    ]),
  );
  const guestCount = detectGuestCount(combinedText);
  const capacity = Math.max(
    0,
    ...linkedSources.map((source) => Number(source.settings?.venueCapacity || 0)),
  );
  const linkedResourceCount = linkedCalendarEvents.length;
  const barResourceCount = linkedCalendarEvents.filter((event) => {
    const resourceVenues = new Set([
      ...venueKeysFromText(event.sourceName),
      ...venueKeysFromText(event.location),
    ]);
    return resourceVenues.has("bar") || resourceVenues.has("cornerbar");
  }).length;
  const capacityHasContext =
    keywords.catering.length > 0 ||
    keywords.social.length > 0 ||
    keywords.tech.length > 0 ||
    keywords.football.length > 0 ||
    keywords.rigging.length > 0 ||
    venues.has("bar") ||
    venues.has("communitystage");
  const knownGuestCountLarge = guestCount !== null && guestCount >= 100;
  const multipleLinkedResources = linkedResourceCount >= 3;
  const highCapacityWithContext = capacity >= 150 && capacityHasContext;
  const startMinutes = osloMinutesSinceMidnight(
    eventOperation?.startsAt || linkedCalendarEvents[0]?.startsAt,
  );
  const endMinutes = osloMinutesSinceMidnight(
    eventOperation?.endsAt || linkedCalendarEvents[0]?.endsAt,
  );
  return {
    combinedText,
    venues: Array.from(venues),
    keywords,
    guestCount,
    capacity,
    linkedResourceCount,
    linkedSourceCount: linkedSources.length,
    barResourceCount,
    knownGuestCountLarge,
    multipleLinkedResources,
    highCapacityWithContext,
    largeEventSignal: knownGuestCountLarge || multipleLinkedResources || highCapacityWithContext,
    startsAfter17: startMinutes !== null ? startMinutes >= 17 * 60 : false,
    daytime: startMinutes !== null ? startMinutes >= 7 * 60 && startMinutes < 17 * 60 : false,
    endsLate: endMinutes !== null ? endMinutes >= 21 * 60 : false,
    timeZone: OSLO_TIME_ZONE,
  };
}

function chooseTemplate(signals) {
  const reasons = [];
  let id = TEMPLATE_IDS.general;
  let confidence = 0.48;
  if (signals.keywords.football.length) {
    id = TEMPLATE_IDS.football;
    confidence = 0.86;
    reasons.push("Football/screening language detected.");
  } else if (signals.largeEventSignal) {
    id = TEMPLATE_IDS.large;
    confidence = 0.82;
    if (signals.knownGuestCountLarge) reasons.push("Known guest count indicates a large event.");
    if (signals.multipleLinkedResources) reasons.push("Multiple linked resources indicate a multi-zone event.");
    if (signals.highCapacityWithContext)
      reasons.push("High venue capacity is combined with service, social, stage or technical signals.");
  } else if (signals.venues.includes("atrium") && (signals.keywords.social.length || signals.venues.includes("bar"))) {
    id = TEMPLATE_IDS.atrium;
    confidence = 0.78;
    reasons.push("Atrium and bar/social service signals detected.");
  } else if (signals.venues.includes("bar") && signals.keywords.social.length) {
    id = TEMPLATE_IDS.cornerbar;
    confidence = 0.74;
    reasons.push("Bar service signals detected.");
  } else if (signals.keywords.conference.length || signals.daytime) {
    id = TEMPLATE_IDS.conference;
    confidence = signals.keywords.conference.length ? 0.78 : 0.64;
    reasons.push("Conference/daytime event signals detected.");
  } else if (signals.startsAfter17 || signals.keywords.social.length) {
    id = TEMPLATE_IDS.afterwork;
    confidence = 0.7;
    reasons.push("Evening or mingling/afterwork signals detected.");
  } else {
    reasons.push("Not enough specific signals, using the general event routine.");
  }
  if (signals.guestCount !== null) reasons.push(`Known guest count: ${signals.guestCount}.`);
  if (signals.capacity > 0) reasons.push(`Venue maximum capacity: ${signals.capacity}.`);
  if (signals.linkedResourceCount >= 3)
    reasons.push(`Multiple linked resources: ${signals.linkedResourceCount}.`);
  else if (signals.linkedResourceCount > 0)
    reasons.push(`Linked resources: ${signals.linkedResourceCount}.`);
  if (signals.guestCount === null)
    confidence = Number(Math.max(0.35, confidence - 0.08).toFixed(2));
  return { template: templateById(id), confidence, reasons };
}

function phaseForTemplateTask(task) {
  const title = text(task.title);
  if (title.includes("after") || title.includes("close") || task.offsetMinutesFromEnd !== undefined) return "after";
  if (title.includes("during") || (task.offsetMinutesFromStart || 0) >= 0) return "during";
  return "before";
}

function buildPlanItem(task, template, eventOperation, index) {
  const start = eventOperation?.startsAt || "";
  const end = eventOperation?.endsAt || "";
  const metadata = normalizedMetadata(task.metadata);
  const audience =
    task.audience ||
    metadata.audience ||
    (task.assignedRoleKey === "all_event_staff" ? "all_event_staff" : "");
  const dueAt =
    task.offsetMinutesFromStart !== undefined
      ? addMinutes(start, task.offsetMinutesFromStart)
      : task.offsetMinutesFromEnd !== undefined
      ? addMinutes(end, task.offsetMinutesFromEnd)
      : "";
  const remindAt = dueAt && task.remindMinutesBefore ? addMinutes(dueAt, -task.remindMinutesBefore) : "";
  return {
    planItemId: `${template.id}:${task.id || index}`,
    title: task.title,
    description: task.description || "",
    phase: phaseForTemplateTask(task),
    zone: task.zone || "all",
    assignedRoleKey: task.assignedRoleKey || "",
    audience,
    priority: task.priority || "normal",
    dueAt,
    remindAt,
    included: true,
    sourceTemplateId: template.id,
    sourceTemplateTaskId: task.id || "",
    guideRef: validGuideRef(task.guideRef || metadata.guideRef),
    rigRef: validRigRef(task.rigRef || metadata.rigRef),
    metadata: audience ? { ...metadata, audience } : metadata,
  };
}

function setupFromSignals(signals, template, eventOperation) {
  const recommendedRoles = new Set(template.suggestedRoles || ["Event Floor Manager"]);
  const prepRecommendationReasons = [];
  if (signals.knownGuestCountLarge) prepRecommendationReasons.push("large attendance");
  if (signals.multipleLinkedResources) prepRecommendationReasons.push("several linked zones");
  if (signals.keywords.catering.length) prepRecommendationReasons.push("food or catering setup");
  if (signals.keywords.tech.length || signals.venues.includes("communitystage"))
    prepRecommendationReasons.push("stage or technical setup");
  if (signals.barResourceCount >= 2) prepRecommendationReasons.push("multiple bars");
  if (signals.keywords.rigging.length) prepRecommendationReasons.push("furniture or rigging work");
  const recommendedPrepMinutes = prepRecommendationReasons.length ? 90 : DEFAULT_PREP_MINUTES;
  if (signals.largeEventSignal) {
    recommendedRoles.add("Headrunner");
    recommendedRoles.add("Runners");
  }
  if (signals.venues.includes("atrium")) recommendedRoles.add("Atrium Manager");
  if (signals.venues.includes("workbar")) recommendedRoles.add("Workbar Manager");
  if (signals.venues.includes("bar")) recommendedRoles.add("Bar Staff");
  return {
    ...deriveEventPlanOperationalWindow(
      eventOperation,
      {
        prepMinutesBefore: DEFAULT_PREP_MINUTES,
        closeMinutesAfter: DEFAULT_CLOSE_MINUTES,
      },
      { recalculateBounds: true },
    ),
    activeZones: signals.venues.length ? signals.venues : ["all"],
    runnersRecommended: signals.largeEventSignal,
    coffeeWater: signals.keywords.catering.length > 0 || signals.keywords.conference.length > 0,
    foodCatering: signals.keywords.catering.length > 0,
    techPresentation: signals.keywords.tech.length > 0 || signals.keywords.conference.length > 0,
    recommendedRoles: Array.from(recommendedRoles),
    recommendedPrepMinutes,
    prepRecommendationReasons,
  };
}

function buildWarnings(signals, roleAssignments = []) {
  const assignedRoles = new Set(roleAssignments.filter((item) => item.active !== false).map((item) => item.roleKey));
  const warnings = [];
  if (signals.guestCount === null && signals.capacity > 0)
    warnings.push(`Guest count not found. Venue maximum capacity is ${signals.capacity}, not a confirmed guest count.`);
  else if (signals.guestCount === null) warnings.push("Guest count not found.");
  if (signals.keywords.catering.length === 0) warnings.push("Food/catering not confirmed.");
  if (!assignedRoles.has("event_floor_manager")) warnings.push("No Event Floor Manager assigned.");
  if (signals.largeEventSignal && !assignedRoles.has("headrunner"))
    warnings.push("Known attendance, linked resources or contextual capacity signals may need a Headrunner and runners.");
  if (signals.venues.includes("atrium") && !assignedRoles.has("atrium_manager"))
    warnings.push("Event uses Atrium but no Atrium Manager is assigned.");
  if (signals.endsLate) warnings.push("Event may end after normal Workbar hours.");
  if (signals.keywords.tech.length && !assignedRoles.has("support")) warnings.push("Technical setup is mentioned; confirm support owner.");
  return warnings;
}

export function suggestEventPlan({
  eventOperation,
  linkedCalendarEvents = [],
  calendarSources = [],
  roleAssignments = [],
  existingTasks = [],
} = {}) {
  const signals = detectSignals({ eventOperation, linkedCalendarEvents, calendarSources });
  const { template, confidence, reasons } = chooseTemplate(signals);
  const rigRefs = rigGuidesForSignals({
    venues: signals.venues,
    keywords: [
      ...Object.values(signals.keywords).flat(),
      ...Object.entries(signals.keywords)
        .filter(([, matches]) => matches.length > 0)
        .map(([group]) => group),
    ],
    zones: [template.id],
  });
  const warnings = buildWarnings(signals, roleAssignments);
  const setup = setupFromSignals(signals, template, eventOperation);
  const planItems = (template.tasks || []).map((task, index) =>
    buildPlanItem(task, template, eventOperation, index),
  );
  if (signals.keywords.tech.length && !existingTasks.some((task) => text(task.title).includes("tech"))) {
    planItems.push({
      planItemId: `${template.id}:smart-tech-check`,
      title: "SMART: Confirm technical setup owner",
      description: "Calendar text mentions technical setup. Confirm screen, microphone, sound and adapters before client arrival.",
      phase: "before",
      zone: "all",
      assignedRoleKey: "support",
      audience: "",
      priority: "important",
      dueAt: addMinutes(eventOperation?.startsAt, -50),
      remindAt: addMinutes(eventOperation?.startsAt, -60),
      included: true,
      sourceTemplateId: template.id,
      sourceTemplateTaskId: "smart-tech-check",
      guideRef: validGuideRef("technical-equipment-standard"),
      rigRef: validRigRef(
        signals.venues.includes("communitystage")
          ? "communitystage-presentation"
          : signals.venues.includes("workbar")
            ? "workbar-conference-setup"
            : "",
      ),
      metadata: { generatedFromSignal: "technical_setup" },
    });
  }
  return {
    suggestedTemplateId: template.id,
    title: template.title,
    confidence,
    detectedSignals: {
      venues: signals.venues,
      keywords: signals.keywords,
      guestCount: signals.guestCount,
      capacity: signals.capacity,
      linkedResourceCount: signals.linkedResourceCount,
      linkedSourceCount: signals.linkedSourceCount,
      barResourceCount: signals.barResourceCount,
      knownGuestCountLarge: signals.knownGuestCountLarge,
      multipleLinkedResources: signals.multipleLinkedResources,
      highCapacityWithContext: signals.highCapacityWithContext,
      startsAfter17: signals.startsAfter17,
      endsLate: signals.endsLate,
      timeZone: signals.timeZone,
    },
    rationale: [...reasons, ...signals.venues.map((venue) => `${venue} resource detected.`)],
    setup,
    planItems: recalculateEventPlanTimes({ planItems, eventOperation, setup }),
    guideRefs: ["how-to-use-run-sheets", "how-event-mode-works"].filter((id) => GUIDE_IDS.has(id)),
    rigRefs: rigRefs.map((guide) => guide.id),
    warnings,
  };
}
