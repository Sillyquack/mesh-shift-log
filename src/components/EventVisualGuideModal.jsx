import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadEventVisualReferenceImage } from '../lib/eventVisualReferenceClient.js';
import './EventVisualGuideModal.css';

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function referenceKey(reference) {
  return String(reference?.referenceKey || reference?.reference_key || '').trim();
}

function referenceStatus(reference) {
  return String(reference?.state || 'missing').trim().toLowerCase();
}

function imageAlt(reference, slot) {
  return String(reference?.altText || slot?.description || slot?.label || 'Visual standard').trim();
}

export default function EventVisualGuideModal({
  guide,
  references = [],
  loading = false,
  error = '',
  onClose,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const returnFocusRef = useRef(null);
  const [images, setImages] = useState({});

  const slots = guide?.requiredImageSlots || [];
  const referenceMap = useMemo(
    () => new Map(references.map((reference) => [referenceKey(reference), reference])),
    [references],
  );

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
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
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];
    const activeReferences = references.filter(
      (reference) => referenceStatus(reference) === 'active_image' && reference.objectPath,
    );
    setImages(Object.fromEntries(
      activeReferences.map((reference) => [
        referenceKey(reference),
        { status: 'loading', url: '', message: '' },
      ]),
    ));

    Promise.all(activeReferences.map(async (reference) => {
      const key = referenceKey(reference);
      const result = await downloadEventVisualReferenceImage(reference.objectPath);
      if (!result.ok) {
        return [key, {
          status: 'error',
          url: '',
          message: result.message || 'The image could not be opened.',
        }];
      }
      const url = URL.createObjectURL(result.blob);
      objectUrls.push(url);
      return [key, { status: 'ready', url, message: '' }];
    })).then((entries) => {
      if (!cancelled) setImages(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [references]);

  if (!guide) return null;

  return (
    <div
      className="event-visual-guide-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="event-visual-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-visual-guide-title"
        aria-describedby="event-visual-guide-description"
      >
        <header className="event-visual-guide-header">
          <div>
            <span>VISUAL STANDARD</span>
            <h2 id="event-visual-guide-title">{guide.title}</h2>
            <p id="event-visual-guide-description">
              Use the image as the finish line and the checklist as the final walk-through.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="event-visual-guide-close"
            aria-label="Close visual guide"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="event-visual-guide-body">
          {slots.length ? (
            <section className="event-visual-guide-images" aria-label="Reference images">
              <div className="event-visual-guide-section-heading">
                <span>HOW IT SHOULD LOOK</span>
                <strong>{slots.length} standard{slots.length === 1 ? '' : 's'}</strong>
              </div>

              {loading ? (
                <p className="event-visual-guide-status" role="status" aria-live="polite">
                  Opening the current visual standards…
                </p>
              ) : null}
              {error ? (
                <p className="event-visual-guide-status is-warning" role="status">
                  {error} The written standard is still available below.
                </p>
              ) : null}

              <div className="event-visual-guide-grid">
                {slots.map((slot) => {
                  const reference = referenceMap.get(slot.id) || null;
                  const state = referenceStatus(reference);
                  const image = images[slot.id];
                  const ready = state === 'active_image' && image?.status === 'ready';
                  return (
                    <article
                      key={slot.id}
                      className={`event-visual-guide-card is-${state}${ready ? ' has-image' : ''}`}
                    >
                      <div className="event-visual-guide-media">
                        {ready ? (
                          <img
                            src={image.url}
                            alt={imageAlt(reference, slot)}
                            loading="lazy"
                          />
                        ) : image?.status === 'loading' ? (
                          <div className="event-visual-guide-placeholder is-loading" role="status">
                            <span>Opening image…</span>
                          </div>
                        ) : (
                          <div className="event-visual-guide-placeholder">
                            <span aria-hidden="true">◎</span>
                            <strong>
                              {image?.status === 'error'
                                ? 'Image unavailable'
                                : reference?.placeholderText || 'Reference image coming soon'}
                            </strong>
                            {image?.message ? <small>{image.message}</small> : null}
                          </div>
                        )}
                      </div>
                      <div className="event-visual-guide-card-copy">
                        <span>{ready ? 'READY' : state === 'missing' ? 'PLANNED' : 'PLACEHOLDER'}</span>
                        <h3>{reference?.label || slot.label}</h3>
                        <p>{reference?.description || slot.description}</p>
                        {ready && reference?.caption ? <small>{reference.caption}</small> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="event-visual-guide-status">
              This guide currently uses a written standard only.
            </p>
          )}

          <section className="event-visual-guide-checklist" aria-labelledby="event-guide-checklist-title">
            <div className="event-visual-guide-section-heading">
              <span>FINAL WALK-THROUGH</span>
              <strong>{guide.checklist?.length || 0} checks</strong>
            </div>
            <h3 id="event-guide-checklist-title">Leave no room for guessing.</h3>
            <ol>
              {(guide.checklist || []).map((item, index) => (
                <li key={`${guide.id}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{item}</p>
                </li>
              ))}
            </ol>
            {guide.notes ? (
              <aside>
                <strong>Good to know</strong>
                <p>{guide.notes}</p>
              </aside>
            ) : null}
          </section>
        </div>

        <footer className="event-visual-guide-footer">
          <button type="button" onClick={onClose}>Back to Event Mode</button>
        </footer>
      </section>
    </div>
  );
}
