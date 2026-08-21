import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRoutines, knowledgeBase } from '../src/data/routines.js';
import {
  SELF_SERVICE_STATION_GUIDE_ID,
  selfServiceStationSections,
} from '../src/data/selfServiceStation.js';
import { SELF_SERVICE_VISUAL_STANDARD_KEYS } from '../src/data/workbarVisualStandards.js';
import { eventLifecycle } from '../src/data/eventReadinessRules.js';

test('Self-Service sections preserve all eight canonical visual keys', () => {
  assert.equal(selfServiceStationSections.length, 8);
  assert.deepEqual(
    new Set(selfServiceStationSections.map((section) => section.visualKey)),
    new Set(Object.values(SELF_SERVICE_VISUAL_STANDARD_KEYS)),
  );
  assert.equal(
    knowledgeBase.some((guide) => guide.id === SELF_SERVICE_STATION_GUIDE_ID),
    true,
  );
});

test('routine guide references still resolve after canonical guide wiring', () => {
  const guideIds = new Set(knowledgeBase.map((guide) => guide.id));
  const unresolved = defaultRoutines
    .flatMap((routine) => routine.tasks)
    .filter((task) => task.guideId && !guideIds.has(task.guideId));
  assert.deepEqual(unresolved, []);
});

test('event lifecycle smoke check remains stable', () => {
  const event = {
    status: 'active',
    startsAt: '2026-08-21T10:00:00.000Z',
    endsAt: '2026-08-21T12:00:00.000Z',
  };
  assert.equal(eventLifecycle(event, null, '2026-08-21T09:00:00.000Z'), 'planning');
  assert.equal(eventLifecycle(event, null, '2026-08-21T10:30:00.000Z'), 'live');
  assert.equal(eventLifecycle(event, null, '2026-08-21T12:30:00.000Z'), 'closing');
});
