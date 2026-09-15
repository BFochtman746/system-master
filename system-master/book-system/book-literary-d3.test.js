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

function makeCraftInput({ projection = true, taskFit = 'APPLICABLE', record = {}, rights = {}, sourceCurrent = true, projectionCurrent = true } = {}) {
  const source = fx.makeSourceAcceptance();
  const normalized = projection ? fx.makeProjection(source) : null;
  const baseApplicability = {
    task_classes: ['PASSAGE_DIAGNOSIS'], genres: ['FICTION'], forms: ['PROSE'], audiences: ['GENERAL'], pov_modes: ['THIRD_LIMITED'], narrative_distances: ['CLOSE']
  };
  const baseRecord = {
    mechanism: 'Controlled variation in syntactic span can alter perceived movement without asserting literary quality.',
    effect_claim: { claim: 'Local sentence-length contrast may change perceived pacing under bounded conditions.', evidence_status: 'BOUNDED_INFERENCE' },
    applicability_conditions: ['Use only when local movement is a diagnosed concern.'],
    counterconditions: ['Do not use when compression would erase required nuance.'],
    failure_modes: ['Overapplication may create mechanical rhythm.'],
    technique_interactions: ['May interact with paragraph movement and dialogue cadence.'],
    diagnostic_signals: ['Repeated equal-length clauses across a bounded passage.'],
    abstract_revision_transforms: ['Vary clause span while preserving meaning and project constraints.'],
    applicability: baseApplicability,
    evidence_refs: [{ evidence_ref: 'craft-evidence:1', evidence_digest: fx.H('a') }],
    provenance_refs: [{ provenance_ref: 'scholarship:craft:1', provenance_digest: fx.H('b'), provenance_class: 'SCHOLARSHIP' }],
    uncertainty_standing: 'UNCERTAIN',
    task_fit_standing: taskFit,
    canonical_effect: false
  };
  const mergedRecord = {
    ...baseRecord,
    ...record,
    effect_claim: record.effect_claim ? { ...baseRecord.effect_claim, ...record.effect_claim } : baseRecord.effect_claim,
    applicability: record.applicability ? { ...baseApplicability, ...record.applicability } : baseApplicability
  };
  return {
    source_acceptance: source,
    normalized_source_projection: normalized,
    source_currentness: { ref: source.source_acceptance_id, digest: source.source_acceptance_digest, current: sourceCurrent },
    projection_currentness: normalized ? { ref: normalized.projection_id, digest: normalized.projection_digest, current: projectionCurrent } : null,
    rights_custody: { rights_ref: source.rights_record_id, rights_digest: source.rights_record_digest, standing: 'ACCEPTED_FOR_DECLARED_SCOPE', current: true, ...rights },
    record: mergedRecord
  };
}
function acceptCraft(options = {}) { return craftRuntime.acceptCraftIntelligenceRecordV1(makeCraftInput(options)); }
function retrievalQuery(overrides = {}) {
  return {
    policy_ref: 'craft-policy:b05:1', policy_digest: fx.H('0'), task_class: 'PASSAGE_DIAGNOSIS', requested_lens_ids: ['B05-LENS-001'],
    genre: 'FICTION', form: 'PROSE', audience: 'GENERAL', pov_mode: 'THIRD_LIMITED', narrative_distance: 'CLOSE', include_conditional: true,
    ...overrides
  };
}
function retrieve(records, query = retrievalQuery()) {
  return craftRuntime.retrieveCraftIntelligenceV1({ record_bindings: records.map(x => x.record ? x : { record: x, current: true }), query });
}
function makeContext() { return fx.makeContext({ lenses: ['B05-LENS-001'] }); }
function seal(context, overrides = {}, providerAdmission = null) {
  const payload = fx.makeObservationPayload(context, 'B05-LENS-001', overrides);
  return obsRuntime.acceptLiteraryDiagnosticObservationV1({ diagnostic_context: context, observation: payload, provider_admission: providerAdmission });
}
function makeDiagnostic({ finding = 'LIMITATION', overrides = {} } = {}) {
  const context = makeContext();
  const observation = seal(context, { finding_class: finding, ...overrides });
  const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: [observation] });
  return { context, observation, observations: [observation], diagnosis };
}
function candidate(context, supportingObservation, overrides = {}) {
  return {
    opportunity_key: 'opportunity:local-movement',
    target_lens_ids: ['B05-LENS-001'],
    supporting_observation_refs: [supportingObservation.diagnostic_observation_id],
    contradicting_observation_refs: [],
    craft_intelligence_refs: [],
    purpose_relevance_class: 'HIGH',
    evidence_strength_class: 'SUPPORTED',
    preservation_risk_class: 'LOW',
    collateral_risk_class: 'LOW',
    scope_recommendation: clone(context.scope),
    owner_constraint_refs: [],
    ...overrides
  };
}
function assembleLedger({ context, observations, diagnosis, craftBindings = [], candidates = [] }) {
  return ledgerRuntime.assembleLiteraryOpportunityLedgerV1({ diagnostic_context: context, observations, diagnosis, craft_record_bindings: craftBindings, opportunity_candidates: candidates });
}

// K01-K20 — focused D3 mechanics. These map the frozen K laws but do not satisfy/replace the B05-E denominator.
test('K01 craft record requires exact B02-admitted source/projection provenance', () => {
  const input = makeCraftInput(); const r = craftRuntime.acceptCraftIntelligenceRecordV1(input);
  assert.equal(r.source_acceptance_ref, input.source_acceptance.source_acceptance_id); assert.equal(r.normalized_source_projection_ref, input.normalized_source_projection.projection_id);
  const bad = makeCraftInput(); bad.source_currentness.digest = fx.H('f'); assert.throws(() => craftRuntime.acceptCraftIntelligenceRecordV1(bad), expectCode('BLOCKED_CRAFT_SOURCE_UNADMITTED'));
});
test('K02 unresolved or blocked rights/custody prevents craft-source admission', () => {
  assert.throws(() => acceptCraft({ rights: { standing: 'UNRESOLVED' } }), expectCode('BLOCKED_CRAFT_SOURCE_UNADMITTED'));
  assert.throws(() => acceptCraft({ rights: { current: false } }), expectCode('BLOCKED_CRAFT_SOURCE_UNADMITTED'));
});
test('K03 literary task fit is separate from accepted rights/custody standing', () => {
  const r = acceptCraft({ taskFit: 'NOT_APPLICABLE' }); assert.equal(r.rights_custody_standing, 'ACCEPTED_FOR_DECLARED_SCOPE'); assert.equal(r.task_fit_standing, 'NOT_APPLICABLE');
});
test('K04 task-mismatched craft record is not returned as applicable intelligence', () => {
  const r = acceptCraft({ record: { applicability: { task_classes: ['OTHER_TASK'] } } }); const q = retrieve([r]); assert.equal(q.selected_record_refs.length, 0); assert.equal(q.excluded_record_refs[0].reason, 'TASK_MISMATCH');
});
test('K05 craft record requires mechanism rather than a prestige label', () => {
  assert.throws(() => acceptCraft({ record: { mechanism: '' } }), expectCode('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED'));
});
test('K06 craft record preserves applicability conditions and counterconditions', () => {
  const r = acceptCraft(); assert.deepEqual(r.applicability_conditions, ['Use only when local movement is a diagnosed concern.']); assert.equal(r.counterconditions.length, 1);
});
test('K07 craft record preserves failure modes', () => { const r = acceptCraft(); assert.equal(r.failure_modes[0], 'Overapplication may create mechanical rhythm.'); });
test('K08 craft record preserves interactions with other techniques where known', () => { const r = acceptCraft(); assert.equal(r.technique_interactions.length, 1); });
test('K09 craft record preserves diagnostic signals', () => { const r = acceptCraft(); assert.equal(r.diagnostic_signals.length, 1); });
test('K10 abstract revision-transform knowledge cannot contain applied replacement text', () => {
  assert.throws(() => acceptCraft({ record: { abstract_revision_transforms: ['replacement prose: The rewritten manuscript sentence.'] } }), expectCode('BLOCKED_REWRITE_PAYLOAD_FORBIDDEN'));
});
test('K11 craft record preserves genre form audience and POV-distance applicability', () => {
  const r = acceptCraft(); assert.deepEqual(r.applicability.genres, ['FICTION']); assert.deepEqual(r.applicability.pov_modes, ['THIRD_LIMITED']); assert.deepEqual(r.applicability.narrative_distances, ['CLOSE']);
});
test('K12 craft record preserves exact provenance and evidence references', () => { const r = acceptCraft(); assert.equal(r.evidence_refs[0].evidence_digest, fx.H('a')); assert.equal(r.provenance_refs[0].provenance_digest, fx.H('b')); });
test('K13 craft record preserves uncertainty rather than fabricating certainty', () => { const r = acceptCraft(); assert.equal(r.uncertainty_standing, 'UNCERTAIN'); });
test('K14 named author/work may exist only as lawful provenance scholarship metadata', () => {
  const r = acceptCraft({ record: { provenance_refs: [{ provenance_ref: 'author-work:Virginia-Woolf:Mrs-Dalloway', provenance_digest: fx.H('c'), provenance_class: 'AUTHOR_WORK_METADATA' }] } });
  assert.equal(r.provenance_refs[0].provenance_class, 'AUTHOR_WORK_METADATA');
});
test('K15 named-author imitation similarity or nearest-author target is forbidden', () => {
  assert.throws(() => acceptCraft({ record: { mechanism: 'write like a named author to optimize similarity' } }), expectCode('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN'));
});
test('K16 craft record/retrieval forbid unauthorized raw or reconstructive source text', () => {
  assert.throws(() => acceptCraft({ record: { raw_source_text: 'forbidden' } }), err => !!err);
});
test('K17 craft retrieval cannot rank by prestige citation count or universal quality score', () => {
  const r = acceptCraft(); const q = retrievalQuery(); q.literary_quality_score = 99; assert.throws(() => retrieve([r], q), err => !!err);
});
test('K18 craft retrieval is deterministic for same policy and current record set', () => {
  const a = acceptCraft(); const b = acceptCraft({ record: { mechanism: 'Paragraph transition pattern can alter local continuity perception.' } });
  assert.deepEqual(retrieve([b,a]), retrieve([a,b]));
});
test('K19 craft retrieval binds exact selected record identities and digests', () => {
  const r = acceptCraft(); const out = retrieve([r]); assert.deepEqual(out.selected_record_refs, [{ craft_record_id: r.craft_record_id, craft_record_digest: r.craft_record_digest }]);
});
test('K20 stale or changed craft record affects only artifacts that consume that record', () => {
  const used = acceptCraft(); const unused = acceptCraft({ record: { mechanism: 'A distinct unused craft mechanism.' } });
  const d = makeDiagnostic(); const c = candidate(d.context, d.observation, { craft_intelligence_refs: [used.craft_record_id] });
  const ledger = assembleLedger({ ...d, craftBindings: [{ record: used, current: true }, { record: unused, current: false }], candidates: [c] });
  assert.deepEqual(ledger.craft_intelligence_refs, [{ craft_record_id: used.craft_record_id, craft_record_digest: used.craft_record_digest }]);
});

// O01-O24 — focused observation/assembly/opportunity mechanics. D2 remains the observation authority; D3 proves composition without denominator transfer.
test('O01 diagnostic observation binds exact diagnostic context identity/digest', () => { const d = makeDiagnostic(); assert.equal(d.observation.diagnostic_context_id, d.context.diagnostic_context_id); assert.equal(d.observation.diagnostic_context_digest, d.context.diagnostic_context_digest); });
test('O02 diagnostic observation references exactly one known B05 lens', () => { const d = makeDiagnostic(); assert.equal(d.observation.lens_id, 'B05-LENS-001'); });
test('O03 finding class is restricted to frozen set', () => { const c = makeContext(); assert.throws(() => seal(c, { finding_class: 'QUALITY_FAIL' }), expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')); });
test('O04 STRENGTH remains first-class and is preserved by opportunity assembly', () => {
  const context = makeContext(); const strength = seal(context, { finding_class: 'STRENGTH' }); const limitation = seal(context, { finding_class: 'LIMITATION', evidence_refs: [{ evidence_ref: 'evidence:limitation', evidence_digest: fx.H('d') }] });
  const observations = [strength, limitation]; const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations });
  const ledger = assembleLedger({ context, observations, diagnosis, candidates: [candidate(context, limitation)] });
  assert.deepEqual(ledger.strengths_to_preserve.map(x => x.observation_id), [strength.diagnostic_observation_id]);
});
test('O05 LIMITATION RISK OPPORTUNITY_SUPPORT preserve evidence/scope without revision authority', () => {
  for (const finding of ['LIMITATION','RISK','OPPORTUNITY_SUPPORT']) { const d = makeDiagnostic({ finding }); assert.equal(d.observation.scope_limits.scope_ref, d.context.scope.scope_ref); assert.ok(d.observation.evidence_refs.length > 0); assert.equal(d.observation.canonical_effect, false); }
});
test('O06 NO_FINDING is valid and does not fabricate a problem', () => {
  const d = makeDiagnostic({ finding: 'NO_FINDING' }); const ledger = assembleLedger({ ...d, candidates: [] }); assert.equal(d.observation.finding_class, 'NO_FINDING'); assert.equal(ledger.ledger_standing, 'NO_ACTION');
});
test('O07 ABSTAINED is valid without fabricated evidence/confidence', () => {
  const c = makeContext(); const o = seal(c, { finding_class: 'ABSTAINED', target_anchor_refs: [], evidence_refs: [], upstream_dependency_refs: [], evidence_strength_class: 'UNSPECIFIED', purpose_relevance_class: 'UNKNOWN', preservation_risk_class: 'UNKNOWN', collateral_risk_class: 'UNKNOWN', abstention_or_blocker_reason: 'INSUFFICIENT_EVIDENCE', standing: 'ABSTAINED' }); assert.equal(o.evidence_refs.length, 0); assert.equal(o.standing, 'ABSTAINED');
});
test('O08 BLOCKED requires blocker reason and cannot masquerade as finding', () => {
  const c = makeContext(); assert.throws(() => seal(c, { finding_class: 'BLOCKED', target_anchor_refs: [], evidence_refs: [], upstream_dependency_refs: [], evidence_strength_class: 'UNSPECIFIED', purpose_relevance_class: 'UNKNOWN', preservation_risk_class: 'UNKNOWN', collateral_risk_class: 'UNKNOWN', abstention_or_blocker_reason: null, standing: 'BLOCKED' }), expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
});
test('O09 MODEL observation requires exact current provider subject admission', () => {
  const c = makeContext(); assert.throws(() => seal(c, { source_class: 'MODEL' }), expectCode('BLOCKED_PROVIDER_SUBJECT_UNADMITTED')); const o = seal(c, { source_class: 'MODEL' }, fx.makeProviderAdmission()); assert.equal(o.provider_admission_digest, fx.makeProviderAdmission().provider_admission_digest);
});
test('O10 HUMAN observation remains uncalibrated evidence', () => { const c = makeContext(); const o = seal(c, { source_class: 'HUMAN' }); assert.equal(o.standing, 'ACCEPTED_UNCALIBRATED'); assert.equal(o.provider_admission_ref, null); });
test('O11 substantive findings require nonempty evidence references', () => { const c = makeContext(); assert.throws(() => seal(c, { evidence_refs: [] }), expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')); });
test('O12 observation preserves exact upstream dependencies actually relied upon', () => { const d = makeDiagnostic(); assert.deepEqual(d.observation.upstream_dependency_refs, fx.sourceDeps(d.context)); });
test('O13 evidence strength uses frozen non-universal ordinal representation', () => { const d = makeDiagnostic({ overrides: { evidence_strength_class: 'STRONG' } }); assert.equal(d.observation.evidence_strength_class, 'STRONG'); const c = makeContext(); assert.throws(() => seal(c, { evidence_strength_class: '0.91' }), expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')); });
test('O14 observation/diagnosis cannot aggregate evidence strength into universal prose score', () => { const c = makeContext(); assert.throws(() => seal(c, { literary_quality_score: 97 }), expectCode('BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN')); });
test('O15 purpose relevance is explicit and distinct from quality standing', () => { const d = makeDiagnostic({ overrides: { purpose_relevance_class: 'MEDIUM' } }); assert.equal(d.observation.purpose_relevance_class, 'MEDIUM'); assert.equal(Object.prototype.hasOwnProperty.call(d.observation, 'quality_score'), false); });
test('O16 preservation and collateral risk are explicit and non-authoritative', () => { const d = makeDiagnostic({ overrides: { preservation_risk_class: 'HIGH', collateral_risk_class: 'MEDIUM' } }); assert.equal(d.observation.preservation_risk_class, 'HIGH'); assert.equal(d.observation.canonical_effect, false); });
test('O17 contradicting observations remain visible and linked', () => {
  const context = makeContext(); const base = seal(context, { finding_class: 'LIMITATION' }); const contradiction = seal(context, { finding_class: 'CONTRADICTION', related_observation_refs: [base.diagnostic_observation_id], evidence_refs: [{ evidence_ref: 'evidence:contradiction', evidence_digest: fx.H('e') }] });
  const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: [base, contradiction] }); assert.deepEqual(diagnosis.contradiction_observation_refs, [contradiction.diagnostic_observation_id]);
});
test('O18 duplicate observation identities are rejected rather than double-counted', () => { const d = makeDiagnostic(); assert.throws(() => diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: d.context, observations: [d.observation, d.observation] }), expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')); });
test('O19 diagnosis assembly is deterministic/content addressed', () => { const d = makeDiagnostic(); const again = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: d.context, observations: d.observations }); assert.equal(again.diagnosis_id, d.diagnosis.diagnosis_id); });
test('O20 diagnosis exposes all 16 frozen lens coverage rows', () => { const d = makeDiagnostic(); assert.equal(d.diagnosis.lens_coverage.length, 16); });
test('O21 correlated observations cannot inflate evidence strength as independent confirmation', () => {
  const d = makeDiagnostic(); const a = candidate(d.context, d.observation, { opportunity_key: 'opportunity:dedup', evidence_strength_class: 'STRONG' }); const b = candidate(d.context, d.observation, { opportunity_key: 'opportunity:dedup', evidence_strength_class: 'LIMITED' });
  const ledger = assembleLedger({ ...d, candidates: [a,b] }); assert.equal(ledger.opportunities.length, 1); assert.equal(ledger.opportunities[0].evidence_strength_class, 'LIMITED');
});
test('O22 opportunity adjudication deduplicates observations for same underlying opportunity', () => {
  const d = makeDiagnostic(); const a = candidate(d.context, d.observation, { opportunity_key: 'same:key' }); const b = candidate(d.context, d.observation, { opportunity_key: 'same:key', collateral_risk_class: 'MEDIUM' }); const ledger = assembleLedger({ ...d, candidates: [a,b] }); assert.equal(ledger.opportunities.length, 1); assert.equal(ledger.opportunities[0].collateral_risk_class, 'MEDIUM');
});
test('O23 durable opportunity ledger admits at most three opportunities and rejects a fourth', () => {
  const d = makeDiagnostic(); const candidates = [1,2,3,4].map(i => candidate(d.context, d.observation, { opportunity_key: `opportunity:${i}` })); const ledger = assembleLedger({ ...d, candidates }); assert.equal(ledger.opportunities.length, 3);
  const tampered = clone(ledger); tampered.opportunities.push(clone(ledger.opportunities[0])); assert.throws(() => ledgerRuntime.validateLiteraryOpportunityLedgerV1(tampered, d.diagnosis, d.observations, []), expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
});
test('O24 zero-opportunity NO_ACTION is valid and never forces revision target', () => { const d = makeDiagnostic(); const ledger = assembleLedger({ ...d, candidates: [] }); assert.equal(ledger.opportunities.length, 0); assert.equal(ledger.ledger_standing, 'NO_ACTION'); assert.equal(ledger.canonical_effect, false); });
