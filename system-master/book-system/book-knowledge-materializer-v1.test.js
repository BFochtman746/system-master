'use strict';

const assert = require('assert');
const kb = require('./book-story-bible-knowledge-v1');
const mat = require('./book-knowledge-materializer-v1');

let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function h(v) { return kb.sha256(v); }

const SOURCE_ID = 'book-source-custody-v1:source-001';
const SOURCE_DIGEST = h('source-acceptance-001');
const PROJECTION_ID = 'book-normalized-source-projection-v1:projection-001';
const PROJECTION_DIGEST = h('projection-001');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-001:v7';
const MANUSCRIPT_DIGEST = h('manuscript-v7');
const PROVIDER_REF = 'provider-projection://narrative-state/001';
const PROVIDER_DIGEST = h('provider-projection-001');
const PROVIDER_SUBJECT = 'subject://provider/model-v1';
const B02_REF = 'b02-recovery://proposal/001';
const B02_DIGEST = h('b02-proposal-001');

function basePolicy() {
  return mat.sealCalibrationPolicyV1({
    policy_schema_version: mat.POLICY_SCHEMA_VERSION,
    policy_id: 'book-knowledge-policy',
    policy_version: '1',
    policy_digest: '',
    provider_subject_scopes: [PROVIDER_SUBJECT],
    rules: [
      {
        semantic_class: 'ANCHOR', admission_mode: 'DETERMINISTIC_ONLY', min_confidence: null,
        min_distinct_evidence_families: 1, allowed_support_statuses: ['VERIFIED'],
        allowed_output_statuses: ['DETERMINISTIC'], calibration_evidence_refs: [], abstain_when_uncalibrated: false
      },
      {
        semantic_class: 'ENTITY', admission_mode: 'CALIBRATED_MODEL', min_confidence: 0.75,
        min_distinct_evidence_families: 1, allowed_support_statuses: ['VERIFIED', 'OBSERVED', 'INFERRED', 'CONTESTED'],
        allowed_output_statuses: ['ASSERTED', 'ALTERNATIVE', 'UNRESOLVED', 'CONTESTED'],
        calibration_evidence_refs: ['calibration://entity/v1'], abstain_when_uncalibrated: true
      }
    ],
    standing: 'ADMITTED'
  });
}
function anchorCandidate() {
  return {
    candidate_local_id: 'anchor-a1', semantic_class: 'ANCHOR', referent_key: 'anchor:a1',
    origin_type: 'DETERMINISTIC', origin_ref: 'BOOK_DETERMINISTIC', origin_digest: h('deterministic-anchor'), provider_subject_ref: null,
    support_status: 'VERIFIED', evidence_family: 'SOURCE_SPAN', creation_operation_id: 'CREATE:ANCHOR:A1',
    source_acceptance_ids: [SOURCE_ID], projection_ids: [PROJECTION_ID], manuscript_refs: [MANUSCRIPT_REF],
    record: {
      anchor_id: 'ANCHOR:A1', source_acceptance_id: SOURCE_ID, source_acceptance_digest: SOURCE_DIGEST,
      projection_id: PROJECTION_ID, projection_digest: PROJECTION_DIGEST, manuscript_ref: MANUSCRIPT_REF,
      unit_ref: 'CHAPTER:CH-001:v1', ordinal: 1, span_start: 10, span_end: 24,
      span_sha256: h('normalized-span-a1'), source_current: true, provenance_refs: ['evidence://anchor/a1']
    }
  };
}
function entityCandidate(overrides = {}) {
  const c = {
    candidate_local_id: 'entity-alice', semantic_class: 'ENTITY', referent_key: 'entity:alice',
    origin_type: 'PROVIDER_PROJECTION', origin_ref: PROVIDER_REF, origin_digest: PROVIDER_DIGEST, provider_subject_ref: PROVIDER_SUBJECT,
    support_status: 'OBSERVED', evidence_family: 'ENTITY_EXTRACTION', creation_operation_id: 'CREATE:ENTITY:ALICE',
    source_acceptance_ids: [SOURCE_ID], projection_ids: [PROJECTION_ID], manuscript_refs: [MANUSCRIPT_REF],
    record: {
      entity_id: 'ENTITY:ALICE', entity_type: 'CHARACTER', aliases: ['Alice'], state_assertion_ids: [],
      status: 'ASSERTED', confidence: 0.91, source_anchor_ids: ['ANCHOR:A1'], provenance_refs: ['evidence://provider/entity/alice'],
      evidence_refs: ['evidence://entity/alice'], depends_on_refs: ['ANCHOR:A1']
    }
  };
  return Object.assign(c, clone(overrides));
}
function b02EntityCandidate() {
  const c = entityCandidate();
  c.candidate_local_id = 'entity-bob'; c.referent_key = 'entity:bob'; c.creation_operation_id = 'CREATE:ENTITY:BOB';
  c.origin_type = 'B02_RECOVERY'; c.origin_ref = B02_REF; c.origin_digest = B02_DIGEST; c.provider_subject_ref = null; c.support_status = 'VERIFIED'; c.evidence_family = 'B02_RECOVERY';
  c.record = { ...clone(c.record), entity_id: 'ENTITY:BOB', aliases: ['Bob'], provenance_refs: ['evidence://b02/entity/bob'], evidence_refs: ['evidence://b02/entity/bob'] };
  return c;
}
function baseInput(policy = basePolicy()) {
  return mat.sealMaterializationInputV1({
    materialization_operation_id: '', materialization_operation_digest: '', book_project_id: 'BOOK-PROJECT-001',
    prior_story_bible_ref: null, prior_story_bible_digest: null,
    source_acceptance_refs_and_digests: [{
      source_acceptance_id: SOURCE_ID, source_acceptance_digest: SOURCE_DIGEST, source_subject_ref: 'subject://source/book-001',
      current: true, rights_current: true, private_authority_current: true
    }],
    projection_refs_and_digests: [{ projection_id: PROJECTION_ID, projection_digest: PROJECTION_DIGEST, source_acceptance_id: SOURCE_ID, current: true }],
    manuscript_refs_and_digests: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST, current: true }],
    b02_recovery_proposal_refs_and_digests: [{ proposal_ref: B02_REF, proposal_digest: B02_DIGEST, standing: 'PROPOSED_NOT_CANONICAL' }],
    provider_projection_refs_and_digests: [{ projection_ref: PROVIDER_REF, projection_digest: PROVIDER_DIGEST, provider_subject_ref: PROVIDER_SUBJECT, standing: 'PROJECTION_EVIDENCE', current: true }],
    calibration_policy_ref: mat.policyRef(policy), calibration_policy_digest: policy.policy_digest,
    candidate_records: [anchorCandidate(), entityCandidate()],
    materializer_subject_ref: mat.MATERIALIZER_SUBJECT_REF, validator_subject_ref: mat.VALIDATOR_SUBJECT_REF,
    prior_knowledge: null, prior_identity_bindings: []
  });
}
function reseal(input) { return mat.sealMaterializationInputV1(input); }
function bindPolicy(input, policy) {
  const x = clone(input); x.calibration_policy_ref = mat.policyRef(policy); x.calibration_policy_digest = policy.policy_digest; return reseal(x);
}
function entity(result, id = 'ENTITY:ALICE') { return result.knowledge.entities.find(x => x.entity_id === id); }

const policy = basePolicy();
const input = baseInput(policy);
const baseline = mat.materializeStoryBibleKnowledgeCandidateV1(input, policy);

pass('M01', () => {
  assert.strictEqual(baseline.result, 'MATERIALIZED_NOT_CANONICAL');
  const stale = clone(input); stale.source_acceptance_refs_and_digests[0].current = false;
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(stale), policy), 'BLOCKED_SOURCE_STALE');
});
pass('M02', () => {
  const x = clone(input); x.candidate_records.push(b02EntityCandidate());
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy);
  assert(r.knowledge.entities.some(e => e.entity_id === 'ENTITY:BOB'));
  assert.strictEqual(x.b02_recovery_proposal_refs_and_digests[0].standing, 'PROPOSED_NOT_CANONICAL');
  assert.strictEqual(r.knowledge.standing, 'MATERIALIZED_NOT_CANONICAL');
});
pass('M03', () => {
  assert.strictEqual(entity(baseline).status, 'ASSERTED');
  assert.strictEqual(baseline.canonical_effect, false);
  assert.strictEqual(baseline.receipt.canonical_write_performed, false);
});
pass('M04', () => {
  const x = clone(input); x.calibration_policy_digest = h('wrong-policy');
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy), 'BLOCKED_CALIBRATION_POLICY_MISSING');
});
pass('M05', () => {
  const x = clone(input); const foreign = 'subject://provider/unadmitted';
  x.provider_projection_refs_and_digests[0].provider_subject_ref = foreign; x.candidate_records[1].provider_subject_ref = foreign;
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy), 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
});
pass('M06', () => {
  let p = clone(policy); const rule = p.rules.find(r => r.semantic_class === 'ENTITY');
  rule.admission_mode = 'AUTHOR_REQUIRED'; rule.min_confidence = null; p = mat.sealCalibrationPolicyV1(p);
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(bindPolicy(input, p), p);
  assert.strictEqual(entity(r).status, 'CONTESTED');
  assert.strictEqual(entity(r).confidence, 0.91);
});
pass('M07', () => {
  let p = clone(policy); const rule = p.rules.find(r => r.semantic_class === 'ENTITY');
  rule.calibration_evidence_refs = []; rule.abstain_when_uncalibrated = true; p = mat.sealCalibrationPolicyV1(p);
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(bindPolicy(input, p), p);
  assert.strictEqual(entity(r).status, 'CONTESTED');
});
pass('M08', () => {
  const x = clone(input); x.source_acceptance_refs_and_digests[0].rights_current = false; x.candidate_records[1].record.confidence = 1;
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy), 'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY');
});
pass('M09', () => {
  const x = clone(input); x.candidate_records[1].support_status = 'CONTESTED'; x.candidate_records[1].record.confidence = 1;
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy);
  assert.strictEqual(entity(r).status, 'CONTESTED');
});
pass('M10', () => {
  let p = clone(policy); const rule = p.rules.find(r => r.semantic_class === 'ENTITY'); rule.min_confidence = 0; p = mat.sealCalibrationPolicyV1(p);
  const x = bindPolicy(input, p); x.candidate_records[1].record.confidence = 0.6;
  const dup = clone(x.candidate_records[1]); dup.candidate_local_id = 'entity-alice-duplicate'; dup.record.provenance_refs = ['evidence://provider/entity/alice-duplicate']; dup.record.evidence_refs = ['evidence://entity/alice-duplicate'];
  x.candidate_records.push(dup);
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), p);
  assert.strictEqual(entity(r).confidence, 0.6);
  assert.strictEqual(entity(r).provenance_refs.length, 2);
});
pass('M11', () => {
  const x = clone(input); const dup = clone(x.candidate_records[1]); dup.candidate_local_id = 'entity-other'; dup.referent_key = 'entity:different'; dup.record.aliases = ['Different']; x.candidate_records.push(dup);
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy), 'BLOCKED_STABLE_ID_CONFLICT');
});
pass('M12', () => {
  const x = clone(input); x.candidate_records = [anchorCandidate()];
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy);
  assert.strictEqual(r.knowledge.entities.length, 0);
  assert.strictEqual(r.knowledge.events.length, 0);
  assert.strictEqual(r.receipt.admitted_counts_by_class.ANCHOR, 1);
});
pass('M13', () => {
  const prior = baseline.knowledge;
  const x = clone(input); x.prior_story_bible_ref = 'STORY_BIBLE:SB1:v1'; x.prior_story_bible_digest = h('story-bible-v1'); x.prior_knowledge = prior;
  x.prior_identity_bindings = [{ semantic_class: 'ENTITY', referent_key: 'entity:alice', stable_id: 'ENTITY:ALICE' }];
  x.candidate_records[1].record.entity_id = 'ENTITY:ALICE_REPROPOSED';
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy);
  assert(entity(r, 'ENTITY:ALICE'));
  assert(!entity(r, 'ENTITY:ALICE_REPROPOSED'));
});
pass('M14', () => {
  const x = clone(input); x.prior_story_bible_ref = 'STORY_BIBLE:SB1:v1'; x.prior_story_bible_digest = h('story-bible-v1'); x.prior_knowledge = baseline.knowledge;
  x.prior_identity_bindings = [{ semantic_class: 'ENTITY', referent_key: 'entity:alice', stable_id: 'ENTITY:ALICE' }];
  x.candidate_records[1].referent_key = 'entity:alice-corrected'; x.candidate_records[1].record.aliases = ['Alice Corrected'];
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy);
  const change = r.receipt.identity_lineage_changes.find(l => l.from_ids.includes('ENTITY:ALICE'));
  assert(change); assert.strictEqual(change.relation, 'SUPERSEDES'); assert.notStrictEqual(change.to_ids[0], 'ENTITY:ALICE');
});
pass('M15', () => {
  const x = clone(input); delete x.candidate_records[1].record.aliases;
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy), 'BLOCKED_KNOWLEDGE_SCHEMA_INVALID');
});
pass('M16', () => {
  let p = clone(policy); const rule = p.rules.find(r => r.semantic_class === 'ENTITY'); rule.allowed_support_statuses = ['VERIFIED']; rule.abstain_when_uncalibrated = false; p = mat.sealCalibrationPolicyV1(p);
  const r = mat.materializeStoryBibleKnowledgeCandidateV1(bindPolicy(input, p), p);
  assert.strictEqual(r.knowledge.entities.length, 0);
  assert.strictEqual(r.receipt.rejected_counts_by_class.ENTITY, 1);
  assert.strictEqual(r.receipt.rejection_reasons[0].candidate_local_id, 'entity-alice');
  assert.deepStrictEqual(r.receipt.rejection_reasons[0].evidence_refs, ['evidence://entity/alice']);
});
pass('M17', () => {
  assert(mat.validateMaterializationReceiptV1(baseline.receipt));
  assert.strictEqual(baseline.receipt.materialization_operation_id, input.materialization_operation_id);
  assert.strictEqual(baseline.receipt.calibration_policy_digest, policy.policy_digest);
  assert.strictEqual(baseline.receipt.knowledge_digest, baseline.knowledge.knowledge_digest);
  assert(baseline.receipt.input_identity_refs.some(x => x.includes(SOURCE_ID)));
});
pass('M18', () => {
  const again = mat.materializeStoryBibleKnowledgeCandidateV1(clone(input), clone(policy));
  assert.strictEqual(again.materialization_operation_id, baseline.materialization_operation_id);
  assert.deepStrictEqual(again.knowledge, baseline.knowledge);
  assert.deepStrictEqual(again.receipt, baseline.receipt);
});
pass('M19', () => {
  const ids = new Set([input.materialization_operation_id]);
  const variants = [];
  let x = clone(input); x.source_acceptance_refs_and_digests[0].source_acceptance_digest = h('source-changed'); variants.push(reseal(x));
  x = clone(input); x.projection_refs_and_digests[0].projection_digest = h('projection-changed'); variants.push(reseal(x));
  x = clone(input); x.manuscript_refs_and_digests[0].manuscript_digest = h('manuscript-changed'); variants.push(reseal(x));
  x = clone(input); x.provider_projection_refs_and_digests[0].projection_digest = h('provider-changed'); variants.push(reseal(x));
  x = clone(input); x.materializer_subject_ref = 'BOOK.KNOWLEDGE.MATERIALIZE_STORY_BIBLE:v1:changed-subject'; variants.push(reseal(x));
  let p = clone(policy); p.policy_version = '2'; p = mat.sealCalibrationPolicyV1(p); variants.push(bindPolicy(input, p));
  for (const v of variants) { assert(!ids.has(v.materialization_operation_id)); ids.add(v.materialization_operation_id); }
  assert.strictEqual(ids.size, 7);
});
pass('M20', () => {
  assert.strictEqual(baseline.receipt.raw_manuscript_text_persisted, false);
  assert.strictEqual(baseline.receipt.canonical_write_performed, false);
  assert.strictEqual(baseline.canonical_effect, false);
  const x = clone(input); x.candidate_records[1].record.raw_manuscript_text = 'forbidden';
  expectCode(() => mat.materializeStoryBibleKnowledgeCandidateV1(reseal(x), policy), 'BLOCKED_KNOWLEDGE_SCHEMA_INVALID');
});

assert.strictEqual(cases, 20);
process.stdout.write(`${JSON.stringify({
  result: 'PASS', denominator: 'M01-M20', cases,
  materializer_implemented: true, calibration_policy_implemented: true,
  invalidation_engine_implemented: false, canonical_admission_implemented: false,
  b01_registry_modified: false, model_accuracy_claimed: false,
  historical_pass_transferred: 0, canonical_effect: false
})}\n`);
