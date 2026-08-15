import { useEffect, useRef, useState } from 'react';
import { inventoryReferencePlaceholder } from '../data/inventoryLocationGuidance.js';
import { locationSupportsReferenceGuidance } from '../data/inventoryLocationAlignment.js';
import {
  cleanupInventoryReferenceImages,
  loadInventoryReferenceImage,
  removeInventoryLocationReferenceImage,
  saveInventoryLocationReferenceGuidance,
} from '../lib/inventoryClient.js';

function ReferenceImage({ guidance, locationName }) {
  const [state, setState] = useState({ status: guidance?.objectPath ? 'loading' : 'empty', url: '', message: '' });
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!guidance?.objectPath) {
      setState({ status: 'empty', url: '', message: '' });
      return () => {};
    }
    setState({ status: 'loading', url: '', message: '' });
    loadInventoryReferenceImage(guidance.objectPath).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setState({ status: 'error', url: '', message: result.message || 'Reference image unavailable.' });
        return;
      }
      objectUrl = URL.createObjectURL(result.blob);
      setState({ status: 'ready', url: objectUrl, message: '' });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [guidance?.objectPath]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeViewer = () => {
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeViewer();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  if (state.status === 'loading') return <div className="inventory-reference-state" role="status" aria-busy="true">Loading reference image…</div>;
  if (state.status === 'error') return <div className="inventory-reference-state error" role="alert"><strong>Reference image unavailable</strong><span>{state.message}</span></div>;
  if (state.status !== 'ready') return null;
  return (
    <>
      <button ref={triggerRef} type="button" className="inventory-reference-preview" onClick={() => setOpen(true)} aria-label={`Open reference image for ${locationName}`}>
        <img src={state.url} alt={`Current setup reference for ${locationName}`} />
        <span>Open larger</span>
      </button>
      {open && (
        <div className="inventory-reference-viewer" role="dialog" aria-modal="true" aria-label={`${locationName} reference image`} onClick={() => setOpen(false)}>
          <div className="inventory-reference-viewer-content" onClick={(event) => event.stopPropagation()}>
            <div className="inventory-panel-heading"><strong>{locationName}</strong><button ref={closeRef} type="button" className="secondary-button" onClick={() => setOpen(false)}>Close</button></div>
            <img src={state.url} alt={`Current setup reference for ${locationName}`} />
            {guidance.caption && <p>{guidance.caption}</p>}
          </div>
        </div>
      )}
    </>
  );
}

export function LocationReferenceViewer({ locationName, guidance, canManage = false, children = null }) {
  const placeholder = inventoryReferencePlaceholder(locationName, canManage);
  return (
    <section className="inventory-panel inventory-reference-card" data-reference-location={guidance?.locationId || ''}>
      <div className="inventory-panel-heading"><div><p className="eyebrow">Current setup guidance</p><h3>{locationName}</h3></div></div>
      {guidance?.objectPath ? <ReferenceImage guidance={guidance} locationName={locationName} /> : (
        <div className="inventory-reference-placeholder" data-reference-empty="true">
          <strong>{placeholder.title}</strong>
          <p>{placeholder.message}</p>
          {canManage && <span>{placeholder.action}</span>}
        </div>
      )}
      {guidance?.caption ? <p className="inventory-reference-caption"><strong>Setup instruction:</strong> {guidance.caption}</p> : <p className="muted">No setup instruction has been added.</p>}
      <p className="inventory-policy-note">Visual guidance may include products, coffee cups, water glasses, or other fixed setup items. It never changes count lines, targets, completion, or inventory evidence.</p>
      {children}
    </section>
  );
}

function ManagerReferenceCard({ organizationId, location, guidance, requestWriteAccess, refresh, setStatus }) {
  const [caption, setCaption] = useState(guidance?.caption || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setCaption(guidance?.caption || '');
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [guidance?.caption, guidance?.objectPath, guidance?.revision]);

  const save = async () => {
    if (!(await requestWriteAccess())) return;
    setBusy(true);
    const result = await saveInventoryLocationReferenceGuidance({
      organizationId,
      locationId: location.id,
      currentGuidance: guidance,
      caption,
      file,
    });
    setBusy(false);
    setStatus(result);
    if (result.ok) await refresh(true);
  };

  const remove = async () => {
    if (!(await requestWriteAccess())) return;
    setBusy(true);
    const result = await removeInventoryLocationReferenceImage({ locationId: location.id, currentGuidance: guidance });
    setBusy(false);
    setStatus(result);
    if (result.ok) await refresh(true);
  };

  return (
    <LocationReferenceViewer locationName={location.name} guidance={guidance} canManage>
      <div className="inventory-reference-manager-actions">
        <label>Reference image
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <span>JPEG, PNG, or WebP · maximum 5 MB.</span>
        </label>
        <label>Short setup instruction
          <textarea rows="2" maxLength="500" value={caption} disabled={busy} onChange={(event) => setCaption(event.target.value)} />
        </label>
        <div className="inventory-action-row">
          <button type="button" className="primary-button" disabled={busy || (!file && caption === (guidance?.caption || ''))} onClick={save}>
            {busy ? 'Saving…' : guidance?.objectPath ? file ? 'Replace image and save' : 'Save instruction' : 'Upload image or save instruction'}
          </button>
          {guidance?.objectPath && <button type="button" className="secondary-button" disabled={busy} onClick={remove}>Remove image</button>}
        </div>
      </div>
    </LocationReferenceViewer>
  );
}

export function LocationReferenceGuidanceManager({ data, requestWriteAccess, refresh, setStatus }) {
  const cleanupStarted = useRef(false);
  useEffect(() => {
    if (cleanupStarted.current) return;
    cleanupStarted.current = true;
    cleanupInventoryReferenceImages().catch(() => {});
  }, []);
  const locations = data.locations.filter(locationSupportsReferenceGuidance)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || left.name.localeCompare(right.name));
  const guidanceByLocation = new Map(data.referenceGuidance.map((guidance) => [guidance.locationId, guidance]));
  return (
    <section className="inventory-stack inventory-reference-manager">
      <div className="inventory-panel">
        <p className="eyebrow">Manager-controlled reference guidance</p>
        <h2>Location reference images</h2>
        <p className="muted">Images describe the current operational setup and can be replaced without a deployment. They remain separate from Stock Count snapshots and approved history.</p>
      </div>
      {locations.map((location) => (
        <ManagerReferenceCard
          key={location.id}
          organizationId={data.storageSettings?.organizationId || ''}
          location={location}
          guidance={guidanceByLocation.get(location.id) || { locationId: location.id, revision: 0 }}
          requestWriteAccess={requestWriteAccess}
          refresh={refresh}
          setStatus={setStatus}
        />
      ))}
      {!locations.length && <section className="inventory-panel inventory-empty"><h2>No eligible locations</h2><p>Enable reference guidance for an active location before adding setup guidance.</p></section>}
    </section>
  );
}
