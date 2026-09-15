'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./book-literary-test-fixtures');
const kb = require('./book-story-bible-knowledge-v1');
const obsRuntime = require('./book-literary-diagnostic-observation-v1');
const diagnosisRuntime = require('./book-literary-diagnosis-v1');
const craftRuntime = require('./book-craft-intelligence-v1');
const ledgerRuntime = require('./book-literary-opportunity-ledger-v1');
const d4 = require('./book-literary-currentness-runtime-v1');

const clone = fx.clone;
const expectCode = code => err => err && err.code === code;

function seal(context, overrides = {}, providerAdmission = null) {
  return obsRuntime.acceptLiteraryDiagnosticObservationV1({
    diagnostic_context: context,
    observation: fx.makeObservationPayload(context, 'B05-LENS-001', overrides),
    provider_admission: providerAdmission
  });
}

function makeCraftInput({ taskFit = 'APPLICABLE', mechanism = 'Controlled syntactic variation can alter perceived local movement.' } = {}) {
  const source = fx.makeSourceAcceptance();
  const projection = fx.makeProjection(source);
  return {
    source_acceptance: source,
    normalized_source_projection: projection,
    source_currentness: { ref: source.source_acceptance_id, digest: source.source_acceptance_digest, current: true },
    projection_currentness: { ref: projection.projection_id, digest: projection.projection_digest, current: true },
    rights_custody: { rights_ref: source.rights_record_id, rights_digest: source.rights_record_digest, standing: 'ACCEPTED_FOR_DECLARED_SCOPE', current: true },
    record: {
      mechanism,
      effect_claim: { claim: 'A bounded local technique may affect perceived movement under stated conditions.', evidence_status: 'BOUNDED_INFERENCE' },
      applicability_conditions: ['Use only for a diagnosed local movement concern.'],
      counterconditions: ['Do not use when it would erase required nuance.'],
      failure_modes: ['Overapplication can become mechanical.'],
      technique_interactions: ['May interact with paragraph movement.'],
      diagnostic_signals: ['Repeated equal-span local structures.'],
      abstract_revision_transforms: ['Vary structural span while preserving meaning and constraints.'],
      applicability: { task_classes: ['PASSAGE_DIAGNOSIS'], genres: ['FICTION'], forms: ['PROSE'], audiences: ['GENERAL'], pov_modes: ['THIRD_LIMITED'], narrative_distances: ['CLOSE'] },
      evidence_refs: [{ evidence_ref: 'craft-evidence:d4', evidence_digest: fx.H('a') }],
      provenance_refs: [{ provenance_ref: 'scholarship:craft:d4', provenance_digest: fx.H('b'), provenance_class: 'SCHOLARSHIP' }],
      uncertainty_standing: 'UNCERTAIN',
      task_fit_standing: taskFit,
      canonical_effect: false
    }
  };
}
function acceptCraft(options = {}) { return craftRuntime.acceptCraftIntelligenceRecordV1(makeCraftInput(options)); }
function retrievalQuery() {
  return {
    policy_ref: 'craft-policy:b05:1', policy_digest: fx.H('0'), task_class: 'PASSAGE_DIAGNOSIS', requested_lens_ids: ['B05-LENS-001'],
    genre: 'FICTION', form: 'PROSE', audience: 'GENERAL', pov_mode: 'THIRD_LIMITED', narrative_distance: 'CLOSE', include_conditional: true
  };
}

function candidate(context, observation, craftRefs = []) {
  return {
    opportunity_key: 'opportunity:d4:local-movement',
    target_lens_ids: ['B05-LENS-001'],
    supporting_observation_refs: [observation.diagnostic_observation_id],
    contradicting_observation_refs: [],
    craft_intelligence_refs: craftRefs,
    purpose_relevance_class: 'HIGH',
    evidence_strength_class: 'SUPPORTED',
    preservation_risk_class: 'LOW',
    collateral_risk_class: 'LOW',
    scope_recommendation: clone(context.scope),
    owner_constraint_refs: []
  };
}

function makeSubject({ contextOptions = {}, model = false, withOpportunity = false, extraCraft = [] } = {}) {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'], ...contextOptions });
  const provider = model ? fx.makeProviderAdmission() : null;
  const observation = seal(context, {
    finding_class: withOpportunity ? 'LIMITATION' : 'STRENGTH',
    source_class: model ? 'MODEL' : 'DETERMINISTIC'
  }, provider);
  const observations = [observation];
  const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations });
  const craftRecordBindings = extraCraft.map(record => ({ record, current: true }));
  let opportunityLedger;
  if (withOpportunity) {
    const craft = acceptCraft();
    craftRecordBindings.unshift({ record: craft, current: true });
    opportunityLedger = ledgerRuntime.assembleLiteraryOpportunityLedgerV1({
      diagnostic_context: context,
      observations,
      diagnosis,
      craft_record_bindings: craftRecordBindings,
      opportunity_candidates: [candidate(context, observation, [craft.craft_record_id])]
    });
  } else {
    opportunityLedger = ledgerRuntime.assembleLiteraryOpportunityLedgerV1({
      diagnostic_context: context,
      observations,
      diagnosis,
      craft_record_bindings: craftRecordBindings,
      opportunity_candidates: []
    });
  }
  return { diagnostic_context: context, observations, diagnosis, craft_record_bindings: craftRecordBindings, opportunity_ledger: opportunityLedger };
}

function makeCurrentBindings(subject) {
  const deps = new Map();
  for (const dep of [...subject.diagnostic_context.dependency_snapshot_refs, ...subject.diagnosis.dependency_refs]) {
    deps.set(`${dep.dependency_kind}:${dep.dependency_ref}`, { ...clone(dep), current: true });
  }
  return {
    dependency_refs: [...deps.values()].sort((a,b) => `${a.dependency_kind}:${a.dependency_ref}`.localeCompare(`${b.dependency_kind}:${b.dependency_ref}`)),
    observation_refs: subject.diagnosis.observation_refs.map(x => ({ ...clone(x), current: true })),
    craft_record_refs: subject.craft_record_bindings.map(x => ({ craft_record_id: x.record.craft_record_id, craft_record_digest: x.record.craft_record_digest, current: true })).sort((a,b) => a.craft_record_id.localeCompare(b.craft_record_id))
  };
}
function compute(subject, currentBindings = makeCurrentBindings(subject)) {
  return d4.computeLiteraryDiagnosticInvalidationV1({ ...subject, current_bindings: currentBindings });
}
function runtime(subject, currentBindings = makeCurrentBindings(subject)) {
  return d4.createBookLiteraryRuntimeV1({ ...subject, current_bindings: currentBindings });
}
function dependency(bindings, kind) {
  const x = bindings.dependency_refs.find(v => v.dependency_kind === kind);
  assert.ok(x, `missing dependency ${kind}`);
  return x;
}
function staleDependency(bindings, kind) { dependency(bindings, kind).current = false; return bindings; }
function staleCraft(bindings, id) { const x = bindings.craft_record_refs.find(v => v.craft_record_id === id); assert.ok(x); x.current = false; return bindings; }

// I01-I24 are focused D4 mechanics. They do not satisfy or replace the later B05-E 152-case denominator.
test('I01 exact current dependency snapshot yields current context diagnosis and opportunity layers', () => {
  const s = makeSubject({ withOpportunity: true }); const c = compute(s);
  assert.equal(c.context_current, true); assert.equal(c.diagnosis_current, true); assert.equal(c.opportunity_ledger_current, true); assert.equal(c.standing, 'CURRENT'); assert.deepEqual(c.recompute_layers, []);
});

test('I02 stale B02 source or projection identity stales context and all dependent B05 layers', () => {
  const s = makeSubject(); const b = staleDependency(makeCurrentBindings(s), 'B02_SOURCE_ACCEPTANCE'); const c = compute(s, b);
  assert.deepEqual([c.context_current,c.diagnosis_current,c.opportunity_ledger_current], [false,false,false]); assert.deepEqual(c.recompute_layers, ['CONTEXT','DIAGNOSIS','OPPORTUNITY_LEDGER']);
});

test('I03 stale consumed B03 Story Bible knowledge or semantic dependency stales dependent B05 layers', () => {
  const s = makeSubject({ contextOptions: { b03: true } }); const b = staleDependency(makeCurrentBindings(s), 'B03_KNOWLEDGE'); const c = compute(s, b);
  assert.equal(c.context_current, false); assert.equal(c.diagnosis_current, false); assert.equal(c.opportunity_ledger_current, false);
});

test('I04 stale B04 reader evidence stales only B05 artifacts that consumed that evidence', () => {
  const consumer = makeSubject({ contextOptions: { b04: true } }); const b = staleDependency(makeCurrentBindings(consumer), 'B04_EXPOSURE'); assert.equal(compute(consumer,b).context_current, false);
  const nonconsumer = makeSubject(); const n = makeCurrentBindings(nonconsumer); n.dependency_refs.push({ dependency_kind: 'B04_EXPOSURE', dependency_ref: 'unrelated:b04', dependency_digest: fx.H('1'), current: false }); assert.equal(compute(nonconsumer,n).standing, 'CURRENT');
});

test('I05 stale B08 voice preference evidence stales only B05 artifacts that consumed it', () => {
  const consumer = makeSubject({ contextOptions: { voice: true } }); const b = staleDependency(makeCurrentBindings(consumer), 'B08_VOICE_PREFERENCE'); assert.equal(compute(consumer,b).context_current, false);
  const nonconsumer = makeSubject(); const n = makeCurrentBindings(nonconsumer); n.dependency_refs.push({ dependency_kind: 'B08_VOICE_PREFERENCE', dependency_ref: 'unrelated:b08', dependency_digest: fx.H('2'), current: false }); assert.equal(compute(nonconsumer,n).standing, 'CURRENT');
});

test('I06 stale B10 or Book author constraint evidence stales only B05 artifacts that consumed it', () => {
  const consumer = makeSubject({ contextOptions: { author: true } }); const b = staleDependency(makeCurrentBindings(consumer), 'B10_AUTHOR_CONSTRAINT'); assert.equal(compute(consumer,b).context_current, false);
  const nonconsumer = makeSubject(); const n = makeCurrentBindings(nonconsumer); n.dependency_refs.push({ dependency_kind: 'B10_AUTHOR_CONSTRAINT', dependency_ref: 'unrelated:b10', dependency_digest: fx.H('3'), current: false }); assert.equal(compute(nonconsumer,n).standing, 'CURRENT');
});

test('I07 stale B05 craft record or retrieval policy stales only artifacts that consumed it', () => {
  const s = makeSubject({ withOpportunity: true });
  const craftId = s.opportunity_ledger.craft_intelligence_refs[0].craft_record_id;
  const craftStale = compute(s, staleCraft(makeCurrentBindings(s), craftId));
  assert.deepEqual([craftStale.context_current,craftStale.diagnosis_current,craftStale.opportunity_ledger_current], [true,true,false]);
  const policy = staleDependency(makeCurrentBindings(s), 'B05_CRAFT_RETRIEVAL_POLICY'); const p = compute(s, policy);
  assert.deepEqual([p.context_current,p.diagnosis_current,p.opportunity_ledger_current], [true,true,false]);
});

test('I08 stale provider admission stales provider-produced observations and dependent diagnosis without mutating provider state', () => {
  const s = makeSubject({ model: true }); const b = staleDependency(makeCurrentBindings(s), 'B01_PROVIDER_ADMISSION'); const before = clone(b); const c = compute(s,b);
  assert.deepEqual([c.context_current,c.diagnosis_current,c.opportunity_ledger_current], [true,false,false]); assert.deepEqual(b,before);
});

test('I09 scope or source-anchor identity drift stales exact dependent context', () => {
  const s = makeSubject(); const a = staleDependency(makeCurrentBindings(s), 'B05_SCOPE'); assert.equal(compute(s,a).context_current, false);
  const b = staleDependency(makeCurrentBindings(s), 'B05_SOURCE_ANCHOR'); assert.equal(compute(s,b).context_current, false);
});

test('I10 unrelated new upstream records do not cause false invalidation', () => {
  const s = makeSubject(); const b = makeCurrentBindings(s); b.dependency_refs.push({ dependency_kind: 'B03_SEMANTIC', dependency_ref: 'ENTITY:UNRELATED', dependency_digest: fx.H('4'), current: false });
  const c = compute(s,b); assert.equal(c.standing, 'CURRENT'); assert.deepEqual(c.recompute_layers, []);
});

test('I11 currentness receipt is deterministic and content addressed', () => {
  const s = makeSubject({ withOpportunity: true }); const a = compute(s); const b = compute(s); assert.equal(a.currentness_id,b.currentness_id); assert.equal(a.currentness_digest,b.currentness_digest);
});

test('I12 currentness receipt digest or identity tampering fails closed', () => {
  const s = makeSubject(); const c = compute(s); const bad = clone(c); bad.currentness_digest = fx.H('f'); assert.throws(() => d4.validateLiteraryDiagnosticCurrentnessV1(bad,s.diagnostic_context,s.diagnosis,s.opportunity_ledger), expectCode('BLOCKED_DIGEST_MISMATCH'));
});

test('I13 current diagnostic-context query returns only an exact current context', () => {
  const s = makeSubject(); const r = runtime(s); assert.deepEqual(r.execute('GetLiteraryDiagnosticContextV1'), s.diagnostic_context);
});

test('I14 stale diagnostic context cannot be returned as current', () => {
  const s = makeSubject(); const r = runtime(s, staleDependency(makeCurrentBindings(s),'B02_SOURCE_ACCEPTANCE')); assert.throws(() => r.execute('GetLiteraryDiagnosticContextV1'), expectCode('BLOCKED_CURRENTNESS_REQUIRED'));
});

test('I15 current diagnosis query returns only the exact current diagnosis projection', () => {
  const s = makeSubject(); assert.deepEqual(runtime(s).execute('GetLiteraryDiagnosisV1'), s.diagnosis);
});

test('I16 stale diagnosis cannot be returned as current', () => {
  const s = makeSubject({ model: true }); const r = runtime(s, staleDependency(makeCurrentBindings(s),'B01_PROVIDER_ADMISSION')); assert.throws(() => r.execute('GetLiteraryDiagnosisV1'), expectCode('BLOCKED_CURRENTNESS_REQUIRED')); assert.deepEqual(r.execute('GetLiteraryDiagnosticContextV1'), s.diagnostic_context);
});

test('I17 lens evidence query validates exact sealed observation membership and currentness before returning evidence', () => {
  const s = makeSubject(); const out = runtime(s).execute('GetLiteraryLensEvidenceV1',{ lens_id:'B05-LENS-001' }); assert.equal(out.observations[0].diagnostic_observation_digest, s.observations[0].diagnostic_observation_digest);
  const bad = clone(s); bad.observations[0].finding_class = 'RISK'; assert.throws(() => runtime(bad), err => !!err);
});

test('I18 opportunity-ledger query returns only exact current bounded ledger', () => {
  const s = makeSubject({ withOpportunity: true }); assert.deepEqual(runtime(s).execute('GetLiteraryOpportunityLedgerV1'), s.opportunity_ledger);
  const id = s.opportunity_ledger.craft_intelligence_refs[0].craft_record_id; const r = runtime(s, staleCraft(makeCurrentBindings(s),id)); assert.throws(() => r.execute('GetLiteraryOpportunityLedgerV1'), expectCode('BLOCKED_CURRENTNESS_REQUIRED'));
});

test('I19 craft-intelligence retrieval query excludes stale blocked or task-inapplicable records from applicable results', () => {
  const current = acceptCraft({ mechanism: 'Current applicable mechanism.' });
  const stale = acceptCraft({ mechanism: 'Stale applicable mechanism.' });
  const notApplicable = acceptCraft({ mechanism: 'Current but task-inapplicable mechanism.', taskFit: 'NOT_APPLICABLE' });
  const s = makeSubject({ extraCraft: [current,stale,notApplicable] }); const b = makeCurrentBindings(s); staleCraft(b, stale.craft_record_id);
  const out = runtime(s,b).execute('RetrieveCraftIntelligenceV1', retrievalQuery());
  assert.deepEqual(out.selected_record_refs.map(x => x.craft_record_id), [current.craft_record_id]);
  assert.ok(out.excluded_record_refs.some(x => x.craft_record_id === stale.craft_record_id)); assert.ok(out.excluded_record_refs.some(x => x.craft_record_id === notApplicable.craft_record_id));
});

test('I20 currentness query remains reachable while B05 artifacts are stale so recomputation boundary can be inspected', () => {
  const s = makeSubject(); const r = runtime(s, staleDependency(makeCurrentBindings(s),'B02_SOURCE_ACCEPTANCE')); const c = r.execute('GetLiteraryDiagnosticCurrentnessV1'); assert.equal(c.standing,'STALE'); assert.deepEqual(c.recompute_layers,['CONTEXT','DIAGNOSIS','OPPORTUNITY_LEDGER']);
});

test('I21 exact replay of unchanged B05 construction or assembly operations is idempotent and content addressed', () => {
  const s = makeSubject(); const r = runtime(s); const a = r.execute('ComputeLiteraryDiagnosticInvalidationV1'); const b = r.execute('ComputeLiteraryDiagnosticInvalidationV1'); assert.deepEqual(a,b);
});

test('I22 reordering set-like evidence references does not change deterministic semantic identity after normalization', () => {
  const s = makeSubject({ withOpportunity: true }); const a = makeCurrentBindings(s); const b = clone(a); b.dependency_refs.reverse(); b.observation_refs.reverse(); b.craft_record_refs.reverse(); assert.equal(compute(s,a).currentness_id, compute(s,b).currentness_id);
});

test('I23 currentness exposes exact recompute layer requirements without unnecessary upstream or unrelated recomputation', () => {
  const base = makeSubject(); assert.deepEqual(compute(base, staleDependency(makeCurrentBindings(base),'B02_SOURCE_ACCEPTANCE')).recompute_layers, ['CONTEXT','DIAGNOSIS','OPPORTUNITY_LEDGER']);
  const model = makeSubject({ model:true }); assert.deepEqual(compute(model, staleDependency(makeCurrentBindings(model),'B01_PROVIDER_ADMISSION')).recompute_layers, ['DIAGNOSIS','OPPORTUNITY_LEDGER']);
  const craft = makeSubject({ withOpportunity:true }); const id = craft.opportunity_ledger.craft_intelligence_refs[0].craft_record_id; assert.deepEqual(compute(craft, staleCraft(makeCurrentBindings(craft),id)).recompute_layers, ['OPPORTUNITY_LEDGER']);
});

test('I24 B05 invalidation and currentness computation never mutates B02 B03 B04 B08 B10 or provider state', () => {
  const s = makeSubject({ contextOptions:{ b03:true,b04:true,voice:true,author:true }, model:true, withOpportunity:true }); const b = makeCurrentBindings(s); const beforeS = clone(s); const beforeB = clone(b); compute(s,b); assert.deepEqual(s,beforeS); assert.deepEqual(b,beforeB);
});
