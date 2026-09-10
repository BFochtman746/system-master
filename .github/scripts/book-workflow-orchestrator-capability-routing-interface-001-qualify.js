'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const outDir = process.env.RUNNER_TEMP || root;
const routing = require(path.join(root, 'system-master/book-system/book-capability-routing-interface.js'));
const contractPath = path.join(root, 'qualification/book-system/book-prose-integration/orchestrator/BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001.json');
const servicePath = path.join(root, 'qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json');
const registry = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const serviceRegistry = JSON.parse(fs.readFileSync(servicePath, 'utf8'));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function fail(code, detail = '') { const e = new Error(detail ? `${code}:${detail}` : code); e.code = code; throw e; }
function assert(v, code, detail = '') { if (!v) fail(code, detail); }
function expectCode(id, fn, prefixes) {
  try { fn(); }
  catch (e) {
    const code = String(e && (e.code || e.message) || 'UNKNOWN');
    if (prefixes.some(p => code.startsWith(p))) return { case_id: id, result: 'PASS', observed: code };
    throw new Error(`${id}:WRONG_FAILURE:${code}`);
  }
  throw new Error(`${id}:EXPECTED_FAILURE_NOT_THROWN`);
}

const results = [];
let assertions = 0;
function pass(id, fn) { fn(); assertions += 1; results.push({ case_id: id, result: 'PASS' }); }
function reject(id, fn, prefixes) { results.push(expectCode(id, fn, prefixes)); assertions += 1; }

function assertServiceOperationExists(cap) {
  const svc = serviceRegistry.services && serviceRegistry.services[cap.service_id];
  assert(svc, 'BACKING_SERVICE_NOT_FOUND', cap.service_id);
  assert(svc.operations && svc.operations[cap.operation_id], 'BACKING_OPERATION_NOT_FOUND', `${cap.service_id}:${cap.operation_id}`);
  assert(svc.canonical_write_authority === false, 'BACKING_SERVICE_CANONICAL_WRITE_MUST_BE_FALSE', cap.service_id);
  if (cap.service_id === 'PROSE_ANALYSIS_AND_REVISION' || cap.service_id === 'BOOK_EVALUATION') {
    assert(svc.canonical_owner_path === 'SYSTEM_MASTER/BOOK/PROSE', 'PROSE_SERVICE_OWNER_MISMATCH', cap.service_id);
    assert(cap.owner_path === 'SYSTEM_MASTER/BOOK/PROSE', 'ROUTING_PROSE_OWNER_MISMATCH', cap.capability_id);
  }
}

pass('OCR-001-REGISTRY-VALID', () => routing.validateRegistry(registry));

pass('OCR-002-CALLABLES-EXIST-IN-QUALIFIED-SERVICE-REGISTRY', () => {
  assert(serviceRegistry.registry_id === 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002', 'BACKING_REGISTRY_ID_MISMATCH');
  for (const cap of registry.capabilities.filter(x => x.dispatch_class === 'QUALIFIED_SERVICE_OPERATION')) assertServiceOperationExists(cap);
});

pass('OCR-003-PROSE-ANALYSIS-RESOLVES', () => {
  const cap = routing.resolveCallableCapability({ capability_id: 'PROSE.ANALYZE_PASSAGE', required_authority_domain: 'LITERARY_DIAGNOSIS' }, registry);
  assert(cap.service_id === 'PROSE_ANALYSIS_AND_REVISION' && cap.operation_id === 'ANALYZE_PASSAGE_OR_UNIT', 'PROSE_ANALYSIS_ROUTE_MISMATCH');
});

pass('OCR-004-PROSE-REVISION-RESOLVES-NO-WRITE', () => {
  const cap = routing.resolveCallableCapability({ capability_id: 'PROSE.GENERATE_REVISION_CANDIDATE', required_authority_domain: 'LITERARY_CANDIDATE_GENERATION' }, registry);
  assert(cap.canonical_write_authority === false, 'PROSE_REVISION_CANONICAL_WRITE');
  assert(routing.assertNoCanonicalWrite(cap) === true, 'PROSE_REVISION_WRITE_GUARD_FAILED');
});

pass('OCR-005-EVALUATOR-RESOLVES-NO-WRITE', () => {
  const cap = routing.resolveCallableCapability({ capability_id: 'EVALUATION.CONTRASTIVE_CANDIDATE', required_authority_domain: 'LITERARY_EVALUATION_EVIDENCE' }, registry);
  assert(cap.service_id === 'BOOK_EVALUATION', 'EVALUATOR_SERVICE_MISMATCH');
  assert(cap.canonical_write_authority === false, 'EVALUATOR_CANONICAL_WRITE');
});

pass('OCR-006-RESEARCH-RESOLVES-NO-WRITE', () => {
  const cap = routing.resolveCallableCapability({ capability_id: 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', required_authority_domain: 'EXTERNAL_EVIDENCE_TRUTH' }, registry);
  assert(cap.service_id === 'RESEARCH_AND_EVIDENCE', 'RESEARCH_SERVICE_MISMATCH');
  assert(cap.canonical_write_authority === false, 'RESEARCH_CANONICAL_WRITE');
});

reject('OCR-007-UNKNOWN-CAPABILITY-FAILS-CLOSED', () => routing.resolveCapability({ capability_id: 'PROSE.MADE_UP_CAPABILITY', required_authority_domain: 'LITERARY_DIAGNOSIS' }, registry), ['UNKNOWN_CAPABILITY']);

reject('OCR-008-AUTHORITY-DOMAIN-MISMATCH-FAILS', () => routing.resolveCapability({ capability_id: 'PROSE.ANALYZE_PASSAGE', required_authority_domain: 'CANONICAL_MANUSCRIPT_MUTATION' }, registry), ['AUTHORITY_DOMAIN_MISMATCH']);

reject('OCR-009-STORY-BIBLE-NONCALLABLE-FAILS', () => routing.resolveCallableCapability({ capability_id: 'CANON.CONSISTENCY_CHECK', required_authority_domain: 'CANON_TRUTH' }, registry), ['CAPABILITY_NOT_CALLABLE']);

reject('OCR-010-CONTINUITY-NONCALLABLE-FAILS', () => routing.resolveCallableCapability({ capability_id: 'CONTINUITY.CHECK', required_authority_domain: 'BOOK_CONTINUITY_EVIDENCE' }, registry), ['CAPABILITY_NOT_CALLABLE']);

reject('OCR-011-BOOK-ADMISSION-NOT-SERVICE-DISPATCHABLE', () => routing.resolveCallableCapability({ capability_id: 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION', required_authority_domain: 'CANONICAL_MANUSCRIPT_MUTATION' }, registry), ['CAPABILITY_NOT_CALLABLE']);

reject('OCR-012-DUPLICATE-CAPABILITY-ID-REJECTED', () => {
  const r = clone(registry); r.capabilities.push(clone(r.capabilities[0])); routing.validateRegistry(r);
}, ['DUPLICATE_CAPABILITY_ID']);

reject('OCR-013-SECOND-CANONICAL-MUTATION-OWNER-REJECTED', () => {
  const r = clone(registry);
  r.capabilities.push({
    capability_id:'PROSE.CANONICAL_WRITE', owner_path:'SYSTEM_MASTER/BOOK/PROSE', authority_domain:'CANONICAL_MANUSCRIPT_MUTATION',
    dispatch_class:'BOOK_INTERNAL_AUTHORITY_GATE', callable:false, service_id:null, operation_id:null, contract_ref:'INVALID', canonical_write_authority:true
  });
  routing.validateRegistry(r);
}, ['BOOK_GATE_OWNER_MISMATCH','CANONICAL_MUTATION_AUTHORITY_VIOLATION']);

reject('OCR-014-PROVIDER-CANONICAL-WRITE-REJECTED', () => {
  const r = clone(registry); const cap = r.capabilities.find(x => x.capability_id === 'PROSE.GENERATE_REVISION_CANDIDATE'); cap.canonical_write_authority = true; routing.validateRegistry(r);
}, ['PROVIDER_CANONICAL_WRITE_FORBIDDEN']);

reject('OCR-015-QUALIFIED-SERVICE-NONCALLABLE-REJECTED', () => {
  const r = clone(registry); const cap = r.capabilities.find(x => x.capability_id === 'PROSE.ANALYZE_PASSAGE'); cap.callable = false; routing.validateRegistry(r);
}, ['QUALIFIED_SERVICE_MUST_BE_CALLABLE']);

reject('OCR-016-NONCALLABLE-WITH-INVENTED-ENDPOINT-REJECTED', () => {
  const r = clone(registry); const cap = r.capabilities.find(x => x.capability_id === 'CANON.CONSISTENCY_CHECK'); cap.service_id = 'INVENTED'; cap.operation_id = 'INVENTED'; routing.validateRegistry(r);
}, ['NONCALLABLE_SERVICE_OPERATION_MUST_BE_NULL']);

reject('OCR-017-BOOK-GATE-CALLABLE-IN-2C-REJECTED', () => {
  const r = clone(registry); const cap = r.capabilities.find(x => x.capability_id === 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION'); cap.callable = true; routing.validateRegistry(r);
}, ['BOOK_GATE_NOT_DISPATCHABLE_IN_PHASE2C']);

pass('OCR-018-EXACT-IDENTITY-NO-FUZZY-ALIAS', () => {
  const exact = routing.resolveCapability({ capability_id: 'PROSE.ASSESS_HOMOGENIZATION', required_authority_domain: 'HOMOGENIZATION_DEFENSE_EVIDENCE' }, registry);
  assert(exact.operation_id === 'ASSESS_HOMOGENIZATION_RISK', 'HOMOGENIZATION_ROUTE_MISMATCH');
  const near = 'prose.assess_homogenization';
  let rejected = false;
  try { routing.resolveCapability({ capability_id: near, required_authority_domain: 'HOMOGENIZATION_DEFENSE_EVIDENCE' }, registry); }
  catch (e) { rejected = e && e.code === 'UNKNOWN_CAPABILITY'; }
  assert(rejected, 'FUZZY_ALIAS_ACCEPTED');
});

pass('OCR-019-ONLY-BOOK-HAS-CANONICAL-WRITE', () => {
  const writers = registry.capabilities.filter(x => x.canonical_write_authority === true);
  assert(writers.length === 1, 'CANONICAL_WRITER_COUNT_MISMATCH');
  assert(writers[0].capability_id === 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION' && writers[0].owner_path === 'SYSTEM_MASTER/BOOK', 'CANONICAL_WRITER_IDENTITY_MISMATCH');
});

pass('OCR-020-CANDIDATE-GENERATION-BACKING-OP-NONIDEMPOTENT-PRESERVED', () => {
  const svc = serviceRegistry.services.PROSE_ANALYSIS_AND_REVISION;
  const op = svc.operations.GENERATE_BOUNDED_REVISION_CANDIDATE;
  assert(op && op.idempotent === false, 'NONIDEMPOTENT_GENERATION_CLASSIFICATION_LOST');
});

const summary = {
  qualification_id: 'BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001-QUALIFICATION',
  result: results.length === 20 && results.every(x => x.result === 'PASS') ? 'PASS' : 'FAIL',
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  fixture_class: 'SYNTHETIC_NON_PRIVATE_CAPABILITY_ROUTING_INTERFACE',
  backing_registry_id: serviceRegistry.registry_id,
  backing_registry_qualified_subject_sha: '77db6b550e9aeb1dfb956627376becbb591498f8',
  planned_cases: 20,
  passed_cases: results.filter(x => x.result === 'PASS').length,
  assertions,
  natural_language_owner_guessing_used: false,
  specialist_execution_performed: false,
  canonical_manuscript_mutated: false,
  prose_runtime_mutated: false,
  fresh_blind_scoring_executed: false,
  a01_pass_claimed_for_this_subject: false,
  results
};

fs.writeFileSync(path.join(outDir, 'book-workflow-orchestrator-capability-routing-interface-001-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.result !== 'PASS') process.exit(1);
