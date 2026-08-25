import { useEffect, useMemo, useRef, useState } from 'react';
import { buildInventoryDefaultRecords } from '../data/inventoryDefaults.js';
import {
  INVENTORY_REFERENCE_IMAGE_TYPES,
  fetchInventoryDefaults,
  publishInventoryReference,
  validateInventoryReferenceFile,
  verifyInventoryRefrigeratorTemplate,
} from '../lib/inventoryDefaultsClient.js';
import { canManageVisualStandards } from '../lib/permissions.js';
import { useVisualStandards } from './VisualStandardsProvider.jsx';

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : timestampFormatter.format(date);
}

export function InventoryLocationReferenceState({ location, relatedStandard }) {
  const guidance = location.guidance;
  return (
    <div className="inventory-location-reference-state">
      {guidance?.imageUrl ? (
        <img src={guidance.imageUrl} alt={`${location.name} reference`} loading="lazy" />
      ) : (
        <div
          className="inventory-reference-placeholder"
          role="img"
          aria-label={location.hasReferencePhoto ? 'Reference photo preview unavailable' : 'Awaiting reference photo'}
          data-location-code={location.code}
        >
          <span aria-hidden="true">＋</span>
          <strong>
            {location.hasReferencePhoto
              ? 'Reference photo recorded · preview unavailable'
              : 'Awaiting reference photo'}
          </strong>
        </div>
      )}
      <div className="inventory-location-reference-copy">
        <strong>{location.hasReferencePhoto ? 'Reference photo available' : 'Awaiting reference photo'}</strong>
        {guidance?.caption && <span>{guidance.caption}</span>}
        {guidance?.updatedAt && <small>Updated {formatTimestamp(guidance.updatedAt)}</small>}
        {relatedStandard && (
          <small data-related-visual-key={location.visualStandardKey}>
            Related Visual Standard: {relatedStandard.sourceLabel}
          </small>
        )}
      </div>
    </div>
  );
}

function RefrigeratorTemplateState({ location, canManage, busy, onVerify }) {
  const state = location.templateState;
  if (!state) return null;
  return (
    <div className={`inventory-template-state template-${state.status}`}>
      <div>
        <strong>{state.label}</strong>
        <span>
          {state.productCount} active products · {state.parCount} par values ·{' '}
          {state.defaultRestockCount} default-restock values
        </span>
        {state.status === 'verified' ? (
          <small>
            Verified by {state.verifiedByName} · {formatTimestamp(state.verifiedAt)}
          </small>
        ) : (
          <ul>
            {state.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )}
        <small>Default-restock values and reference photos are not verification requirements.</small>
      </div>
      {state.status !== 'verified' && (
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={!canManage || !location.id || !state.canVerify || busy}
          onClick={onVerify}
        >
          Verify template
        </button>
      )}
    </div>
  );
}

export default function InventoryDefaultsManager({ user }) {
  const { resolve } = useVisualStandards();
  const [records, setRecords] = useState(() => buildInventoryDefaultRecords());
  const [status, setStatus] = useState({ state: 'loading', message: 'Loading Inventory Defaults…' });
  const [targetCode, setTargetCode] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busyCode, setBusyCode] = useState('');
  const uploadInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canManage = canManageVisualStandards(user);
  const target = records.find((record) => record.code === targetCode) || null;

  async function refresh() {
    const result = await fetchInventoryDefaults();
    if (result.records) setRecords(result.records);
    setStatus({
      state: result.ok ? 'ready' : result.mode === 'backend_unavailable' ? 'fallback' : 'error',
      message: result.message,
    });
    return result;
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const areaGroups = useMemo(() => {
    const groups = new Map();
    records.forEach((record) => {
      const current = groups.get(record.area) || [];
      current.push(record);
      groups.set(record.area, current);
    });
    return [...groups.entries()];
  }, [records]);

  function clearCapture() {
    setTargetCode('');
    setSelectedFile(null);
    setPreviewUrl('');
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  function openPicker(location, type) {
    if (!canManage || !location.id) return;
    clearCapture();
    setTargetCode(location.code);
    window.requestAnimationFrame(() => {
      (type === 'camera' ? cameraInputRef.current : uploadInputRef.current)?.click();
    });
  }

  function chooseFile(file) {
    const validation = validateInventoryReferenceFile(file);
    if (!validation.ok) {
      setStatus({ state: 'error', message: validation.message });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus({ state: 'pending', message: 'Preview ready. Nothing is saved until you press Save.' });
  }

  async function saveReference() {
    if (!target || !selectedFile || busyCode) return;
    setBusyCode(target.code);
    setStatus({ state: 'pending', message: `Saving ${target.name} reference photo…` });
    const result = await publishInventoryReference({
      location: target,
      file: selectedFile,
      caption: target.guidance?.caption || '',
      expectedRevision: target.guidance?.revision || 0,
    });
    if (result.ok) {
      clearCapture();
      await refresh();
    } else {
      setStatus({ state: 'error', message: result.message });
    }
    setBusyCode('');
  }

  async function verifyTemplate(location) {
    if (!canManage || busyCode) return;
    if (!window.confirm(`Manager-verify the refrigerator template for ${location.name}?`)) return;
    setBusyCode(location.code);
    setStatus({ state: 'pending', message: `Verifying ${location.name}…` });
    const result = await verifyInventoryRefrigeratorTemplate(location.id);
    if (result.ok) await refresh();
    else setStatus({ state: 'error', message: result.message });
    setBusyCode('');
  }

  return (
    <section className="panel inventory-defaults-manager" data-manager-section="inventory-defaults">
      <div className="section-heading static-heading">
        <div>
          <p className="eyebrow">Manager inventory</p>
          <h2>Inventory Locations & Fridge Defaults</h2>
          <p className="muted">
            Location reference photos stay separate from approved setup Visual Standards.
          </p>
        </div>
        <span>{records.length} locations</span>
      </div>

      {!canManage && (
        <p className="status-message">
          Email login with an active manager profile is required to upload reference photos or verify templates.
        </p>
      )}
      {status.message && (
        <p className={status.state === 'error' ? 'critical-warning' : 'status-message'} role="status">
          {status.message}
        </p>
      )}

      <input
        ref={uploadInputRef}
        className="visually-hidden"
        type="file"
        tabIndex="-1"
        accept={INVENTORY_REFERENCE_IMAGE_TYPES.join(',')}
        aria-label="Choose an inventory location reference photo"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        className="visually-hidden"
        type="file"
        tabIndex="-1"
        accept="image/*"
        capture="environment"
        aria-label="Take an inventory location reference photo"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />

      {areaGroups.map(([area, locations]) => (
        <div key={area} className="inventory-default-area">
          <h3>{area}</h3>
          <div className="inventory-default-list">
            {locations.map((location) => {
              const relatedStandard = location.visualStandardKey
                ? resolve(location.visualStandardKey)
                : null;
              return (
                <article key={location.code} className="inventory-default-row" data-location-code={location.code}>
                  <div className="inventory-default-row-heading">
                    <div>
                      <strong>{location.name}</strong>
                      <code>{location.code}</code>
                    </div>
                    {!location.id && <span className="visual-standard-source">Active location unavailable</span>}
                  </div>
                  <InventoryLocationReferenceState
                    location={location}
                    relatedStandard={relatedStandard}
                  />
                  <div className="inventory-default-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!canManage || !location.id || Boolean(busyCode)}
                      onClick={() => openPicker(location, 'camera')}
                    >
                      Camera
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!canManage || !location.id || Boolean(busyCode)}
                      onClick={() => openPicker(location, 'upload')}
                    >
                      Upload
                    </button>
                  </div>
                  <RefrigeratorTemplateState
                    location={location}
                    canManage={canManage}
                    busy={busyCode === location.code}
                    onVerify={() => verifyTemplate(location)}
                  />
                </article>
              );
            })}
          </div>
        </div>
      ))}

      {target && (
        <section className="inventory-reference-capture" aria-label={`Update ${target.name} reference photo`}>
          <div className="section-heading static-heading">
            <div>
              <p className="eyebrow">Reference photo</p>
              <h3>{target.name}</h3>
            </div>
            <button type="button" className="text-button" onClick={clearCapture}>Close</button>
          </div>
          {previewUrl ? (
            <figure>
              <img src={previewUrl} alt={`Reference preview for ${target.name}`} />
              <figcaption>{selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} KB</figcaption>
            </figure>
          ) : (
            <p className="muted">Choose or take a photo. The current reference remains unchanged until Save.</p>
          )}
          <div className="inventory-default-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!selectedFile || Boolean(busyCode)}
              onClick={saveReference}
            >
              {busyCode ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="ghost-button" onClick={() => openPicker(target, 'camera')}>Camera</button>
            <button type="button" className="ghost-button" onClick={() => openPicker(target, 'upload')}>Upload</button>
            <button type="button" className="text-button" onClick={clearCapture}>Cancel</button>
          </div>
        </section>
      )}
    </section>
  );
}
