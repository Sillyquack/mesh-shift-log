import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build as buildWithEsbuild } from 'esbuild';
import { WORKBAR_VISUAL_STANDARD_KEYS } from '../src/data/workbarVisualStandards.js';

async function loadGuideSections() {
  const build = await buildWithEsbuild({
    entryPoints: ['src/WorkbarGuideOverlay.jsx'],
    absWorkingDir: process.cwd(),
    bundle: true,
    define: { 'import.meta.env': '{}' },
    format: 'cjs',
    jsx: 'automatic',
    minify: true,
    platform: 'node',
    packages: 'external',
    write: false,
  });
  const compiledModule = { exports: {} };
  const evaluate = new Function(
    'require',
    'module',
    'exports',
    build.outputFiles[0].text,
  );
  evaluate(createRequire(import.meta.url), compiledModule, compiledModule.exports);
  return compiledModule.exports.workbarGuideSections;
}

test('every accepted Workbar setup concept is wired to its canonical key', async () => {
  const sections = await loadGuideSections();
  const itemsByTitle = new Map(
    sections.flatMap((section) => section.items || []).map((item) => [item[0], item]),
  );
  const expected = new Map([
    ['Non-alcoholic fridge', WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE],
    ['Workbar left fridge', WORKBAR_VISUAL_STANDARD_KEYS.BAR_LEFT_FRIDGE],
    ['Workbar right fridge', WORKBAR_VISUAL_STANDARD_KEYS.BAR_RIGHT_FRIDGE],
    ['Milk / opened-wine fridge', WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE],
    ['Lower back-bar glass setup', WORKBAR_VISUAL_STANDARD_KEYS.LOWER_BACK_BAR_GLASS_SETUP],
    ['Wine / prosecco glasses', WORKBAR_VISUAL_STANDARD_KEYS.WINE_PROSECCO_SHELF],
    ['Back-bar bottles', WORKBAR_VISUAL_STANDARD_KEYS.BACK_BAR_BOTTLE_LAYOUT],
    ['Hanging glasses', WORKBAR_VISUAL_STANDARD_KEYS.HANGING_WINE_PROSECCO_GLASS_LAYOUT],
    ['Glass-rack storage', WORKBAR_VISUAL_STANDARD_KEYS.GLASS_RACK_STORAGE],
    ['Opening setup', WORKBAR_VISUAL_STANDARD_KEYS.CLEANING_STATION_OPENING],
    ['Closing reset', WORKBAR_VISUAL_STANDARD_KEYS.CLEANING_STATION_CLOSING],
    ['Cabinet below main PC', WORKBAR_VISUAL_STANDARD_KEYS.CABINET_BELOW_MAIN_PC_STORAGE],
  ]);

  expected.forEach((canonicalKey, title) => {
    assert.equal(itemsByTitle.get(title)?.[2], canonicalKey, title);
  });
  assert.equal(new Set([...expected.values()]).size, Object.keys(WORKBAR_VISUAL_STANDARD_KEYS).length);
});

test('procedural future-photo mentions remain non-canonical', async () => {
  const sections = await loadGuideSections();
  const itemsByTitle = new Map(
    sections.flatMap((section) => section.items || []).map((item) => [item[0], item]),
  );
  [
    'Periodic deep clean',
    'Glass rinser',
    'Prep-kitchen large dishwasher',
    'Other units',
  ].forEach((title) => assert.equal(itemsByTitle.get(title)?.[2], undefined, title));
});
