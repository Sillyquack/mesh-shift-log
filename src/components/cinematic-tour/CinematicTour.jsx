import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildChapterTimeline,
  getActiveNarrationBeat,
  locateTimelinePosition,
} from "./tourTimeline.js";

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  return reducedMotion;
}

function formatRuntime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export default function CinematicTour({
  tour,
  renderScene,
  onExit,
  onComplete,
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [started, setStarted] = useState(false);
  const [timelineSeconds, setTimelineSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState("silent");
  const [muted, setMuted] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const shellRef = useRef(null);
  const stageRef = useRef(null);
  const audioRef = useRef(null);
  const completionReportedRef = useRef(false);
  const chapters = tour.chapters;
  const chapterTimeline = useMemo(() => buildChapterTimeline(chapters), [chapters]);
  const totalDurationSeconds = chapterTimeline.at(-1)?.endSeconds || 0;
  const position = locateTimelinePosition(chapterTimeline, timelineSeconds);
  const chapter = position.chapter;
  const chapterIndex = position.chapterIndex;
  const chapterElapsedSeconds = position.chapterElapsedSeconds;
  const activeBeat = getActiveNarrationBeat(chapter, chapterElapsedSeconds);
  const chapterProgress = activeBeat?.visualProgress
    ?? Math.min(1, chapterElapsedSeconds / chapter.durationSeconds);
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === chapters.length - 1;
  const overallProgress = totalDurationSeconds
    ? Math.min(1, timelineSeconds / totalDurationSeconds)
    : 0;
  const configuredAudioSrc = tour.narration?.audioSrc || "";
  const narrationAvailable = Boolean(configuredAudioSrc) && !audioFailed;

  const pausePlayback = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const playFromCurrentPosition = useCallback(async (fromSeconds = timelineSeconds) => {
    if (playbackMode !== "narrated") {
      setPlaying(true);
      return;
    }

    if (!narrationAvailable || !audioRef.current) {
      setPlaybackMode("silent");
      setAudioStatus("Narration is not attached. Continuing with captions.");
      setPlaying(true);
      return;
    }

    const audio = audioRef.current;
    audio.currentTime = Math.min(fromSeconds, totalDurationSeconds);
    audio.muted = muted;
    try {
      await audio.play();
      setAudioStatus("");
      setPlaying(true);
    } catch {
      setAudioStatus("Narration could not start. Playback is paused; captions remain available.");
      setPlaying(false);
    }
  }, [muted, narrationAvailable, playbackMode, timelineSeconds, totalDurationSeconds]);

  const togglePlayback = useCallback(() => {
    if (playing) pausePlayback();
    else void playFromCurrentPosition();
  }, [pausePlayback, playFromCurrentPosition, playing]);

  const seekTo = useCallback((nextSeconds, shouldPlay = playing) => {
    const safeSeconds = Math.max(0, Math.min(totalDurationSeconds, nextSeconds));
    setTimelineSeconds(safeSeconds);
    completionReportedRef.current = safeSeconds >= totalDurationSeconds;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = safeSeconds;
      if (!shouldPlay) audio.pause();
    }

    setPlaying(Boolean(shouldPlay));
    if (shouldPlay && playbackMode === "narrated" && audio?.paused) {
      audio.play().catch(() => {
        setAudioStatus("Narration could not resume. Playback is paused; captions remain available.");
        setPlaying(false);
      });
    }
  }, [playbackMode, playing, totalDurationSeconds]);

  const goToChapter = useCallback((nextIndex, shouldPlay = playing) => {
    const safeIndex = Math.max(0, Math.min(chapters.length - 1, nextIndex));
    seekTo(chapterTimeline[safeIndex].startSeconds, shouldPlay);
    setChapterMenuOpen(false);
  }, [chapterTimeline, chapters.length, playing, seekTo]);

  const startTour = useCallback(async (mode) => {
    completionReportedRef.current = false;
    setStarted(true);
    setTimelineSeconds(0);
    setChapterMenuOpen(false);
    setPlaybackMode(mode);
    setAudioStatus("");

    if (mode === "narrated" && narrationAvailable && audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = 0;
      audio.muted = muted;
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setAudioStatus("Narration could not start. Choose play to try again, or continue silently.");
        setPlaying(false);
      }
      return;
    }

    setPlaying(true);
  }, [muted, narrationAvailable]);

  const replay = useCallback(() => {
    completionReportedRef.current = false;
    seekTo(0, false);
    window.requestAnimationFrame(() => {
      void playFromCurrentPosition(0);
    });
  }, [playFromCurrentPosition, seekTo]);

  const exitTour = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    onExit?.();
  }, [onExit]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shellRef.current?.focus();
    return () => {
      audioRef.current?.pause();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [chapterIndex]);

  useEffect(() => {
    if (!started || !playing || playbackMode !== "silent") return undefined;
    let previousTimestamp = window.performance.now();
    const timer = window.setInterval(() => {
      const timestamp = window.performance.now();
      const deltaSeconds = Math.max(0, (timestamp - previousTimestamp) / 1000);
      previousTimestamp = timestamp;
      setTimelineSeconds((current) => Math.min(totalDurationSeconds, current + deltaSeconds));
    }, 100);

    return () => window.clearInterval(timer);
  }, [playbackMode, playing, started, totalDurationSeconds]);

  useEffect(() => {
    if (!started || !playing || playbackMode !== "narrated" || !narrationAvailable) return undefined;
    const timer = window.setInterval(() => {
      if (audioRef.current) {
        setTimelineSeconds(Math.min(totalDurationSeconds, audioRef.current.currentTime));
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [narrationAvailable, playbackMode, playing, started, totalDurationSeconds]);

  useEffect(() => {
    if (!started || timelineSeconds < totalDurationSeconds) return;
    pausePlayback();
    if (!completionReportedRef.current) {
      completionReportedRef.current = true;
      onComplete?.();
    }
  }, [onComplete, pausePlayback, started, timelineSeconds, totalDurationSeconds]);

  useEffect(() => {
    function onKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      const isInteractive = ["button", "a", "input", "select", "textarea", "summary"].includes(tagName);
      if (event.key === "Escape") {
        if (chapterMenuOpen) setChapterMenuOpen(false);
        else exitTour();
        return;
      }
      if (!started || isInteractive) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToChapter(chapterIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToChapter(chapterIndex - 1);
      } else if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "Home") {
        event.preventDefault();
        goToChapter(0, false);
      } else if (event.key === "End") {
        event.preventDefault();
        goToChapter(chapters.length - 1, false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chapterIndex, chapterMenuOpen, chapters.length, exitTour, goToChapter, started, togglePlayback]);

  function handleAudioError() {
    setAudioFailed(true);
    if (started && playbackMode === "narrated") {
      setPlaybackMode("silent");
      setAudioStatus("Narration is unavailable. Continuing silently with captions.");
      setPlaying(true);
    }
  }

  function toggleMuted() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audioRef.current) audioRef.current.muted = nextMuted;
  }

  return (
    <section
      ref={shellRef}
      className={`ct-shell${reducedMotion ? " ct-reduced-motion" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${tour.title} cinematic tour`}
      tabIndex="-1"
    >
      <div className="ct-ambient" aria-hidden="true" />
      <header className="ct-header">
        <div className="ct-brand">
          <span className="ct-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <strong>Mesh Shift Log</strong>
            <span>{tour.eyebrow}</span>
          </div>
        </div>
        <div className="ct-header-actions">
          {started && (
            <button
              type="button"
              className="ct-text-button"
              aria-expanded={chapterMenuOpen}
              onClick={() => setChapterMenuOpen((current) => !current)}
            >
              Chapters <span>{chapterIndex + 1}/{chapters.length}</span>
            </button>
          )}
          <button type="button" className="ct-icon-button" aria-label="Exit demo" onClick={exitTour}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      {configuredAudioSrc && (
        <audio
          ref={audioRef}
          preload="metadata"
          src={configuredAudioSrc}
          muted={muted}
          onError={handleAudioError}
          onEnded={() => setTimelineSeconds(totalDurationSeconds)}
        />
      )}

      {!started ? (
        <main className="ct-launch-stage">
          <section className="ct-launch-card" aria-labelledby="ct-launch-title">
            <p className="ct-kicker">A calm operational story · {formatRuntime(totalDurationSeconds)}</p>
            <h1 id="ct-launch-title">Follow an event from preparation to review.</h1>
            <p>
              Eleven narration-led chapters. Captions stay on by default, and no
              operational records are touched.
            </p>
            <div className="ct-launch-options">
              <button
                type="button"
                className="ct-primary-action"
                disabled={!narrationAvailable}
                onClick={() => void startTour("narrated")}
              >
                <span aria-hidden="true">▶</span> Play with narration
              </button>
              <button type="button" className="ct-secondary-action" onClick={() => void startTour("silent")}>
                Play silently
              </button>
            </div>
            <div className="ct-launch-notes">
              <span>CC on</span>
              <span>{reducedMotion ? "Reduced motion on" : "Measured visual pacing"}</span>
              <span>{narrationAvailable ? "Narration available" : "Narration recording prepared, not attached"}</span>
            </div>
            {!narrationAvailable && (
              <p className="ct-audio-note" role="status">
                The approved audio asset can be added later. Silent playback and
                timed captions are fully available now.
              </p>
            )}
          </section>
        </main>
      ) : (
        <>
          {chapterMenuOpen && (
            <nav className="ct-chapter-menu" aria-label="Tour chapters">
              <div className="ct-chapter-menu-heading">
                <div>
                  <span>Full story</span>
                  <strong>{formatRuntime(totalDurationSeconds)}</strong>
                </div>
                <button type="button" className="ct-icon-button" aria-label="Close chapter menu" onClick={() => setChapterMenuOpen(false)}>×</button>
              </div>
              <ol>
                {chapterTimeline.map((item) => (
                  <li key={item.chapter.id}>
                    <button
                      type="button"
                      className={item.index === chapterIndex ? "is-active" : ""}
                      aria-current={item.index === chapterIndex ? "step" : undefined}
                      onClick={() => goToChapter(item.index, false)}
                    >
                      <span>{item.chapter.number}</span>
                      <div><strong>{item.chapter.label}</strong><small>{item.chapter.durationSeconds}s · {item.chapter.capability}</small></div>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="ct-progress" aria-hidden="true">
            <span style={{ width: `${overallProgress * 100}%` }} />
          </div>

          <main ref={stageRef} className="ct-stage">
            <div key={chapter.id} className="ct-scene-enter">
              {renderScene({
                chapter,
                chapterIndex,
                chapterProgress,
                chapterElapsedSeconds,
                activeBeat,
                isFirst,
                isLast,
                replay,
                exit: exitTour,
              })}
            </div>
          </main>

          <div
            className={`ct-caption${captionsVisible ? "" : " is-hidden"}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {captionsVisible ? (
              <p><span>CAPTIONS</span>{activeBeat?.text || chapter.caption}</p>
            ) : (
              <p aria-hidden="true">Captions hidden</p>
            )}
          </div>

          <footer className="ct-controls">
            <div className="ct-control-group">
              <button type="button" className="ct-icon-button" aria-label="Previous chapter" disabled={isFirst} onClick={() => goToChapter(chapterIndex - 1)}>
                <span aria-hidden="true">←</span>
              </button>
              <button
                type="button"
                className="ct-play-button"
                aria-label={playing ? "Pause tour" : "Play tour"}
                onClick={togglePlayback}
              >
                <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="ct-icon-button" aria-label="Next chapter" disabled={isLast} onClick={() => goToChapter(chapterIndex + 1)}>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="ct-control-meta">
              <span>{chapter.label} · {Math.max(0, Math.ceil(chapter.durationSeconds - chapterElapsedSeconds))}s</span>
              <span>{formatRuntime(timelineSeconds)} / {formatRuntime(totalDurationSeconds)}</span>
              {reducedMotion && <span className="ct-motion-note">Reduced motion</span>}
              {audioStatus && <span className="ct-audio-status" role="status">{audioStatus}</span>}
            </div>
            <div className="ct-control-group ct-control-group-right">
              {playbackMode === "narrated" && narrationAvailable && (
                <button type="button" className="ct-text-button" aria-label={muted ? "Unmute narration" : "Mute narration"} aria-pressed={muted} onClick={toggleMuted}>
                  {muted ? "Unmute" : "Mute"}
                </button>
              )}
              <button type="button" className="ct-text-button" aria-pressed={captionsVisible} onClick={() => setCaptionsVisible((current) => !current)}>
                CC {captionsVisible ? "On" : "Off"}
              </button>
              {!isLast ? (
                <button type="button" className="ct-text-button" onClick={() => goToChapter(chapters.length - 1, false)}>Skip</button>
              ) : (
                <button type="button" className="ct-text-button" onClick={replay}>Replay</button>
              )}
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
