import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_IDS,
  getDemoById,
  getManagerPreviewDemos,
  isDemoAvailableToRole,
} from "../src/data/demoRegistry.js";
import {
  julieDemoNarrationWordCount,
  julieDemoRuntimeSeconds,
  julieEventDemo,
} from "../src/data/julieEventDemo.js";
import {
  buildChapterTimeline,
  getActiveNarrationBeat,
  locateTimelinePosition,
} from "../src/components/cinematic-tour/tourTimeline.js";

test("Julie demo has the approved calm runtime and narration pace", () => {
  assert.equal(julieDemoRuntimeSeconds, 225);
  assert.equal(julieEventDemo.chapters.length, 11);
  assert.equal(julieDemoNarrationWordCount, 467);
  assert.equal(Number((julieDemoNarrationWordCount / (julieDemoRuntimeSeconds / 60)).toFixed(1)), 124.5);
});

test("every chapter uses ordered narration beats as its visual timing authority", () => {
  for (const chapter of julieEventDemo.chapters) {
    assert.equal(chapter.narrationBeats[0].atSeconds, 0);
    assert.ok(chapter.narrationBeats.at(-1).atSeconds < chapter.durationSeconds);
    assert.equal(chapter.caption, chapter.narrationBeats.map((beat) => beat.text).join(" "));

    for (let index = 1; index < chapter.narrationBeats.length; index += 1) {
      assert.ok(chapter.narrationBeats[index].atSeconds > chapter.narrationBeats[index - 1].atSeconds);
      assert.ok(chapter.narrationBeats[index].visualProgress >= chapter.narrationBeats[index - 1].visualProgress);
    }
  }
});

test("master timeline maps chapter jumps and narration cues deterministically", () => {
  const timeline = buildChapterTimeline(julieEventDemo.chapters);
  assert.deepEqual(timeline.map((item) => item.startSeconds), [0, 14, 39, 62, 84, 112, 126, 143, 163, 184, 214]);
  assert.equal(timeline.at(-1).endSeconds, 225);

  const duringEvent = locateTimelinePosition(timeline, 95);
  assert.equal(duringEvent.chapter.id, "during-event");
  assert.equal(duringEvent.chapterElapsedSeconds, 11);
  assert.match(getActiveNarrationBeat(duringEvent.chapter, duringEvent.chapterElapsedSeconds).text, /Mircea acknowledges/);

  const finalFrame = locateTimelinePosition(timeline, 225);
  assert.equal(finalFrame.chapter.id, "final");
  assert.equal(finalFrame.chapterElapsedSeconds, 11);
});

test("demo registry preserves role gates and reports narration-ready metadata", () => {
  const demo = getDemoById(DEMO_IDS.julieEventFloorManager);
  assert.equal(demo.runtimeLabel, "3:45");
  assert.equal(demo.narrationWordCount, 467);
  assert.deepEqual(demo.playbackModes, ["Narration-ready", "Silent + captions"]);
  assert.equal(demo.audioAssetIncluded, false);
  assert.equal(julieEventDemo.narration.audioSrc, null);
  assert.equal(julieEventDemo.narration.replacementAssetPath, "public/audio/event-floor-manager-narration.mp3");
  assert.equal(getManagerPreviewDemos().some((item) => item.id === demo.id), true);
  assert.equal(isDemoAvailableToRole(demo.id, "event_floor_manager"), true);
  assert.equal(isDemoAvailableToRole(demo.id, "staff"), false);
});
