import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { eventRigGuides } from '../src/data/eventRigGuides.js';
import {
  classifyManagerSection,
  MANAGER_EXPERIENCE_VIEWS,
  managerPageSummary,
  osloGreeting,
  preferredUserName,
} from '../src/experience/productionCandidateModel.js';

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const orchestrator = readFileSync(
  new URL('../src/experience/ProductionCandidateOrchestrator.jsx', import.meta.url),
  'utf8',
);
const experienceStyles = readFileSync(
  new URL('../src/experience/ProductionCandidateExperience.css', import.meta.url),
  'utf8',
);
const studioStyles = readFileSync(
  new URL('../src/experience/RoutineStudioExperience.css', import.meta.url),
  'utf8',
);
const visualStyles = readFileSync(
  new URL('../src/experience/VisualStandardsExperience.css', import.meta.url),
  'utf8',
);
const managerModel = readFileSync(
  new URL('../src/features/routines-v2/data/routineManagerModel.js', import.meta.url),
  'utf8',
);
const managerWorkspace = readFileSync(
  new URL('../src/features/routines-v2/manager/RoutineManagerWorkspace.jsx', import.meta.url),
  'utf8',
);
const referenceManager = readFileSync(
  new URL('../src/features/routines-v2/manager/RoutineReferenceManager.jsx', import.meta.url),
  'utf8',
);

const combinedExperience = [
  orchestrator,
  experienceStyles,
  studioStyles,
  visualStyles,
  managerWorkspace,
  referenceManager,
].join('\n');

test('browser entry activates one shared production-candidate experience layer', () => {
  assert.match(main, /ProductionCandidateOrchestrator/);
  assert.match(main, /ProductionCandidateExperience\.css/);
  assert.match(main, /RoutineStudioExperience\.css/);
  assert.match(main, /VisualStandardsExperience\.css/);
  assert.match(main, /<ProductionCandidateOrchestrator\s*\/>[\s\S]*?<App\s*\/>/);
});

test('manager home exposes exactly Today, Attention and Control', () => {
  assert.deepEqual(
    MANAGER_EXPERIENCE_VIEWS.map((view) => view.id),
    ['today', 'attention', 'control'],
  );
  for (const label of ['Today', 'Attention', 'Control']) {
    assert.ok(orchestrator.includes(label), label);
  }
  assert.match(orchestrator, /aria-label="Manager workspace sections"/);
  assert.match(orchestrator, /mesh-manager-experience-view-v1/);
});

test('manager section routing prioritizes action before administration', () => {
  assert.equal(classifyManagerSection('Open alerts'), 'attention');
  assert.equal(classifyManagerSection('Daily report'), 'today');
  assert.equal(classifyManagerSection('Manager review'), 'today');
  assert.equal(classifyManagerSection('Routine editor'), 'control');
  assert.equal(classifyManagerSection('Backend diagnostics'), 'control');
  const summary = managerPageSummary([
    { group: 'today', section: { textContent: 'Opening is moving' } },
    { group: 'attention', section: { textContent: 'Urgent issue' } },
    { group: 'control', section: { textContent: 'Settings' } },
  ]);
  assert.equal(summary.counts.today, 1);
  assert.equal(summary.counts.attention, 1);
  assert.equal(summary.operationalState, 'Action needed');
});

test('the manager redesign preserves the existing DOM and action handlers', () => {
  assert.match(orchestrator, /MutationObserver/);
  assert.match(orchestrator, /managerSectionsFromPage/);
  assert.match(orchestrator, /dataset\.meshManagerGroup/);
  assert.match(orchestrator, /createPortal/);
  assert.doesNotMatch(orchestrator, /supabase|\.from\(|\.rpc\(|fetch\(/i);
  assert.doesNotMatch(orchestrator, /innerHTML|outerHTML|eval\(/i);
});

test('role-aware surfaces share the premium language without hiding auth failures', () => {
  for (const surface of [
    'mesh-surface-login',
    'mesh-surface-role-launcher',
    'mesh-surface-shift-launcher',
    'mesh-surface-manager',
    'mesh-surface-history',
    'mesh-surface-routine-manager',
  ]) {
    assert.ok(experienceStyles.includes(surface), surface);
  }
  assert.match(experienceStyles, /\.login-panel \.error/);
  assert.match(experienceStyles, /min-height:\s*48px/);
  assert.match(experienceStyles, /prefers-reduced-motion/);
  assert.match(experienceStyles, /focus-visible/);
});

test('Operations Studio replaces ten equal tabs with grouped human navigation', () => {
  for (const label of [
    'Today',
    'Attention',
    'Content',
    'Routines',
    'Visual standards',
    'People & devices',
    'Access',
    'History',
    'Places & standards',
    'Publish',
  ]) {
    assert.ok(managerModel.includes(label), label);
  }
  for (const group of ['today', 'build', 'people', 'history', 'system']) {
    assert.ok(managerWorkspace.includes(`id: "${group}"`), group);
  }
  assert.match(managerWorkspace, /Operations Studio/);
  assert.match(managerWorkspace, /Build the standard once\. Make every shift easier\./);
  assert.doesNotMatch(managerWorkspace, /phase10k2|server contract|Personal manager auth only/);
});

test('Julie event image requirements become a concrete permanent upload queue', () => {
  const slots = new Set(
    eventRigGuides.flatMap((guide) =>
      (guide.requiredImageSlots || []).map((slot) => slot.id),
    ),
  );
  assert.ok(slots.size >= 25, `Expected at least 25 visual slots, found ${slots.size}`);
  assert.match(referenceManager, /eventRigGuides/);
  assert.match(referenceManager, /Image upload queue/);
  assert.match(referenceManager, /Create .* missing event placeholder/);
  assert.match(referenceManager, /createRoutineReferenceImage/);
  assert.match(referenceManager, /uploadRoutineReferenceImage|manager\.upload/);
  assert.match(referenceManager, /expectedReferenceRevision/);
  assert.match(referenceManager, /JPEG, PNG or WebP/);
  assert.match(referenceManager, /Maximum 5 MB/);
  assert.match(referenceManager, /Image description/);
  assert.match(referenceManager, /Version history/);
  assert.doesNotMatch(referenceManager, /notion\.so|amazonaws\.com|X-Amz-Signature/i);
});

test('visual-standard writes stay behind existing guarded clients', () => {
  assert.doesNotMatch(referenceManager, /supabase\.from|\.from\(['"]routine_reference|insert\(|update\(/i);
  for (const action of [
    'createRoutineReferenceImage',
    'updateRoutineReferenceImageMetadata',
    'setRoutineReferenceImageActive',
    'setRoutineReferenceImagePlaceholder',
    'downloadRoutineCurrentReferenceImage',
  ]) {
    assert.ok(referenceManager.includes(action), action);
  }
});

test('new frontline copy remains English and contains no credentials', () => {
  assert.doesNotMatch(combinedExperience, /[æøå]/i);
  assert.doesNotMatch(
    combinedExperience,
    /\b(?:pin|alarm code|password|access code)\s*[:=-]\s*\d{4,8}\b/i,
  );
});

test('name and greeting helpers remain deterministic and Oslo-aware', () => {
  assert.equal(preferredUserName({ name: 'Bobby / Manager' }), 'Bobby');
  assert.equal(osloGreeting(new Date('2026-08-14T06:00:00Z')), 'Good morning');
});

console.log('Verified the role-aware production candidate, manager hierarchy, Operations Studio and visual-standard upload queue.');
