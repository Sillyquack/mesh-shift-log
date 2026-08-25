import {
  CAPABILITY_LEVELS,
  julieEventDemo,
} from "./julieEventDemo.js";

export const DEMO_REVIEW_STATUSES = Object.freeze({
  draft: "DRAFT",
  readyForReview: "READY FOR REVIEW",
  approved: "APPROVED",
  availableToRole: "AVAILABLE TO ROLE",
});

export const DEMO_IDS = Object.freeze({
  julieEventFloorManager: "julie-event-floor-manager",
});

function formatRuntime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function capabilityMix(chapters) {
  return Object.values(CAPABILITY_LEVELS).map((label) => ({
    label,
    count: chapters.filter((chapter) => chapter.capability === label).length,
  }));
}

function registerDemo({ tour, ...configuration }) {
  const runtimeSeconds = tour.chapters.reduce(
    (total, chapter) => total + chapter.durationSeconds,
    0,
  );
  const narrationWordCount = tour.chapters.reduce(
    (total, chapter) => total + chapter.narrationBeats.reduce(
      (chapterTotal, beat) => chapterTotal + beat.text.trim().split(/\s+/).length,
      0,
    ),
    0,
  );

  return Object.freeze({
    ...configuration,
    runtimeSeconds,
    runtimeLabel: formatRuntime(runtimeSeconds),
    chapterCount: tour.chapters.length,
    narrationWordCount,
    narrationLanguage: tour.narration.language,
    audioAssetIncluded: tour.narration.assetIncluded,
    playbackModes: Object.freeze(["Narration-ready", "Silent + captions"]),
    capabilityMix: Object.freeze(capabilityMix(tour.chapters)),
  });
}

export const demoRegistry = Object.freeze([
  registerDemo({
    id: DEMO_IDS.julieEventFloorManager,
    title: "Julie · Event Floor Manager",
    intendedAudience: Object.freeze({
      label: "Event Floor Manager",
      roleIds: Object.freeze(["event_floor_manager"]),
    }),
    description:
      "A calm, chapter-based walkthrough of event readiness, ownership, live control, and verified closeout.",
    reviewStatus: DEMO_REVIEW_STATUSES.availableToRole,
    managerPreviewable: true,
    availableToRole: true,
    loadComponent: () =>
      import("../components/cinematic-tour/EventFloorManagerDemo.jsx"),
    tour: julieEventDemo,
  }),
]);

export function getDemoById(demoId) {
  return demoRegistry.find((demo) => demo.id === demoId) || null;
}

export function getManagerPreviewDemos() {
  return demoRegistry.filter((demo) => demo.managerPreviewable);
}

export function isDemoAvailableToRole(demoId, roleId) {
  const demo = getDemoById(demoId);
  return Boolean(
    demo?.availableToRole && demo.intendedAudience.roleIds.includes(roleId),
  );
}
