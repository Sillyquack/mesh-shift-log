import React from 'react';
import { useVisualStandards } from './VisualStandardsProvider.jsx';

export default function GuideSubsections({ sections = [] }) {
  const { resolve } = useVisualStandards();
  if (!sections.length) return null;

  return (
    <div className="canonical-guide-sections">
      {sections.map((section) => {
        const visualStandard = resolve(
          section.visualKey || section.visualStandard?.id,
          section.visualStandard || null,
        );
        const hasPhoto = Boolean(visualStandard?.src);
        return (
          <details
            key={section.id || section.title}
            className="canonical-guide-section"
          >
            <summary>
              <span>{section.title}</span>
              {section.audience && <small>{section.audience}</small>}
            </summary>
            <div className="canonical-guide-section-body">
              {section.summary && <p>{section.summary}</p>}
              {Array.isArray(section.items) && section.items.length > 0 && (
                <dl className="canonical-standard-list">
                  {section.items.map((item) => (
                    <div key={item.name} className="canonical-standard-item">
                      <dt>{item.name}</dt>
                      <dd>{item.detail}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {hasPhoto ? (
                <figure className="canonical-visual-standard">
                  <img
                    src={visualStandard.src}
                    alt={visualStandard.label || section.title}
                    loading="lazy"
                  />
                  <figcaption>{visualStandard.label || section.title}</figcaption>
                </figure>
              ) : (
                <div
                  className="visual-standard-slot"
                  data-visual-key={section.visualKey}
                >
                  <div>
                    <strong>Visual standard slot</strong>
                    <span>Awaiting approved photo</span>
                  </div>
                  <code>{section.visualKey}</code>
                </div>
              )}
              {visualStandard?.details?.length > 0 && (
                <div className="canonical-visual-details" aria-label={`${section.title} detail images`}>
                  <h4>Detail images</h4>
                  <div className="canonical-visual-detail-list">
                    {visualStandard.details.map((detail) => (
                      <details key={detail.detailKey} className="canonical-visual-detail">
                        <summary>
                          <img src={detail.src} alt="" loading="lazy" />
                          <span>{detail.label}</span>
                        </summary>
                        <figure>
                          <img src={detail.src} alt={`${section.title}: ${detail.label}`} loading="lazy" />
                          <figcaption>{detail.label}</figcaption>
                        </figure>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
