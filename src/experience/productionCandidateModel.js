export const MANAGER_EXPERIENCE_VIEWS = Object.freeze([
  {
    id: 'today',
    label: 'Today',
    caption: 'What is moving right now',
  },
  {
    id: 'attention',
    label: 'Attention',
    caption: 'Only the things that need a decision',
  },
  {
    id: 'control',
    label: 'Control',
    caption: 'People, content, settings and history',
  },
]);

const ATTENTION_TERMS = [
  'needs attention',
  'open alert',
  'urgent',
  'unresolved',
  'missing',
  'blocked',
  'returned',
  'correction',
  'failed',
  'issue',
  'exception',
  'deviation',
  'overdue',
];

const TODAY_TERMS = [
  'today',
  'daily report',
  'current shift',
  'shift progress',
  'shift status',
  'manager review',
  'event operations',
  'event cockpit',
  'responsible',
  'cash/invoice',
  'asset check',
  'opening',
  'closing',
  'double shift',
];

const CONTROL_TERMS = [
  'history',
  'routine',
  'template',
  'reference',
  'visual standard',
  'staff',
  'people',
  'operator',
  'site access',
  'settings',
  'configuration',
  'inventory',
  'stock count',
  'calendar',
  'backend',
  'diagnostic',
  'pilot',
  'supabase',
  'data status',
  'asset registry',
  'event management',
];

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function includesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

export function classifyManagerSection(title, content = '') {
  const normalizedTitle = normalize(title);
  const normalizedContent = normalize(content);
  const combined = `${normalizedTitle} ${normalizedContent}`;

  if (includesAny(normalizedTitle, ATTENTION_TERMS)) return 'attention';
  if (includesAny(normalizedTitle, TODAY_TERMS)) return 'today';
  if (includesAny(normalizedTitle, CONTROL_TERMS)) return 'control';

  if (
    includesAny(combined, ATTENTION_TERMS) &&
    !includesAny(normalizedTitle, ['history', 'settings', 'diagnostic'])
  ) {
    return 'attention';
  }

  return 'control';
}

export function managerSectionTitle(section) {
  if (!section?.querySelector) return '';
  const heading = section.querySelector(
    ':scope > .section-heading h2, :scope > h2, :scope > header h2, h2',
  );
  return String(heading?.textContent || '').trim();
}

export function isManagerTopLevelSection(section, managerPage) {
  if (!section || !managerPage || section.closest?.('.manager-page') !== managerPage) {
    return false;
  }
  if (
    section.classList?.contains('intro') ||
    section.classList?.contains('manager-jump-index') ||
    section.classList?.contains('manager-collapse-toolbar')
  ) {
    return false;
  }
  const parentSection = section.parentElement?.closest?.('section');
  return !parentSection || parentSection.closest?.('.manager-page') !== managerPage;
}

export function managerSectionsFromPage(managerPage) {
  if (!managerPage?.querySelectorAll) return [];
  const candidates = Array.from(managerPage.querySelectorAll('section')).filter((section) =>
    isManagerTopLevelSection(section, managerPage),
  );

  return candidates
    .map((section) => {
      const title = managerSectionTitle(section);
      if (!title) return null;
      const group = classifyManagerSection(title, section.textContent || '');
      return { section, title, group };
    })
    .filter(Boolean);
}

export function parseStoredUser(storage) {
  if (!storage?.getItem) return null;
  try {
    const user = JSON.parse(storage.getItem('mesh-current-user-v1') || 'null');
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

export function preferredUserName(user) {
  const value =
    user?.display_name ||
    user?.displayName ||
    user?.staffName ||
    user?.name ||
    'Manager';
  return String(value).split('/')[0].trim() || 'Manager';
}

export function osloGreeting(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
  if (hour < 11) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function osloDayLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function managerPageSummary(entries = []) {
  const counts = Object.fromEntries(
    MANAGER_EXPERIENCE_VIEWS.map((view) => [
      view.id,
      entries.filter((entry) => entry.group === view.id).length,
    ]),
  );
  const attentionText = entries
    .filter((entry) => entry.group === 'attention')
    .map((entry) => normalize(entry.section?.textContent || ''))
    .join(' ');
  const urgentSignals = (attentionText.match(/urgent|critical|failed|blocked|overdue/g) || [])
    .length;

  return {
    counts,
    urgentSignals,
    operationalState:
      counts.attention === 0
        ? 'All clear'
        : urgentSignals > 0
          ? 'Action needed'
          : 'Review needed',
  };
}

export function detectExperienceSurface(documentObject) {
  if (!documentObject?.querySelector) return 'default';
  if (documentObject.querySelector('.login-shell')) return 'login';
  if (documentObject.querySelector('.manager-page')) return 'manager';
  if (documentObject.querySelector('.role-launcher-intro')) return 'role-launcher';
  if (documentObject.querySelector('.shift-grid')) return 'shift-launcher';
  if (documentObject.querySelector('.rh-workspace')) return 'history';
  if (documentObject.querySelector('.rm-workspace')) return 'routine-manager';
  return 'default';
}
