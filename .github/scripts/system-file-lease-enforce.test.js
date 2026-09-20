#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildPrViolations,
  canonicalDigest,
  extractOperationId,
  isSingleWriterPath,
  leaseEventPath,
  parseCommitLeaseProof,
  requiresOperationIdentity,
  validateLeaseEventProof,
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

const path = 'governance/CURRENT-AUTHORITY.json';
const mutationId = 'SYSTEM-MASTER-TEST-001';
const fence = 'b'.repeat(64);
const parentSha = 'c'.repeat(40);
const commitSha = 'd'.repeat(40);
const proof = parseCommitLeaseProof([
  'core: governed write',
  '',
  `Control-Gateway-Mutation: ${mutationId}`,
  `System-File-Lease: ${path}@7/${fence}`,
].join('\n'));
assert.strictEqual(proof.mutationId, mutationId);
assert.deepStrictEqual(proof.receipts.get(path), { epoch: 7, fence });
assert.deepStrictEqual(proof.violations, []);
assert.strictEqual(leaseEventPath(mutationId, path), `system-file-leases/events/${require('crypto').createHash('sha256').update(mutationId).digest('hex')}/${require('crypto').createHash('sha256').update(path).digest('hex')}.json`);

const event = {
  protocol_version: 'control-gateway.system-file-lease-event.v1',
  mutation_id: mutationId,
  path,
  holder: { workstream_id: 'SYSTEM-MASTER-TEST', operation_id: 'SYSTEM-MASTER-TEST-OP', mutation_id: mutationId },
  target_ref: 'system-master/test',
  expected_predecessor_sha: parentSha,
  result_commit_sha: commitSha,
  path_revision: 5,
  lease_epoch: 7,
  fence_token: fence,
  acquired_at: '2026-09-20T03:00:00.000Z',
  expires_at: '2026-09-20T03:10:00.000Z',
  released_at: '2026-09-20T03:06:00.000Z',
  acquisition_commit_sha: 'a'.repeat(40),
  acquisition_record_digest: 'e'.repeat(64),
  release_record_digest: 'f'.repeat(64),
  event_digest: '',
};
event.event_digest = canonicalDigest(event, 'event_digest');
violations = validateLeaseEventProof({ event, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' });
assert.deepStrictEqual(violations, []);

let bad = structuredClone(event);
bad.holder.mutation_id = 'OTHER';
bad.event_digest = canonicalDigest(bad, 'event_digest');
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_MUTATION_BINDING_MISMATCH'));

bad = structuredClone(event);
delete bad.holder.operation_id;
bad.event_digest = canonicalDigest(bad, 'event_digest');
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_MUTATION_BINDING_MISMATCH'));

bad = structuredClone(event);
bad.target_ref = '';
bad.event_digest = canonicalDigest(bad, 'event_digest');
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_TARGET_REF_INVALID'));

bad = structuredClone(event);
bad.fence_token = '1'.repeat(64);
bad.event_digest = canonicalDigest(bad, 'event_digest');
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_TRAILER_BINDING_MISMATCH'));

bad = structuredClone(event);
bad.expected_predecessor_sha = '1'.repeat(40);
bad.event_digest = canonicalDigest(bad, 'event_digest');
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_PREDECESSOR_BINDING_MISMATCH'));

bad = structuredClone(event);
bad.result_commit_sha = '2'.repeat(40);
bad.event_digest = canonicalDigest(bad, 'event_digest');
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_RESULT_COMMIT_BINDING_MISMATCH'));

bad = structuredClone(event);
bad.event_digest = '3'.repeat(64);
assert(reasons(validateLeaseEventProof({ event: bad, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:05:00.000Z' })).includes('LEASE_EVENT_DIGEST_INVALID'));

assert(reasons(validateLeaseEventProof({ event, path, mutationId, receipt: { epoch: 7, fence }, parentSha, commitSha, commitTime: '2026-09-20T03:11:00.000Z' })).includes('LEASE_NOT_LIVE_AT_COMMIT'));

const duplicates = parseCommitLeaseProof([
  `Control-Gateway-Mutation: ${mutationId}`,
  `Control-Gateway-Mutation: ${mutationId}`,
  `System-File-Lease: ${path}@7/${fence}`,
  `System-File-Lease: ${path}@7/${fence}`,
].join('\n'));
assert(reasons(duplicates.violations).includes('DUPLICATE_CONTROL_GATEWAY_MUTATION_TRAILER'));
assert(reasons(duplicates.violations).includes('DUPLICATE_LEASE_RECEIPT'));

console.log('SYSTEM_FILE_LEASE_PR_SINGLE_WRITER_TEST=PASS');
