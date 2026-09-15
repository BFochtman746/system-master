#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildPrViolations,
  extractOperationId,
  isSingleWriterPath,
  requiresOperationIdentity,
} = require('./system-file-lease-enforce.js');

function reasons(violations) {
  return violations.map((v) => v.reason);
}

assert.strictEqual(
  extractOperationId({ title: 'misc title', body: 'System-Operation: PQF-REPAIR-A01-001\n' }),
  'PQF-REPAIR-A01-001'
);

assert.strictEqual(
  extractOperationId({ title: 'PQF-REPAIR-A01-001: fence execution worker ownership', body: '' }),
  'PQF-REPAIR-A01-001'
);

assert.strictEqual(requiresOperationIdentity('control-gateway/python/a01_execution_worker.py'), true);
assert.strictEqual(isSingleWriterPath('governance/CURRENT-AUTHORITY.json'), true);
assert.strictEqual(isSingleWriterPath('README.md'), false);

const current = {
  number: 210,
  title: 'PQF-REPAIR-A01-001: authoritative repair',
  body: '',
};
const duplicate = {
  number: 212,
  title: 'PQF-REPAIR-A01-001: alternate repair',
  body: '',
};
const distinct = {
  number: 213,
  title: 'CONTROL-PLANE-OTHER-001: different work',
  body: '',
};

let violations = buildPrViolations(
  current,
  ['control-gateway/python/a01_execution_worker.py'],
  [duplicate],
  new Map([[212, ['tests/other_test.py']]])
);
assert(reasons(violations).includes('DUPLICATE_OPEN_OPERATION_WRITER'));

violations = buildPrViolations(
  current,
  ['control-gateway/python/a01_execution_worker.py'],
  [distinct],
  new Map([[213, ['control-gateway/python/a01_execution_worker.py']]])
);
assert(reasons(violations).includes('DUPLICATE_OPEN_PATH_WRITER'));

violations = buildPrViolations(
  { number: 214, title: 'generic maintenance', body: '' },
  ['control-gateway/python/a01_execution_worker.py'],
  [],
  new Map()
);
assert(reasons(violations).includes('SYSTEM_OPERATION_ID_REQUIRED'));

violations = buildPrViolations(
  { number: 215, title: 'docs only', body: '' },
  ['docs/note.md'],
  [distinct],
  new Map([[213, ['docs/note.md']]])
);
assert.deepStrictEqual(violations, []);

console.log('SYSTEM_FILE_LEASE_PR_SINGLE_WRITER_TEST=PASS');
