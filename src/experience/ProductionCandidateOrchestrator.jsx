import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  detectExperienceSurface,
  managerPageSummary,
  managerSectionsFromPage,
  MANAGER_EXPERIENCE_VIEWS,
  osloDayLabel,
  osloGreeting,
  parseStoredUser,
  preferredUserName,
} from './productionCandidateModel.js';

const MANAGER_VIEW_KEY = 'mesh-manager-experience-view-v1';
const SURFACE_CLASSES = [
  'mesh-surface-login',
  'mesh-surface-manager',
  'mesh-surface-role-launcher',
  'mesh-surface-shift-launcher',
  'mesh-surface-history',
  'mesh-surface-routine-manager',
];

function storedManagerView() {
  if (typeof window === 'undefined') return 'today';
  const stored = window.localStorage.getItem(MANAGER_VIEW_KEY);
  return MANAGER_EXPERIENCE_VIEWS.some((view) => view.id === stored)
    ? stored
    : 'today';
}

function applySurfaceClass(surface) {
  if (typeof document === 'undefined') return;
  const className = `mesh-surface-${surface}`;
  [document.documentElement, document.body].forEach((node) => {
    if (!node) return;
    SURFACE_CLASSES.forEach((name) => node.classList.remove(name));
    if (SURFACE_CLASSES.includes(className)) node.classList.add(className);
  });
}

function ensureManagerMount(managerPage) {
  if (!managerPage) return null;
  let mount = managerPage.querySelector(':scope > [data-mesh-manager-experience-mount="true"]');
  if (!mount) {
    mount = document.createElement('div');
    mount.dataset.meshManagerExperienceMount = 'true';
    const intro = managerPage.querySelector(':scope > .intro');
    if (intro) intro.insertAdjacentElement('beforebegin', mount);
    else managerPage.prepend(mount);
  }
  return mount;
}

function enhanceLaunchCards(surface) {
  if (typeof document === 'undefined') return;
  if (!['role-launcher', 'shift-launcher'].includes(surface)) return;
  document
    .querySelectorAll('.role-card, .shift-card')
    .forEach((card, index) => {
      card.dataset.meshLaunchCard = 'true';
      card.style.setProperty('--mesh-card-index', index);
    });
}

function enhanceManagerPage(managerPage, view) {
  if (!managerPage) return [];
  const entries = managerSectionsFromPage(managerPage);
  managerPage.dataset.meshManagerActiveView = view;
  entries.forEach((entry, index) => {
    entry.section.dataset.meshManagerGroup = entry.group;
    entry.section.dataset.meshManagerOrder = String(index);
    entry.section.classList.add('mesh-manager-section-card');
  });
  return entries;
}

function attentionPreview(entries) {
  return entries
    .filter((entry) => entry.group === 'attention')
    .slice(0, 3)
    .map((entry) => entry.title);
}

function ManagerExperienceHeader({ managerPage, entries, view, onView }) {
  const summary = useMemo(() => managerPageSummary(entries), [entries]);
  const user = useMemo(
    () => parseStoredUser(typeof window === 'undefined' ? null : window.localStorage),
    [],
  );
  const name = preferredUserName(user);
  const attentionItems = attentionPreview(entries);

  const selectView = useCallback(
    (nextView) => {
      onView(nextView);
      window.localStorage.setItem(MANAGER_VIEW_KEY, nextView);
      window.requestAnimationFrame(() => {
        managerPage
          ?.querySelector(`[data-mesh-manager-group="${nextView}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [managerPage, onView],
  );

  return (
    <section className="mesh-manager-experience-header" aria-label="Manager home">
      <div className="mesh-manager-experience-ambient" aria-hidden="true" />
      <div className="mesh-manager-experience-hero">
        <div>
          <p className="mesh-kicker">{osloGreeting()}, {name}.</p>
          <h1>Run today.<br />Shape tomorrow.</h1>
          <p>
            The operation first. Decisions second. Everything else stays quietly
            available when you need it.
          </p>
          <div className="mesh-facts" aria-label="Today at a glance">
            <span>{osloDayLabel()}</span>
            <span>{summary.counts.today || 0} live areas</span>
            <span>{summary.counts.attention || 0} review areas</span>
          </div>
        </div>
        <div
          className={`mesh-manager-pulse is-${
            summary.operationalState === 'All clear'
              ? 'clear'
              : summary.operationalState === 'Action needed'
                ? 'urgent'
                : 'review'
          }`}
          aria-label={`Operational state: ${summary.operationalState}`}
        >
          <span>OPERATION</span>
          <strong>{summary.operationalState}</strong>
          <small>
            {summary.urgentSignals
              ? `${summary.urgentSignals} urgent signal${summary.urgentSignals === 1 ? '' : 's'}`
              : 'No urgent signal detected'}
          </small>
        </div>
      </div>

      <nav className="mesh-manager-view-nav" aria-label="Manager workspace sections">
        {MANAGER_EXPERIENCE_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'is-active' : ''}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => selectView(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.caption}</small>
            <strong>{summary.counts[item.id] || 0}</strong>
          </button>
        ))}
      </nav>

      {view === 'attention' && attentionItems.length > 0 ? (
        <div className="mesh-manager-attention-strip" role="status">
          <span>First to review</span>
          <strong>{attentionItems.join(' · ')}</strong>
        </div>
      ) : null}
    </section>
  );
}

export default function ProductionCandidateOrchestrator() {
  const [surface, setSurface] = useState('default');
  const [managerPage, setManagerPage] = useState(null);
  const [managerMount, setManagerMount] = useState(null);
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState(storedManagerView);
  const scanFrame = useRef(0);
  const lastSignature = useRef('');

  const scan = useCallback(() => {
    if (typeof document === 'undefined') return;
    const nextSurface = detectExperienceSurface(document);
    setSurface((current) => (current === nextSurface ? current : nextSurface));
    applySurfaceClass(nextSurface);
    enhanceLaunchCards(nextSurface);

    const nextManagerPage = document.querySelector('.manager-page');
    if (!nextManagerPage) {
      setManagerPage(null);
      setManagerMount(null);
      setEntries([]);
      lastSignature.current = '';
      return;
    }

    const nextEntries = enhanceManagerPage(nextManagerPage, view);
    const signature = nextEntries
      .map((entry) => `${entry.group}:${entry.title}`)
      .join('|');
    setManagerPage((current) => (current === nextManagerPage ? current : nextManagerPage));
    setManagerMount(ensureManagerMount(nextManagerPage));
    if (signature !== lastSignature.current) {
      lastSignature.current = signature;
      setEntries(nextEntries);
    }
  }, [view]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const schedule = () => {
      window.cancelAnimationFrame(scanFrame.current);
      scanFrame.current = window.requestAnimationFrame(scan);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(scanFrame.current);
      SURFACE_CLASSES.forEach((className) => {
        document.documentElement.classList.remove(className);
        document.body?.classList.remove(className);
      });
    };
  }, [scan]);

  useEffect(() => {
    if (!managerPage) return;
    managerPage.dataset.meshManagerActiveView = view;
  }, [managerPage, view]);

  if (surface !== 'manager' || !managerMount || !managerPage) return null;

  return createPortal(
    <ManagerExperienceHeader
      managerPage={managerPage}
      entries={entries}
      view={view}
      onView={setView}
    />,
    managerMount,
  );
}
