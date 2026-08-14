import { useEffect, useMemo, useState } from "react";
import { eventRigGuides } from "../../../data/eventRigGuides.js";
import {
  createRoutineReferenceImage,
  downloadRoutineCurrentReferenceImage,
  setRoutineReferenceImageActive,
  setRoutineReferenceImagePlaceholder,
  updateRoutineReferenceImageMetadata,
} from "../api/routineReferenceClient.js";
import { createIdempotencyKey } from "../data/routineManagerModel.js";
import { useRoutineReferenceManager } from "../hooks/useRoutineReferenceManager.js";
import { EmptyState, Field, Modal, StatusPill } from "./RoutineManagerPrimitives.jsx";

function eventVisualSlots() {
  const slots = new Map();
  eventRigGuides.forEach((guide) => {
    (guide.requiredImageSlots || []).forEach((slot) => {
      if (!slots.has(slot.id)) {
        slots.set(slot.id, {
          ...slot,
          guideIds: [guide.id],
          guideTitles: [guide.title],
        });
        return;
      }
      const current = slots.get(slot.id);
      current.guideIds.push(guide.id);
      current.guideTitles.push(guide.title);
    });
  });
  return [...slots.values()];
}

function referenceKey(reference) {
  return reference?.stableKey || reference?.referenceKey || reference?.reference_key || "";
}

function referenceState(reference) {
  return reference?.current?.state || "placeholder";
}

function visualReadiness(slots, references) {
  const byKey = new Map(references.map((reference) => [referenceKey(reference), reference]));
  const rows = slots.map((slot) => {
    const reference = byKey.get(slot.id) || null;
    return {
      ...slot,
      reference,
      state: reference ? referenceState(reference) : "missing",
      ready: referenceState(reference) === "active_image",
    };
  });
  return {
    rows,
    ready: rows.filter((row) => row.ready),
    placeholders: rows.filter((row) => row.state === "placeholder"),
    missing: rows.filter((row) => row.state === "missing"),
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

  const slots = useMemo(eventVisualSlots, []);
  const readiness = useMemo(
    () => visualReadiness(slots, manager.data.references || []),
    [slots, manager.data.references],
  );
  const completion = readiness.rows.length
    ? Math.round((readiness.ready.length / readiness.rows.length) * 100)
    : 100;

  const filteredReferences = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return manager.data.references || [];
    return (manager.data.references || []).filter((reference) =>
      [reference.label, referenceKey(reference), reference.description]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [manager.data.references, search]);

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
      placeholderText: draft.placeholderText || "Reference image coming soon",
      idempotencyKey: createIdempotencyKey(),
    });
    if (result.ok) {
      await manager.refresh();
      setMessage("Visual-standard placeholder created.");
      setDraft(null);
    } else {
      setMessage(result.message);
    }
  };

  const createMissingEventSlots = async () => {
    if (!readiness.missing.length || creatingSlots) return;
    setCreatingSlots(true);
    setMessage("");
    let created = 0;
    const failures = [];
    for (const slot of readiness.missing) {
      const result = await createRoutineReferenceImage({
        referenceKey: slot.id,
        label: slot.label,
        description: `${slot.description} Used by: ${slot.guideTitles.join(", ")}.`,
        placeholderText: "Reference image coming soon",
        idempotencyKey: createIdempotencyKey(),
      });
      if (result.ok) created += 1;
      else failures.push(`${slot.label}: ${result.message || "could not be created"}`);
    }
    await manager.refresh();
    setCreatingSlots(false);
    setMessage(
      failures.length
        ? `${created} placeholder${created === 1 ? "" : "s"} created. ${failures.length} need review: ${failures.join(" · ")}`
        : `${created} event visual-standard placeholder${created === 1 ? "" : "s"} created.`,
    );
  };

  const upload = async () => {
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
    const result = await downloadRoutineCurrentReferenceImage(selected.current.objectPath);
    if (result.ok) {
      setPreview({
        url: URL.createObjectURL(result.blob),
        alt: selected.current.altText || selected.label,
      });
    } else {
      setMessage(result.message);
    }
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
            <span>{readiness.ready.length}/{readiness.rows.length} ready</span>
          </div>
        </div>
      </header>

      <section className="rm-card rm-visual-readiness" aria-labelledby="event-visual-readiness-title">
        <div className="rm-visual-readiness-summary">
          <div>
            <p className="eyebrow">Julie’s event set</p>
            <h3 id="event-visual-readiness-title">Image upload queue</h3>
            <p>
              Every slot below comes from the current event routines. Missing images
              remain visible as honest placeholders; they never silently disappear.
            </p>
          </div>
          <div className="rm-visual-readiness-counts">
            <span><strong>{readiness.ready.length}</strong> ready</span>
            <span><strong>{readiness.placeholders.length}</strong> awaiting image</span>
            <span><strong>{readiness.missing.length}</strong> not created</span>
          </div>
        </div>

        {readiness.missing.length ? (
          <button
            type="button"
            className="primary-button"
            disabled={creatingSlots}
            onClick={createMissingEventSlots}
          >
            {creatingSlots
              ? "Creating safe placeholders…"
              : `Create ${readiness.missing.length} missing event placeholder${readiness.missing.length === 1 ? "" : "s"}`}
          </button>
        ) : (
          <p className="mesh-status is-success" role="status">
            Every required event image slot exists. Uploads can now be completed one by one.
          </p>
        )}

        <div className="rm-visual-slot-grid">
          {readiness.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`rm-visual-slot is-${row.state}`}
              disabled={!row.reference}
              onClick={() => row.reference && choose(row.reference)}
            >
              <span>{row.ready ? "✓" : row.state === "missing" ? "+" : "○"}</span>
              <strong>{row.label}</strong>
              <small>
                {row.ready
                  ? "Ready for staff"
                  : row.state === "missing"
                    ? "Create placeholder first"
                    : "Upload image"}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="rm-card rm-visual-library">
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
              setDraft({
                stableKey: "",
                label: "",
                description: "",
                placeholderText: "Reference image coming soon",
              });
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
                <span>{referenceState(reference) === "active_image" ? "✓" : "○"}</span>
                {reference.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {draft ? (
        <div className="rm-split rm-visual-editor">
          <form
            className="rm-card rm-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (selected) {
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
              } else {
                await create();
              }
            }}
          >
            <header>
              <div>
                <p className="eyebrow">Details</p>
                <h3>{selected ? draft.label : "New visual standard"}</h3>
              </div>
              <StatusPill state={draft.current?.state === "active_image" ? "ready" : "warning"}>
                {draft.current?.state === "active_image" ? "Ready" : "Awaiting image"}
              </StatusPill>
            </header>
            <Field id="reference-key" label="Stable key" help="Permanent identifier; it cannot change after creation.">
              <input
                id="reference-key"
                readOnly={Boolean(selected)}
                value={draft.stableKey || draft.referenceKey || ""}
                onChange={(event) => setDraft({ ...draft, stableKey: event.target.value })}
              />
            </Field>
            <Field id="reference-label" label="Name" help="The name managers and tasks will use.">
              <input
                id="reference-label"
                value={draft.label || ""}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
            </Field>
            <Field id="reference-description" label="What this image proves" help="Describe the standard, not the photo itself.">
              <textarea
                id="reference-description"
                value={draft.description || ""}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>
            <Field id="reference-placeholder" label="Message before upload" help="Shown honestly while the image is missing.">
              <input
                id="reference-placeholder"
                value={draft.placeholderText || ""}
                onChange={(event) => setDraft({ ...draft, placeholderText: event.target.value })}
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
                  <button type="button" className="rm-reference-preview" onClick={open}>
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
                <div className="rm-placeholder">Reference image coming soon</div>
              )}
              <Field id="reference-file" label="Choose image" help="JPEG, PNG or WebP. Maximum 5 MB. File content is checked before upload.">
                <input
                  id="reference-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </Field>
              <Field id="reference-caption" label="Caption" help="Optional short context under the image.">
                <input
                  id="reference-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                />
              </Field>
              <Field id="reference-alt" label="Image description" help="Required so the standard remains understandable with assistive technology.">
                <input
                  id="reference-alt"
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  aria-required="true"
                />
              </Field>
              <button
                type="button"
                className="primary-button"
                disabled={!file || !alt || manager.status === "uploading"}
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
          <h3>Version history</h3>
          <p>Previous versions remain auditable and cannot be silently overwritten.</p>
          <ol className="rm-history">
            {selected.versions?.map((version) => (
              <li key={version.id}>
                <strong>v{version.versionNumber} · {version.state}</strong>
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
                  {usage.itemKey ? ` · ${usage.itemKey}` : ""} · {usage.templateState}
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
            <button type="button" className="primary-button" onClick={() => setPreview(null)}>
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
