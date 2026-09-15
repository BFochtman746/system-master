'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fixtures = require('./book-literary-test-fixtures');
const observationRuntime = require('./book-literary-diagnostic-observation-v1');
const diagnosisRuntime = require('./book-literary-diagnosis-v1');
const ledgerRuntime = require('./book-literary-opportunity-ledger-v1');
const currentnessRuntime = require('./book-literary-currentness-runtime-v1');
const manifest = require('../../qualification/book-system/reconstruction/BOOK-B05-E-152-DENOMINATOR-v1.json');

const ROOT = path.resolve(__dirname, '../..');

function assertCode(fn, code) {
  assert.throws(fn, err => err && err.code === code, code);
}

function rejectObservationField(key, expectedCode, value = 'forbidden') {
  const context = fixtures.makeContext({ lenses: ['B05-LENS-001'] });
  const payload = fixtures.makeObservationPayload(context, 'B05-LENS-001');
  payload[key] = value;
  assertCode(() => observationRuntime.acceptLiteraryDiagnosticObservationV1({
    diagnostic_context: context,
    observation: payload,
    provider_admission: null
  }), expectedCode);
}

function isolatedChildEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runExisting(file, pattern) {
  const result = spawnSync(process.execPath, ['--test', `--test-name-pattern=${pattern}`, file], {
    cwd: ROOT,
    encoding: 'utf8',
    env: isolatedChildEnv()
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /# pass 1\b/, output);
  assert.match(output, /# fail 0\b/, output);
}

test('X01 replacement manuscript prose in any B05 payload is forbidden', () => {
  rejectObservationField('replacement_prose', 'BLOCKED_REWRITE_PAYLOAD_FORBIDDEN');
});

test('X02 revision candidate text or applied revision transform in B05 is forbidden', () => {
  rejectObservationField('candidate_text', 'BLOCKED_REWRITE_PAYLOAD_FORBIDDEN');
  rejectObservationField('applied_revision', 'BLOCKED_REWRITE_PAYLOAD_FORBIDDEN');
});

test('X03 original-vs-candidate winner or evaluation disposition is forbidden', () => {
  rejectObservationField('evaluation_disposition', 'BLOCKED_EVALUATION_AUTHORITY_FORBIDDEN');
});

test('X04 B08 voice degradation evolution or trait disposition standing is forbidden', () => {
  rejectObservationField('voice_evolution_standing', 'BLOCKED_VOICE_STANDING_FORBIDDEN');
  rejectObservationField('trait_disposition', 'BLOCKED_VOICE_STANDING_FORBIDDEN');
});

test('X05 B08 homogenization governing standing is forbidden', () => {
  rejectObservationField('homogenization_standing', 'BLOCKED_VOICE_STANDING_FORBIDDEN');
});

test('X06 universal prose quality score rank or percentile is forbidden', () => {
  rejectObservationField('prose_quality_score', 'BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN', 99);
  rejectObservationField('percentile', 'BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN', 99);
});

test('X07 named-author imitation similarity or nearest-author target is forbidden', () => {
  rejectObservationField('named_author_target', 'BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN', 'Named Author');
});

test('X08 chain-of-thought hidden reasoning or private model reasoning is forbidden', () => {
  rejectObservationField('chain_of_thought', 'BLOCKED_RAW_TEXT_FORBIDDEN', 'hidden reasoning');
});

test('X09 credentials access tokens and secrets are forbidden', () => {
  rejectObservationField('access_token', 'BLOCKED_RAW_TEXT_FORBIDDEN', 'token-value');
});

test('X10 unauthorized long raw source storage or reconstruction is forbidden', () => {
  rejectObservationField('raw_source_text', 'BLOCKED_RAW_TEXT_FORBIDDEN', 'raw manuscript text');
});

test('X11 B05 cannot widen the frozen B01 provider capability registry', () => {
  assert.deepEqual(currentnessRuntime.COMMAND_NAMES, [
    'BuildLiteraryDiagnosticContextV1',
    'AcceptLiteraryDiagnosticObservationV1',
    'AssembleLiteraryDiagnosisV1',
    'AcceptCraftIntelligenceRecordV1',
    'AssembleLiteraryOpportunityLedgerV1',
    'ComputeLiteraryDiagnosticInvalidationV1'
  ]);
  assert.equal(currentnessRuntime.COMMAND_NAMES.some(x => /register|provider.*capability|registry/i.test(x)), false);
});

test('X12 retired PROSE dispatch cannot be reactivated as canonical authority', () => {
  const surface = [...currentnessRuntime.COMMAND_NAMES, ...currentnessRuntime.QUERY_NAMES];
  assert.equal(surface.some(x => /^PROSE\./i.test(x) || /PROSE[._]/i.test(x)), false);
  assert.equal(currentnessRuntime.RUNTIME_SCHEMA_VERSION, 'BOOK_LITERARY_RUNTIME_V1');
});

test('X13 B05 observation cannot create a B03 canonical fact', () => {
  rejectObservationField('canonical_fact', 'BLOCKED_OBSERVATION_BINDING_MISMATCH', { fact: 'invented' });
});

test('X14 B05 observation cannot create B04 reader truth', () => {
  rejectObservationField('reader_truth', 'BLOCKED_OBSERVATION_BINDING_MISMATCH', { standing: 'TRUE' });
});

test('X15 B05 opportunity or observation cannot create a B06 revision candidate', () => {
  rejectObservationField('revision_candidate', 'BLOCKED_OBSERVATION_BINDING_MISMATCH', { candidate_ref: 'revision:1' });
});

test('X16 B05 cannot self-issue a B07 independent evaluation or calibration verdict', () => {
  rejectObservationField('independent_evaluation_verdict', 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'PASS');
});

test('X17 B05 cannot self-issue B08 governing voice standing', () => {
  rejectObservationField('voice_standing', 'BLOCKED_VOICE_STANDING_FORBIDDEN', 'GOVERNING');
});

test('X18 B05 cannot self-issue B10 author decision or protected-language approval', () => {
  rejectObservationField('author_decision', 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'APPROVED');
});

test('X19 B05 cannot export publish freeze or canonically version a manuscript', () => {
  const surface = [...currentnessRuntime.COMMAND_NAMES, ...currentnessRuntime.QUERY_NAMES];
  assert.equal(surface.some(x => /export|publish|freeze|canonical.*version|admit.*canon/i.test(x)), false);
});

test('X20 B02 rights or privacy BLOCKED overrides otherwise-good literary task fit', () => {
  runExisting('system-master/book-system/book-literary-d3.test.js', '^K02\\b');
});

test('X21 B03 or B10 hard canon conflict blocks opportunity instead of silently trading it off', () => {
  const context = fixtures.makeContext({ lenses: ['B05-LENS-001'], author: true });
  const payload = fixtures.makeObservationPayload(context, 'B05-LENS-001', { finding_class: 'LIMITATION' });
  const observation = observationRuntime.acceptLiteraryDiagnosticObservationV1({ diagnostic_context: context, observation: payload, provider_admission: null });
  const diagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: [observation] });
  const candidate = {
    opportunity_key: 'canon-conflict',
    target_lens_ids: ['B05-LENS-001'],
    supporting_observation_refs: [observation.diagnostic_observation_id],
    contradicting_observation_refs: [],
    craft_intelligence_refs: [],
    purpose_relevance_class: 'HIGH',
    evidence_strength_class: 'SUPPORTED',
    preservation_risk_class: 'HIGH',
    collateral_risk_class: 'HIGH',
    scope_recommendation: fixtures.clone(context.scope),
    owner_constraint_refs: ['author-constraint:not-bound']
  };
  assertCode(() => ledgerRuntime.assembleLiteraryOpportunityLedgerV1({
    diagnostic_context: context,
    observations: [observation],
    diagnosis,
    craft_record_bindings: [],
    opportunity_candidates: [candidate]
  }), 'BLOCKED_OWNER_CONSTRAINT');
});

test('X22 stale evidence cannot be returned as current through query alias or substitution', () => {
  runExisting('system-master/book-system/book-literary-d4.test.js', '^I16\\b');
});

test('X23 missing external qualification evidence remains explicit fenced and uncalibrated', () => {
  assert.deepEqual(manifest.external_fences, [
    'MODEL_LITERARY_SPECIALIST_CALIBRATION_REQUIRED',
    'HUMAN_EDITOR_ALIGNMENT_REQUIRED',
    'REAL_BOOK_DIAGNOSTIC_CALIBRATION_REQUIRED',
    'CROSS_GENRE_GENERALIZATION_REQUIRED',
    'PROVIDER_SUBJECT_ADMISSION_REQUIRED',
    'PRIVATE_MANUSCRIPT_ENVIRONMENT_REQUIRED'
  ]);
  assert.equal(manifest.external_fences.some(x => /PASS|CLOSED|SATISFIED/.test(x)), false);
});

test('X24 historical Literary Prose PASS transfers zero and legacy authority remains reference-only', () => {
  assert.equal(manifest.historical_pass_transfer, 0);
  assert.equal(manifest.denominator_shrinkage_allowed, false);
  assert.equal(manifest.canonical_effect, false);
  assert.equal([...currentnessRuntime.COMMAND_NAMES, ...currentnessRuntime.QUERY_NAMES].some(x => /PROSE/i.test(x)), false);
});
