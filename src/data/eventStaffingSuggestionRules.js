const RULE_VERSION = "2026-07-h3";
const OSLO_TIME_ZONE = "Europe/Oslo";

export const staffingRoleOptions = [
  { key: "event_floor_manager", label: "Event Floor Manager", zone: "all", singleLead: true },
  { key: "cornerbar_manager", label: "Cornerbar Manager", zone: "cornerbar", singleLead: true },
  { key: "atrium_manager", label: "Atrium Manager", zone: "atrium", singleLead: true },
  { key: "workbar_manager", label: "Workbar Manager", zone: "workbar", singleLead: true },
  { key: "headrunner", label: "Headrunner", zone: "runners", singleLead: true },
  { key: "runner", label: "Runner", zone: "runners" },
  { key: "cornerbar_staff", label: "Cornerbar Staff", zone: "cornerbar" },
  { key: "atrium_staff", label: "Atrium Staff", zone: "atrium" },
  { key: "workbar_staff", label: "Workbar Staff", zone: "workbar" },
  { key: "bar_staff", label: "Bar Staff", zone: "bar" },
  { key: "support", label: "Support", zone: "support" },
  { key: "other", label: "Other", zone: "other" },
];

const ROLE_BY_KEY = Object.fromEntries(staffingRoleOptions.map((role) => [role.key, role]));
const KNOWN_ZONES = new Set([
  "all",
  "workbar",
  "cornerbar",
  "atrium",
  "bar",
  "runners",
  "support",
  "other",
  "backstage",
  "project_rooms",
]);

const segmentDefinitions = [
  { type: "setup", title: "Setup", terms: ["rigg", "rigging", "setup", "set up"], zones: ["all"] },
  { type: "soundcheck", title: "Soundcheck", terms: ["lydprøve", "lydprove", "soundcheck", "sound check"], zones: ["backstage"] },
  { type: "registration", title: "Registration", terms: ["registrering", "registration", "check-in", "check in", "guest list", "gjesteliste"], zones: ["all"] },
  { type: "doors", title: "Doors open", terms: ["dørene åpner", "dorene apner", "doors open", "doors"], zones: ["all"] },
  { type: "guest_arrival", title: "Guest arrival", terms: ["gjesteankomst", "guest arrival", "arrival", "ankomst"], zones: ["all"] },
  { type: "presentation", title: "Presentation", terms: ["presentasjon", "presentation", "speaker", "foredrag"], zones: ["all"] },
  { type: "break", title: "Break", terms: ["pause", "break", "coffee break", "kaffepause"], zones: ["support"] },
  { type: "lunch", title: "Lunch", terms: ["lunsj", "lunch"], zones: ["support"] },
  { type: "dinner", title: "Dinner", terms: ["middag", "dinner", "buffet"], zones: ["support"] },
  { type: "bar_open", title: "Bar opens", terms: ["bar opens", "baren åpner", "baren apner"], zones: ["bar"] },
  { type: "last_service", title: "Last serving", terms: ["last serving", "siste servering", "last call"], zones: ["bar"] },
  { type: "cleanup", title: "Cleanup", terms: ["rydde", "cleanup", "clean up", "nedrigg", "teardown"], zones: ["support"] },
  { type: "event_end", title: "Event ends", terms: ["event ends", "arrangement slutt", "closing", "close"], zones: ["all"] },
];

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedName(value) {
  return normalizedText(value);
}

function validDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function osloParts(value) {
  const date = validDate(value);
  if (!date) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: OSLO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function isoForOsloClock(referenceIso, hour, minute) {
  const reference = validDate(referenceIso);
  const parts = osloParts(referenceIso);
  if (!reference || !parts) return "";
  const referenceMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const targetMinutes = hour * 60 + minute;
  const result = new Date(reference.getTime() + (targetMinutes - referenceMinutes) * 60000);
  return result.toISOString();
}

function clampToWindow(value, startsAt, endsAt) {
  const date = validDate(value);
  const start = validDate(startsAt);
  const end = validDate(endsAt);
  if (!date) return "";
  if (start && date < start) return start.toISOString();
  if (end && date > end) return end.toISOString();
  return date.toISOString();
}

function addMinutes(value, minutes) {
  const date = validDate(value);
  return date ? new Date(date.getTime() + minutes * 60000).toISOString() : "";
}

function eventText(eventOperation, linkedCalendarEvents, linkedCalendarSources) {
  return [
    eventOperation?.title,
    eventOperation?.venue,
    eventOperation?.description,
    eventOperation?.notes,
    ...linkedCalendarEvents.flatMap((event) => [
      event.title,
      event.description,
      event.location,
      event.sourceName,
    ]),
    ...linkedCalendarSources.flatMap((source) => [source.name, source.calendarId]),
  ]
    .filter(Boolean)
    .join("\n");
}

export function detectStaffingGuestCount(value) {
  const text = normalizedText(value);
  const patterns = [
    /\b(\d{1,4})\s*(?:guests?|people|persons?|pax|gjester|deltakere)\b/i,
    /\b(?:guests?|people|persons?|pax|gjester|deltakere|attendance)\s*[:=-]?\s*(\d{1,4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { count: Number(match[1]), source: "calendar_text" };
  }
  return { count: null, source: "unknown" };
}

function detectZones(eventOperation, linkedCalendarEvents, linkedCalendarSources, text) {
  const zones = new Set();
  const candidates = [
    eventOperation?.venue,
    ...linkedCalendarEvents.flatMap((event) => [event.location, event.sourceName, event.title]),
    ...linkedCalendarSources.flatMap((source) => [source.name, source.calendarId]),
  ].map(normalizedText);
  const explicitText = normalizedText(text);

  candidates.forEach((candidate) => {
    const compact = candidate.replace(/[^a-z0-9]/g, "");
    if (compact.includes("workbar")) zones.add("workbar");
    if (compact.includes("cornerbar")) zones.add("cornerbar");
    else if (!compact.includes("workbar") && /(^|[^a-z])bar([^a-z]|$)/.test(candidate)) zones.add("bar");
    if (compact.includes("atrium")) zones.add("atrium");
    if (compact.includes("communitystage")) zones.add("backstage");
    if (compact.includes("projectroom") || compact.includes("meetingroom")) zones.add("project_rooms");
  });

  if (/\bcornerbar\b/.test(explicitText)) zones.add("cornerbar");
  if (/\batrium\b/.test(explicitText)) zones.add("atrium");
  if (/\bcommunity\s*stage\b|\bscene\b|\bstage\b/.test(explicitText)) zones.add("backstage");
  if (/\bbar opens\b|\bbaren åpner\b|\bbar service\b|\bcocktails?\b/.test(explicitText)) zones.add("bar");
  return [...zones].filter((zone) => KNOWN_ZONES.has(zone));
}

export function parseEventScheduleSegments({ text = "", eventOperation = {}, operationalWindow = {} } = {}) {
  const reference = eventOperation.startsAt || operationalWindow.prepStartsAt;
  const windowStart = operationalWindow.prepStartsAt || eventOperation.startsAt;
  const windowEnd = operationalWindow.closeEndsAt || eventOperation.endsAt;
  if (!reference) return [];
  const segments = [];
  const lines = String(text || "").split(/\r?\n|[;|]/).map((line) => line.trim()).filter(Boolean);

  lines.forEach((line) => {
    const match = line.match(/(?:^|\s)([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s|\-|$)(.*)/i);
    if (!match) return;
    const remainder = normalizedText(match[3] || line);
    const definition = segmentDefinitions.find((candidate) =>
      candidate.terms.some((term) => remainder.includes(term)),
    );
    if (!definition) return;
    const startsAt = clampToWindow(
      isoForOsloClock(reference, Number(match[1]), Number(match[2])),
      windowStart,
      windowEnd,
    );
    if (!startsAt) return;
    const clock = `${String(match[1]).padStart(2, "0")}${match[2]}`;
    segments.push({
      segmentId: `${definition.type}-${clock}`,
      type: definition.type,
      title: definition.title,
      startsAt,
      endsAt: "",
      zones: [...definition.zones],
      signals: definition.terms.filter((term) => remainder.includes(term)),
    });
  });

  return segments
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((segment, index, list) => ({
      ...segment,
      endsAt: list[index + 1]?.startsAt || "",
    }));
}

function peopleForGuestCount(guestCount) {
  if (!Number.isFinite(guestCount)) return 1;
  if (guestCount <= 40) return 1;
  if (guestCount <= 90) return 2;
  if (guestCount <= 150) return 3;
  return 3 + Math.ceil((guestCount - 150) / 60);
}

export function eventStaffingEffectiveZone(roleKey, zone = "") {
  const requestedZone = normalizedText(zone);
  const validZone = KNOWN_ZONES.has(requestedZone) ? requestedZone : "";
  if (["headrunner", "runner"].includes(roleKey)) return "runners";
  if (["workbar_manager", "workbar_staff"].includes(roleKey)) return "workbar";
  if (["atrium_manager", "atrium_staff"].includes(roleKey)) return "atrium";
  if (["cornerbar_manager", "cornerbar_staff"].includes(roleKey)) return "cornerbar";
  if (roleKey === "bar_staff") return validZone || "bar";
  if (roleKey === "support") return validZone || "support";
  if (roleKey === "other") return validZone || "other";
  return validZone || ROLE_BY_KEY[roleKey]?.zone || "all";
}

function assignmentZone(assignment) {
  return eventStaffingEffectiveZone(assignment?.roleKey, assignment?.zone);
}

export function staffingProfileAuthUserId(profile = {}) {
  return String(profile.authUserId || profile.auth_user_id || "").trim();
}

export function staffingProfileId(profile = {}) {
  return String(profile.profileId || profile.profile_id || profile.id || "").trim();
}

export function staffingProfileDisplayName(profile = {}) {
  return String(profile.displayName || profile.display_name || "").trim();
}

export function isAssignableStaffProfile(profile = {}, organizationId = "") {
  const profileOrganizationId = String(profile.organizationId || profile.organization_id || "").trim();
  return (
    profile.active !== false &&
    profile.isSharedDevice !== true &&
    profile.is_shared_device !== true &&
    Boolean(staffingProfileAuthUserId(profile)) &&
    Boolean(staffingProfileDisplayName(profile)) &&
    (!organizationId || profileOrganizationId === organizationId)
  );
}

export function staffProfileMatchesSearch(profile = {}, search = "") {
  const query = normalizedText(search);
  if (!query) return true;
  return normalizedText(`${staffingProfileDisplayName(profile)} ${profile.email || ""}`).includes(query);
}

export function staffingAssignmentMatchesProfile(assignment, requirement, profile) {
  if (!assignment?.active || assignment.roleKey !== requirement?.roleKey) return false;
  if (assignmentZone(assignment) !== requirement?.zoneKey) return false;
  const assignmentAuthUserId = String(assignment.assignedAuthUserId || "").trim();
  const profileAuthUserId = staffingProfileAuthUserId(profile);
  if (assignmentAuthUserId && profileAuthUserId) return assignmentAuthUserId === profileAuthUserId;
  if (assignmentAuthUserId || !profileAuthUserId) return false;
  const assignmentName = normalizedName(assignment.assignedOperatorName);
  return Boolean(
    assignmentName &&
    assignmentName === normalizedName(staffingProfileDisplayName(profile)),
  );
}

export function normalizeStaffingProposalAssignedAuthUserIds(proposal = {}, profiles = []) {
  const profileByEitherId = new Map();
  profiles.forEach((profile) => {
    const authUserId = staffingProfileAuthUserId(profile);
    const profileId = staffingProfileId(profile);
    if (authUserId) profileByEitherId.set(authUserId, authUserId);
    if (profileId && authUserId) profileByEitherId.set(profileId, authUserId);
  });
  return {
    ...proposal,
    requirements: (proposal.requirements || []).map((requirement) => ({
      ...requirement,
      assignedUserIds: [...new Set(
        (requirement.assignedUserIds || []).map((id) => profileByEitherId.get(id) || id).filter(Boolean),
      )],
    })),
  };
}

export function staffingAssignmentAction(assignments = [], requirement = {}, profile = {}, singleLead = false) {
  const exact = assignments.find((assignment) =>
    staffingAssignmentMatchesProfile(assignment, requirement, profile),
  );
  if (exact) return { action: "reuse", assignment: exact };
  if (singleLead) {
    const occupied = assignments.find(
      (assignment) => assignment.active && assignment.roleKey === requirement.roleKey,
    );
    if (occupied) return { action: "conflict", assignment: occupied };
  }
  return { action: "create", assignment: null };
}

function assignmentMatchesIdentity(assignment, profile) {
  const assignmentAuthUserId = String(assignment?.assignedAuthUserId || "").trim();
  const profileAuthUserId = staffingProfileAuthUserId(profile);
  if (assignmentAuthUserId && profileAuthUserId) return assignmentAuthUserId === profileAuthUserId;
  if (assignmentAuthUserId || !profileAuthUserId) return false;
  return Boolean(
    normalizedName(assignment?.assignedOperatorName) &&
    normalizedName(assignment.assignedOperatorName) === normalizedName(staffingProfileDisplayName(profile)),
  );
}

export function analyzeStaffingAssignmentConflicts(
  proposal = {},
  profiles = [],
  assignments = [],
  singleLeadRoleKeys = [],
) {
  const duplicateMatches = [];
  const singleLeadConflicts = [];
  const overrideWarnings = [];
  const selectedByAuthUserId = new Map();
  (proposal.requirements || []).filter((item) => item.included !== false).forEach((requirement) => {
    (requirement.assignedUserIds || []).forEach((authUserId) => {
      const profile = profiles.find((item) => staffingProfileAuthUserId(item) === authUserId);
      if (!profile) return;
      if (!selectedByAuthUserId.has(authUserId)) selectedByAuthUserId.set(authUserId, []);
      selectedByAuthUserId.get(authUserId).push(requirement);
      const action = staffingAssignmentAction(
        assignments,
        requirement,
        profile,
        singleLeadRoleKeys.includes(requirement.roleKey),
      );
      if (action.action === "reuse") {
        duplicateMatches.push({ requirementId: requirement.requirementId, authUserId, assignmentId: action.assignment.id });
      } else if (action.action === "conflict") {
        singleLeadConflicts.push({
          requirementId: requirement.requirementId,
          authUserId,
          assignmentId: action.assignment.id,
          message: `${requirement.roleLabel} is already assigned to ${action.assignment.assignedOperatorName || "another person"}.`,
        });
      }

      assignments.filter((assignment) => assignment.active && assignmentMatchesIdentity(assignment, profile)).forEach((assignment) => {
        const exactRoleZone =
          assignment.roleKey === requirement.roleKey && assignmentZone(assignment) === requirement.zoneKey;
        if (!exactRoleZone) {
          overrideWarnings.push(
            `${staffingProfileDisplayName(profile)} already has ${assignment.roleLabel || assignment.roleKey} in ${assignmentZone(assignment)} and may overlap ${requirement.roleLabel}.`,
          );
        }
      });
    });
  });

  selectedByAuthUserId.forEach((requirements, authUserId) => {
    const profile = profiles.find((item) => staffingProfileAuthUserId(item) === authUserId);
    for (let index = 0; index < requirements.length; index += 1) {
      for (let compare = index + 1; compare < requirements.length; compare += 1) {
        const first = requirements[index];
        const second = requirements[compare];
        const firstStart = validDate(first.shiftStartsAt)?.getTime() || 0;
        const firstEnd = validDate(first.shiftEndsAt)?.getTime() || 0;
        const secondStart = validDate(second.shiftStartsAt)?.getTime() || 0;
        const secondEnd = validDate(second.shiftEndsAt)?.getTime() || 0;
        const overlaps = firstStart && firstEnd && secondStart && secondEnd && firstStart < secondEnd && secondStart < firstEnd;
        const leadershipConflict =
          [first.roleKey, second.roleKey].includes("event_floor_manager") && first.zoneKey !== second.zoneKey;
        if (overlaps || leadershipConflict) {
          overrideWarnings.push(
            `${staffingProfileDisplayName(profile) || "One person"} has overlapping ${first.roleLabel} and ${second.roleLabel} roles.`,
          );
        }
      }
    }
  });
  return {
    duplicateMatches,
    singleLeadConflicts,
    overrideWarnings: [...new Set(overrideWarnings)],
  };
}

function matchingAssignments(requirement, roleAssignments) {
  return roleAssignments.filter(
    (assignment) =>
      assignment.active !== false &&
      assignment.roleKey === requirement.roleKey &&
      assignmentZone(assignment) === requirement.zoneKey,
  );
}

function requirement({
  roleKey,
  roleLabel,
  zoneKey,
  zoneLabel,
  count = 1,
  minimumCount,
  required = false,
  shiftStartsAt,
  shiftEndsAt,
  rationale = [],
  confidence = 0.7,
  sourceSignals = [],
  roleAssignments = [],
}) {
  const baseRole = ROLE_BY_KEY[roleKey];
  const normalizedZone = KNOWN_ZONES.has(zoneKey) ? zoneKey : baseRole?.zone || "all";
  const normalizedCount = baseRole?.singleLead ? 1 : Math.max(1, Math.round(count));
  const result = {
    requirementId: `${normalizedZone}:${roleKey}`,
    roleKey,
    roleLabel: roleLabel || baseRole?.label || "Other",
    zoneKey: normalizedZone,
    zoneLabel: zoneLabel || normalizedZone.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    recommendedCount: normalizedCount,
    minimumCount: Math.min(normalizedCount, minimumCount ?? (required ? 1 : 0)),
    preferredCount: normalizedCount,
    required,
    shiftStartsAt: shiftStartsAt || "",
    shiftEndsAt: shiftEndsAt || "",
    rationale,
    confidence,
    sourceSignals,
    linkedAssignmentIds: [],
    assignedUserIds: [],
    manuallyEdited: false,
    included: true,
  };
  const matches = matchingAssignments(result, roleAssignments);
  result.linkedAssignmentIds = matches.map((assignment) => assignment.id).filter(Boolean);
  result.assignedUserIds = matches.map((assignment) => assignment.assignedAuthUserId).filter(Boolean);
  return result;
}

function firstSegment(segments, types) {
  return segments.find((segment) => types.includes(segment.type));
}

export function staffingProposalStats(proposal = {}, roleAssignments = []) {
  const requirements = (proposal.requirements || []).filter((item) => item.included !== false);
  let recommended = 0;
  let assigned = 0;
  requirements.forEach((item) => {
    recommended += Number(item.recommendedCount) || 0;
    assigned += Math.min(
      Number(item.recommendedCount) || 0,
      matchingAssignments(item, roleAssignments).length,
    );
  });
  return { recommended, assigned, open: Math.max(0, recommended - assigned) };
}

export function syncStaffingProposalAssignments(proposal = {}, roleAssignments = []) {
  return {
    ...proposal,
    requirements: (proposal.requirements || []).map((item) => {
      const matches = matchingAssignments(item, roleAssignments);
      const activeMatchIds = new Set(matches.map((assignment) => assignment.id).filter(Boolean));
      return {
        ...item,
        linkedAssignmentIds: (item.linkedAssignmentIds || []).filter((id) => activeMatchIds.has(id)),
        assignedUserIds: [...new Set(item.assignedUserIds || [])],
      };
    }),
  };
}

export function mergeStaffingProposals(current = {}, suggested = {}, mode = "merge") {
  if (!current?.requirements?.length) return suggested;
  if (mode === "cancel") return current;
  const currentById = new Map(current.requirements.map((item) => [item.requirementId, item]));
  const suggestedIds = new Set(suggested.requirements.map((item) => item.requirementId));
  const merged = suggested.requirements.map((item) => {
    const existing = currentById.get(item.requirementId);
    if (!existing) return item;
    const preserve = mode === "merge" || existing.manuallyEdited;
    return preserve
      ? {
          ...item,
          ...existing,
          linkedAssignmentIds: [...new Set([...(item.linkedAssignmentIds || []), ...(existing.linkedAssignmentIds || [])])],
          assignedUserIds: [...new Set([...(item.assignedUserIds || []), ...(existing.assignedUserIds || [])])],
        }
      : item;
  });
  current.requirements.forEach((item) => {
    if (!suggestedIds.has(item.requirementId) && (item.manuallyEdited || mode === "merge")) merged.push(item);
  });
  return {
    ...suggested,
    requirements: merged,
    manuallyEdited: merged.some((item) => item.manuallyEdited),
  };
}

export function suggestEventStaffing({
  eventOperation = {},
  linkedCalendarEvents = [],
  linkedCalendarSources = [],
  eventPlan = {},
  roleAssignments = [],
  generatedAt = "",
} = {}) {
  const combinedText = eventText(eventOperation, linkedCalendarEvents, linkedCalendarSources);
  const normalized = normalizedText(combinedText);
  const guestResult = detectStaffingGuestCount(combinedText);
  const eventBoardGuestCount = Number(eventOperation?.metadata?.guestCount || eventOperation?.guestCount);
  const guestCount = guestResult.count ?? (Number.isFinite(eventBoardGuestCount) && eventBoardGuestCount > 0 ? eventBoardGuestCount : null);
  const guestCountSource = guestResult.count
    ? guestResult.source
    : guestCount
      ? "event_board"
      : "unknown";
  const operationalWindow = eventPlan?.setup || eventPlan || {};
  const prepStartsAt = operationalWindow.prepStartsAt || eventOperation.startsAt || "";
  const closeEndsAt = operationalWindow.closeEndsAt || eventOperation.endsAt || "";
  const scheduleSegments = parseEventScheduleSegments({
    text: combinedText,
    eventOperation,
    operationalWindow: { prepStartsAt, closeEndsAt },
  });
  const activeZones = detectZones(eventOperation, linkedCalendarEvents, linkedCalendarSources, combinedText);
  const requirements = [];
  const add = (values) => requirements.push(requirement({
    shiftStartsAt: prepStartsAt,
    shiftEndsAt: closeEndsAt,
    roleAssignments,
    ...values,
  }));
  const has = (...terms) => terms.some((term) => normalized.includes(term));
  const catering = has("catering", "buffet", "lunch", "lunsj", "dinner", "middag", "coffee service", "kaffeservering");
  const repeatedBreaks = (normalized.match(/coffee break|kaffepause|\bbreak\b|\bpause\b/g) || []).length > 1;
  const technical = has("microphone", "mikrofon", "projector", "screen", "soundcheck", "lydprøve", "streaming", "technical", "stage", "scene", "presentation", "presentasjon");
  const barService = activeZones.includes("bar") || activeZones.includes("cornerbar") || has("bar opens", "cocktail", "drinks", "beer", "wine");
  const cocktailHeavy = has("cocktail", "cocktails", "cocktail menu");
  const meaningfulAtriumFlow = activeZones.includes("atrium") && (catering || barService || (guestCount || 0) >= 40);
  const simpleMeeting = has("small meeting", "meeting room", "boardroom") && !catering && !barService && !technical;
  const arrival = firstSegment(scheduleSegments, ["registration", "doors", "guest_arrival"]);
  const barOpen = firstSegment(scheduleSegments, ["bar_open"]);
  const lastService = firstSegment(scheduleSegments, ["last_service"]);
  const soundcheck = firstSegment(scheduleSegments, ["soundcheck", "presentation"]);
  const foodSegment = firstSegment(scheduleSegments, ["break", "lunch", "dinner"]);

  add({
    roleKey: "event_floor_manager",
    zoneKey: "all",
    zoneLabel: "Event Floor",
    required: true,
    minimumCount: 1,
    rationale: ["Every operational event needs one overall coordinator."],
    confidence: 0.95,
    sourceSignals: ["event_board"],
  });

  if (activeZones.includes("workbar") && !simpleMeeting) {
    add({
      roleKey: "workbar_manager",
      zoneKey: "workbar",
      required: (guestCount || 0) >= 40 || catering || technical,
      rationale: ["Workbar is active with service or programme complexity."],
      sourceSignals: ["workbar", ...(catering ? ["catering"] : []), ...(technical ? ["technical"] : [])],
    });
    add({
      roleKey: "workbar_staff",
      zoneKey: "workbar",
      count: peopleForGuestCount(guestCount) + (repeatedBreaks && catering ? 1 : 0),
      minimumCount: 1,
      required: true,
      rationale: [guestCount ? `Known attendance is ${guestCount}.` : "Attendance is unknown, so the recommendation is conservative."],
      confidence: guestCount ? 0.85 : 0.55,
      sourceSignals: ["workbar", ...(guestCount ? ["known_guest_count"] : ["unknown_guest_count"])],
    });
  }

  if (barService) {
    add({
      roleKey: "cornerbar_manager",
      roleLabel: activeZones.includes("cornerbar") ? "Cornerbar Manager" : "Bar Manager",
      zoneKey: "cornerbar",
      zoneLabel: activeZones.includes("cornerbar") ? "Cornerbar" : "Bar",
      required: true,
      rationale: ["An event bar is active."],
      sourceSignals: ["bar_service"],
    });
    add({
      roleKey: activeZones.includes("cornerbar") ? "cornerbar_staff" : "bar_staff",
      roleLabel: "Bar Staff",
      zoneKey: activeZones.includes("cornerbar") ? "cornerbar" : "bar",
      zoneLabel: activeZones.includes("cornerbar") ? "Cornerbar" : "Bar",
      count: peopleForGuestCount(guestCount) + (cocktailHeavy ? 1 : 0),
      minimumCount: 1,
      required: true,
      shiftStartsAt: addMinutes(barOpen?.startsAt || eventOperation.startsAt || prepStartsAt, -30),
      shiftEndsAt: addMinutes(lastService?.startsAt || eventOperation.endsAt || closeEndsAt, 30),
      rationale: [guestCount ? `Bar staffing uses the known attendance of ${guestCount}.` : "Bar service is confirmed, but attendance is unknown."],
      confidence: guestCount ? 0.85 : 0.6,
      sourceSignals: ["bar_service", ...(cocktailHeavy ? ["cocktail_service"] : [])],
    });
  }

  if (activeZones.includes("atrium")) {
    if (meaningfulAtriumFlow) add({
      roleKey: "atrium_manager",
      zoneKey: "atrium",
      required: (guestCount || 0) >= 60,
      rationale: ["Atrium has meaningful guest flow or service activity."],
      sourceSignals: ["atrium", "guest_flow"],
    });
    add({
      roleKey: "atrium_staff",
      zoneKey: "atrium",
      count: guestCount ? Math.max(1, Math.ceil(guestCount / 70)) : 1,
      minimumCount: meaningfulAtriumFlow ? 1 : 0,
      required: meaningfulAtriumFlow,
      rationale: [guestCount ? "Atrium staffing is scaled at roughly one person per 70 guests." : "Atrium is active; attendance is unknown."],
      confidence: guestCount ? 0.8 : 0.5,
      sourceSignals: ["atrium"],
    });
  }

  const coordinationZones = activeZones.filter((zone) => !["project_rooms", "support", "other"].includes(zone));
  const complexLogistics = coordinationZones.length >= 3 || (guestCount || 0) >= 100 || (technical && barService && catering);
  if (complexLogistics) add({
    roleKey: "headrunner",
    zoneKey: "runners",
    required: true,
    shiftStartsAt: addMinutes(arrival?.startsAt || eventOperation.startsAt || prepStartsAt, -45),
    rationale: ["Guest volume or multi-zone complexity needs runner coordination."],
    sourceSignals: [coordinationZones.length >= 3 ? "three_or_more_zones" : "high_complexity"],
  });
  if (!simpleMeeting && (coordinationZones.length >= 2 || (guestCount || 0) >= 75 || catering)) add({
    roleKey: "runner",
    zoneKey: "runners",
    count: Math.max(1, guestCount ? Math.ceil(guestCount / 90) : coordinationZones.length - 1),
    minimumCount: coordinationZones.length >= 2 ? 1 : 0,
    required: coordinationZones.length >= 2,
    shiftStartsAt: addMinutes(arrival?.startsAt || eventOperation.startsAt || prepStartsAt, -30),
    rationale: ["Guest flow, replenishment or movement between zones needs runner coverage."],
    confidence: guestCount || coordinationZones.length >= 2 ? 0.8 : 0.55,
    sourceSignals: ["logistics"],
  });

  if (catering) add({
    roleKey: "support",
    roleLabel: "Support / Catering",
    zoneKey: "support",
    count: guestCount && guestCount > 120 ? 2 : 1,
    minimumCount: 1,
    required: true,
    shiftStartsAt: addMinutes(foodSegment?.startsAt || eventOperation.startsAt || prepStartsAt, -45),
    shiftEndsAt: addMinutes(foodSegment?.endsAt || eventOperation.endsAt || closeEndsAt, 30),
    rationale: ["Food, buffet or repeated coffee service is confirmed."],
    sourceSignals: ["catering"],
  });
  if (technical) add({
    roleKey: "support",
    roleLabel: "Technical Support",
    zoneKey: "backstage",
    zoneLabel: "Stage / Technical",
    count: 1,
    minimumCount: 1,
    required: true,
    shiftStartsAt: addMinutes(soundcheck?.startsAt || eventOperation.startsAt || prepStartsAt, -45),
    shiftEndsAt: soundcheck?.endsAt || eventOperation.endsAt || closeEndsAt,
    rationale: ["Presentation, stage or AV setup is mentioned."],
    confidence: 0.75,
    sourceSignals: ["technical"],
  });
  if (arrival || has("tickets", "ticket", "controlled arrival")) add({
    roleKey: "other",
    roleLabel: "Door Host / Reception",
    zoneKey: "all",
    count: guestCount && guestCount >= 100 ? 2 : 1,
    minimumCount: 1,
    required: true,
    shiftStartsAt: addMinutes(arrival?.startsAt || eventOperation.startsAt || prepStartsAt, -30),
    shiftEndsAt: addMinutes(arrival?.startsAt || eventOperation.startsAt || prepStartsAt, 60),
    rationale: ["A controlled arrival or registration window is part of the run of show."],
    sourceSignals: ["guest_arrival"],
  });

  requirements.forEach((item) => {
    const start = validDate(item.shiftStartsAt);
    const end = validDate(item.shiftEndsAt);
    item.shiftStartsAt = clampToWindow(item.shiftStartsAt, prepStartsAt, closeEndsAt);
    item.shiftEndsAt = clampToWindow(item.shiftEndsAt, prepStartsAt, closeEndsAt);
    if (start && end && end < start) item.shiftEndsAt = item.shiftStartsAt;
  });

  const warnings = [];
  if (!guestCount) warnings.push("Guest count not found; staffing is based on event type and linked zones.");
  const capacity = Math.max(0, ...linkedCalendarSources.map((source) => Number(source.settings?.venueCapacity || 0)));
  if (capacity && !guestCount) warnings.push(`Venue capacity is ${capacity}, but actual attendance is unknown.`);
  if (!matchingAssignments(requirements[0], roleAssignments).length) warnings.push("No Event Floor Manager is assigned.");
  if (complexLogistics && !roleAssignments.some((assignment) => assignment.active !== false && assignment.roleKey === "headrunner"))
    warnings.push("Three active zones or high complexity are detected, but no Headrunner is assigned.");
  if (technical && !roleAssignments.some((assignment) => assignment.active !== false && assignment.roleKey === "support" && assignmentZone(assignment) === "backstage"))
    warnings.push("Technical programme is mentioned, but no technical support is assigned.");

  return {
    version: 1,
    generatedAt: generatedAt || eventPlan?.generatedAt || eventOperation?.updatedAt || eventOperation?.createdAt || "",
    ruleVersion: RULE_VERSION,
    guestCount,
    guestCountSource,
    activeZones,
    scheduleSegments,
    requirements,
    rationale: [
      guestCount ? `Staffing uses a known guest count of ${guestCount}.` : "Staffing uses incomplete attendance information.",
      activeZones.length ? `Active zones: ${activeZones.join(", ")}.` : "No specific service zone was confidently detected.",
    ],
    warnings,
    confidence: guestCount ? 0.82 : activeZones.length ? 0.62 : 0.45,
    manuallyEdited: false,
  };
}

export function runEventStaffingRuleChecks() {
  const event = (title, venue, description, guests = "") => ({
    title,
    venue,
    description: `${description} ${guests}`.trim(),
    startsAt: "2026-07-20T16:00:00.000Z",
    endsAt: "2026-07-20T21:00:00.000Z",
  });
  const plan = { setup: { prepStartsAt: "2026-07-20T15:00:00.000Z", closeEndsAt: "2026-07-20T22:00:00.000Z" } };
  const scenarios = [
    ["A", event("Presentation", "MY-1-Workbar", "coffee and screen", "30 guests"), ["event_floor_manager", "workbar_manager", "workbar_staff", "support"], ["cornerbar_manager"]],
    ["B", event("Afterwork", "MY-1-Bar", "drinks and mingling", "80 guests"), ["event_floor_manager", "cornerbar_manager", "bar_staff"], ["workbar_manager"]],
    ["C", event("Large event", "Atrium, Bar and CommunityStage", "buffet presentation drinks", "180 guests"), ["event_floor_manager", "atrium_manager", "headrunner", "runner", "support"], []],
    ["D", event("Small meeting", "Meeting room", "simple room booking"), ["event_floor_manager"], ["runner", "headrunner"]],
    ["E", event("Small event", "Workbar", "20 guests"), ["workbar_staff"], []],
    ["F", event("Workbar booking", "MY-1-Workbar", "conference 30 guests"), ["workbar_manager"], ["cornerbar_manager", "bar_staff"]],
  ];
  const results = scenarios.map(([id, eventOperation, expected, absent]) => {
    const result = suggestEventStaffing({
      eventOperation,
      eventPlan: plan,
      linkedCalendarSources: id === "E" ? [{ name: "Workbar", settings: { venueCapacity: 200 } }] : [],
      generatedAt: "2026-07-01T00:00:00.000Z",
    });
    const roles = result.requirements.map((item) => item.roleKey);
    const workbarCount = result.requirements.find((item) => item.roleKey === "workbar_staff")?.recommendedCount;
    return {
      id,
      passed:
        expected.every((role) => roles.includes(role)) &&
        absent.every((role) => !roles.includes(role)) &&
        (id !== "E" || (result.guestCount === 20 && workbarCount === 1)),
      roles,
    };
  });
  const existingAssignment = {
    id: "assignment-1",
    active: true,
    roleKey: "workbar_staff",
    zone: "workbar",
    assignedAuthUserId: "profile-1",
  };
  const scenarioG = suggestEventStaffing({
    eventOperation: event("Conference", "Workbar", "presentation", "30 guests"),
    eventPlan: plan,
    roleAssignments: [existingAssignment],
    generatedAt: "2026-07-01T00:00:00.000Z",
  });
  const workbarRequirement = scenarioG.requirements.find((item) => item.roleKey === "workbar_staff");
  results.push({
    id: "G",
    passed:
      workbarRequirement?.linkedAssignmentIds?.includes(existingAssignment.id) &&
      staffingProposalStats(scenarioG, [existingAssignment]).assigned === 1,
    roles: scenarioG.requirements.map((item) => item.roleKey),
  });
  return results;
}

export function runStaffingIdentityRuleChecks() {
  const requirement = {
    requirementId: "runners:runner",
    roleKey: "runner",
    roleLabel: "Runner",
    zoneKey: "runners",
    shiftStartsAt: "2026-07-20T16:00:00.000Z",
    shiftEndsAt: "2026-07-20T20:00:00.000Z",
    included: true,
    assignedUserIds: [],
  };
  const bobby = {
    profileId: "10000000-0000-0000-0000-000000000001",
    authUserId: "20000000-0000-0000-0000-000000000001",
    displayName: "Same Name",
    email: "bobby@example.com",
    organizationId: "30000000-0000-0000-0000-000000000001",
    active: true,
  };
  const julie = {
    profileId: "10000000-0000-0000-0000-000000000002",
    authUserId: "20000000-0000-0000-0000-000000000002",
    displayName: "Same Name",
    email: "julie@example.com",
    organizationId: bobby.organizationId,
    active: true,
  };
  const bobbyRunner = {
    id: "assignment-bobby-runner",
    active: true,
    roleKey: "runner",
    roleLabel: "Runner",
    zone: "runners",
    assignedAuthUserId: bobby.authUserId,
    assignedOperatorName: bobby.displayName,
  };
  const normalizedProposal = normalizeStaffingProposalAssignedAuthUserIds({
    requirements: [{ ...requirement, assignedUserIds: [bobby.profileId] }],
  }, [bobby]);
  const occupiedLead = {
    id: "assignment-bobby-lead",
    active: true,
    roleKey: "event_floor_manager",
    roleLabel: "Event Floor Manager",
    zone: "all",
    assignedAuthUserId: bobby.authUserId,
    assignedOperatorName: "Bobby",
  };
  const leadRequirement = {
    ...requirement,
    requirementId: "all:event_floor_manager",
    roleKey: "event_floor_manager",
    roleLabel: "Event Floor Manager",
    zoneKey: "all",
    assignedUserIds: [julie.authUserId],
  };
  const externalAssignment = {
    id: "assignment-other-zone",
    active: true,
    roleKey: "workbar_staff",
    roleLabel: "Workbar Staff",
    zone: "workbar",
    assignedAuthUserId: bobby.authUserId,
    assignedOperatorName: bobby.displayName,
  };
  const sharedDevice = {
    ...bobby,
    profileId: "10000000-0000-0000-0000-000000000003",
    authUserId: "20000000-0000-0000-0000-000000000003",
    displayName: "Workbar Device",
    isSharedDevice: true,
  };
  const firstAction = staffingAssignmentAction([], requirement, bobby, false);
  const createdAssignment = {
    ...bobbyRunner,
    id: "assignment-created-once",
  };
  const secondAction = staffingAssignmentAction([createdAssignment], requirement, bobby, false);
  const commandConflict = analyzeStaffingAssignmentConflicts(
    { requirements: [{ ...requirement, assignedUserIds: [bobby.authUserId] }] },
    [bobby],
    [externalAssignment],
    staffingRoleOptions.filter((role) => role.singleLead).map((role) => role.key),
  );

  return [
    {
      id: "H",
      passed:
        staffingAssignmentMatchesProfile(bobbyRunner, requirement, bobby) &&
        !staffingAssignmentMatchesProfile(bobbyRunner, requirement, julie),
      detail: "UUID-first matching keeps same-name profiles distinct.",
    },
    {
      id: "I",
      passed: normalizedProposal.requirements[0].assignedUserIds[0] === bobby.authUserId,
      detail: "Legacy profile IDs normalize to canonical auth user IDs.",
    },
    {
      id: "J",
      passed: staffingAssignmentAction([occupiedLead], leadRequirement, julie, true).action === "conflict",
      detail: "Occupied single-lead roles require explicit replacement.",
    },
    {
      id: "K",
      passed: commandConflict.overrideWarnings.some((warning) => warning.includes("Workbar Staff")),
      detail: "Assignments outside the current proposal remain visible to overlap analysis.",
    },
    {
      id: "L",
      passed: staffProfileMatchesSearch(bobby, "bobby@") && !staffProfileMatchesSearch(julie, "bobby@"),
      detail: "Staff search supports email.",
    },
    {
      id: "M",
      passed: !isAssignableStaffProfile(sharedDevice, bobby.organizationId),
      detail: "Shared-device profiles are not assignable staff.",
    },
    {
      id: "N",
      passed: firstAction.action === "create" && secondAction.action === "reuse",
      detail: "A second apply reuses the exact assignment instead of duplicating it.",
    },
  ];
}

export function runStaffingZoneRuleChecks() {
  const profile = {
    profileId: "10000000-0000-0000-0000-000000000011",
    authUserId: "20000000-0000-0000-0000-000000000011",
    displayName: "Zone Worker",
    organizationId: "30000000-0000-0000-0000-000000000001",
    active: true,
  };
  const sameNameOtherProfile = {
    ...profile,
    profileId: "10000000-0000-0000-0000-000000000012",
    authUserId: "20000000-0000-0000-0000-000000000012",
  };
  const barRequirement = {
    requirementId: "bar:bar_staff",
    roleKey: "bar_staff",
    roleLabel: "Bar Staff",
    zoneKey: "bar",
    included: true,
    assignedUserIds: [profile.authUserId],
  };
  const barAssignment = {
    id: "assignment-bar",
    active: true,
    roleKey: "bar_staff",
    roleLabel: "Bar Staff",
    zone: "bar",
    assignedAuthUserId: profile.authUserId,
    assignedOperatorName: profile.displayName,
  };
  const technicalRequirement = {
    ...barRequirement,
    requirementId: "backstage:support",
    roleKey: "support",
    roleLabel: "Technical Support",
    zoneKey: "backstage",
  };
  const technicalAssignment = {
    ...barAssignment,
    id: "assignment-technical",
    roleKey: "support",
    roleLabel: "Technical Support",
    zone: "backstage",
  };
  const genericSupportRequirement = {
    ...technicalRequirement,
    requirementId: "support:support",
    roleLabel: "Support",
    zoneKey: "support",
  };
  const sharedDevice = {
    ...profile,
    profileId: "10000000-0000-0000-0000-000000000013",
    authUserId: "20000000-0000-0000-0000-000000000013",
    displayName: "Workbar Device",
    isSharedDevice: true,
  };
  const leadRequirement = {
    ...barRequirement,
    requirementId: "all:event_floor_manager",
    roleKey: "event_floor_manager",
    roleLabel: "Event Floor Manager",
    zoneKey: "all",
  };
  const leadAssignment = {
    ...barAssignment,
    id: "assignment-lead",
    roleKey: "event_floor_manager",
    roleLabel: "Event Floor Manager",
    zone: "all",
  };

  return [
    {
      id: "O",
      passed:
        eventStaffingEffectiveZone("bar_staff", "bar") === "bar" &&
        staffingAssignmentMatchesProfile(barAssignment, barRequirement, profile) &&
        staffingAssignmentAction([barAssignment], barRequirement, profile, false).action === "reuse",
      detail: "Bar Staff preserves bar and reuses the exact assignment.",
    },
    {
      id: "P",
      passed:
        eventStaffingEffectiveZone("support", "backstage") === "backstage" &&
        staffingAssignmentMatchesProfile(technicalAssignment, technicalRequirement, profile) &&
        !staffingAssignmentMatchesProfile(technicalAssignment, genericSupportRequirement, profile),
      detail: "Technical backstage support remains separate from generic support.",
    },
    {
      id: "Q",
      passed: eventStaffingEffectiveZone("support", "support") === "support",
      detail: "Generic support preserves the support zone.",
    },
    {
      id: "R",
      passed: !isAssignableStaffProfile(sharedDevice, profile.organizationId),
      detail: "Shared-device UUID profiles are rejected as assignees.",
    },
    {
      id: "S",
      passed: Boolean(normalizedName("  Sheila  ")),
      detail: "A normalized legacy name remains a valid name-only identity.",
    },
    {
      id: "T",
      passed:
        staffingAssignmentMatchesProfile(barAssignment, barRequirement, profile) &&
        !staffingAssignmentMatchesProfile(barAssignment, barRequirement, sameNameOtherProfile),
      detail: "UUID identity wins when two authenticated profiles share a name.",
    },
    {
      id: "U",
      passed: staffingAssignmentAction([leadAssignment], leadRequirement, profile, true).action === "reuse",
      detail: "Selecting the same current lead is a no-change reuse.",
    },
  ];
}
