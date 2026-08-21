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
        <strong>Awaiting approved photo</strong>
        <span>No bundled or backend image is active.</span>
      </div>
    );
  }
  return (
    <img
      className={className}
      src={standard.src}
      alt={standard.label}
      loading="lazy"
    />
  );
}

export default function VisualStandardsManager({ user }) {
  const { standards, publish, restore, status: resolverStatus } = useVisualStandards();
  const [areaFilter, setAreaFilter] = useState('All');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState('idle');
  const uploadInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const editorRef = useRef(null);

  const canPublish = canManageVisualStandards(user);
  const areas = useMemo(
    () => ['All', ...new Set(standards.map((standard) => standard.area))],
    [standards],
  );
  const visibleStandards = areaFilter === 'All'
    ? standards
    : standards.filter((standard) => standard.area === areaFilter);
  const selectedStandard = standards.find(
    (standard) => standard.canonicalKey === selectedKey,
  ) || null;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!selectedStandard || !canPublish) {
      setHistory([]);
      setHistoryState('idle');
      return;
    }

    let cancelled = false;
    setHistoryState('loading');
    fetchVisualStandardVersions(selectedStandard.canonicalKey).then((result) => {
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
  }, [selectedStandard?.canonicalKey, selectedStandard?.activeVersion, canPublish]);

  function resetSelectedFile() {
    setSelectedFile(null);
    setPreviewUrl('');
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  function openEditor(canonicalKey) {
    resetSelectedFile();
    setMessage({ type: '', text: '' });
    setSelectedKey(canonicalKey);
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    setMessage({ type: 'pending', text: 'Preview ready. The live standard is unchanged until Save.' });
  }

  async function saveReplacement() {
    if (!selectedStandard || !selectedFile || saving) return;
    setSaving(true);
    setMessage({ type: 'pending', text: 'Uploading and publishing…' });
    const result = await publish({
      canonicalKey: selectedStandard.canonicalKey,
      file: selectedFile,
    });
    setSaving(false);
    if (!result.ok) {
      const cleanupNote = result.cleanupError
        ? ' The inactive upload could not be cleaned up automatically; the previous live standard is still active.'
        : '';
      setMessage({
        type: 'error',
        text: `${result.message}${cleanupNote}`,
      });
      return;
    }
    resetSelectedFile();
    setMessage({ type: 'success', text: 'Saved. The new image is now the live canonical standard.' });
  }

  async function restoreVersion(version) {
    if (!selectedStandard || saving) return;
    if (!window.confirm(`Restore version ${version.version} as the live standard?`)) return;
    setSaving(true);
    setMessage({ type: 'pending', text: `Restoring version ${version.version}…` });
    const result = await restore({
      canonicalKey: selectedStandard.canonicalKey,
      versionId: version.id,
      notes: `Restored from version ${version.version}`,
    });
    setSaving(false);
    setMessage({
      type: result.ok ? 'success' : 'error',
      text: result.message,
    });
  }

  return (
    <section className="panel visual-standards-manager" data-manager-section="visual-standards">
      <div className="section-heading static-heading">
        <div>
          <p className="eyebrow">Manager content</p>
          <h2>Default Standards / Visual Standards</h2>
          <p className="muted">
            One canonical image per key. Saving publishes that key everywhere it is referenced.
          </p>
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

      <div className="visual-standard-area-filters" role="group" aria-label="Filter Visual Standards by area">
        {areas.map((area) => (
          <button
            key={area}
            type="button"
            className={areaFilter === area ? 'is-active' : ''}
            aria-pressed={areaFilter === area}
            onClick={() => setAreaFilter(area)}
          >
            {area}
          </button>
        ))}
      </div>

      <div className="visual-standard-grid">
        {visibleStandards.map((standard) => (
          <button
            key={standard.canonicalKey}
            type="button"
            className="visual-standard-card"
            onClick={() => openEditor(standard.canonicalKey)}
          >
            <CurrentStandardImage standard={standard} />
            <span className={`visual-standard-source source-${standard.source}`}>
              {standard.sourceLabel}
            </span>
            <strong>{standard.label}</strong>
            <small>{standard.section}</small>
            <small>
              {formatUpdatedAt(
                standard.updatedAt,
                standard.source === 'bundled' ? 'Bundled with app' : 'Not published',
              )}
            </small>
          </button>
        ))}
      </div>

      {selectedStandard && (
        <section ref={editorRef} className="visual-standard-editor" aria-label={`Edit ${selectedStandard.label}`}>
          <div className="section-heading static-heading">
            <div>
              <p className="eyebrow">{selectedStandard.area} · {selectedStandard.section}</p>
              <h3>{selectedStandard.label}</h3>
              <code>{selectedStandard.canonicalKey}</code>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                resetSelectedFile();
                setSelectedKey('');
                setMessage({ type: '', text: '' });
              }}
            >
              Close editor
            </button>
          </div>

          <div className="visual-standard-comparison">
            <article>
              <h4>Current live image</h4>
              <CurrentStandardImage standard={selectedStandard} className="visual-standard-editor-image" />
              <p>
                <span className={`visual-standard-source source-${selectedStandard.source}`}>
                  {selectedStandard.sourceLabel}
                </span>
              </p>
              <small>
                {selectedStandard.activeVersion
                  ? `Version ${selectedStandard.activeVersion} · ${formatUpdatedAt(selectedStandard.updatedAt)}`
                  : 'No backend version published yet'}
              </small>
            </article>

            <article>
              <h4>Replacement preview</h4>
              {previewUrl ? (
                <img
                  className="visual-standard-editor-image"
                  src={previewUrl}
                  alt="Selected replacement preview"
                />
              ) : (
                <div className="visual-standard-empty visual-standard-editor-image">
                  <strong>No replacement selected</strong>
                  <span>Choose Upload image or Camera.</span>
                </div>
              )}
              {selectedFile && <small>{selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} KB</small>}
            </article>
          </div>

          <input
            ref={uploadInputRef}
            className="visually-hidden"
            type="file"
            tabIndex="-1"
            aria-hidden="true"
            accept={VISUAL_STANDARD_IMAGE_TYPES.join(',')}
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            className="visually-hidden"
            type="file"
            tabIndex="-1"
            aria-hidden="true"
            accept="image/*"
            capture="environment"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          <div className="visual-standard-editor-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={!canPublish || saving}
              onClick={() => uploadInputRef.current?.click()}
            >
              Upload image
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!canPublish || saving}
              onClick={() => cameraInputRef.current?.click()}
            >
              Camera
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!selectedFile || saving}
              onClick={() => {
                resetSelectedFile();
                setMessage({ type: '', text: '' });
              }}
            >
              Cancel selected image
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!canPublish || !selectedFile || saving}
              onClick={saveReplacement}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {message.text && (
            <p
              className={message.type === 'error' ? 'critical-warning' : message.type === 'success' ? 'all-clear' : 'status-message'}
              role="status"
              aria-live="polite"
            >
              {message.text}
            </p>
          )}

          <section className="visual-standard-history">
            <div className="section-heading static-heading">
              <div>
                <h4>Version history</h4>
                <p className="muted">Restoring creates a new audited version and retains every previous asset.</p>
              </div>
              <span>{history.length} versions</span>
            </div>
            {historyState === 'loading' && <p className="muted">Loading history…</p>}
            {historyState === 'error' && <p className="critical-warning">Version history is unavailable.</p>}
            {historyState === 'ready' && history.length === 0 && <p className="muted">No backend versions yet.</p>}
            {history.map((version) => {
              const isActive = version.id === selectedStandard.activeVersionId;
              return (
                <article key={version.id} className="visual-standard-version-row">
                  <div>
                    <strong>Version {version.version}{isActive ? ' · Active' : ''}</strong>
                    <span>{formatUpdatedAt(version.createdAt)}</span>
                    <small>{version.createdByName || version.createdBy || 'Unknown updater'}</small>
                    {version.restoredFromVersionId && <small>Restored from an earlier version</small>}
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
        </section>
      )}
    </section>
  );
}
