import { useEffect, useMemo, useRef, useState } from "react";
import { downloadEventVisualReferenceImage } from "../lib/eventVisualReferenceClient.js";
import "./EventVisualGuideModal.css";

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])",
  )].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function referenceKey(reference) {
  return String(reference?.referenceKey || reference?.reference_key || "").trim();
}

function referenceStatus(reference) {
  return String(reference?.state || "missing").trim().toLowerCase();
}

function imageAlt(reference, angle) {
  return String(reference?.altText || angle?.altText || angle?.operationalDescription || angle?.label || "Visual standard").trim();
}

function AngleCard({ angle, reference, image }) {
  const state = referenceStatus(reference);
  const ready = state === "active_image" && image?.status === "ready";
  return (
    <article className={`event-visual-guide-card is-${state}${ready ? " has-image" : ""}`}>
      <div className="event-visual-guide-media">
        {ready ? (
          <img src={image.url} alt={imageAlt(reference, angle)} loading="lazy" />
        ) : image?.status === "loading" ? (
          <div className="event-visual-guide-placeholder is-loading" role="status"><span>Opening image…</span></div>
        ) : (
          <div className="event-visual-guide-placeholder">
            <span aria-hidden="true">◎</span>
            <strong>{image?.status === "error" ? "Image unavailable" : reference?.placeholderText || angle.placeholderText}</strong>
            <small>{image?.message || "Follow the written target below; never guess from a missing image."}</small>
          </div>
        )}
      </div>
      <div className="event-visual-guide-card-copy">
        <span>{ready ? "CURRENT IMAGE" : angle.required ? "REQUIRED ANGLE" : "OPTIONAL COMPARISON"}</span>
        <h4>{reference?.label || angle.label}</h4>
        <p>{reference?.description || angle.operationalDescription}</p>
        {ready && reference?.caption ? <small>{reference.caption}</small> : null}
      </div>
    </article>
  );
}

export default function EventVisualGuideModal({ guide, references = [], loading = false, error = "", onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const returnFocusRef = useRef(null);
  const [images, setImages] = useState({});
  const [restoredZones, setRestoredZones] = useState(() => new Set());
  const zones = guide?.zones || [];
  const requiredZones = zones.filter((item) => item.required !== false);
  const completeCount = requiredZones.filter((item) => restoredZones.has(item.key)).length;
  const complete = completeCount === requiredZones.length;

  const referenceMap = useMemo(
    () => new Map(references.map((reference) => [referenceKey(reference), reference])),
    [references],
  );

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];
    const activeReferences = references.filter(
      (reference) => referenceStatus(reference) === "active_image" && reference.objectPath,
    );
    setImages(Object.fromEntries(activeReferences.map((reference) => [referenceKey(reference), { status: "loading", url: "", message: "" }])));
    Promise.all(activeReferences.map(async (reference) => {
      const key = referenceKey(reference);
      const result = await downloadEventVisualReferenceImage(reference.objectPath);
      if (!result.ok) return [key, { status: "error", url: "", message: result.message || "The image could not be opened." }];
      const url = URL.createObjectURL(result.blob);
      objectUrls.push(url);
      return [key, { status: "ready", url, message: "" }];
    })).then((entries) => {
      if (!cancelled) setImages(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [references]);

  if (!guide) return null;

  const toggleZone = (zoneKey) => {
    setRestoredZones((current) => {
      const next = new Set(current);
      if (next.has(zoneKey)) next.delete(zoneKey);
      else next.add(zoneKey);
      return next;
    });
  };

  return (
    <div className="event-visual-guide-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="event-visual-guide-modal" role="dialog" aria-modal="true" aria-labelledby="event-visual-guide-title" aria-describedby="event-visual-guide-description">
        <header className="event-visual-guide-header">
          <div>
            <span>RECONSTRUCTION JOURNEY · {guide.selectionKind?.replaceAll("_", " ")}</span>
            <h2 id="event-visual-guide-title">{guide.title}</h2>
            <p id="event-visual-guide-description">{guide.summary}</p>
          </div>
          <button ref={closeRef} type="button" className="event-visual-guide-close" aria-label="Close visual guide" onClick={onClose}>×</button>
        </header>

        <div className="event-visual-guide-body is-journey">
          <main className="event-visual-guide-journey">
            <section className="event-visual-guide-facts" aria-labelledby="event-guide-facts-title">
              <div className="event-visual-guide-section-heading"><span>01 · KNOW THE TARGET</span><strong>{guide.operationalFacts?.length || 0} exact facts</strong></div>
              <h3 id="event-guide-facts-title">Key operational facts</h3>
              {guide.operationalFacts?.length ? <ul>{guide.operationalFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>Use the written zone targets and selected event plan. No undocumented quantities are implied.</p>}
            </section>

            {loading ? <p className="event-visual-guide-status" role="status" aria-live="polite">Opening the current visual standards…</p> : null}
            {error ? <p className="event-visual-guide-status is-warning" role="status">{error} The complete written reconstruction remains available.</p> : null}

            <section aria-labelledby="event-guide-zones-title">
              <div className="event-visual-guide-section-heading"><span>02 · REBUILD IN ORDER</span><strong>{completeCount}/{requiredZones.length} required zones checked</strong></div>
              <h3 id="event-guide-zones-title" className="event-visual-guide-section-title">Start with the overview, then finish each zone.</h3>
              <div className="event-visual-guide-zone-list">
                {zones.map((zone, zoneIndex) => (
                  <article key={zone.key} className={`event-visual-guide-zone${restoredZones.has(zone.key) ? " is-restored" : ""}`}>
                    <header>
                      <span>{String(zoneIndex + 1).padStart(2, "0")}</span>
                      <div><h3>{zone.label}</h3><p>{zone.description}</p></div>
                      <button type="button" aria-pressed={restoredZones.has(zone.key)} onClick={() => toggleZone(zone.key)}>
                        {restoredZones.has(zone.key) ? "Checked" : zone.required === false ? "Check optional zone" : "Mark zone checked"}
                      </button>
                    </header>
                    {zone.angles.length ? (
                      <div className="event-visual-guide-grid">
                        {zone.angles.map((angle) => <AngleCard key={angle.stableKey} angle={angle} reference={referenceMap.get(angle.stableKey)} image={images[angle.stableKey]} />)}
                      </div>
                    ) : <p className="event-visual-guide-status">Written standard only. The source contains no image; preserve these checks until an authoritative replacement is supplied.</p>}
                  </article>
                ))}
              </div>
            </section>
          </main>

          <aside className="event-visual-guide-checklist" aria-labelledby="event-guide-checklist-title">
            <div className="event-visual-guide-section-heading"><span>03 · FINAL WALK-THROUGH</span><strong>{guide.finalWalkthrough?.length || 0} checks</strong></div>
            <h3 id="event-guide-checklist-title">Leave no room for guessing.</h3>
            <ol>{(guide.finalWalkthrough || []).map((item, index) => <li key={`${guide.id}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol>
            {guide.commonMisses?.length ? <aside><strong>Common misses</strong><ul>{guide.commonMisses.map((item) => <li key={item}>{item}</li>)}</ul></aside> : null}
          </aside>
        </div>

        <footer className="event-visual-guide-footer">
          <p role="status">{complete ? "Required zones checked. Complete the final walk-through before leaving." : `${requiredZones.length - completeCount} required zone${requiredZones.length - completeCount === 1 ? "" : "s"} still to check.`}</p>
          <button type="button" disabled={!complete} onClick={onClose}>Complete guide & return to Event Mode</button>
        </footer>
      </section>
    </div>
  );
}
