'use strict';

const fs = require('fs');
const path = require('path');
const retry = require('../../system-master/book-system/book-workflow-retry-idempotency-rules');

const results = [];
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function pass(case_id, extra = {}) { results.push({ case_id, result: 'PASS', ...extra }); }
function expectError(case_id, fn, code) {
  try { fn(); throw new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`); }
  catch (err) {
    if (err.message === `EXPECTED_ERROR_NOT_THROWN:${code}`) throw err;
    if (err.code !== code) throw new Error(`${case_id}:EXPECTED_${code}:GOT_${err.code || err.message}`);
    pass(case_id, { observed: err.code });
  }
}

const canonical = retry.loadServiceRegistry();
retry.validatePinnedServiceRegistry(canonical);
pass('RIP-001-CANONICAL-REGISTRY-EXACT-PIN-ACCEPTED');

if (retry.EXPECTED_SERVICE_REGISTRY_GIT_BLOB_SHA !== 'd5c31835cb79e8267fdbe868f073ef311e85214f') throw new Error('REGISTRY_BLOB_PIN_CHANGED');
pass('RIP-002-EXACT-REGISTRY-BLOB-PIN-STABLE');

if (retry.EXPECTED_SERVICE_REGISTRY_QUALIFIED_SUBJECT_SHA !== '77db6b550e9aeb1dfb956627376becbb591498f8') throw new Error('QUALIFIED_SUBJECT_PIN_CHANGED');
pass('RIP-003-QUALIFIED-SUBJECT-PIN-STABLE');

const flipIdempotent = clone(canonical);
flipIdempotent.services.PROSE_ANALYSIS_AND_REVISION.operations.ANALYZE_PASSAGE_OR_UNIT.idempotent = false;
expectError('RIP-004-FORGED-IDEMPOTENCY-FLIP-REJECTED', () => retry.validatePinnedServiceRegistry(flipIdempotent), 'SERVICE_REGISTRY_EXACT_CONTENT_PIN_MISMATCH');

const flipGenerator = clone(canonical);
flipGenerator.services.PROSE_ANALYSIS_AND_REVISION.operations.GENERATE_BOUNDED_REVISION_CANDIDATE.idempotent = true;
expectError('RIP-005-FORGED-GENERATOR-IDEMPOTENCY-WIDENING-REJECTED', () => retry.validatePinnedServiceRegistry(flipGenerator), 'SERVICE_REGISTRY_EXACT_CONTENT_PIN_MISMATCH');

const wrongId = clone(canonical);
wrongId.registry_id = 'LOOKALIKE-REGISTRY';
expectError('RIP-006-WRONG-REGISTRY-ID-REJECTED', () => retry.validatePinnedServiceRegistry(wrongId), 'SERVICE_REGISTRY_IDENTITY_MISMATCH');

const wrongVersion = clone(canonical);
wrongVersion.registry_version = 99;
expectError('RIP-007-WRONG-REGISTRY-VERSION-REJECTED', () => retry.validatePinnedServiceRegistry(wrongVersion), 'SERVICE_REGISTRY_IDENTITY_MISMATCH');

const unrelatedMutation = clone(canonical);
unrelatedMutation.owner_path = 'SYSTEM_MASTER/BOOK/PROSE';
expectError('RIP-008-LOOKALIKE-REGISTRY-CONTENT-REJECTED', () => retry.validatePinnedServiceRegistry(unrelatedMutation), 'SERVICE_REGISTRY_EXACT_CONTENT_PIN_MISMATCH');

const badContract = clone(retry.loadContract());
badContract.registered_service_policy_source.qualified_subject_sha = '0000000000000000000000000000000000000000';
expectError('RIP-009-CONTRACT-QUALIFIED-SUBJECT-MISMATCH-REJECTED', () => retry.validateContract(badContract), 'SERVICE_POLICY_QUALIFIED_SUBJECT_MISMATCH');

const analyzePolicy = retry.registeredOperationPolicy({ service_id: 'PROSE_ANALYSIS_AND_REVISION', operation_id: 'ANALYZE_PASSAGE_OR_UNIT' }, canonical);
if (analyzePolicy.idempotent !== true) throw new Error('ANALYZE_IDEMPOTENCY_POLICY_WRONG');
pass('RIP-010-ANALYZE-IDEMPOTENCY-READ-FROM-PINNED-REGISTRY');

const generatorPolicy = retry.registeredOperationPolicy({ service_id: 'PROSE_ANALYSIS_AND_REVISION', operation_id: 'GENERATE_BOUNDED_REVISION_CANDIDATE' }, canonical);
if (generatorPolicy.idempotent !== false) throw new Error('GENERATOR_IDEMPOTENCY_POLICY_WRONG');
pass('RIP-011-GENERATOR-NONIDEMPOTENCY-READ-FROM-PINNED-REGISTRY');

expectError('RIP-012-FORGED-REGISTRY-CANNOT-REACH-POLICY-LOOKUP', () => retry.registeredOperationPolicy({ service_id: 'PROSE_ANALYSIS_AND_REVISION', operation_id: 'ANALYZE_PASSAGE_OR_UNIT' }, flipIdempotent), 'SERVICE_REGISTRY_EXACT_CONTENT_PIN_MISMATCH');

const summary = {
  qualification_id: 'BOOK-WORKFLOW-ORCHESTRATOR-RETRY-IDEMPOTENCY-REGISTRY-PIN-001-QUALIFICATION',
  result: 'PASS',
  subject_sha: process.env.GITHUB_SHA || null,
  fixture_class: 'SYNTHETIC_NON_PRIVATE_REGISTRY_PIN_ADVERSARIAL',
  planned_cases: 12,
  passed_cases: results.length,
  assertions: results.length,
  exact_registry_git_blob_sha: retry.EXPECTED_SERVICE_REGISTRY_GIT_BLOB_SHA,
  exact_registry_qualified_subject_sha: retry.EXPECTED_SERVICE_REGISTRY_QUALIFIED_SUBJECT_SHA,
  provider_execution_performed: false,
  canonical_manuscript_mutated: false,
  prose_runtime_mutated: false,
  fresh_blind_scoring_executed: false,
  a01_pass_claimed_for_this_subject: false,
  results
};
if (results.length !== 12) throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const out = path.join(process.env.RUNNER_TEMP || '/tmp', 'book-workflow-orchestrator-retry-idempotency-registry-pin-001-summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
