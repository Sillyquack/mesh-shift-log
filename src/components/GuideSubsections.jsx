import React from 'react';
import { useVisualStandards } from './VisualStandardsProvider.jsx';
import VisualStandardDisplay from './VisualStandardDisplay.jsx';

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
              <VisualStandardDisplay
                visualStandard={visualStandard}
                visualKey={section.visualKey}
                title={section.title}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
