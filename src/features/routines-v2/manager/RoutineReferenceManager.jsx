import { useEffect, useMemo, useState } from "react";
import {
  eventVisualAngles,
  eventVisualVenues,
} from "../../../data/eventRigGuides.js";
import {
  createRoutineReferenceImage,
  downloadRoutineCurrentReferenceImage,
  setRoutineReferenceImageActive,
  setRoutineReferenceImagePlaceholder,
  updateRoutineReferenceImageMetadata,
} from "../api/routineReferenceClient.js";
import { createIdempotencyKey } from "../data/routineManagerModel.js";
import { useRoutineReferenceManager } from "../hooks/useRoutineReferenceManager.js";
import {
  EmptyState,
  Field,
  Modal,
  StatusPill,
} from "./RoutineManagerPrimitives.jsx";

function eventVisualSlots() {
  return eventVisualAngles.map((angle) => ({
    ...angle,
    id: angle.stableKey,
    description: angle.operationalDescription,
  }));
}

function readinessProgress(rows) {
  const required = rows.filter((row) => row.required !== false);
  const ready = required.filter((row) => row.ready).length;
  return {
    ready,
    total: required.length,
    percent: required.length ? Math.round((ready / required.length) * 100) : null,
  };
}

const GUIDE_TYPE_LABELS = Object.freeze({
  default_restore: "Default restore",
  customer_layout: "Customer layout",
  service_station: "Service station",
  stage_tech: "Stage & tech",
  bar_ready: "Bar ready",
  closing_reset: "Closing reset",
});

function guideTypeLabel(value) {
  return GUIDE_TYPE_LABELS[value] || String(value || "Visual guide").replaceAll("_", " ");
}

function progressCopy(progress) {
  if (!progress.total) return "Written standard only";
  return `${progress.ready} of ${progress.total} required ready`;
}

function progressState(progress) {
  if (!progress.total) return "written";
  if (progress.ready === progress.total) return "ready";
  if (progress.ready > 0) return "progress";
  return "missing";
}

function referenceKey(reference) {
  return (
    reference?.stableKey ||
    reference?.referenceKey ||
    reference?.reference_key ||
    ""
  );
}

function referenceState(reference) {
  return reference?.current?.state || "placeholder";
}

function visualReadiness(slots, references) {
  const byKey = new Map(
    references.map((reference) => [referenceKey(reference), reference]),
  );
  const rows = slots.map((slot) => {
    const reference = byKey.get(slot.id) || null;
    const state = reference ? referenceState(reference) : "missing";
    return {
      ...slot,
      reference,
      state,
      ready: state === "active_image",
    };
  });
  return {
    rows,
    ready: rows.filter((row) => row.ready),
    placeholders: rows.filter((row) => row.state === "placeholder"),
    missing: rows.filter((row) => row.state === "missing"),
  };
}

function initialDraft() {
  return {
    stableKey: "",
    label: "",
    description: "",
    placeholderText: "Reference image coming soon",
  };
}

export default function RoutineReferenceManager({ loader, uploader }) {
  const manager = useRoutineReferenceManager({ loader, uploader });
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [creatingSlots, setCreatingSlots] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);

  const slots = useMemo(eventVisualSlots, []);
  const references = manager.data.references || [];
  const readiness = useMemo(
    () => visualReadiness(slots, references),
    [slots, references],
  );
  const requiredReadiness = useMemo(
    () => readinessProgress(readiness.rows),
    [readiness.rows],
  );
  const completion = requiredReadiness.percent ?? 0;
  const requiredRows = readiness.rows.filter((row) => row.required !== false);
  const optionalRows = readiness.rows.filter((row) => row.required === false);
  const requiredAwaiting = requiredRows.filter((row) => row.state === "placeholder");
  const requiredMissing = requiredRows.filter((row) => row.state === "missing");
  const readinessTree = useMemo(() => {
    const rowsByKey = new Map(readiness.rows.map((row) => [row.stableKey, row]));
    return eventVisualVenues.map((venue) => {
      const guides = venue.guides.map((guide) => {
        const zones = guide.zones.map((zone) => {
          const rows = zone.angles.map((angle) => rowsByKey.get(angle.stableKey)).filter(Boolean);
          return { ...zone, rows, progress: readinessProgress(rows) };
        });
        const rows = zones.flatMap((zone) => zone.rows);
        return { ...guide, zones, progress: readinessProgress(rows) };
      });
      const rows = guides.flatMap((guide) => guide.zones.flatMap((zone) => zone.rows));
      return { ...venue, guides, progress: readinessProgress(rows) };
    });
  }, [readiness.rows]);

  const filteredReferences = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return references;
    return references.filter((reference) =>
      [reference.label, referenceKey(reference), reference.description]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [references, search]);

  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const choose = (reference) => {
    setSelected(reference);
    setDraft({ ...reference });
    setFile(null);
    setCaption("");
    setAlt("");
    setMessage("");
  };

  const create = async () => {
    const result = await createRoutineReferenceImage({
      referenceKey: draft.stableKey,
      label: draft.label,
      description: draft.description,
      placeholderText:
        draft.placeholderText || "Reference image coming soon",
      idempotencyKey: createIdempotencyKey(),
    });
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    await manager.refresh();
    setMessage("Visual-standard placeholder created.");
    setDraft(null);
  };

  const createMissingEventSlots = async () => {
    if (!readiness.missing.length || creatingSlots) return;
    setCreatingSlots(true);
    setMessage("");
    let created = 0;
    const failures = [];
    try {
      for (const slot of readiness.missing) {
        const result = await createRoutineReferenceImage({
          referenceKey: slot.id,
          label: slot.label,
          description: slot.description,
          placeholderText: slot.placeholderText,
          idempotencyKey: createIdempotencyKey(),
        });
        if (result.ok) created += 1;
        else {
          failures.push(
            `${slot.label}: ${result.message || "could not be created"}`,
          );
        }
      }
      await manager.refresh();
      setMessage(
        failures.length
          ? `${created} placeholder${created === 1 ? "" : "s"} created. ${failures.length} need review: ${failures.join(" · ")}`
          : `${created} event visual-standard placeholder${created === 1 ? "" : "s"} created.`,
      );
      setConfirmMissing(false);
    } catch (error) {
      setMessage(
        error?.message ||
          "The placeholder queue stopped safely. Existing references remain unchanged.",
      );
    } finally {
      setCreatingSlots(false);
    }
  };

  const createEventSlot = async (slot) => {
    setMessage("");
    const result = await createRoutineReferenceImage({
      referenceKey: slot.id,
      label: slot.label,
      description: slot.description,
      placeholderText: slot.placeholderText,
      idempotencyKey: createIdempotencyKey(),
    });
    if (!result.ok) {
      setMessage(result.message || `${slot.label} could not be created.`);
      return;
    }
    await manager.refresh();
    setMessage(`${slot.label} placeholder created. Production upload remains separate.`);
  };

  const upload = async () => {
    if (!file || !alt.trim()) return;
    const result = await manager.upload({
      referenceId: selected.id,
      expectedReferenceRevision: selected.revision,
      file,
      caption,
      altText: alt,
      prepareIdempotencyKey: createIdempotencyKey(),
      finalizeIdempotencyKey: createIdempotencyKey(),
      cancelIdempotencyKey: createIdempotencyKey(),
    });
    setFile(null);
    setCaption("");
    setAlt("");
    setMessage(result.message || "Upload finished.");
  };

  const open = async () => {
    const result = await downloadRoutineCurrentReferenceImage(
      selected.current.objectPath,
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setPreview({
      url: URL.createObjectURL(result.blob),
      alt: selected.current.altText || selected.label,
    });
  };

  return (
    <section className="rm-stack rm-visual-standards">
      <header className="rm-section-heading rm-visual-standards-heading">
        <div>
          <p className="eyebrow">Show, don’t explain</p>
          <h2>Visual standards</h2>
          <p>
            Upload the exact setup once. Staff can then open it directly from the
            relevant task without searching Notion or asking what “ready” means.
          </p>
        </div>
        <div
          className="mesh-progress-ring rm-visual-progress"
          style={{ "--mesh-progress": `${completion}%` }}
          aria-label={`${completion}% of required event visual standards uploaded`}
        >
          <div>
            <strong>{completion}%</strong>
            <span>
              {requiredReadiness.ready}/{requiredReadiness.total} required ready
            </span>
          </div>
        </div>
      </header>

      <section
        className="rm-card rm-visual-readiness"
        aria-labelledby="event-visual-readiness-title"
      >
        <div className="rm-visual-readiness-summary">
          <div>
            <p className="eyebrow">Operations event set</p>
            <h3 id="event-visual-readiness-title">Image upload queue</h3>
            <p>
              Every slot below comes from the current event routines. A missing
              image is a warning, never a blocker; the honest placeholder stays
              visible until a permanent image is ready.
            </p>
          </div>
          <div className="rm-visual-readiness-counts" aria-label="Required visual-standard progress">
            <span><strong>{requiredReadiness.ready}</strong><b>ready</b></span>
            <i aria-hidden="true">·</i>
            <span><strong>{requiredAwaiting.length}</strong><b>awaiting upload</b></span>
            <i aria-hidden="true">·</i>
            <span><strong>{requiredMissing.length}</strong><b>not created</b></span>
            <span className="is-optional"><strong>{optionalRows.length}</strong><b>optional angles</b></span>
          </div>
        </div>

        {readiness.missing.length ? (
          <aside className="rm-visual-bulk-plan" aria-label="Missing placeholder plan">
            <div>
              <p className="eyebrow">Guarded library setup</p>
              <h4>{readiness.missing.length} visual slot{readiness.missing.length === 1 ? "" : "s"} do not exist yet</h4>
              <p>
                {requiredMissing.length} required and {readiness.missing.length - requiredMissing.length} optional slot{readiness.missing.length === 1 ? "" : "s"} can receive honest placeholders. No image is uploaded or activated.
              </p>
            </div>
            {!confirmMissing ? (
              <button type="button" className="ghost-button" onClick={() => setConfirmMissing(true)}>
                Review placeholder plan
              </button>
            ) : (
              <div className="rm-actions" role="group" aria-label="Confirm placeholder creation">
                <button type="button" className="ghost-button" disabled={creatingSlots} onClick={() => setConfirmMissing(false)}>Cancel</button>
                <button type="button" className="primary-button" disabled={creatingSlots} onClick={createMissingEventSlots}>
                  {creatingSlots ? "Creating safe placeholders…" : `Create ${readiness.missing.length} missing event placeholders`}
                </button>
              </div>
            )}
          </aside>
        ) : (
          <p className="mesh-status is-success" role="status">
            Every required event image slot exists. Uploads can now be completed
            one by one.
          </p>
        )}

        <div className="rm-visual-tree" aria-label="Visual standards grouped by venue, guide, zone and angle">
          {readinessTree.map((venue, venueIndex) => (
            <details key={venue.key} className={`rm-visual-venue is-${progressState(venue.progress)}`} open={venueIndex === 0}>
              <summary>
                <div>
                  <p className="eyebrow">Venue standard</p>
                  <h4>{venue.label}</h4>
                  <small>{venue.guides.length} guide{venue.guides.length === 1 ? "" : "s"} · {progressCopy(venue.progress)}</small>
                </div>
                <span className="rm-visual-venue-progress" aria-label={progressCopy(venue.progress)}>
                  {venue.progress.total ? <><strong>{venue.progress.percent}%</strong><i style={{ "--rm-venue-progress": `${venue.progress.percent}%` }} /></> : <strong>Written</strong>}
                </span>
              </summary>
              {!venue.progress.total ? (
                <p className="rm-visual-written-state"><strong>Written standard only</strong><span>No image is currently required or sourced.</span></p>
              ) : null}
              <div className="rm-visual-guide-list">
                {venue.guides.map((guide, guideIndex) => (
                  <details key={guide.key} className={`rm-visual-guide is-${progressState(guide.progress)}`} open={venueIndex === 0 && guideIndex === 0}>
                    <summary>
                      <span><small>{guideTypeLabel(guide.guideType)}</small><strong>{guide.title}</strong><em>{guide.summary}</em></span>
                      <b>{progressCopy(guide.progress)}</b>
                    </summary>
                    <div className="rm-visual-zone-list">
                      {guide.zones.map((zone, zoneIndex) => (
                        <details key={zone.key} className="rm-visual-zone" open={venueIndex === 0 && guideIndex === 0 && zoneIndex === 0}>
                          <summary>
                            <span>{String(zoneIndex + 1).padStart(2, "0")}</span>
                            <div><strong>{zone.label}</strong><p>{zone.description}</p></div>
                            <b>{progressCopy(zone.progress)}</b>
                          </summary>
                          {zone.rows.length ? (
                            <div className="rm-visual-angle-list">
                              {zone.rows.map((row) => (
                                <button
                                  key={row.id}
                                  type="button"
                                  className={`rm-visual-angle-card is-${row.state}`}
                                  onClick={() => row.reference ? choose(row.reference) : createEventSlot(row)}
                                >
                                  <span className="rm-visual-angle-media" aria-hidden="true">{row.ready ? "✓" : row.state === "missing" ? "+" : "◎"}</span>
                                  <span className="rm-visual-angle-copy">
                                    <span className="rm-visual-angle-chips"><i>{row.imageRole || "zone"}</i><i>{row.required === false ? "Optional" : "Required"}</i></span>
                                    <strong>{row.label}</strong>
                                    <small>{row.description}</small>
                                    <b>{row.ready ? "Ready · open details" : row.state === "missing" ? "Create placeholder" : "Awaiting upload · open details"}</b>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : <p className="rm-visual-written-state"><strong>Written standard only</strong><span>No image is currently required or sourced.</span></p>}
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <details className="rm-card rm-visual-library">
        <summary className="rm-visual-library-summary">
          <span><small>Advanced</small><strong>Library search and custom standards</strong></span>
          <b>{references.length} standards</b>
        </summary>
        <div className="rm-visual-library-body">
        <div className="rm-section-heading">
          <div>
            <p className="eyebrow">Permanent library</p>
            <h3>All visual standards</h3>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setSelected(null);
              setDraft(initialDraft());
            }}
          >
            Create custom standard
          </button>
        </div>
        <label className="rm-visual-search" htmlFor="visual-standard-search">
          Find a standard
          <input
            id="visual-standard-search"
            type="search"
            value={search}
            placeholder="Atrium, coffee, Cornerbar…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!filteredReferences.length && !draft ? (
          <EmptyState title="No visual standards found">
            Clear the search or create a new placeholder.
          </EmptyState>
        ) : (
          <div className="rm-chip-row rm-visual-reference-list">
            {filteredReferences.map((reference) => (
              <button
                type="button"
                className="ghost-button"
                key={reference.id}
                onClick={() => choose(reference)}
              >
                <span>
                  {referenceState(reference) === "active_image" ? "✓" : "○"}
                </span>
                {reference.label}
              </button>
            ))}
          </div>
        )}
        </div>
      </details>

      {draft ? (
        <div className="rm-split rm-visual-editor">
          <form
            className="rm-card rm-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selected) {
                await create();
                return;
              }
              const result = await updateRoutineReferenceImageMetadata({
                referenceId: selected.id,
                label: draft.label,
                description: draft.description,
                placeholderText: draft.placeholderText,
                expectedRevision: selected.revision,
                idempotencyKey: createIdempotencyKey(),
              });
              if (result.ok) {
                await manager.refresh();
                setMessage("Visual-standard details saved.");
              } else {
                setMessage(result.message);
              }
            }}
          >
            <header>
              <div>
                <p className="eyebrow">Details</p>
                <h3>{selected ? draft.label : "New visual standard"}</h3>
              </div>
              <StatusPill
                state={
                  draft.current?.state === "active_image" ? "ready" : "warning"
                }
              >
                {draft.current?.state === "active_image"
                  ? "Ready"
                  : "Awaiting image"}
              </StatusPill>
            </header>
            <details className="rm-advanced">
              <summary>Advanced technical details</summary>
              <Field
                id="reference-key"
                label="Stable key"
                help="Permanent identifier; it cannot change after creation."
              >
                <input
                  id="reference-key"
                  readOnly={Boolean(selected)}
                  value={draft.stableKey || draft.referenceKey || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, stableKey: event.target.value })
                  }
                />
              </Field>
            </details>
            <Field
              id="reference-label"
              label="Name"
              help="The name managers and tasks will use."
            >
              <input
                id="reference-label"
                value={draft.label || ""}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
              />
            </Field>
            <Field
              id="reference-description"
              label="What this image proves"
              help="Describe the standard, not the photo itself."
            >
              <textarea
                id="reference-description"
                value={draft.description || ""}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>
            <Field
              id="reference-placeholder"
              label="Message before upload"
              help="Shown honestly while the image is missing."
            >
              <input
                id="reference-placeholder"
                value={draft.placeholderText || ""}
                onChange={(event) =>
                  setDraft({ ...draft, placeholderText: event.target.value })
                }
              />
            </Field>
            <div className="rm-actions">
              <button className="primary-button">
                {selected ? "Save details" : "Create placeholder"}
              </button>
              {selected ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={async () => {
                    await setRoutineReferenceImageActive({
                      referenceId: selected.id,
                      active: !selected.active,
                      expectedRevision: selected.revision,
                      idempotencyKey: createIdempotencyKey(),
                    });
                    await manager.refresh();
                  }}
                >
                  {selected.active ? "Deactivate" : "Activate"}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSelected(null);
                  setDraft(null);
                }}
              >
                Close
              </button>
            </div>
          </form>

          {selected ? (
            <section className="rm-card rm-form rm-visual-upload-card">
              <p className="eyebrow">Image</p>
              <h3>Current standard</h3>
              {selected.current?.state === "active_image" ? (
                <>
                  <button
                    type="button"
                    className="rm-reference-preview"
                    onClick={open}
                  >
                    <span>Open current image</span>
                    <small>
                      {selected.current.mimeType} · {selected.current.byteSize} bytes
                    </small>
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={async () => {
                      const result = await setRoutineReferenceImagePlaceholder({
                        referenceId: selected.id,
                        placeholderText: selected.placeholderText,
                        expectedReferenceRevision: selected.revision,
                        idempotencyKey: createIdempotencyKey(),
                      });
                      if (result.ok) await manager.refresh();
                      else setMessage(result.message);
                    }}
                  >
                    Remove image and return to placeholder
                  </button>
                </>
              ) : (
                <div className="rm-placeholder">
                  Reference image coming soon
                </div>
              )}
              <Field
                id="reference-file"
                label="Choose image"
                help="JPEG, PNG or WebP. Maximum 5 MB. File content is checked before upload."
              >
                <input
                  id="reference-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] || null)
                  }
                />
              </Field>
              <Field
                id="reference-caption"
                label="Caption"
                help="Optional short context under the image."
              >
                <input
                  id="reference-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                />
              </Field>
              <Field
                id="reference-alt"
                label="Image description"
                help="Required for an actual image so the standard remains understandable with assistive technology."
              >
                <input
                  id="reference-alt"
                  value={alt}
                  required
                  aria-required="true"
                  onChange={(event) => setAlt(event.target.value)}
                />
              </Field>
              <button
                type="button"
                className="primary-button"
                disabled={!file || !alt.trim() || manager.status === "uploading"}
                onClick={upload}
              >
                {manager.status === "uploading"
                  ? `Uploading ${manager.progress}%`
                  : selected.current?.state === "active_image"
                    ? "Upload new version"
                    : "Upload image"}
              </button>
            </section>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <section className="rm-card rm-visual-history">
          <h3>Immutable version history</h3>
          <p>
            Previous versions remain auditable and cannot be silently overwritten.
          </p>
          <ol className="rm-history">
            {selected.versions?.map((version) => (
              <li key={version.id}>
                <strong>
                  v{version.versionNumber} · {version.state}
                </strong>
                <small>{version.caption || version.createdAt}</small>
              </li>
            ))}
          </ol>
          <h3>Used by</h3>
          <ul>
            {manager.data.usage
              ?.filter((usage) => usage.referenceId === selected.id)
              .map((usage, index) => (
                <li key={index}>
                  {usage.routineKey} · {usage.taskKey}
                  {usage.itemKey ? ` · ${usage.itemKey}` : ""} ·{" "}
                  {usage.templateState}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <p className="rm-visual-message" role="status" aria-live="polite">
        {message}
      </p>

      {preview ? (
        <Modal
          title="Visual standard"
          onClose={() => setPreview(null)}
          actions={(
            <button
              type="button"
              className="primary-button"
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          )}
        >
          <img className="rm-full-image" src={preview.url} alt={preview.alt} />
        </Modal>
      ) : null}
    </section>
  );
}
