import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build as buildWithEsbuild } from 'esbuild';
import {
  INVENTORY_REFERENCE_LOCATION_CODES,
  INVENTORY_LOCATION_VISUAL_STANDARD_KEYS,
  buildInventoryDefaultRecords,
  classifyRefrigeratorTemplate,
} from '../src/data/inventoryDefaults.js';

const organizationId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000001';

async function loadInventoryClientModule() {
  const build = await buildWithEsbuild({
    entryPoints: ['src/lib/inventoryDefaultsClient.js'],
    absWorkingDir: process.cwd(),
    bundle: true,
    define: { 'import.meta.env': '{}' },
    format: 'cjs',
    minify: true,
    platform: 'node',
    packages: 'external',
    write: false,
  });
  const compiledModule = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', build.outputFiles[0].text);
  evaluate(createRequire(import.meta.url), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

test('all required physical inventory locations have explicit reference-photo coverage', () => {
  assert.equal(INVENTORY_REFERENCE_LOCATION_CODES.length, 11);
  assert.equal(new Set(INVENTORY_REFERENCE_LOCATION_CODES).size, 11);
  assert.deepEqual(Object.keys(INVENTORY_LOCATION_VISUAL_STANDARD_KEYS).sort(), [
    'WORKBAR_BAR_LEFT_FRIDGE',
    'WORKBAR_BAR_RIGHT_FRIDGE',
    'WORKBAR_MILK_FRIDGE',
    'WORKBAR_NON_ALCO_FRIDGE',
  ]);
  assert.equal(buildInventoryDefaultRecords().length, 11);
});

test('refrigerator completeness mirrors the database invariant without inventing quantity gates', () => {
  const location = { refrigerator: true };
  const noRow = classifyRefrigeratorTemplate({
    location,
    products: [{ active: true, parQuantity: 4, defaultRestockQuantity: null }],
  });
  assert.equal(noRow.status, 'incomplete');
  assert.deepEqual(noRow.reasons, [
    'No refrigerator-template row.',
    'Manager verification pending.',
  ]);
  assert.equal(noRow.canVerify, true);
  assert.equal(noRow.parCount, 1);
  assert.equal(noRow.defaultRestockCount, 0);

  const noProducts = classifyRefrigeratorTemplate({
    location,
    template: { templateStatus: 'incomplete' },
    products: [],
  });
  assert.deepEqual(noProducts.reasons, ['No active products are configured.']);
  assert.equal(noProducts.canVerify, false);

  const verified = classifyRefrigeratorTemplate({
    location,
    template: {
      templateStatus: 'verified',
      verifiedAt: '2026-08-25T08:00:00.000Z',
      verifiedByName: 'Manager',
    },
    products: [{ active: true, parQuantity: null, defaultRestockQuantity: null }],
  });
  assert.equal(verified.status, 'verified');
  assert.deepEqual(verified.reasons, []);
});

test('Workbar Milk Fridge remains incomplete until an explicit manager verification exists', () => {
  const records = buildInventoryDefaultRecords({
    locations: [{
      id: locationId,
      organizationId,
      name: 'Workbar Milk Fridge',
      code: 'WORKBAR_MILK_FRIDGE',
      locationType: 'fridge',
      active: true,
      countable: true,
    }],
    templateRows: [{ locationId, templateStatus: 'incomplete' }],
    productRows: [{ locationId, active: true, parQuantity: 0, defaultRestockQuantity: null }],
  });
  const milk = records.find((record) => record.code === 'WORKBAR_MILK_FRIDGE');
  assert.equal(milk.templateState.status, 'incomplete');
  assert.deepEqual(milk.templateState.reasons, ['Manager verification pending.']);
});

test('reference image validation and private object paths match the database contract', async () => {
  const { buildInventoryReferencePath, validateInventoryReferenceFile } =
    await loadInventoryClientModule();
  const file = { name: 'fridge.jpg', type: 'image/jpeg', size: 2048 };
  assert.equal(validateInventoryReferenceFile(file).ok, true);
  assert.equal(validateInventoryReferenceFile({ ...file, type: 'image/gif' }).ok, false);
  assert.equal(validateInventoryReferenceFile({ ...file, size: 6 * 1024 * 1024 }).ok, false);
  assert.equal(
    buildInventoryReferencePath(
      { id: locationId, organizationId },
      file,
      { uuid: '30000000-0000-4000-8000-000000000001' },
    ),
    `${organizationId}/${locationId}/30000000-0000-4000-8000-000000000001.jpg`,
  );
});

test('reference publication uploads, records metadata, and returns a populated state', async () => {
  const { publishInventoryReferenceWithClient } = await loadInventoryClientModule();
  const events = [];
  const client = {
    storage: {
      from(bucketName) {
        assert.equal(bucketName, 'inventory-location-reference-images');
        return {
          async upload(path) {
            events.push(['upload', path]);
            return { error: null };
          },
          async remove(paths) {
            events.push(['remove', paths]);
            return { error: null };
          },
          async createSignedUrl(path) {
            events.push(['sign', path]);
            return { data: { signedUrl: 'https://assets.test/location.jpg' }, error: null };
          },
        };
      },
    },
    async rpc(name, input) {
      events.push(['rpc', name]);
      assert.equal(input.input_location_id ?? locationId, locationId);
      return {
        data: {
          id: 'guidance-1',
          location_id: locationId,
          object_path: `${organizationId}/${locationId}/30000000-0000-4000-8000-000000000001.jpg`,
          caption: null,
          mime_type: 'image/jpeg',
          byte_size: 2048,
          original_file_name: 'fridge.jpg',
          revision: 1,
          updated_at: '2026-08-25T08:00:00.000Z',
          cleanup_path: null,
        },
        error: null,
      };
    },
  };
  const result = await publishInventoryReferenceWithClient({
    client,
    location: { id: locationId, organizationId },
    file: { name: 'fridge.jpg', type: 'image/jpeg', size: 2048 },
    pathOptions: { uuid: '30000000-0000-4000-8000-000000000001' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.guidance.imageUrl, 'https://assets.test/location.jpg');
  assert.deepEqual(events.map(([event]) => event), ['upload', 'rpc', 'sign']);
});

async function renderReferenceStates() {
  const build = await buildWithEsbuild({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { InventoryLocationReferenceState } from './src/components/InventoryDefaultsManager.jsx';
        const empty = {
          code: 'WORKBAR_BAR_LEFT_FRIDGE', name: 'Workbar Bar Left Fridge',
          hasReferencePhoto: false, guidance: null, visualStandardKey: ''
        };
        const populated = {
          code: 'WORKBAR_BAR_RIGHT_FRIDGE', name: 'Workbar Bar Right Fridge',
          hasReferencePhoto: true, visualStandardKey: '',
          guidance: { imageUrl: 'https://assets.test/right.jpg', caption: 'Reference', updatedAt: '' }
        };
        export default renderToStaticMarkup(React.createElement('div', null,
          React.createElement(InventoryLocationReferenceState, { location: empty }),
          React.createElement(InventoryLocationReferenceState, { location: populated })
        ));
      `,
      resolveDir: process.cwd(),
      sourcefile: 'inventory-reference-render.jsx',
      loader: 'jsx',
    },
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
  const evaluate = new Function('require', 'module', 'exports', build.outputFiles[0].text);
  evaluate(createRequire(import.meta.url), compiledModule, compiledModule.exports);
  return compiledModule.exports.default;
}

test('location reference UI distinguishes awaiting and populated photo states', async () => {
  const html = await renderReferenceStates();
  assert.match(html, /Awaiting reference photo/);
  assert.match(html, /Reference photo available/);
  assert.match(html, /https:\/\/assets\.test\/right\.jpg/);
});
