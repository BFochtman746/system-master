'use strict';

const assert = require('assert');
const kb = require('./book-story-bible-knowledge-v1');
const mat = require('./book-knowledge-materializer-v1');
const inv = require('./book-knowledge-invalidation-v1');
const d4 = require('./book-story-bible-admission-v1');
const vr = require('./version-and-rollback-core');
const registry = require('./book-capability-binding-v1.registry.json');

let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function h(v) { return kb.sha256(v); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}
function sealKnowledge(k) {
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  return k;
}

const BOOK_PROJECT_ID = 'BOOK-PROJECT-001';
const STORY_REF = 'BIBLE-001:V1';
const SOURCE_ID = 'book-source-custody-v1:source-001';
const SOURCE_DIGEST = h('b03-e-source-acceptance');
const PROJECTION_ID = 'book-normalized-source-projection-v1:projection-001';
const PROJECTION_DIGEST = h('b03-e-normalized-projection');
const MANUSCRIPT_REF = 'MANUSCRIPT-001:V1';
const MANUSCRIPT_DIGEST = h('b03-e-manuscript');
const PROVIDER_REF = 'provider-projection://narrative-state/b03-e';
const PROVIDER_DIGEST = h('b03-e-provider-projection');
const PROVIDER_SUBJECT = 'subject://provider/model-b03-e';
const B02_REF = 'b02-recovery://proposal/b03-e';
const B02_DIGEST = h('b03-e-b02-proposal');
const ANCHOR_SPAN = h('b03-e-anchor-span');
const B03_SUBJECT_SHA = 'c'.repeat(40);
const CREATED_AT = '2026-09-12T19:00:00Z';

function rule(semanticClass, mode, outputs) {
  return {
    semantic_class: semanticClass,
    admission_mode: mode,
    min_confidence: semanticClass === 'ENTITY' ? 0.5 : null,
    min_distinct_evidence_families: 1,
    allowed_support_statuses: ['VERIFIED', 'OBSERVED', 'INFERRED', 'CONTESTED'],
    allowed_output_statuses: outputs,
    calibration_evidence_refs: semanticClass === 'ENTITY' ? ['calibration://b03-e/entity-v1'] : [],
    abstain_when_uncalibrated: semanticClass === 'ENTITY'
  };
}
function policy() {
  return mat.sealCalibrationPolicyV1({
    policy_schema_version: mat.POLICY_SCHEMA_VERSION,
    policy_id: 'book-knowledge-policy-b03-e',
    policy_version: '1',
    policy_digest: '',
    provider_subject_scopes: [PROVIDER_SUBJECT],
    rules: [
      rule('ANCHOR', 'DETERMINISTIC_ONLY', ['DETERMINISTIC']),
      rule('ENTITY', 'CALIBRATED_MODEL', ['ASSERTED', 'ALTERNATIVE', 'UNRESOLVED', 'CONTESTED', 'INVALIDATED'])
    ],
    standing: 'ADMITTED'
  });
}
function emptyKnowledge(p) {
  return sealKnowledge({
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: BOOK_PROJECT_ID,
    knowledge_candidate_id: '', knowledge_digest: '', prior_story_bible_ref: null,
    source_subject_refs: ['subject://source/b03-e'],
    source_acceptance_refs: [{ source_acceptance_id: SOURCE_ID, source_acceptance_digest: SOURCE_DIGEST }],
    projection_refs: [{ projection_id: PROJECTION_ID, projection_digest: PROJECTION_DIGEST, source_acceptance_id: SOURCE_ID }],
    manuscript_refs: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST }],
    calibration_policy_ref: mat.policyRef(p), calibration_policy_digest: p.policy_digest,
    anchors: [], entities: [], events: [], temporal_claims: [], causal_goal_claims: [], state_assertions: [],
    character_knowledge_claims: [], relationships: [], arcs: [], motifs: [], themes: [], promises: [], setup_payoffs: [], open_questions: [],
    identity_lineage: [], standing: 'MATERIALIZED_NOT_CANONICAL'
  });
}
function baseState(k0) {
  return vr.sealState({
    schema_version: 1, state_version: 1,
    book_project: { book_project_id: BOOK_PROJECT_ID, book_id: 'BOOK-001', status: 'DRAFTING', governing_brief_ref: 'BRIEF-001:V1', canonical_manifest_ref: 'CANON-001:V1' },
    governing_briefs: [{ brief_id: 'BRIEF-001', version: 'V1' }],
    canon_manifests: [{ canon_manifest_id: 'CANON-001', version: 'V1' }],
    story_bibles: [{
      story_bible_id: 'BIBLE-001', version: 'V1', book_project_id: BOOK_PROJECT_ID,
      knowledge_schema_version: k0.knowledge_schema_version, knowledge_candidate_id: k0.knowledge_candidate_id,
      knowledge_digest: k0.knowledge_digest, knowledge: clone(k0),
      entity_refs: [], relationship_refs: [], timeline_refs: [], arc_refs: [], motif_theme_refs: [], open_questions: [], provenance: []
    }],
    book_plans: [{ plan_id: 'PLAN-001', version: 'V1' }],
    manuscripts: [{ manuscript_id: 'MANUSCRIPT-001', version_id: 'V1', artifact_digest: h('b03-e-manuscript-artifact'), authority_state: 'CANONICAL' }],
    research_evidence_links: [], author_decisions: [], integration_proposals: [], export_releases: [],
    active: { governing_brief_ref: 'BRIEF-001:V1', canon_manifest_ref: 'CANON-001:V1', story_bible_ref: STORY_REF, book_plan_ref: 'PLAN-001:V1', canonical_manuscript_ref: MANUSCRIPT_REF }
  });
}
function currentStoryRecord(parent) {
  return vr.objectRecords(parent).find(x => x.type === 'STORY_BIBLE' && `${x.object_id}:${x.object_version}` === STORY_REF);
}
function anchorCandidate() {
  return {
    candidate_local_id: 'anchor-a1', semantic_class: 'ANCHOR', referent_key: 'anchor:a1',
    origin_type: 'DETERMINISTIC', origin_ref: 'BOOK_DETERMINISTIC', origin_digest: h('b03-e-anchor-origin'), provider_subject_ref: null,
    support_status: 'VERIFIED', evidence_family: 'SOURCE_SPAN', creation_operation_id: 'B03-E:CREATE:ANCHOR:A1',
    source_acceptance_ids: [SOURCE_ID], projection_ids: [PROJECTION_ID], manuscript_refs: [MANUSCRIPT_REF],
    record: {
      anchor_id: 'ANCHOR:A1', source_acceptance_id: SOURCE_ID, source_acceptance_digest: SOURCE_DIGEST,
      projection_id: PROJECTION_ID, projection_digest: PROJECTION_DIGEST, manuscript_ref: MANUSCRIPT_REF,
      unit_ref: 'CHAPTER:CH-001:V1', ordinal: 1, span_start: 0, span_end: 12, span_sha256: ANCHOR_SPAN,
      source_current: true, provenance_refs: ['evidence://b03-e/anchor/a1']
    }
  };
}
function entityCandidate(id, alias, originType, originRef, originDigest, supportStatus, evidenceFamily, providerSubject) {
  return {
    candidate_local_id: `entity-${alias.toLowerCase()}`, semantic_class: 'ENTITY', referent_key: `entity:${alias.toLowerCase()}`,
    origin_type: originType, origin_ref: originRef, origin_digest: originDigest, provider_subject_ref: providerSubject,
    support_status: supportStatus, evidence_family: evidenceFamily, creation_operation_id: `B03-E:CREATE:${id}`,
    source_acceptance_ids: [SOURCE_ID], projection_ids: [PROJECTION_ID], manuscript_refs: [MANUSCRIPT_REF],
    record: {
      entity_id: id, entity_type: 'CHARACTER', aliases: [alias], state_assertion_ids: [],
      status: supportStatus === 'CONTESTED' ? 'CONTESTED' : 'ASSERTED', confidence: originType === 'B02_RECOVERY' ? 0.82 : 0.94,
      source_anchor_ids: ['ANCHOR:A1'], provenance_refs: [`evidence://b03-e/${alias.toLowerCase()}`],
      evidence_refs: [`evidence://b03-e/claim/${alias.toLowerCase()}`], depends_on_refs: ['ANCHOR:A1']
    }
  };
}
function materializationInput(p, priorKnowledge, storyDigest, candidates) {
  return mat.sealMaterializationInputV1({
    materialization_operation_id: '', materialization_operation_digest: '', book_project_id: BOOK_PROJECT_ID,
    prior_story_bible_ref: STORY_REF, prior_story_bible_digest: storyDigest,
    source_acceptance_refs_and_digests: [{
      source_acceptance_id: SOURCE_ID, source_acceptance_digest: SOURCE_DIGEST, source_subject_ref: 'subject://source/b03-e',
      current: true, rights_current: true, private_authority_current: true
    }],
    projection_refs_and_digests: [{ projection_id: PROJECTION_ID, projection_digest: PROJECTION_DIGEST, source_acceptance_id: SOURCE_ID, current: true }],
    manuscript_refs_and_digests: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST, current: true }],
    b02_recovery_proposal_refs_and_digests: [{ proposal_ref: B02_REF, proposal_digest: B02_DIGEST, standing: 'PROPOSED_NOT_CANONICAL' }],
    provider_projection_refs_and_digests: [{ projection_ref: PROVIDER_REF, projection_digest: PROVIDER_DIGEST, provider_subject_ref: PROVIDER_SUBJECT, standing: 'PROJECTION_EVIDENCE', current: true }],
    calibration_policy_ref: mat.policyRef(p), calibration_policy_digest: p.policy_digest,
    candidate_records: candidates,
    materializer_subject_ref: mat.MATERIALIZER_SUBJECT_REF, validator_subject_ref: mat.VALIDATOR_SUBJECT_REF,
    prior_knowledge: clone(priorKnowledge), prior_identity_bindings: []
  });
}
function invalidationFor(knowledge, storyDigest) {
  const alice = knowledge.entities.find(x => x.entity_id === 'ENTITY:ALICE');
  return inv.computeStoryBibleInvalidationImpactV1(inv.sealInvalidationInputV1({
    invalidation_operation_id: '', invalidation_operation_digest: '', invalidation_subject_ref: inv.INVALIDATION_SUBJECT_REF,
    book_project_id: BOOK_PROJECT_ID, base_story_bible_ref: STORY_REF, base_story_bible_digest: storyDigest,
    base_knowledge: knowledge,
    changed_identities: [{
      kind: 'SEMANTIC_IDENTITY', identity_ref: 'ENTITY:ALICE', prior_digest: kb.sha256(alice),
      current_digest: h('b03-e-alice-superseded'), current_identity_ref: 'ENTITY:ALICE:SUPERSEDED'
    }]
  }));
}
function invalidatedAliceCandidate(impact) {
  const record = impact.successor.proposed_knowledge.entities.find(x => x.entity_id === 'ENTITY:ALICE');
  return {
    candidate_local_id: 'entity-alice-invalidated', semantic_class: 'ENTITY', referent_key: 'entity:alice',
    origin_type: 'DETERMINISTIC', origin_ref: 'BOOK_DETERMINISTIC', origin_digest: impact.impact.impact_digest, provider_subject_ref: null,
    support_status: 'VERIFIED', evidence_family: 'INVALIDATION', creation_operation_id: impact.impact.invalidation_operation_id,
    source_acceptance_ids: [SOURCE_ID], projection_ids: [PROJECTION_ID], manuscript_refs: [MANUSCRIPT_REF], record: clone(record)
  };
}
function admissionInput(ctx, p, materialized, impact, patch = {}) {
  const current = currentStoryRecord(ctx.parent_state);
  return d4.sealStoryBibleAdmissionInputV1({
    admission_operation_id: '', admission_operation_digest: '', book_project_id: BOOK_PROJECT_ID,
    current_parent_state_version: ctx.parent_state.state_version, current_parent_state_digest: ctx.parent_state.state_digest,
    current_story_bible_ref: STORY_REF, current_story_bible_digest: current.object_digest,
    knowledge: clone(materialized.knowledge), knowledge_candidate_id: materialized.knowledge.knowledge_candidate_id, knowledge_digest: materialized.knowledge.knowledge_digest,
    materialization_receipt: clone(materialized.receipt), materialization_receipt_id: materialized.receipt.receipt_id, materialization_receipt_digest: materialized.receipt.receipt_digest,
    calibration_policy: clone(p), calibration_policy_ref: mat.policyRef(p), calibration_policy_digest: p.policy_digest,
    source_identity_evidence: [{ source_acceptance_id: SOURCE_ID, source_acceptance_digest: SOURCE_DIGEST, current: true, rights_current: true, private_authority_current: true }],
    projection_identity_evidence: [{ projection_id: PROJECTION_ID, projection_digest: PROJECTION_DIGEST, current: true }],
    manuscript_identity_evidence: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST, current: true }],
    definitive_contested_resolution_refs: [], author_decision_refs: [], author_applicability_bindings: [],
    new_story_bible_id: 'BIBLE-001', new_story_bible_version: 'V2', new_story_bible_content_digest: '',
    b03_subject_sha: B03_SUBJECT_SHA, created_at: CREATED_AT, invalidation_result: clone(impact), ...patch
  });
}

const p = policy();
const k0 = emptyKnowledge(p);
kb.validateStoryBibleKnowledgeV1(k0, { expected_book_project_id: BOOK_PROJECT_ID });
const ctx = vr.createVersionLedger(baseState(k0));
const storyDigest = currentStoryRecord(ctx.parent_state).object_digest;
const providerAlice = entityCandidate('ENTITY:ALICE', 'Alice', 'PROVIDER_PROJECTION', PROVIDER_REF, PROVIDER_DIGEST, 'OBSERVED', 'ENTITY_EXTRACTION', PROVIDER_SUBJECT);
const b02Bob = entityCandidate('ENTITY:BOB', 'Bob', 'B02_RECOVERY', B02_REF, B02_DIGEST, 'CONTESTED', 'B02_RECOVERY', null);
const m1 = mat.materializeStoryBibleKnowledgeCandidateV1(materializationInput(p, k0, storyDigest, [anchorCandidate(), providerAlice, b02Bob]), p);
const impact = invalidationFor(m1.knowledge, storyDigest);
const m2 = mat.materializeStoryBibleKnowledgeCandidateV1(materializationInput(p, m1.knowledge, storyDigest, [invalidatedAliceCandidate(impact)]), p);

pass('E01_PROVIDER_AND_B02_PROPOSAL_MATERIALIZE_NONCANONICALLY', () => {
  assert.strictEqual(m1.result, 'MATERIALIZED_NOT_CANONICAL');
  assert.strictEqual(m1.canonical_effect, false);
  assert.strictEqual(m1.receipt.canonical_write_performed, false);
  assert.strictEqual(m1.knowledge.entities.find(x => x.entity_id === 'ENTITY:ALICE').status, 'ASSERTED');
  assert.strictEqual(m1.knowledge.entities.find(x => x.entity_id === 'ENTITY:BOB').status, 'CONTESTED');
});

pass('E02_INVALIDATION_IS_BOUNDED_AND_HISTORICAL_KNOWLEDGE_IMMUTABLE', () => {
  const before = kb.stableStringify(m1.knowledge);
  assert.deepStrictEqual(impact.impact.directly_affected_refs, ['ENTITY:ALICE']);
  assert(impact.impact.unaffected_refs.includes('ENTITY:BOB'));
  assert.strictEqual(impact.successor.proposed_knowledge.entities.find(x => x.entity_id === 'ENTITY:ALICE').status, 'INVALIDATED');
  assert.strictEqual(impact.successor.proposed_knowledge.entities.find(x => x.entity_id === 'ENTITY:BOB').status, 'CONTESTED');
  assert.strictEqual(kb.stableStringify(m1.knowledge), before);
  assert.strictEqual(impact.canonical_effect, false);
});

pass('E03_INVALIDATED_SUCCESSOR_IS_REMATERIALIZED_WITH_EXACT_RECEIPT', () => {
  assert.strictEqual(m2.knowledge.knowledge_digest, impact.successor.proposed_knowledge.knowledge_digest);
  assert.strictEqual(m2.knowledge.knowledge_candidate_id, impact.successor.proposed_knowledge.knowledge_candidate_id);
  assert.strictEqual(m2.knowledge.entities.find(x => x.entity_id === 'ENTITY:ALICE').status, 'INVALIDATED');
  assert.strictEqual(m2.knowledge.entities.find(x => x.entity_id === 'ENTITY:BOB').status, 'CONTESTED');
  assert.strictEqual(mat.validateMaterializationReceiptV1(m2.receipt), true);
  assert.strictEqual(m2.receipt.canonical_write_performed, false);
});

pass('E04_DEFINITIVE_CONTESTED_RESOLUTION_IS_AUTHOR_GATED', () => {
  const gated = admissionInput(ctx, p, m2, impact, { definitive_contested_resolution_refs: ['ENTITY:BOB'] });
  expectCode(() => d4.prepareStoryBibleKnowledgeAdmissionV1(gated, { parent_state: ctx.parent_state, version_ledger: ctx.version_ledger }), 'BLOCKED_AUTHOR_DECISION');
});

const input = admissionInput(ctx, p, m2, impact);
const prepared = d4.prepareStoryBibleKnowledgeAdmissionV1(input, { parent_state: ctx.parent_state, version_ledger: ctx.version_ledger });

pass('E05_PREPARE_IS_ZERO_EFFECT_AND_COMPOSES_EXACT_B00_OPERATIONS', () => {
  const before = clone(ctx.parent_state);
  assert.strictEqual(prepared.canonical_effect, false);
  assert.strictEqual(prepared.readiness, 'READY_FOR_GOVERNED_ADMISSION');
  assert.strictEqual(prepared.content_admission_request.operations.length, 2);
  assert.strictEqual(prepared.content_admission_request.operations[0].operation_type, 'REGISTER_CONTENT_OBJECT_VERSION');
  assert.strictEqual(prepared.content_admission_request.operations[0].object_type, 'STORY_BIBLE');
  assert.strictEqual(prepared.content_admission_request.operations[1].operation_type, 'SET_ACTIVE_CONTENT_OBJECT_VERSION');
  assert.strictEqual(prepared.content_admission_request.operations[1].object_ref, 'BIBLE-001:V2');
  assert.deepStrictEqual(ctx.parent_state, before);
});

const preState = clone(ctx.parent_state);
const preStory = clone(preState.story_bibles[0]);
const committed = d4.commitStoryBibleKnowledgeAdmissionV1(prepared, { parent_state: ctx.parent_state, version_ledger: ctx.version_ledger });

pass('E06_B00_ATOMIC_SUCCESSOR_POINTER_AND_VERSION_LEDGER_BEHAVIOR_HOLDS', () => {
  assert.strictEqual(committed.result, 'COMMITTED_VERIFIED');
  assert.strictEqual(committed.canonical_effect_authority, 'B00_CONTENT_ADMISSION_ONLY');
  assert.strictEqual(committed.parent_state.state_version, preState.state_version + 1);
  assert.strictEqual(committed.parent_state.active.story_bible_ref, 'BIBLE-001:V2');
  assert.strictEqual(committed.parent_state.story_bibles.length, preState.story_bibles.length + 1);
  assert.deepStrictEqual(committed.parent_state.story_bibles[0], preStory);
  assert.strictEqual(committed.parent_state.book_project.status, preState.book_project.status);
  assert.deepStrictEqual(committed.parent_state.export_releases, preState.export_releases);
  assert(committed.version_receipt && committed.version_receipt.receipt_id);
});

pass('E07_EXACT_REPLAY_REUSES_ONE_VERIFIED_EFFECT', () => {
  const replay = d4.commitStoryBibleKnowledgeAdmissionV1(prepared, { parent_state: committed.parent_state, version_ledger: committed.version_ledger });
  assert.strictEqual(replay.result, 'COMMITTED_VERIFIED_REPLAY');
  assert.strictEqual(replay.parent_state.state_version, committed.parent_state.state_version);
  assert.strictEqual(replay.parent_state.active.story_bible_ref, 'BIBLE-001:V2');
  assert.strictEqual(replay.parent_state.story_bibles.length, committed.parent_state.story_bibles.length);
});

pass('E08_AUTHORITY_AND_EVIDENCE_BOUNDARIES_REMAIN_CLOSED', () => {
  assert.strictEqual(registry.binding_inputs.length, 11);
  assert.strictEqual(prepared.b01_registry_modified, false);
  assert.strictEqual(prepared.historical_pass_transferred, 0);
  assert.strictEqual(m1.model_accuracy_claimed, false);
  assert.strictEqual(m2.model_accuracy_claimed, false);
  assert.strictEqual(committed.publication_authority, false);
  assert.strictEqual(committed.production_standing_claimed, false);
});

assert.strictEqual(cases, 8);
process.stdout.write(JSON.stringify({
  result: 'PASS',
  denominator: 'B03-E-INTEGRATION-E01-E08',
  cases,
  b03_isolated_denominator_modified: false,
  provider_projection_consumed_as_evidence: true,
  b02_proposal_consumed_as_noncanonical_evidence: true,
  invalidation_currentness_exercised: true,
  author_gate_exercised: true,
  b00_atomic_story_bible_admission_exercised: true,
  immutable_story_bible_successor_verified: true,
  exact_replay_verified: true,
  b01_registry_modified: false,
  historical_pass_transferred: 0,
  model_accuracy_claimed: false,
  real_book_validation_claimed: false,
  publication_standing_claimed: false,
  production_standing_claimed: false,
  b03_f_freeze_claimed: false
}) + '\n');
