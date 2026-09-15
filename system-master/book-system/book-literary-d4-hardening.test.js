'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./book-literary-test-fixtures');
const obsRuntime = require('./book-literary-diagnostic-observation-v1');
const diagnosisRuntime = require('./book-literary-diagnosis-v1');
const ledgerRuntime = require('./book-literary-opportunity-ledger-v1');
const d4 = require('./book-literary-currentness-runtime-v1');

const clone = fx.clone;
const expectCode = code => err => err && err.code === code;

function subject() {
  const diagnostic_context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  const observation = obsRuntime.acceptLiteraryDiagnosticObservationV1({
    diagnostic_context,
    observation: fx.makeObservationPayload(diagnostic_context, 'B05-LENS-001'),
    provider_admission: null
  });
  const observations = [observation];
  const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context, observations });
  const craft_record_bindings = [];
  const opportunity_ledger = ledgerRuntime.assembleLiteraryOpportunityLedgerV1({ diagnostic_context, observations, diagnosis, craft_record_bindings, opportunity_candidates: [] });
  return { diagnostic_context, observations, diagnosis, craft_record_bindings, opportunity_ledger };
}
function bindings(s) {
  const map = new Map();
  for (const dep of [...s.diagnostic_context.dependency_snapshot_refs, ...s.diagnosis.dependency_refs]) map.set(`${dep.dependency_kind}:${dep.dependency_ref}`, { ...clone(dep), current: true });
  return {
    dependency_refs: [...map.values()].sort((a,b) => `${a.dependency_kind}:${a.dependency_ref}`.localeCompare(`${b.dependency_kind}:${b.dependency_ref}`)),
    observation_refs: s.diagnosis.observation_refs.map(x => ({ ...clone(x), current: true })),
    craft_record_refs: []
  };
}
function compute(s,b=bindings(s)) { return d4.computeLiteraryDiagnosticInvalidationV1({ ...s, current_bindings:b }); }
function runtime(s,b=bindings(s)) { return d4.createBookLiteraryRuntimeV1({ ...s, current_bindings:b }); }

// Extra D4 hardening is additive implementation evidence only; it does not alter the B05-E 152-case denominator.
test('D4-H01 runtime exposes exactly the frozen six commands and six queries', () => {
  const r = runtime(subject());
  assert.deepEqual(r.command_names, [
    'BuildLiteraryDiagnosticContextV1','AcceptLiteraryDiagnosticObservationV1','AssembleLiteraryDiagnosisV1','AcceptCraftIntelligenceRecordV1','AssembleLiteraryOpportunityLedgerV1','ComputeLiteraryDiagnosticInvalidationV1'
  ]);
  assert.deepEqual(r.query_names, [
    'GetLiteraryDiagnosticContextV1','GetLiteraryDiagnosisV1','GetLiteraryLensEvidenceV1','GetLiteraryOpportunityLedgerV1','RetrieveCraftIntelligenceV1','GetLiteraryDiagnosticCurrentnessV1'
  ]);
});

test('D4-H02 unknown runtime operation fails closed', () => {
  assert.throws(() => runtime(subject()).execute('B05.UNKNOWN.OPERATION'), expectCode('BLOCKED_RUNTIME_OPERATION_UNKNOWN'));
});

test('D4-H03 unconsumed retrieval-policy drift does not create false stale standing', () => {
  const s = subject(); const b = bindings(s); const policy = b.dependency_refs.find(x => x.dependency_kind === 'B05_CRAFT_RETRIEVAL_POLICY'); assert.ok(policy); policy.current = false;
  const c = compute(s,b); assert.deepEqual([c.context_current,c.diagnosis_current,c.opportunity_ledger_current], [true,true,true]); assert.equal(c.standing,'CURRENT'); assert.deepEqual(c.recompute_layers,[]);
});

test('D4-H04 recomputed content address cannot hide substituted dependency snapshot', () => {
  const s = subject(); const c = compute(s); const bad = clone(c); bad.dependency_snapshot_refs[0].dependency_digest = fx.H('f'); bad.currentness_digest = d4.literaryCurrentnessDigestV1(bad); bad.currentness_id = d4.CURRENTNESS_PREFIX + bad.currentness_digest;
  assert.throws(() => d4.validateLiteraryDiagnosticCurrentnessV1(bad,s.diagnostic_context,s.diagnosis,s.opportunity_ledger), expectCode('BLOCKED_CURRENTNESS_REQUIRED'));
});

test('D4-H05 duplicate current dependency identity fails closed', () => {
  const s = subject(); const b = bindings(s); b.dependency_refs.push(clone(b.dependency_refs[0])); assert.throws(() => compute(s,b), expectCode('BLOCKED_CURRENTNESS_REQUIRED'));
});

test('D4-H06 unrelated stale craft identity does not invalidate a ledger that did not consume it', () => {
  const s = subject(); const b = bindings(s); b.craft_record_refs.push({ craft_record_id:'book-craft-intelligence-v1:' + fx.H('a'), craft_record_digest:fx.H('a'), current:false }); const c = compute(s,b); assert.equal(c.standing,'CURRENT'); assert.equal(c.opportunity_ledger_current,true);
});

test('D4-H07 lens query rejects unknown lens before returning evidence', () => {
  assert.throws(() => runtime(subject()).execute('GetLiteraryLensEvidenceV1',{lens_id:'B05-LENS-999'}), expectCode('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN'));
});

test('D4-H08 currentness and runtime surfaces preserve canonical_effect=false without embedding subject payloads', () => {
  const s = subject(); const r = runtime(s); const c = r.execute('GetLiteraryDiagnosticCurrentnessV1'); assert.equal(r.canonical_effect,false); assert.equal(c.canonical_effect,false); assert.equal(Object.prototype.hasOwnProperty.call(c,'observations'),false); assert.equal(Object.prototype.hasOwnProperty.call(c,'diagnostic_context'),false);
});
