function detailSlotsForDisplay(visualStandard) {
  const publishedByKey = new Map(
    (visualStandard?.details || []).map((detail) => [detail.detailKey, detail]),
  );
  const configured = (visualStandard?.detailSlots || []).map((slot) => ({
    detailKey: slot.key,
    label: slot.label,
    order: slot.order,
    ...publishedByKey.get(slot.key),
  }));
  const configuredKeys = new Set(configured.map((detail) => detail.detailKey));
  const unconfiguredPublished = (visualStandard?.details || []).filter(
    (detail) => !configuredKeys.has(detail.detailKey),
  );
  return [...configured, ...unconfiguredPublished].sort(
    (left, right) => left.order - right.order || left.label.localeCompare(right.label),
  );
}

function AwaitingPhoto({ visualKey, label = 'Visual standard slot' }) {
  return (
    <div className="visual-standard-slot" data-visual-key={visualKey}>
      <div>
        <strong>{label}</strong>
        <span>Awaiting approved photo</span>
      </div>
      <code>{visualKey}</code>
    </div>
  );
}

export default function VisualStandardDisplay({
  visualStandard,
  visualKey,
  title = '',
}) {
  const canonicalKey = visualStandard?.canonicalKey || visualStandard?.id || visualKey;
  const details = detailSlotsForDisplay(visualStandard);

  return (
    <div className="visual-standard-display">
      {visualStandard?.src ? (
        <figure className="canonical-visual-standard">
          <img
            src={visualStandard.src}
            alt={visualStandard.label || title}
            loading="lazy"
          />
          <figcaption>
            {visualStandard.primaryLabel || visualStandard.label || title}
          </figcaption>
        </figure>
      ) : (
        <AwaitingPhoto visualKey={canonicalKey} />
      )}

      {details.length > 0 && (
        <div className="canonical-visual-details" aria-label={`${title || visualStandard?.label} detail images`}>
          <h4>Detail images</h4>
          <div className="canonical-visual-detail-list">
            {details.map((detail) => (
              detail.src ? (
                <details key={detail.detailKey} className="canonical-visual-detail">
                  <summary>
                    <img src={detail.src} alt="" loading="lazy" />
                    <span>{detail.label}</span>
                  </summary>
                  <figure>
                    <img src={detail.src} alt={`${title}: ${detail.label}`} loading="lazy" />
                    <figcaption>{detail.label}</figcaption>
                  </figure>
                </details>
              ) : (
                <AwaitingPhoto
                  key={detail.detailKey}
                  visualKey={`${canonicalKey}/details/${detail.detailKey}`}
                  label={detail.label}
                />
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
