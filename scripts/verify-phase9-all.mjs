import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['run', 'verify:inventory-permissions']],
  ['npm', ['run', 'verify:phase9a']],
  ['npm', ['run', 'verify:inventory-session-lifecycle']],
  ['npm', ['run', 'verify:inventory-product-identity-csv']],
  ['npm', ['run', 'verify:inventory-structured-quantities']],
  ['npm', ['run', 'verify:inventory-operational-scope']],
  ['npm', ['run', 'verify:inventory-product-mappings']],
  ['npm', ['run', 'verify:inventory-counter-workflow']],
  ['npm', ['run', 'verify:inventory-counter-replacement']],
  ['npm', ['run', 'verify:inventory-counter-mobile']],
  ['npm', ['run', 'verify:inventory-session-location-scope']],
  ['npm', ['run', 'verify:inventory-confirmation-dialog']],
  ['npm', ['run', 'verify:inventory-variance-notes']],
  ['npm', ['run', 'verify:inventory-millum-export']],
  ['npm', ['run', 'verify:inventory-shelf-storage-guidance']],
  ['npm', ['run', 'verify:inventory-history-detail']],
  ['npm', ['run', 'verify:inventory-simplicity']],
  ['npm', ['run', 'verify:phase9-security-db']],
  ['npm', ['run', 'build']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('Phase 9 combined verification passed.');
