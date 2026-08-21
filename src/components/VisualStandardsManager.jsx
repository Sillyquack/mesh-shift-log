import { useEffect, useMemo, useRef, useState } from 'react';
import { canManageVisualStandards } from '../lib/permissions.js';
import { fetchVisualStandardVersions } from '../lib/visualStandardsClient.js';
import {
  VISUAL_STANDARD_IMAGE_TYPES,
  validateVisualStandardFile,
} from '../lib/visualStandards.js';
import { useVisualStandards } from './VisualStandardsProvider.jsx';

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatUpdatedAt(value, emptyLabel = 'Not published') {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return updatedAtFormatter.format(date);
}

function CurrentStandardImage({ standard, className = '' }) {
  if (!standard?.src) {
    return (
      <div className={`visual-standard-empty ${className}`} role="img" aria-label="Awaiting approved photo">
        <span aria-hidden="true">＋</span>
        <strong>Awaiting photo</strong>
      </div>
    );
  }
  return <img className={className} src={standard.src} alt={standard.label} loading="lazy" />;
}

function detailSlotsFor(standard) {
  const slots = new Map(
    (standard?.detailSlots || []).map((slot) => [slot.key, {
      detailKey: slot.key,
      label: slot.label,
      order: slot.order,
      src: '',
      activeVersion: 0,
      activeVersionId: '',
      updatedAt: '',
    }]),
  );
  (standard?.details || []).forEach((detail) => {
    slots.set(detail.detailKey, { ...slots.get(detail.detailKey), ...detail });
  });
  return [...slots.values()].sort(
    (left, right) => left.order - right.order || left.label.localeCompare(right.label),
  );
}

function captureTargetFor(standard, detail = null) {
  return {
    canonicalKey: standard.canonicalKey,
    assetRole: detail ? 'detail' : 'primary',
    detailKey: detail?.detailKey || '',
    label: detail?.label || standard.label,
    order: detail?.order ?? 0,
  };
}

export default function VisualStandardsManager({ user }) {
  const {
    standards,
    publish,
    publishDetail,
    restore,
    restoreDetail,
    status: resolverStatus,
  } = useVisualStandards();
  const [areaFilter, setAreaFilter] = useState('All');
  const [target, setTarget] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [rowFeedback, setRowFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState('idle');
  const [historyNonce, setHistoryNonce] = useState(0);
  const uploadInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const focusRef = useRef(null);

  const canPublish = canManageVisualStandards(user);
  const areas = useMemo(
    () => ['All', ...new Set(standards.map((standard) => standard.area))],
    [standards],
  );
  const visibleStandards = areaFilter === 'All'
    ? standards
    : standards.filter((standard) => standard.area === areaFilter);
  const targetStandard = target
    ? standards.find((standard) => standard.canonicalKey === target.canonicalKey) || null
    : null;
  const targetDetailSlots = useMemo(
    () => detailSlotsFor(targetStandard),
    [targetStandard],
  );
  const targetAsset = target?.assetRole === 'detail'
    ? targetDetailSlots.find((detail) => detail.detailKey === target.detailKey) || null
    : targetStandard;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!historyOpen || !target || !canPublish) {
      setHistory([]);
      setHistoryState('idle');
      return undefined;
    }
    let cancelled = false;
    setHistoryState('loading');
    fetchVisualStandardVersions(target.canonicalKey, {
      detailKey: target.assetRole === 'detail' ? target.detailKey : '',
    }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setHistory(result.records);
        setHistoryState('ready');
      } else {
        setHistory([]);
        setHistoryState('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    historyOpen,
    target?.canonicalKey,
    target?.assetRole,
    target?.detailKey,
    targetAsset?.activeVersion,
    canPublish,
    historyNonce,
  ]);

  function resetSelectedFile() {
    setSelectedFile(null);
    setPreviewUrl('');
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  function focusTarget(nextTarget, { showHistory = false } = {}) {
    resetSelectedFile();
    setTarget(nextTarget);
    setMessage({ type: '', text: '' });
    setHistoryOpen(showHistory);
    window.requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function openPicker(standard, inputType, detail = null) {
    if (!canPublish || saving) return;
    const nextTarget = captureTargetFor(standard, detail);
    focusTarget(nextTarget);
    window.requestAnimationFrame(() => {
      const input = inputType === 'camera' ? cameraInputRef.current : uploadInputRef.current;
      input?.click();
    });
  }

  function chooseFile(file) {
    const validation = validateVisualStandardFile(file);
    if (!validation.ok) {
      resetSelectedFile();
      setMessage({ type: 'error', text: validation.message });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMessage({
      type: 'pending',
      text: 'Preview ready. Nothing is live until you press Save.',
    });
  }

  function cancelCapture() {
    resetSelectedFile();
    setTarget(null);
    setHistoryOpen(false);
    setMessage({ type: '', text: '' });
  }

  async function saveReplacement() {
    if (!target || !selectedFile || saving) return;
    const fileToPublish = selectedFile;
    const targetToPublish = target;
    setSaving(true);
    setMessage({ type: 'pending', text: 'Uploading and publishing…' });
    const result = targetToPublish.assetRole === 'detail'
      ? await publishDetail({
        canonicalKey: targetToPublish.canonicalKey,
        detailKey: targetToPublish.detailKey,
        label: targetToPublish.label,
        order: targetToPublish.order,
        file: fileToPublish,
      })
      : await publish({
        canonicalKey: targetToPublish.canonicalKey,
        file: fileToPublish,
      });
    setSaving(false);
    if (!result.ok) {
      const cleanupNote = result.cleanupError
        ? ' The inactive upload could not be cleaned up automatically; the previous live image remains active.'
        : '';
      setMessage({ type: 'error', text: `${result.message}${cleanupNote}` });
      return;
    }
    resetSelectedFile();
    setTarget(null);
    setHistoryOpen(false);
    setRowFeedback({
      canonicalKey: targetToPublish.canonicalKey,
      type: result.deliveryError ? 'warning' : 'success',
      text: result.deliveryError
        ? result.message
        : `${targetToPublish.label} saved and published.`,
    });
  }

  async function restoreVersion(version) {
    if (!target || saving) return;
    if (!window.confirm(`Restore version ${version.version} as the live image?`)) return;
    setSaving(true);
    setMessage({ type: 'pending', text: `Restoring version ${version.version}…` });
    const result = target.assetRole === 'detail'
      ? await restoreDetail({
        canonicalKey: target.canonicalKey,
        detailKey: target.detailKey,
        versionId: version.id,
        notes: `Restored from version ${version.version}`,
      })
      : await restore({
        canonicalKey: target.canonicalKey,
        versionId: version.id,
        notes: `Restored from version ${version.version}`,
      });
    setSaving(false);
    setMessage({
      type: result.ok ? (result.deliveryError ? 'warning' : 'success') : 'error',
      text: result.message,
    });
    if (result.ok) setHistoryNonce((current) => current + 1);
  }

  return (
    <section className="panel visual-standards-manager" data-manager-section="visual-standards">
      <div className="section-heading static-heading visual-standard-manager-heading">
        <div>
          <p className="eyebrow">Manager content</p>
          <h2>Default Standards</h2>
          <p className="muted">Take or choose a photo from its row. Save is always explicit.</p>
        </div>
        <span>{standards.length} standards</span>
      </div>

      {!canPublish && (
        <p className="status-message">
          Email login with an active manager profile is required to replace images. Current standards remain readable.
        </p>
      )}
      {resolverStatus.state === 'error' && (
        <p className="critical-warning">
          Live backend assets are unavailable. Bundled and awaiting-photo fallbacks remain active.
        </p>
      )}

      <label className="visual-standard-area-select">
        <span>Area</span>
        <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
          {areas.map((area) => <option key={area} value={area}>{area}</option>)}
        </select>
      </label>

      <input
        ref={uploadInputRef}
        className="visually-hidden"
        type="file"
        tabIndex="-1"
        aria-label="Choose a Visual Standard image"
        accept={VISUAL_STANDARD_IMAGE_TYPES.join(',')}
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        className="visually-hidden"
        type="file"
        tabIndex="-1"
        aria-label="Take a Visual Standard photo"
        accept="image/*"
        capture="environment"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />

      <div className="visual-standard-list">
        {visibleStandards.map((standard) => (
          <article key={standard.canonicalKey} className="visual-standard-row">
            <CurrentStandardImage standard={standard} className="visual-standard-row-thumbnail" />
            <div className="visual-standard-row-copy">
              <strong>{standard.label}</strong>
              <span className={`visual-standard-source source-${standard.source}`}>
                {standard.sourceLabel}
              </span>
              <small>
                {standard.activeVersion ? `v${standard.activeVersion} · ` : ''}
                {formatUpdatedAt(
                  standard.updatedAt,
                  standard.source === 'bundled' ? 'Bundled with app' : 'Not published',
                )}
              </small>
            </div>
            <div
              className="visual-standard-row-actions"
              role="group"
              aria-label={`${standard.label} actions`}
            >
              <button
                type="button"
                className="text-button"
                onClick={() => focusTarget(captureTargetFor(standard))}
              >
                View
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canPublish || saving}
                onClick={() => openPicker(standard, 'camera')}
                aria-label={`Camera for ${standard.label}`}
              >
                Camera
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canPublish || saving}
                onClick={() => openPicker(standard, 'upload')}
                aria-label={`Upload for ${standard.label}`}
              >
                Upload
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!canPublish}
                onClick={() => focusTarget(captureTargetFor(standard), { showHistory: true })}
              >
                History
              </button>
            </div>
            {rowFeedback?.canonicalKey === standard.canonicalKey && (
              <p
                className={rowFeedback.type === 'success' ? 'all-clear' : 'status-message'}
                role="status"
              >
                {rowFeedback.text}
              </p>
            )}
          </article>
        ))}
      </div>

      {targetStandard && (
        <section
          ref={focusRef}
          className="visual-standard-capture"
          aria-label={`Update ${target.label}`}
        >
          <div className="visual-standard-capture-heading">
            <div>
              <p className="eyebrow">
                {target.assetRole === 'detail' ? 'Detail image' : targetStandard.area}
              </p>
              <h3>{target.label}</h3>
              <small>{targetStandard.section}</small>
            </div>
            <button type="button" className="text-button" onClick={cancelCapture}>
              Close
            </button>
          </div>

          {previewUrl ? (
            <figure className="visual-standard-replacement-preview">
              <img src={previewUrl} alt={`Replacement preview for ${target.label}`} />
              <figcaption>
                <strong>Replacement preview</strong>
                <span>{selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} KB</span>
              </figcaption>
            </figure>
          ) : (
            <div className="visual-standard-capture-empty">
              <strong>Ready for a new photo</strong>
              <span>Use Camera or Upload. The live image will not change until Save.</span>
            </div>
          )}

          <details className="visual-standard-current-compact">
            <summary>
              {targetAsset?.src ? <img src={targetAsset.src} alt="" /> : <span aria-hidden="true">＋</span>}
              <span>
                <strong>View current</strong>
                <small>{targetAsset?.src ? `Version ${targetAsset.activeVersion || targetStandard.activeVersion}` : 'No published image'}</small>
              </span>
            </summary>
            {targetAsset?.src ? (
              <img src={targetAsset.src} alt={`Current live ${target.label}`} />
            ) : (
              <p className="muted">This slot is awaiting its first approved photo.</p>
            )}
          </details>

          <div className="visual-standard-capture-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!canPublish || !selectedFile || saving}
              onClick={saveReplacement}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!canPublish || saving}
              onClick={() => openPicker(targetStandard, 'camera', target.assetRole === 'detail' ? target : null)}
            >
              {selectedFile ? 'Retake' : 'Camera'}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!canPublish || saving}
              onClick={() => openPicker(targetStandard, 'upload', target.assetRole === 'detail' ? target : null)}
            >
              {selectedFile ? 'Choose another' : 'Upload'}
            </button>
            <button type="button" className="text-button" disabled={saving} onClick={cancelCapture}>
              Cancel
            </button>
          </div>

          {message.text && (
            <p
              className={
                message.type === 'error'
                  ? 'critical-warning'
                  : message.type === 'success'
                    ? 'all-clear'
                    : 'status-message'
              }
              role="status"
              aria-live="polite"
            >
              {message.text}
            </p>
          )}

          {target.assetRole === 'primary' && targetDetailSlots.length > 0 && (
            <details className="visual-standard-detail-manager">
              <summary>Detail images ({targetStandard.details?.length || 0} published)</summary>
              <div>
                {targetDetailSlots.map((detail) => (
                  <article key={detail.detailKey} className="visual-standard-detail-row">
                    {detail.src ? <img src={detail.src} alt="" /> : <span aria-hidden="true">＋</span>}
                    <div>
                      <strong>{detail.label}</strong>
                      <small>{detail.src ? `Version ${detail.activeVersion}` : 'Optional · not published'}</small>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!canPublish || saving}
                      onClick={() => openPicker(targetStandard, 'camera', detail)}
                    >
                      Camera
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!canPublish || saving}
                      onClick={() => openPicker(targetStandard, 'upload', detail)}
                    >
                      Upload
                    </button>
                    {detail.activeVersion > 0 && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={!canPublish || saving}
                        onClick={() => focusTarget(captureTargetFor(targetStandard, detail), { showHistory: true })}
                      >
                        History
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </details>
          )}

          {!historyOpen ? (
            <button
              type="button"
              className="text-button visual-standard-history-trigger"
              disabled={!canPublish}
              onClick={() => setHistoryOpen(true)}
            >
              History & restore
            </button>
          ) : (
            <section className="visual-standard-history">
              <div className="visual-standard-history-heading">
                <div>
                  <h4>Version history</h4>
                  <p className="muted">Restore creates a new audited version.</p>
                </div>
                <button type="button" className="text-button" onClick={() => setHistoryOpen(false)}>
                  Hide
                </button>
              </div>
              {historyState === 'loading' && <p className="muted">Loading history…</p>}
              {historyState === 'error' && <p className="critical-warning">Version history is unavailable.</p>}
              {historyState === 'ready' && history.length === 0 && <p className="muted">No published versions yet.</p>}
              {history.map((version) => {
                const isActive = version.id === targetAsset?.activeVersionId;
                return (
                  <article key={version.id} className="visual-standard-version-row">
                    {version.signedUrl ? (
                      <img
                        className="visual-standard-version-preview"
                        src={version.signedUrl}
                        alt={`Version ${version.version} preview`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="visual-standard-version-preview visual-standard-version-preview-empty">
                        Preview unavailable
                      </div>
                    )}
                    <div>
                      <strong>Version {version.version}{isActive ? ' · Active' : ''}</strong>
                      <span>{formatUpdatedAt(version.createdAt)}</span>
                      <small>{version.createdByName || version.createdBy || 'Unknown updater'}</small>
                    </div>
                    {!isActive && (
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        disabled={!canPublish || saving}
                        onClick={() => restoreVersion(version)}
                      >
                        Restore
                      </button>
                    )}
                  </article>
                );
              })}
            </section>
          )}
        </section>
      )}
    </section>
  );
}
