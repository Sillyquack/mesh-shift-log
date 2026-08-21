import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [chapterIndex, setChapterIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const shellRef = useRef(null);
  const stageRef = useRef(null);
  const chapters = tour.chapters;
  const chapter = chapters[chapterIndex];
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === chapters.length - 1;
  const chapterDurationMs = chapter.durationSeconds * 1000;
  const chapterProgress = Math.min(1, elapsedMs / chapterDurationMs);
  const totalDurationSeconds = useMemo(
    () => chapters.reduce((total, item) => total + item.durationSeconds, 0),
    [chapters],
  );
  const elapsedBeforeChapter = useMemo(
    () => chapters.slice(0, chapterIndex).reduce((total, item) => total + item.durationSeconds, 0),
    [chapters, chapterIndex],
  );
  const overallProgress = Math.min(
    1,
    (elapsedBeforeChapter + elapsedMs / 1000) / totalDurationSeconds,
  );

  const goToChapter = useCallback((nextIndex, shouldPlay = playing) => {
    const safeIndex = Math.max(0, Math.min(chapters.length - 1, nextIndex));
    setChapterIndex(safeIndex);
    setElapsedMs(0);
    setPlaying(safeIndex === chapters.length - 1 ? false : shouldPlay);
    setChapterMenuOpen(false);
  }, [chapters.length, playing]);

  const replay = useCallback(() => {
    setChapterIndex(0);
    setElapsedMs(0);
    setPlaying(!reducedMotion);
    setChapterMenuOpen(false);
  }, [reducedMotion]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shellRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [chapterIndex]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setElapsedMs((current) => Math.min(chapterDurationMs, current + 100));
    }, 100);
    return () => window.clearInterval(timer);
  }, [chapterDurationMs, playing]);

  useEffect(() => {
    if (elapsedMs < chapterDurationMs) return;
    if (isLast) {
      setPlaying(false);
      onComplete?.();
      return;
    }
    setChapterIndex((current) => current + 1);
    setElapsedMs(0);
  }, [chapterDurationMs, elapsedMs, isLast, onComplete]);

  useEffect(() => {
    function onKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      const isInteractive = ["button", "a", "input", "select", "textarea", "summary"].includes(tagName);
      if (event.key === "Escape") {
        if (chapterMenuOpen) setChapterMenuOpen(false);
        else onExit?.();
        return;
      }
      if (isInteractive) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToChapter(chapterIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToChapter(chapterIndex - 1);
      } else if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPlaying((current) => !current);
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
  }, [chapterIndex, chapterMenuOpen, chapters.length, goToChapter, onExit]);

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
          <button
            type="button"
            className="ct-text-button"
            aria-expanded={chapterMenuOpen}
            onClick={() => setChapterMenuOpen((current) => !current)}
          >
            Chapters <span>{chapterIndex + 1}/{chapters.length}</span>
          </button>
          <button type="button" className="ct-icon-button" aria-label="Exit demo" onClick={onExit}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

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
            {chapters.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={index === chapterIndex ? "is-active" : ""}
                  aria-current={index === chapterIndex ? "step" : undefined}
                  onClick={() => goToChapter(index, false)}
                >
                  <span>{item.number}</span>
                  <div><strong>{item.label}</strong><small>{item.durationSeconds}s · {item.capability}</small></div>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="ct-progress" aria-hidden="true">
        <span style={{ width: `${overallProgress * 100}%` }} />
      </div>

      <main ref={stageRef} className="ct-stage" aria-live="polite">
        <div key={chapter.id} className="ct-scene-enter">
          {renderScene({
            chapter,
            chapterIndex,
            chapterProgress,
            isFirst,
            isLast,
            replay,
            exit: onExit,
          })}
        </div>
      </main>

      <div className={`ct-caption${captionsVisible ? "" : " is-hidden"}`}>
        {captionsVisible ? (
          <p><span>CAPTIONS</span>{chapter.caption}</p>
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
            onClick={() => setPlaying((current) => !current)}
          >
            <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="ct-icon-button" aria-label="Next chapter" disabled={isLast} onClick={() => goToChapter(chapterIndex + 1)}>
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="ct-control-meta">
          <span>{chapter.label} · {Math.max(0, Math.ceil((chapterDurationMs - elapsedMs) / 1000))}s</span>
          {reducedMotion && <span className="ct-motion-note">Reduced motion</span>}
        </div>
        <div className="ct-control-group ct-control-group-right">
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
    </section>
  );
}
