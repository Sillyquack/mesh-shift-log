import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build as buildWithEsbuild } from 'esbuild';

async function renderManagerMarkup() {
  const build = await buildWithEsbuild({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import VisualStandardsManager from './src/components/VisualStandardsManager.jsx';
        import { VisualStandardsProvider } from './src/components/VisualStandardsProvider.jsx';
        const user = { role: 'manager', loginSource: 'supabase_auth', isSharedDevice: false };
        export default renderToStaticMarkup(
          React.createElement(
            VisualStandardsProvider,
            null,
            React.createElement(VisualStandardsManager, { user }),
          ),
        );
      `,
      resolveDir: process.cwd(),
      sourcefile: 'visual-standards-manager-render.jsx',
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
  const localRequire = createRequire(import.meta.url);
  const evaluate = new Function('require', 'module', 'exports', build.outputFiles[0].text);
  evaluate(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports.default;
}

test('manager mobile baseline renders compact rows with direct Camera and Upload actions', async () => {
  const html = await renderManagerMarkup();
  const rowCount = (html.match(/class="visual-standard-row"/g) || []).length;
  const cameraCount = (html.match(/>Camera<\/button>/g) || []).length;
  const uploadCount = (html.match(/>Upload<\/button>/g) || []).length;

  assert.equal(rowCount, 21);
  assert.equal(cameraCount, 21);
  assert.equal(uploadCount, 21);
  assert.match(html, /Workbar · Fridges/);
  assert.match(html, /Self-Service Station · Overview/);
  assert.match(html, /<select/);
  assert.doesNotMatch(html, /visual-standard-card/);
  assert.doesNotMatch(html, /visual-standard-editor/);
});

test('capture controls and history stay out of the baseline flow until a standard is selected', async () => {
  const html = await renderManagerMarkup();
  assert.doesNotMatch(html, /visual-standard-replacement-preview/);
  assert.doesNotMatch(html, />Save<\/button>/);
  assert.doesNotMatch(html, /class="visual-standard-history"/);
  assert.match(html, />History<\/button>/);
});
