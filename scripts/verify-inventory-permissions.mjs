import { runInventoryPermissionVerification } from '../src/data/inventoryPermissionVerification.js';

const result = runInventoryPermissionVerification();
for (const check of result.checks) {
  console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
}

const passed = result.checks.filter((check) => check.passed).length;
console.log(`\nStock Count permission verification: ${passed}/${result.checks.length} passed.`);
if (!result.passed) process.exitCode = 1;
