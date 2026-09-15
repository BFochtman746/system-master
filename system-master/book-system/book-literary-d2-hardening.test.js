'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const obs = require('./book-literary-diagnostic-observation-v1');
const diagnosis = require('./book-literary-diagnosis-v1');
const fx = require('./book-literary-test-fixtures');

const expectCode = code => err => err && err.code === code;

function accept(context, lensId, overrides = {}, providerAdmission = null) {
  return obs.acceptLiteraryDiagnosticObservationV1({
    diagnostic_context: context,
    observation: fx.makeObservationPayload(context, lensId, overrides),
    provider_admission: providerAdmission
  });
}

test('D2-H01 POV observation must cite an exact B03 narrative dependency, not merely have B03 in context', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-004'], b03: true });
  assert.throws(
    () => accept(context, 'B05-LENS-004', { upstream_dependency_refs: fx.sourceDeps(context) }),
    expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')
  );
});

test('D2-H02 character/dialogue/causality observations must cite exact B03 semantic evidence actually used', () => {
  for (const lensId of ['B05-LENS-005','B05-LENS-006','B05-LENS-007']) {
    const context = fx.makeContext({ lenses: [lensId], b03: true });
    assert.throws(
      () => accept(context, lensId, { upstream_dependency_refs: fx.sourceDeps(context) }),
      expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')
    );
  }
});

test('D2-H03 information-release observation must cite exact B04 exposure or understanding evidence', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-009'], b04: true });
  assert.throws(
    () => accept(context, 'B05-LENS-009', { upstream_dependency_refs: fx.sourceDeps(context) }),
    expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')
  );
});

test('D2-H04 canon/protected-language observation must cite the exact B10 constraint dependency', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-016'], b03: true, author: true });
  assert.throws(
    () => accept(context, 'B05-LENS-016', { upstream_dependency_refs: fx.sourceDeps(context) }),
    expectCode('BLOCKED_OWNER_CONSTRAINT')
  );
});

test('D2-H05 named-author targeting is rejected even when smuggled inside an allowed string field', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  assert.throws(
    () => accept(context, 'B05-LENS-001', {
      evidence_refs: [{ evidence_ref: 'named-author-target:external-author', evidence_digest: fx.H('5') }]
    }),
    expectCode('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN')
  );
});

test('D2-H06 evaluation/winner authority payloads fail closed before sealing', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  assert.throws(
    () => accept(context, 'B05-LENS-001', { winner: true }),
    expectCode('BLOCKED_EVALUATION_AUTHORITY_FORBIDDEN')
  );
});

test('D2-H07 contradiction requires a concrete related observation reference', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  assert.throws(
    () => accept(context, 'B05-LENS-001', { finding_class: 'CONTRADICTION', related_observation_refs: [] }),
    expectCode('BLOCKED_CONFLICT_UNRESOLVED')
  );
});

test('D2-H08 NO_FINDING cannot claim evidence strength when no evidence is supplied', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  assert.throws(
    () => accept(context, 'B05-LENS-001', {
      finding_class: 'NO_FINDING', evidence_refs: [], evidence_strength_class: 'SUPPORTED'
    }),
    expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')
  );
});

test('D2-H09 diagnosis fails closed on conflicting digests for one provider-admission identity', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  const providerA = fx.makeProviderAdmission();
  const providerB = fx.clone(providerA);
  providerB.provider_admission_digest = fx.H('7');

  const first = accept(context, 'B05-LENS-001', { source_class: 'MODEL' }, providerA);
  const second = accept(context, 'B05-LENS-001', {
    source_class: 'MODEL',
    finding_class: 'LIMITATION',
    evidence_refs: [{ evidence_ref: 'evidence:provider-conflict:2', evidence_digest: fx.H('4') }]
  }, providerB);

  assert.throws(
    () => diagnosis.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: [first, second] }),
    expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')
  );
});

test('D2-H10 related observation references must resolve inside the assembled diagnosis and cannot self-reference', () => {
  const context = fx.makeContext({ lenses: ['B05-LENS-001'] });
  const first = accept(context, 'B05-LENS-001');
  const contradiction = accept(context, 'B05-LENS-001', {
    finding_class: 'CONTRADICTION',
    evidence_refs: [{ evidence_ref: 'evidence:contradiction:2', evidence_digest: fx.H('3') }],
    related_observation_refs: [first.diagnostic_observation_id]
  });
  assert.doesNotThrow(() => diagnosis.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: [first, contradiction] }));
  assert.throws(
    () => diagnosis.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: [contradiction] }),
    expectCode('BLOCKED_OBSERVATION_BINDING_MISMATCH')
  );
});
