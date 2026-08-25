export function buildChapterTimeline(chapters) {
  let cursorSeconds = 0;
  return chapters.map((chapter, index) => {
    const startSeconds = cursorSeconds;
    cursorSeconds += chapter.durationSeconds;
    return {
      chapter,
      index,
      startSeconds,
      endSeconds: cursorSeconds,
    };
  });
}

export function locateTimelinePosition(timeline, elapsedSeconds) {
  const totalSeconds = timeline.at(-1)?.endSeconds || 0;
  const clampedSeconds = Math.max(0, Math.min(totalSeconds, elapsedSeconds));
  const entry = timeline.find((item) => clampedSeconds < item.endSeconds)
    || timeline.at(-1);

  if (!entry) {
    return {
      chapter: null,
      chapterIndex: 0,
      chapterElapsedSeconds: 0,
      totalSeconds,
    };
  }

  return {
    chapter: entry.chapter,
    chapterIndex: entry.index,
    chapterElapsedSeconds: Math.min(
      entry.chapter.durationSeconds,
      Math.max(0, clampedSeconds - entry.startSeconds),
    ),
    totalSeconds,
  };
}

export function getActiveNarrationBeat(chapter, chapterElapsedSeconds) {
  const beats = chapter?.narrationBeats || [];
  return beats.reduce(
    (active, beat) => (chapterElapsedSeconds >= beat.atSeconds ? beat : active),
    beats[0] || null,
  );
}
