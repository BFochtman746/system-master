'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./book-literary-test-fixtures');
const obsRuntime = require('./book-literary-diagnostic-observation-v1');
const diagnosisRuntime = require('./book-literary-diagnosis-v1');
const craftRuntime = require('./book-craft-intelligence-v1');
const ledgerRuntime = require('./book-literary-opportunity-ledger-v1');

const expectCode = code => err => err && err.code === code;
const clone = fx.clone;

function craftInput(overrides = {}) {
  const source = fx.makeSourceAcceptance();
  const projection = fx.makeProjection(source);
  const base = {
    mechanism: 'Bounded syntactic variation may alter perceived local movement.',
    effect_claim: { claim: 'A local structural change may affect pacing under bounded conditions.', evidence_status: 'BOUNDED_INFERENCE' },
    applicability_conditions: ['Use only for a diagnosed local craft concern.'],
    counterconditions: ['Avoid when required nuance would be lost.'],
    failure_modes: ['Overuse may become mechanical.'],
    technique_interactions: ['May interact with paragraph movement.'],
    diagnostic_signals: ['Repeated local structural pattern.'],
    abstract_revision_transforms: ['Vary structural span while preserving meaning.'],
    applicability: { task_classes: ['PASSAGE_DIAGNOSIS'], genres: ['FICTION'], forms: ['PROSE'], audiences: ['GENERAL'], pov_modes: ['THIRD_LIMITED'], narrative_distances: ['CLOSE'] },
    evidence_refs: [{ evidence_ref: 'craft-hardening:evidence:1', evidence_digest: fx.H('1') }],
    provenance_refs: [{ provenance_ref: 'scholarship:hardening:1', provenance_digest: fx.H('2'), provenance_class: 'SCHOLARSHIP' }],
    uncertainty_standing: 'UNCERTAIN', task_fit_standing: 'APPLICABLE', canonical_effect: false
  };
  const record = { ...base, ...(overrides.record || {}) };
  return {
    source_acceptance: source,
    normalized_source_projection: projection,
    source_currentness: { ref: source.source_acceptance_id, digest: source.source_acceptance_digest, current: true },
    projection_currentness: { ref: projection.projection_id, digest: projection.projection_digest, current: true },
    rights_custody: { rights_ref: source.rights_record_id, rights_digest: source.rights_record_digest, standing: 'ACCEPTED_FOR_DECLARED_SCOPE', current: true },
    record
  };
}
function craft(overrides = {}) { return craftRuntime.acceptCraftIntelligenceRecordV1(craftInput(overrides)); }
function diagnosisFixture() {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  const observation = obsRuntime.acceptLiteraryDiagnosticObservationV1({ diagnostic_context: context, observation: fx.makeObservationPayload(context, 'B05-LENS-001', { finding_class: 'LIMITATION' }), provider_admission: null });
  const observations = [observation];
  const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations });
  return { context, observation, observations, diagnosis };
}
function candidate(f, overrides = {}) {
  return {
    opportunity_key: 'hardening:opportunity:1', target_lens_ids: ['B05-LENS-001'],
    supporting_observation_refs: [f.observation.diagnostic_observation_id], contradicting_observation_refs: [], craft_intelligence_refs: [],
    purpose_relevance_class: 'HIGH', evidence_strength_class: 'SUPPORTED', preservation_risk_class: 'LOW', collateral_risk_class: 'LOW',
    scope_recommendation: clone(f.context.scope), owner_constraint_refs: [], ...overrides
  };
}
function ledger(f, craftBindings = [], candidates = []) {
  return ledgerRuntime.assembleLiteraryOpportunityLedgerV1({ diagnostic_context: f.context, observations: f.observations, diagnosis: f.diagnosis, craft_record_bindings: craftBindings, opportunity_candidates: candidates });
}
function readdressLedger(value) {
  value.opportunity_ledger_digest = ledgerRuntime.opportunityLedgerDigestV1(value);
  value.opportunity_ledger_id = `${ledgerRuntime.LEDGER_PREFIX}${value.opportunity_ledger_digest}`;
  return value;
}

test('D3-H01 lawful author/work provenance remains allowed but provenance cannot smuggle imitation targeting', () => {
  const ok = craft({ record: { provenance_refs: [{ provenance_ref: 'author-work:Virginia-Woolf:Mrs-Dalloway', provenance_digest: fx.H('3'), provenance_class: 'AUTHOR_WORK_METADATA' }] } });
  assert.equal(ok.provenance_refs[0].provenance_class, 'AUTHOR_WORK_METADATA');
  assert.throws(() => craft({ record: { provenance_refs: [{ provenance_ref: 'author-work:write like Virginia Woolf', provenance_digest: fx.H('4'), provenance_class: 'AUTHOR_WORK_METADATA' }] } }), expectCode('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN'));
});

test('D3-H02 sealed craft-record digest substitution fails closed', () => {
  const r = craft(); const tampered = clone(r); tampered.craft_record_digest = fx.H('f');
  assert.throws(() => craftRuntime.validateCraftIntelligenceRecordV1(tampered), expectCode('BLOCKED_DIGEST_MISMATCH'));
});

test('D3-H03 retrieval excludes stale record while selecting exact current record', () => {
  const current = craft(); const stale = craft({ record: { mechanism: 'A second distinct mechanism.' } });
  const out = craftRuntime.retrieveCraftIntelligenceV1({ record_bindings: [{ record: stale, current: false }, { record: current, current: true }], query: { policy_ref: 'craft-policy:b05:1', policy_digest: fx.H('0'), task_class: 'PASSAGE_DIAGNOSIS', requested_lens_ids: ['B05-LENS-001'], genre: 'FICTION', form: 'PROSE', audience: 'GENERAL', pov_mode: 'THIRD_LIMITED', narrative_distance: 'CLOSE', include_conditional: true } });
  assert.deepEqual(out.selected_record_refs.map(x => x.craft_record_id), [current.craft_record_id]);
  assert.equal(out.excluded_record_refs.find(x => x.craft_record_id === stale.craft_record_id).reason, 'STALE');
});

test('D3-H04 duplicate craft-record bindings fail closed rather than double count', () => {
  const r = craft();
  assert.throws(() => craftRuntime.retrieveCraftIntelligenceV1({ record_bindings: [{ record: r, current: true }, { record: r, current: true }], query: { policy_ref: 'craft-policy:b05:1', policy_digest: fx.H('0'), task_class: 'PASSAGE_DIAGNOSIS', requested_lens_ids: ['B05-LENS-001'], genre: null, form: null, audience: null, pov_mode: null, narrative_distance: null, include_conditional: true } }), expectCode('BLOCKED_CONFLICT_UNRESOLVED'));
});

test('D3-H05 opportunity candidate cannot smuggle replacement prose in an allowed string field', () => {
  const f = diagnosisFixture();
  assert.throws(() => ledger(f, [], [candidate(f, { opportunity_key: 'replacement prose: rewrite the paragraph' })]), expectCode('BLOCKED_REWRITE_PAYLOAD_FORBIDDEN'));
});

test('D3-H06 recomputed ledger identity cannot hide substituted observation digest', () => {
  const f = diagnosisFixture(); const l = ledger(f, [], [candidate(f)]); const tampered = clone(l);
  tampered.contributing_observation_refs[0].diagnostic_observation_digest = fx.H('a');
  tampered.opportunities[0].supporting_observation_refs[0].diagnostic_observation_digest = fx.H('a');
  readdressLedger(tampered);
  assert.throws(() => ledgerRuntime.validateLiteraryOpportunityLedgerV1(tampered, f.diagnosis, f.observations, []), expectCode('BLOCKED_DIGEST_MISMATCH'));
});

test('D3-H07 recomputed ledger identity cannot hide substituted craft-record digest', () => {
  const f = diagnosisFixture(); const r = craft(); const bindings = [{ record: r, current: true }]; const l = ledger(f, bindings, [candidate(f, { craft_intelligence_refs: [r.craft_record_id] })]); const tampered = clone(l);
  tampered.craft_intelligence_refs[0].craft_record_digest = fx.H('b');
  tampered.opportunities[0].craft_intelligence_refs[0].craft_record_digest = fx.H('b');
  readdressLedger(tampered);
  assert.throws(() => ledgerRuntime.validateLiteraryOpportunityLedgerV1(tampered, f.diagnosis, f.observations, bindings), expectCode('BLOCKED_DIGEST_MISMATCH'));
});

test('D3-H08 stale craft record consumed by an opportunity blocks assembly', () => {
  const f = diagnosisFixture(); const r = craft();
  assert.throws(() => ledger(f, [{ record: r, current: false }], [candidate(f, { craft_intelligence_refs: [r.craft_record_id] })]), expectCode('BLOCKED_CURRENTNESS_REQUIRED'));
});

test('D3-H09 top-three adjudication is deterministic independent of candidate input order', () => {
  const f = diagnosisFixture();
  const candidates = [1,2,3,4].map(i => candidate(f, { opportunity_key: `hardening:opportunity:${i}`, purpose_relevance_class: i === 4 ? 'LOW' : 'HIGH' }));
  const a = ledger(f, [], candidates); const b = ledger(f, [], [...candidates].reverse());
  assert.equal(a.opportunity_ledger_id, b.opportunity_ledger_id); assert.deepEqual(a.opportunities, b.opportunities);
});

test('D3-H10 opportunity scope escape fails closed', () => {
  const f = diagnosisFixture(); const escaped = clone(f.context.scope); escaped.scope_ref = 'scope:outside:b05';
  assert.throws(() => ledger(f, [], [candidate(f, { scope_recommendation: escaped })]), expectCode('BLOCKED_DIAGNOSTIC_SCOPE_INVALID'));
});
