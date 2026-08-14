import { useEffect, useMemo, useState } from "react";
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
import "./RoutineManagerExperience.css";

const EMPTY_REFERENCE = {
  stableKey: "",
  label: "",
  description: "",
  placeholderText: "Visual standard coming soon",
};

export default function RoutineReferenceManager({ loader, uploader }) {
  const manager = useRoutineReferenceManager({ loader, uploader });
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const references = Array.isArray(manager.data.references) ? manager.data.references : [];
  const usage = Array.isArray(manager.data.usage) ? manager.data.usage : [];
  const readyCount = references.filter((reference) => reference.active !== false && reference.current?.state === "active_image").length;
  const activeCount = references.filter((reference) => reference.active !== false).length;
  const progress = activeCount ? Math.round((readyCount / activeCount) * 100) : 100;

  const selectedUsage = useMemo(
    () => selected ? usage.filter((entry) => entry.referenceId === selected.id) : [],
    [selected, usage],
  );

  const choose = (reference) => {
    setSelected(reference);
    setDraft({ ...reference });
    setFile(null);
    setCaption("");
    setAlt("");
    setMessage("");
  };

  const startCreate = () => {
    setSelected(null);
    setDraft({ ...EMPTY_REFERENCE });
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
      placeholderText: draft.placeholderText || "Visual standard coming soon",
      idempotencyKey: createIdempotencyKey(),
    });
    if (result.ok) {
      await manager.refresh();
      setMessage("Logical placeholder created.");
      setDraft(null);
    } else {
      setMessage(result.message);
    }
  };

  const saveMetadata = async () => {
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
      setMessage("Visual standard details saved.");
    } else {
      setMessage(result.message);
    }
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
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ url: URL.createObjectURL(result.blob), alt: selected.current.altText || selected.label });
    } else {
      setMessage(result.message);
    }
  };

  return (
    <section className="rm-stack mesh-visual-standards">
      <header className="mesh-visual-standards-hero">
        <div>
          <p className="eyebrow">Visual standards</p>
          <h2>Show exactly what “done” looks like.</h2>
          <p>Choose a standard, upload the approved photo and add useful alt text. Employees will see the image only when they ask for help.</p>
        </div>
        <div className="mesh-visual-progress" style={{ "--mesh-visual-progress": `${progress}%` }} role="progressbar" aria-label="Visual standards ready" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
          <div><strong>{readyCount}/{activeCount}</strong><span>images ready</span></div>
        </div>
      </header>

      <div className="mesh-visual-actions">
        <div><strong>{activeCount - readyCount}</strong><span>still need an image</span></div>
        <button type="button" className="primary-button" onClick={startCreate}>Create reference</button>
      </div>

      {!references.length && !draft ? (
        <EmptyState title="No logical references">Create a placeholder now; a missing image remains a warning, never a blocker.</EmptyState>
      ) : (
        <section className="mesh-visual-gallery" aria-label="Visual standard library">
          {references.map((reference) => {
            const ready = reference.current?.state === "active_image";
            const uses = usage.filter((entry) => entry.referenceId === reference.id).length;
            return (
              <button type="button" className={`mesh-visual-card${selected?.id === reference.id ? " is-selected" : ""}`} key={reference.id} onClick={() => choose(reference)}>
                <span className={`mesh-visual-thumb${ready ? " is-ready" : ""}`} aria-hidden="true">{ready ? "✓" : "+"}</span>
                <span className="mesh-visual-card-copy">
                  <strong>{reference.label}</strong>
                  <small>{ready ? "Image ready" : reference.placeholderText || "Visual standard coming soon"}</small>
                  <span>{uses} task link{uses === 1 ? "" : "s"}</span>
                </span>
                <StatusPill state={ready ? "ready" : "warning"}>{ready ? "Ready" : "Needs image"}</StatusPill>
              </button>
            );
          })}
        </section>
      )}

      {draft && (
        <section className="mesh-visual-editor">
          <header className="mesh-manager-tool-heading">
            <div>
              <p className="eyebrow">{selected ? "Edit visual standard" : "New visual standard"}</p>
              <h2>{selected ? draft.label : "Create a clear placeholder"}</h2>
              <p>{selected ? "Update the image or descriptive text without changing immutable version history." : "Create the logical reference first, then upload the approved image."}</p>
            </div>
            <button type="button" className="ghost-button" onClick={() => { setSelected(null); setDraft(null); }}>Close</button>
          </header>

          <div className="rm-split">
            <form className="rm-card rm-form" onSubmit={async (event) => { event.preventDefault(); if (selected) await saveMetadata(); else await create(); }}>
              <header>
                <h3>Details</h3>
                <StatusPill state={draft.current?.state === "active_image" ? "ready" : "warning"}>{draft.current?.state || "placeholder"}</StatusPill>
              </header>
              <Field id="reference-key" label="Stable key" help="Immutable after creation.">
                <input id="reference-key" readOnly={Boolean(selected)} value={draft.stableKey || ""} onChange={(event) => setDraft({ ...draft, stableKey: event.target.value })} />
              </Field>
              <Field id="reference-label" label="Name" help="The human label managers and employees see.">
                <input id="reference-label" value={draft.label || ""} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
              </Field>
              <Field id="reference-description" label="Instruction" help="Short context for when this image should be used.">
                <textarea id="reference-description" value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </Field>
              <Field id="reference-placeholder" label="Placeholder text" help="Shown until an approved photo exists.">
                <input id="reference-placeholder" value={draft.placeholderText || ""} onChange={(event) => setDraft({ ...draft, placeholderText: event.target.value })} />
              </Field>
              <div className="rm-actions">
                <button className="primary-button">{selected ? "Save details" : "Create placeholder"}</button>
                {selected && (
                  <button type="button" className="ghost-button" onClick={async () => {
                    await setRoutineReferenceImageActive({
                      referenceId: selected.id,
                      active: !selected.active,
                      expectedRevision: selected.revision,
                      idempotencyKey: createIdempotencyKey(),
                    });
                    await manager.refresh();
                  }}>{selected.active ? "Deactivate" : "Activate"}</button>
                )}
              </div>
            </form>

            {selected && (
              <section className="rm-card rm-form mesh-visual-upload-panel">
                <h3>Approved image</h3>
                {selected.current?.state === "active_image" ? (
                  <>
                    <button type="button" className="rm-reference-preview mesh-current-image" onClick={open}>
                      <span>Open larger</span>
                      <small>{selected.current.mimeType} · {selected.current.byteSize} bytes</small>
                    </button>
                    <button type="button" className="ghost-button" onClick={async () => {
                      const result = await setRoutineReferenceImagePlaceholder({
                        referenceId: selected.id,
                        placeholderText: selected.placeholderText,
                        expectedReferenceRevision: selected.revision,
                        idempotencyKey: createIdempotencyKey(),
                      });
                      if (result.ok) await manager.refresh();
                    }}>Remove image to new placeholder</button>
                  </>
                ) : (
                  <div className="rm-placeholder mesh-upload-placeholder">Visual standard coming soon</div>
                )}

                <label className="mesh-file-drop" htmlFor="reference-file">
                  <strong>{file ? file.name : "Choose an approved photo"}</strong>
                  <span>JPEG, PNG or WebP · maximum 5 MB</span>
                  <input id="reference-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                </label>
                <Field id="reference-caption" label="Caption" help="Optional short context under the image.">
                  <input id="reference-caption" value={caption} onChange={(event) => setCaption(event.target.value)} />
                </Field>
                <Field id="reference-alt" label="Alt text" help="Describe what a person should understand from the image.">
                  <input id="reference-alt" value={alt} onChange={(event) => setAlt(event.target.value)} aria-required="true" />
                </Field>
                <button type="button" className="primary-button" disabled={!file || !alt || manager.status === "uploading"} onClick={upload}>
                  {manager.status === "uploading" ? `Uploading ${manager.progress}%` : "Prepare, upload and finalize"}
                </button>
              </section>
            )}
          </div>

          {selected && (
            <details className="mesh-manager-release-details">
              <summary>Version history and task usage</summary>
              <div>
                <h3>Immutable version history</h3>
                <ol className="rm-history">
                  {selected.versions?.map((version) => <li key={version.id}><strong>v{version.versionNumber} · {version.state}</strong><small>{version.caption || version.createdAt}</small></li>)}
                </ol>
                <h3>Usage</h3>
                <ul>{selectedUsage.map((entry, index) => <li key={`${entry.routineKey}-${entry.taskKey}-${index}`}>{entry.routineKey} · {entry.taskKey}{entry.itemKey ? ` · ${entry.itemKey}` : ""} · {entry.templateState}</li>)}</ul>
              </div>
            </details>
          )}
        </section>
      )}

      <p role="status" aria-live="polite">{message}</p>
      {preview && (
        <Modal title="Reference image" onClose={() => setPreview(null)} actions={<button type="button" className="primary-button" onClick={() => setPreview(null)}>Close</button>}>
          <img className="rm-full-image" src={preview.url} alt={preview.alt} />
        </Modal>
      )}
      <span className="sr-only">Reference Manager · Current image · Immutable reference images</span>
    </section>
  );
}
