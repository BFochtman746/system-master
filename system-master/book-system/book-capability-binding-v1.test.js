'use strict';

const assert = require('assert');
const binding = require('./book-capability-binding-v1');
const source = require('./book-capability-binding-v1.registry.json');

let checks = 0;
function ok(v, m) { assert(v, m); checks += 1; }
function eq(a, b, m) { assert.strictEqual(a, b, m); checks += 1; }
function deep(a, b, m) { assert.deepStrictEqual(a, b, m); checks += 1; }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  ok(caught, `expected ${code}`);
  eq(caught.code, code, `expected ${code}`);
}

const registry = binding.buildRegistry(source);

eq(registry.owner_path, 'SYSTEM_MASTER/BOOK');
eq(registry.bindings.length, 11);
ok(/^[0-9a-f]{64}$/.test(registry.registry_digest));
eq(new Set(registry.bindings.map(x => x.current_capability_id)).size, 11);
eq(new Set(registry.bindings.map(x => x.binding_id)).size, 11);

for (const b of registry.bindings) {
  ok(binding.validateBinding(b));
  eq(b.current_owner_path, 'SYSTEM_MASTER/BOOK');
  eq(b.canonical_write_authority, false);
  eq(b.lifecycle_transition_authority, false);
  eq(b.export_freeze_authority, false);
  eq(b.publication_authority, false);
  eq(b.author_decision_authority, false);
  eq(b.private_data_authority, 'NOT_GRANTED_BY_BINDING');
  eq(b.provider_provenance.provider_subject_ref, null);
  ok(b.binding_id.endsWith(b.binding_digest));
  ok(!b.current_capability_id.startsWith('PROSE.'));
}

const expectedMappings = {
  'BOOK.LITERARY.ANALYZE_PASSAGE': ['LITERARY_DIAGNOSIS','PROSE_ANALYSIS_AND_REVISION','ANALYZE_PASSAGE_OR_UNIT','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.LITERARY.BUILD_NARRATIVE_STATE': ['LITERARY_NARRATIVE_ANALYSIS','PROSE_ANALYSIS_AND_REVISION','BUILD_NARRATIVE_STATE_PROJECTION','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.LITERARY.DIAGNOSE': ['LITERARY_DIAGNOSIS','PROSE_ANALYSIS_AND_REVISION','DIAGNOSE_LIMITATIONS_AND_OPPORTUNITIES','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.LITERARY.RETRIEVE_CRAFT_INTELLIGENCE': ['LITERARY_CRAFT_INTELLIGENCE','PROSE_ANALYSIS_AND_REVISION','RETRIEVE_CRAFT_INTELLIGENCE','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE': ['LITERARY_CANDIDATE_GENERATION','PROSE_ANALYSIS_AND_REVISION','GENERATE_BOUNDED_REVISION_CANDIDATE','GENERATION_CONTEXT',false,'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING'],
  'BOOK.LITERARY.COMPARE_ORIGINAL_CANDIDATE': ['LITERARY_COMPARISON_EVIDENCE','PROSE_ANALYSIS_AND_REVISION','COMPARE_ORIGINAL_AND_CANDIDATE','EVALUATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.LITERARY.ASSESS_VOICE': ['VOICE_EVIDENCE','PROSE_ANALYSIS_AND_REVISION','ASSESS_VOICE_EVOLUTION_OR_DEGRADATION','EVALUATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.LITERARY.ASSESS_HOMOGENIZATION': ['HOMOGENIZATION_DEFENSE_EVIDENCE','PROSE_ANALYSIS_AND_REVISION','ASSESS_HOMOGENIZATION_RISK','EVALUATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  'BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT': ['LITERARY_EVALUATION_EVIDENCE','BOOK_EVALUATION','INDEPENDENT_BOOK_OR_UNIT_EVALUATION','EVALUATION_CONTEXT',true,'ISOLATION_GATED'],
  'BOOK.EVALUATION.CONTRASTIVE_CANDIDATE': ['LITERARY_EVALUATION_EVIDENCE','BOOK_EVALUATION','CONTRASTIVE_CANDIDATE_EVALUATION','EVALUATION_CONTEXT',true,'ISOLATION_GATED'],
  'BOOK.EVALUATION.QUALIFICATION_EVIDENCE': ['QUALIFICATION_EVIDENCE','BOOK_EVALUATION','QUALIFICATION_EVIDENCE','EVALUATION_CONTEXT',true,'ISOLATION_GATED']
};

for (const [capabilityId, expected] of Object.entries(expectedMappings)) {
  const b = binding.resolveBinding(capabilityId, expected[0], { registry });
  eq(b.provider_provenance.historical_or_provider_service_id, expected[1]);
  eq(b.provider_provenance.operation_id, expected[2]);
  eq(b.context_package_class, expected[3]);
  eq(b.registered_idempotent, expected[4]);
  eq(b.concurrency_policy_class, expected[5]);
}

const generation = binding.resolveBinding('BOOK.LITERARY.GENERATE_REVISION_CANDIDATE', 'LITERARY_CANDIDATE_GENERATION', { registry });
eq(generation.registered_idempotent, false);
eq(generation.concurrency_policy_class, 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING');

const evalCaps = registry.bindings.filter(x => x.current_capability_id.startsWith('BOOK.EVALUATION.'));
eq(evalCaps.length, 3);
ok(evalCaps.every(x => x.concurrency_policy_class === 'ISOLATION_GATED'));

expectCode(() => binding.resolveBinding('PROSE.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS', { registry }), 'RETIRED_PROSE_EXECUTION_ID');
expectCode(() => binding.resolveBinding('BOOK.LITERARY.UNKNOWN', 'LITERARY_DIAGNOSIS', { registry }), 'CAPABILITY_BINDING_NOT_FOUND');
expectCode(() => binding.resolveBinding('BOOK.LITERARY.ANALYZE_PASSAGE', 'WRONG_DOMAIN', { registry }), 'CAPABILITY_AUTHORITY_DOMAIN_MISMATCH');
expectCode(() => binding.resolveBinding('BOOK.LITERARY.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS', { registry, requireExecutable: true }), 'PROVIDER_SUBJECT_UNADMITTED');

const sourceInput = source.binding_inputs[0];
const b1 = binding.createBinding(sourceInput);
const reordered = {
  provider_provenance: { ...sourceInput.provider_provenance },
  private_data_authority: sourceInput.private_data_authority,
  concurrency_policy_class: sourceInput.concurrency_policy_class,
  registered_idempotent: sourceInput.registered_idempotent,
  context_package_class: sourceInput.context_package_class,
  authority_domain: sourceInput.authority_domain,
  adapter_version: sourceInput.adapter_version,
  adapter_id: sourceInput.adapter_id,
  current_capability_id: sourceInput.current_capability_id,
  ignored_chat_label: 'mutable metadata must not affect identity',
  created_at: '2099-01-01T00:00:00Z'
};
const b2 = binding.createBinding(reordered);
eq(b1.binding_digest, b2.binding_digest);
eq(b1.binding_id, b2.binding_id);

eq(binding.assertCreateOnce(null, b1).action, 'CREATE');
eq(binding.assertCreateOnce(b1, b2).action, 'REUSE');

const changedAdapter = binding.createBinding({ ...sourceInput, adapter_version: '1.0.1' });
ok(changedAdapter.binding_digest !== b1.binding_digest);
expectCode(() => binding.assertCreateOnce(b1, changedAdapter), 'BINDING_ID_CONFLICT');

const changedProvider = binding.createBinding({
  ...sourceInput,
  provider_provenance: { ...sourceInput.provider_provenance, provider_subject_ref: 'provider-subject://different' }
});
ok(changedProvider.binding_digest !== b1.binding_digest);

const changedDomain = binding.createBinding({ ...sourceInput, authority_domain: 'DIFFERENT_DOMAIN' });
ok(changedDomain.binding_digest !== b1.binding_digest);

const changedConcurrency = binding.createBinding({ ...sourceInput, concurrency_policy_class: 'ISOLATION_GATED' });
ok(changedConcurrency.binding_digest !== b1.binding_digest);

const changedIdempotency = binding.createBinding({ ...sourceInput, registered_idempotent: false });
ok(changedIdempotency.binding_digest !== b1.binding_digest);

const tamperedDigest = { ...b1, binding_digest: '0'.repeat(64) };
expectCode(() => binding.validateBinding(tamperedDigest), 'BINDING_DIGEST_MISMATCH');
const tamperedId = { ...b1, binding_id: `book-capability-binding-v1:${'1'.repeat(64)}` };
expectCode(() => binding.validateBinding(tamperedId), 'BINDING_ID_CONTENT_ADDRESS_MISMATCH');
const widenedCanon = binding.createBinding(sourceInput);
widenedCanon.canonical_write_authority = true;
widenedCanon.binding_digest = binding.digestBinding(widenedCanon);
widenedCanon.binding_id = `book-capability-binding-v1:${widenedCanon.binding_digest}`;
expectCode(() => binding.validateBinding(widenedCanon), 'AUTHORITY_WIDENING_FORBIDDEN');
expectCode(() => binding.createBinding({ ...sourceInput, private_data_authority: 'GRANTED' }), 'PRIVATE_AUTHORITY_WIDENING_FORBIDDEN');
expectCode(() => binding.createBinding({ ...sourceInput, current_capability_id: 'PROSE.ANALYZE_PASSAGE' }), 'RETIRED_PROSE_EXECUTION_ID');

const duplicateSource = {
  ...source,
  binding_inputs: [...source.binding_inputs, { ...source.binding_inputs[0] }]
};
expectCode(() => binding.buildRegistry(duplicateSource), 'DUPLICATE_CURRENT_CAPABILITY_ID');

console.log(JSON.stringify({
  result: 'PASS',
  checks,
  capability_mappings: registry.bindings.length,
  provider_subjects_admitted: 0,
  retired_prose_execution_allowed: false,
  canonical_effect_allowed: false,
  publication_authority_granted: false,
  private_authority_granted: false
}));
