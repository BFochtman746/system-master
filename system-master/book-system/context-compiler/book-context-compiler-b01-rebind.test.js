'use strict';

const assert = require('assert');
const bindingRuntime = require('../book-capability-binding-v1');
const bindingSource = require('../book-capability-binding-v1.registry.json');
const rebound = require('./book-context-compiler-b01-rebind');

const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const NOW = new Date('2026-09-11T04:40:00Z');
let checks = 0;
function ok(v, m) { assert(v, m); checks += 1; }
function eq(a, b, m) { assert.strictEqual(a, b, m); checks += 1; }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  ok(caught, `expected ${code}`);
  eq(caught.code, code, `expected ${code}`);
}

const registry = bindingRuntime.buildRegistry(bindingSource);
const cap = bindingRuntime.resolveBinding('BOOK.LITERARY.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS', { registry });

function base(capability = cap) {
  return {
    context_package_id: 'ctx-b01-d2-1',
    schema_version: '1.0.0-proposed',
    package_class: capability.context_package_class,
    book_project_id: 'book-b01-d2',
    source_identity: {
      source_manuscript_ref: 'manuscript:v1',
      source_manuscript_sha256: H,
      source_version_id: '1'
    },
    book_state_binding: {
      expected_book_state_version: '10',
      expected_book_state_digest_sha256: H
    },
    story_bible_binding: {
      story_bible_snapshot_ref: 'story:v4',
      story_bible_snapshot_sha256: H,
      canon_version: '4'
    },
    author_authority_binding: {
      decision_required: false,
      observed_author_decision_refs: [],
      unresolved_author_questions: []
    },
    constraint_set: [
      { constraint_id: 'C-1', class: 'canon', source_ref: 's1', priority: 1, hard_or_advisory: 'hard' }
    ],
    capability_request: {
      capability_id: capability.current_capability_id,
      authority_domain: capability.authority_domain,
      service_registry_id: capability.provider_provenance.service_registry_id,
      service_registry_subject_sha: capability.provider_provenance.service_registry_subject_or_digest,
      consumer_role: capability.context_package_class === 'EVALUATION_CONTEXT' ? 'BOOK_OWNED_EVALUATION_ADAPTER' : 'BOOK_OWNED_GENERATION_ADAPTER',
      integration_owner: 'BOOK',
      completed_prose_input: true
    },
    privacy_class: 'BOOK_PRIVATE_REF_ONLY',
    created_at: '2026-09-11T04:00:00Z',
    expires_at: '2026-09-11T06:00:00Z',
    compiler_version: 'B01-D2',
    compiler_subject_sha: 'CURRENT_B01_SUBJECT',
    research_evidence_refs: [],
    prior_decision_refs: [],
    artifact_refs: [],
    evaluation_policy_ref: null
  };
}

function live(x) {
  return {
    source_identity: x.source_identity,
    book_state_binding: x.book_state_binding,
    story_bible_binding: x.story_bible_binding,
    capability_request: {
      service_registry_id: x.capability_request.service_registry_id,
      service_registry_subject_sha: x.capability_request.service_registry_subject_sha
    }
  };
}

function compile(x = base(), capability = cap, extra = {}) {
  return rebound.compileBoundContext({
    context_input: x,
    current_capability_id: capability.current_capability_id,
    expected_authority_domain: capability.authority_domain,
    binding_registry: extra.binding_registry || registry,
    live: extra.live || live(x),
    now: NOW
  });
}

const result = compile();
eq(result.result_class, 'BOUND_CONTEXT_READY');
eq(result.canonical_effect, false);
eq(result.capability_binding_id, cap.binding_id);
eq(result.capability_binding_digest, cap.binding_digest);
eq(result.provider_execution_standing, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
eq(result.bound_context.current_owner_path, 'SYSTEM_MASTER/BOOK');
eq(result.bound_context.current_capability_id, 'BOOK.LITERARY.ANALYZE_PASSAGE');
eq(result.bound_context.capability_binding_digest, cap.binding_digest);
eq(result.bound_context.provider_service_id, 'PROSE_ANALYSIS_AND_REVISION');
eq(result.bound_context.provider_operation_id, 'ANALYZE_PASSAGE_OR_UNIT');
eq(result.bound_context.provider_subject_ref, null);
eq(result.bound_context.canonical_write_authority, false);
eq(result.bound_context.publication_authority, false);
eq(result.bound_context.author_decision_authority, false);
eq(result.bound_context.private_data_authority, 'NOT_GRANTED_BY_BINDING');
ok(/^[0-9a-f]{64}$/.test(result.bound_context.bound_context_digest_sha256));
ok(result.bound_context.bound_context_id.endsWith(result.bound_context.bound_context_digest_sha256));
ok(rebound.validateBoundContext(result.bound_context));
ok(rebound.assertBoundContextFresh(result.bound_context, { binding_registry: registry }));

// X01: binding identity is part of the durable bound-context identity.
const copied = JSON.parse(JSON.stringify(result.bound_context));
copied.capability_binding_digest = '0'.repeat(64);
expectCode(() => rebound.validateBoundContext(copied), 'BOUND_CONTEXT_DIGEST_MISMATCH');

// X02: a changed current binding makes the previous bound context stale.
const changedBindingSource = JSON.parse(JSON.stringify(bindingSource));
changedBindingSource.binding_inputs[0].adapter_version = '1.0.1';
const changedRegistry = bindingRuntime.buildRegistry(changedBindingSource);
expectCode(() => rebound.assertBoundContextFresh(result.bound_context, { binding_registry: changedRegistry }), 'STALE_BOUND_CONTEXT');

// X09: a missing provider subject remains explicitly unadmitted and cannot become executable standing.
expectCode(() => bindingRuntime.resolveBinding(cap.current_capability_id, cap.authority_domain, { registry, requireExecutable: true }), 'PROVIDER_SUBJECT_UNADMITTED');
eq(result.provider_execution_standing, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');

// Current execution identity is Book-owned; retired Prose ID cannot compile through the rebind layer.
const retired = rebound.compileBoundContext({
  context_input: base(),
  current_capability_id: 'PROSE.ANALYZE_PASSAGE',
  expected_authority_domain: 'LITERARY_DIAGNOSIS',
  binding_registry: registry,
  live: live(base()),
  now: NOW
});
eq(retired.result_class, 'REJECTED_AUTHORITY_BOUNDARY');
eq(retired.reason, 'RETIRED_PROSE_EXECUTION_ID');

// Exact capability, authority, registry and current owner bindings fail closed.
const wrongCap = base();
wrongCap.capability_request.capability_id = 'BOOK.LITERARY.DIAGNOSE';
eq(compile(wrongCap).reason, 'CURRENT_CAPABILITY_BINDING_MISMATCH');
const wrongDomain = base();
wrongDomain.capability_request.authority_domain = 'WRONG';
eq(compile(wrongDomain).reason, 'CAPABILITY_AUTHORITY_DOMAIN_MISMATCH');
const wrongRegistry = base();
wrongRegistry.capability_request.service_registry_id = 'other';
eq(compile(wrongRegistry).reason, 'SERVICE_REGISTRY_BINDING_MISMATCH');
const wrongRegistrySubject = base();
wrongRegistrySubject.capability_request.service_registry_subject_sha = 'other';
eq(compile(wrongRegistrySubject).reason, 'SERVICE_REGISTRY_SUBJECT_BINDING_MISMATCH');
const wrongOwner = base();
wrongOwner.capability_request.integration_owner = 'DOCUMENTS';
eq(compile(wrongOwner).reason, 'CURRENT_INTEGRATION_OWNER_MUST_BE_BOOK');
const wrongRole = base();
wrongRole.capability_request.consumer_role = 'BOOK_OWNED_EVALUATION_ADAPTER';
eq(compile(wrongRole).reason, 'CONTEXT_CONSUMER_ROLE_MISMATCH');

// Live service change fails stale rather than being overwritten by the wrapper.
const liveWrong = live(base());
liveWrong.capability_request.service_registry_subject_sha = 'changed';
eq(compile(base(), cap, { live: liveWrong }).result_class, 'STALE_CONTEXT');

// Donor source/Book/Story-Bible/author/privacy fences remain active through the wrapper.
const staleSource = base();
const staleSourceLive = live(staleSource);
staleSourceLive.source_identity = { ...staleSourceLive.source_identity, source_version_id: '2' };
eq(compile(staleSource, cap, { live: staleSourceLive }).result_class, 'STALE_CONTEXT');
const staleBook = base();
const staleBookLive = live(staleBook);
staleBookLive.book_state_binding = { ...staleBookLive.book_state_binding, expected_book_state_digest_sha256: H2 };
eq(compile(staleBook, cap, { live: staleBookLive }).result_class, 'STALE_CONTEXT');
const staleStory = base();
const staleStoryLive = live(staleStory);
staleStoryLive.story_bible_binding = { ...staleStoryLive.story_bible_binding, story_bible_snapshot_sha256: H2 };
eq(compile(staleStory, cap, { live: staleStoryLive }).result_class, 'STALE_CONTEXT');
const authorBlocked = base();
authorBlocked.author_authority_binding = { decision_required: true, observed_author_decision_refs: [], unresolved_author_questions: ['choose ending'] };
eq(compile(authorBlocked).result_class, 'AUTHOR_DECISION_REQUIRED');
const rawPrivate = base();
rawPrivate.raw_manuscript_text = 'forbidden';
eq(compile(rawPrivate).result_class, 'REJECTED_AUTHORITY_BOUNDARY');
const publicationSecret = base();
publicationSecret.research_evidence_refs = [{ publication_credentials: 'forbidden' }];
eq(compile(publicationSecret).result_class, 'REJECTED_AUTHORITY_BOUNDARY');

// Evaluator identity is current Book-owned and retains structural isolation role separation.
const evalCap = bindingRuntime.resolveBinding('BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT', 'LITERARY_EVALUATION_EVIDENCE', { registry });
const evalInput = base(evalCap);
const evalResult = compile(evalInput, evalCap);
eq(evalResult.result_class, 'BOUND_CONTEXT_READY');
eq(evalResult.bound_context.package_class, 'EVALUATION_CONTEXT');
eq(evalResult.bound_context.current_owner_path, 'SYSTEM_MASTER/BOOK');
eq(evalResult.provider_execution_standing, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
const evalWrongRole = base(evalCap);
evalWrongRole.capability_request.consumer_role = 'BOOK_OWNED_GENERATION_ADAPTER';
eq(compile(evalWrongRole, evalCap).reason, 'CONTEXT_CONSUMER_ROLE_MISMATCH');

// All 11 design-locked current mappings can be bound to context metadata without granting execution.
for (const mapped of registry.bindings) {
  const input = base(mapped);
  const r = compile(input, mapped);
  eq(r.result_class, 'BOUND_CONTEXT_READY');
  eq(r.bound_context.current_capability_id, mapped.current_capability_id);
  eq(r.bound_context.capability_binding_digest, mapped.binding_digest);
  eq(r.provider_execution_standing, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
  eq(r.canonical_effect, false);
}

console.log(JSON.stringify({
  result: 'PASS',
  checks,
  design_locked_capability_mappings_bound: registry.bindings.length,
  donor_context_package_ready: true,
  binding_digest_in_bound_context_identity: true,
  changed_binding_stales_context: true,
  provider_subjects_admitted: 0,
  retired_prose_execution_allowed: false,
  canonical_effect_allowed: false,
  publication_authority_granted: false,
  private_authority_granted: false
}));
