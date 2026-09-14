'use strict';

const { spawnSync } = require('child_process');

const testPath = 'system-master/book-system/book-lifecycle-state-machine.test.js';
const result = spawnSync(process.execPath, [testPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
});

if (result.status !== 0) {
  process.stderr.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}

if (!String(result.stdout || '').includes('BOOK_LIFECYCLE_STATE_MACHINE_TESTS_PASS')) {
  process.stderr.write('BOOK_LIFECYCLE_STATE_MACHINE_QUALIFICATION_MISSING_PASS_SENTINEL\n');
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  qualifier: 'BOOK-LIFECYCLE-STATE-MACHINE-001',
  test: testPath,
  sentinel: 'BOOK_LIFECYCLE_STATE_MACHINE_TESTS_PASS'
}));
