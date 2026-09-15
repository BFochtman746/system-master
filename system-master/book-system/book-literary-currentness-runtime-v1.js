'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const contextRuntime = require('./book-literary-diagnostic-context-v1');
const observationRuntime = require('./book-literary-diagnostic-observation-v1');
const diagnosisRuntime = require('./book-literary-diagnosis-v1');
const craftRuntime = require('./book-craft-intelligence-v1');
const ledgerRuntime = require('./book-literary-opportunity-ledger-v1');
const lensRegistry = require('./book-literary-diagnostic-lens-registry-v1');

const CURRENTNESS_SCHEMA_VERSION = 'BOOK_LITERARY_DIAGNOSTIC_CURRENTNESS_V1';
const CURRENTNESS_PREFIX = 'book-literary-currentness-v1:';
const RUNTIME_SCHEMA_VERSION = 'BOOK_LITERARY_RUNTIME_V1';
const CURRENTNESS_STANDINGS = Object.freeze(['CURRENT', 'STALE', 'INVALID']);
const RECOMPUTE_LAYERS = Object.freeze(['CONTEXT', 'DIAGNOSIS', 'OPPORTUNITY_LEDGER']);
const SHA256 = /^[a-f0-9]{64}$/;

const COMMAND_NAMES = Object.freeze([
  'BuildLiteraryDiagnosticContextV1',
  'AcceptLiteraryDiagnosticObservationV1',
  'AssembleLiteraryDiagnosisV1',
  'AcceptCraftIntelligenceRecordV1',
  'AssembleLiteraryOpportunityLedgerV1',
  'ComputeLiteraryDiagnosticInvalidationV1'
]);

const QUERY_NAMES = Object.freeze([
  'GetLiteraryDiagnosticContextV1',
  'GetLiteraryDiagnosisV1',
  'GetLiteraryLensEvidenceV1',
  'GetLiteraryOpportunityLedgerV1',
  'RetrieveCraftIntelligenceV1',
  'GetLiteraryDiagnosticCurrentnessV1'
]);

class BookLiteraryCurrentnessError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLiteraryCurrentnessError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookLiteraryCurrentnessError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stable(v) { return kb.stableStringify(v); }
function exactKeys(v, fields, code, label) {
  if (!obj(v)) fail(code, `${label}:OBJECT_REQUIRED`);
  const expected = new Set(fields);
  for (const key of Object.keys(v)) if (!expected.has(key)) fail(code, `${label}.unexpected:${key}`);
  for (const field of fields) if (!own(v, field)) fail(code, `${label}.missing:${field}`);
}
function assertRefDigest(ref, dg, label) {
  if (!text(ref) || !digest(dg)) fail('BLOCKED_CURRENTNESS_REQUIRED', label);
}
function depKey(v) { return `${v.dependency_kind}:${v.dependency_ref}`; }

function currentnessSemanticV1(receipt) {
  const out = clone(receipt);
  delete out.currentness_id;
  delete out.currentness_digest;
  return out;
}
function literaryCurrentnessDigestV1(receipt) { return kb.sha256(currentnessSemanticV1(receipt)); }

function normalizeCurrentBindingsV1(bindings) {
  exactKeys(bindings, ['dependency_refs','observation_refs','craft_record_refs'], 'BLOCKED_CURRENTNESS_REQUIRED', 'current_bindings');
  if (!Array.isArray(bindings.dependency_refs) || !Array.isArray(bindings.observation_refs) || !Array.isArray(bindings.craft_record_refs)) {
    fail('BLOCKED_CURRENTNESS_REQUIRED', 'current_binding_arrays');
  }
  const deps = [];
  const depSeen = new Set();
  for (let i = 0; i < bindings.dependency_refs.length; i += 1) {
    const x = bindings.dependency_refs[i];
    exactKeys(x, ['dependency_kind','dependency_ref','dependency_digest','current'], 'BLOCKED_CURRENTNESS_REQUIRED', `dependency_refs.${i}`);
    if (!text(x.dependency_kind) || !text(x.dependency_ref) || !digest(x.dependency_digest) || typeof x.current !== 'boolean') fail('BLOCKED_CURRENTNESS_REQUIRED', `dependency_refs.${i}`);
    const key = depKey(x);
    if (depSeen.has(key)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate_dependency:${key}`);
    depSeen.add(key); deps.push(clone(x));
  }
  deps.sort((a,b) => depKey(a).localeCompare(depKey(b)));

  const observations = [];
  const observationSeen = new Set();
  for (let i = 0; i < bindings.observation_refs.length; i += 1) {
    const x = bindings.observation_refs[i];
    exactKeys(x, ['observation_id','observation_digest','current'], 'BLOCKED_CURRENTNESS_REQUIRED', `observation_refs.${i}`);
    assertRefDigest(x.observation_id, x.observation_digest, `observation_refs.${i}`);
    if (typeof x.current !== 'boolean' || observationSeen.has(x.observation_id)) fail('BLOCKED_CURRENTNESS_REQUIRED', `observation_refs.${i}`);
    observationSeen.add(x.observation_id); observations.push(clone(x));
  }
  observations.sort((a,b) => a.observation_id.localeCompare(b.observation_id));

  const craft = [];
  const craftSeen = new Set();
  for (let i = 0; i < bindings.craft_record_refs.length; i += 1) {
    const x = bindings.craft_record_refs[i];
    exactKeys(x, ['craft_record_id','craft_record_digest','current'], 'BLOCKED_CURRENTNESS_REQUIRED', `craft_record_refs.${i}`);
    assertRefDigest(x.craft_record_id, x.craft_record_digest, `craft_record_refs.${i}`);
    if (typeof x.current !== 'boolean' || craftSeen.has(x.craft_record_id)) fail('BLOCKED_CURRENTNESS_REQUIRED', `craft_record_refs.${i}`);
    craftSeen.add(x.craft_record_id); craft.push(clone(x));
  }
  craft.sort((a,b) => a.craft_record_id.localeCompare(b.craft_record_id));
  return { dependency_refs: deps, observation_refs: observations, craft_record_refs: craft };
}

function validateExactSubjectV1(input) {
  exactKeys(input, ['diagnostic_context','observations','diagnosis','craft_record_bindings','opportunity_ledger'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'subject');
  try { contextRuntime.validateLiteraryDiagnosticContextV1(input.diagnostic_context); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `context:${err.detail || err.message || 'invalid'}`); }
  if (!Array.isArray(input.observations)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'observations');
  const observationIds = new Set();
  for (let i = 0; i < input.observations.length; i += 1) {
    const observation = input.observations[i];
    try { observationRuntime.validateLiteraryDiagnosticObservationV1(observation, input.diagnostic_context); }
    catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation.${i}:${err.detail || err.message || 'invalid'}`); }
    if (observationIds.has(observation.diagnostic_observation_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `duplicate_observation:${observation.diagnostic_observation_id}`);
    observationIds.add(observation.diagnostic_observation_id);
  }
  let rebuiltDiagnosis;
  try { rebuiltDiagnosis = diagnosisRuntime.assembleLiteraryDiagnosisV1({ diagnostic_context: input.diagnostic_context, observations: input.observations }); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `diagnosis_rebuild:${err.detail || err.message || 'invalid'}`); }
  if (rebuiltDiagnosis.diagnosis_id !== input.diagnosis.diagnosis_id || rebuiltDiagnosis.diagnosis_digest !== input.diagnosis.diagnosis_digest) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'diagnosis_observation_set');
  }
  try { diagnosisRuntime.validateLiteraryDiagnosisV1(input.diagnosis, input.diagnostic_context, input.observations); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `diagnosis:${err.detail || err.message || 'invalid'}`); }

  if (!Array.isArray(input.craft_record_bindings)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'craft_record_bindings');
  const craftIds = new Set();
  for (let i = 0; i < input.craft_record_bindings.length; i += 1) {
    const binding = input.craft_record_bindings[i];
    exactKeys(binding, ['record','current'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `craft_record_bindings.${i}`);
    try { craftRuntime.validateCraftIntelligenceRecordV1(binding.record); }
    catch (err) { fail(err.code || 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `craft.${i}:${err.detail || err.message || 'invalid'}`); }
    if (craftIds.has(binding.record.craft_record_id)) fail('BLOCKED_CONFLICT_UNRESOLVED', `duplicate_craft_record:${binding.record.craft_record_id}`);
    craftIds.add(binding.record.craft_record_id);
  }
  try { ledgerRuntime.validateLiteraryOpportunityLedgerV1(input.opportunity_ledger, input.diagnosis, input.observations, input.craft_record_bindings); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `ledger:${err.detail || err.message || 'invalid'}`); }
  return true;
}

function expectedDependencyRefsV1(context, diagnosis) {
  const map = new Map();
  for (const dep of [...context.dependency_snapshot_refs, ...diagnosis.dependency_refs]) {
    if (!obj(dep) || !text(dep.dependency_kind) || !text(dep.dependency_ref) || !digest(dep.dependency_digest)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'expected_dependency');
    const key = depKey(dep);
    const prior = map.get(key);
    if (prior && prior.dependency_digest !== dep.dependency_digest) fail('BLOCKED_CONFLICT_UNRESOLVED', `dependency_digest:${key}`);
    map.set(key, clone(dep));
  }
  return [...map.values()].sort((a,b) => depKey(a).localeCompare(depKey(b)));
}

function compareExpectedV1(expected, current, type, idField, digestField) {
  const currentMap = new Map(current.map(x => [x[idField], x]));
  const changed = [];
  for (const ref of expected) {
    const id = ref[idField];
    const dg = ref[digestField];
    const now = currentMap.get(id);
    if (!now) {
      changed.push({ dependency_kind: type, dependency_ref: id, expected_digest: dg, current_digest: null, change_class: 'MISSING_OR_IDENTITY_CHANGED' });
    } else if (now[digestField] !== dg) {
      changed.push({ dependency_kind: type, dependency_ref: id, expected_digest: dg, current_digest: now[digestField], change_class: 'DIGEST_CHANGED' });
    } else if (now.current !== true) {
      changed.push({ dependency_kind: type, dependency_ref: id, expected_digest: dg, current_digest: now[digestField], change_class: 'NOT_CURRENT' });
    }
  }
  return changed;
}

function compareDependencyRefsV1(expected, current) {
  const map = new Map(current.map(x => [depKey(x), x]));
  const changed = [];
  for (const dep of expected) {
    const key = depKey(dep);
    const now = map.get(key);
    if (!now) {
      changed.push({ dependency_kind: dep.dependency_kind, dependency_ref: dep.dependency_ref, expected_digest: dep.dependency_digest, current_digest: null, change_class: 'MISSING_OR_IDENTITY_CHANGED' });
    } else if (now.dependency_digest !== dep.dependency_digest) {
      changed.push({ dependency_kind: dep.dependency_kind, dependency_ref: dep.dependency_ref, expected_digest: dep.dependency_digest, current_digest: now.dependency_digest, change_class: 'DIGEST_CHANGED' });
    } else if (now.current !== true) {
      changed.push({ dependency_kind: dep.dependency_kind, dependency_ref: dep.dependency_ref, expected_digest: dep.dependency_digest, current_digest: now.dependency_digest, change_class: 'NOT_CURRENT' });
    }
  }
  return changed;
}

function recomputeLayersV1(contextCurrent, diagnosisCurrent, ledgerCurrent) {
  if (!contextCurrent) return ['CONTEXT','DIAGNOSIS','OPPORTUNITY_LEDGER'];
  if (!diagnosisCurrent) return ['DIAGNOSIS','OPPORTUNITY_LEDGER'];
  if (!ledgerCurrent) return ['OPPORTUNITY_LEDGER'];
  return [];
}

function computeLiteraryDiagnosticInvalidationV1(input) {
  exactKeys(input, ['diagnostic_context','observations','diagnosis','craft_record_bindings','opportunity_ledger','current_bindings'], 'BLOCKED_CURRENTNESS_REQUIRED', 'input');
  const subject = {
    diagnostic_context: input.diagnostic_context,
    observations: input.observations,
    diagnosis: input.diagnosis,
    craft_record_bindings: input.craft_record_bindings,
    opportunity_ledger: input.opportunity_ledger
  };
  validateExactSubjectV1(subject);
  const current = normalizeCurrentBindingsV1(input.current_bindings);
  const expectedDeps = expectedDependencyRefsV1(input.diagnostic_context, input.diagnosis);
  const dependencyChanges = compareDependencyRefsV1(expectedDeps, current.dependency_refs);
  const observationChanges = compareExpectedV1(
    input.diagnosis.observation_refs,
    current.observation_refs,
    'B05_DIAGNOSTIC_OBSERVATION',
    'observation_id',
    'observation_digest'
  );
  const craftChanges = compareExpectedV1(
    input.opportunity_ledger.craft_intelligence_refs,
    current.craft_record_refs,
    'B05_CRAFT_INTELLIGENCE',
    'craft_record_id',
    'craft_record_digest'
  );

  const contextKeys = new Set(input.diagnostic_context.dependency_snapshot_refs
    .filter(x => x.dependency_kind !== 'B05_CRAFT_RETRIEVAL_POLICY')
    .map(depKey));
  const contextChanged = dependencyChanges.some(x => contextKeys.has(`${x.dependency_kind}:${x.dependency_ref}`));

  const observationDependencyKeys = new Set(input.observations.flatMap(o => o.upstream_dependency_refs.map(depKey)));
  const diagnosisDependencyChanged = dependencyChanges.some(x => {
    const key = `${x.dependency_kind}:${x.dependency_ref}`;
    if (x.dependency_kind === 'B01_PROVIDER_ADMISSION') return true;
    if (x.dependency_kind === 'B05_CRAFT_RETRIEVAL_POLICY') return observationDependencyKeys.has(key);
    return contextKeys.has(key) || observationDependencyKeys.has(key);
  });

  const policyChanged = dependencyChanges.some(x => x.dependency_kind === 'B05_CRAFT_RETRIEVAL_POLICY');
  const contextCurrent = !contextChanged;
  const diagnosisCurrent = contextCurrent && !diagnosisDependencyChanged && observationChanges.length === 0;
  const ledgerCurrent = diagnosisCurrent && craftChanges.length === 0 && !(policyChanged && input.opportunity_ledger.craft_intelligence_refs.length > 0);
  const recompute = recomputeLayersV1(contextCurrent, diagnosisCurrent, ledgerCurrent);

  const allChanges = [...dependencyChanges, ...observationChanges, ...craftChanges]
    .sort((a,b) => `${a.dependency_kind}:${a.dependency_ref}`.localeCompare(`${b.dependency_kind}:${b.dependency_ref}`));
  const staleObservationRefs = observationChanges.map(x => x.dependency_ref).sort();
  const staleCraftRecordRefs = craftChanges.map(x => x.dependency_ref).sort();
  const out = {
    currentness_schema_version: CURRENTNESS_SCHEMA_VERSION,
    currentness_id: null,
    currentness_digest: null,
    book_project_id: input.diagnostic_context.book_project_id,
    diagnostic_context_id: input.diagnostic_context.diagnostic_context_id,
    diagnostic_context_digest: input.diagnostic_context.diagnostic_context_digest,
    diagnosis_id: input.diagnosis.diagnosis_id,
    diagnosis_digest: input.diagnosis.diagnosis_digest,
    opportunity_ledger_id: input.opportunity_ledger.opportunity_ledger_id,
    opportunity_ledger_digest: input.opportunity_ledger.opportunity_ledger_digest,
    dependency_snapshot_refs: expectedDeps,
    observation_snapshot_refs: input.diagnosis.observation_refs.map(clone).sort((a,b) => a.observation_id.localeCompare(b.observation_id)),
    craft_record_snapshot_refs: input.opportunity_ledger.craft_intelligence_refs.map(clone).sort((a,b) => a.craft_record_id.localeCompare(b.craft_record_id)),
    changed_dependency_refs: allChanges,
    stale_observation_refs: staleObservationRefs,
    stale_craft_record_refs: staleCraftRecordRefs,
    context_current: contextCurrent,
    diagnosis_current: diagnosisCurrent,
    opportunity_ledger_current: ledgerCurrent,
    recompute_layers: recompute,
    standing: allChanges.length === 0 ? 'CURRENT' : 'STALE',
    canonical_effect: false
  };
  const dg = literaryCurrentnessDigestV1(out);
  out.currentness_digest = dg;
  out.currentness_id = `${CURRENTNESS_PREFIX}${dg}`;
  validateLiteraryDiagnosticCurrentnessV1(out, input.diagnostic_context, input.diagnosis, input.opportunity_ledger);
  return out;
}

function validateSnapshotRefsV1(values, kind) {
  if (!Array.isArray(values)) fail('BLOCKED_CURRENTNESS_REQUIRED', kind);
  const seen = new Set();
  for (const item of values) {
    if (kind === 'dependency_snapshot_refs') {
      exactKeys(item, ['dependency_kind','dependency_ref','dependency_digest'], 'BLOCKED_CURRENTNESS_REQUIRED', kind);
      assertRefDigest(item.dependency_ref, item.dependency_digest, kind);
      if (!text(item.dependency_kind)) fail('BLOCKED_CURRENTNESS_REQUIRED', kind);
      const key = depKey(item); if (seen.has(key)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate:${key}`); seen.add(key);
    } else if (kind === 'observation_snapshot_refs') {
      exactKeys(item, ['observation_id','observation_digest'], 'BLOCKED_CURRENTNESS_REQUIRED', kind);
      assertRefDigest(item.observation_id, item.observation_digest, kind);
      if (seen.has(item.observation_id)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate:${item.observation_id}`); seen.add(item.observation_id);
    } else {
      exactKeys(item, ['craft_record_id','craft_record_digest'], 'BLOCKED_CURRENTNESS_REQUIRED', kind);
      assertRefDigest(item.craft_record_id, item.craft_record_digest, kind);
      if (seen.has(item.craft_record_id)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate:${item.craft_record_id}`); seen.add(item.craft_record_id);
    }
  }
}

function validateLiteraryDiagnosticCurrentnessV1(receipt, context, diagnosis, ledger) {
  const fields = [
    'currentness_schema_version','currentness_id','currentness_digest','book_project_id',
    'diagnostic_context_id','diagnostic_context_digest','diagnosis_id','diagnosis_digest','opportunity_ledger_id','opportunity_ledger_digest',
    'dependency_snapshot_refs','observation_snapshot_refs','craft_record_snapshot_refs','changed_dependency_refs','stale_observation_refs','stale_craft_record_refs',
    'context_current','diagnosis_current','opportunity_ledger_current','recompute_layers','standing','canonical_effect'
  ];
  exactKeys(receipt, fields, 'BLOCKED_CURRENTNESS_REQUIRED', 'currentness');
  if (receipt.currentness_schema_version !== CURRENTNESS_SCHEMA_VERSION || receipt.book_project_id !== context.book_project_id) fail('BLOCKED_CURRENTNESS_REQUIRED', 'schema_or_project');
  if (receipt.diagnostic_context_id !== context.diagnostic_context_id || receipt.diagnostic_context_digest !== context.diagnostic_context_digest) fail('BLOCKED_CURRENTNESS_REQUIRED', 'context_binding');
  if (receipt.diagnosis_id !== diagnosis.diagnosis_id || receipt.diagnosis_digest !== diagnosis.diagnosis_digest) fail('BLOCKED_CURRENTNESS_REQUIRED', 'diagnosis_binding');
  if (receipt.opportunity_ledger_id !== ledger.opportunity_ledger_id || receipt.opportunity_ledger_digest !== ledger.opportunity_ledger_digest) fail('BLOCKED_CURRENTNESS_REQUIRED', 'ledger_binding');
  validateSnapshotRefsV1(receipt.dependency_snapshot_refs, 'dependency_snapshot_refs');
  validateSnapshotRefsV1(receipt.observation_snapshot_refs, 'observation_snapshot_refs');
  validateSnapshotRefsV1(receipt.craft_record_snapshot_refs, 'craft_record_snapshot_refs');
  if (!Array.isArray(receipt.changed_dependency_refs) || !Array.isArray(receipt.stale_observation_refs) || !Array.isArray(receipt.stale_craft_record_refs)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'change_arrays');
  for (const x of receipt.changed_dependency_refs) {
    exactKeys(x, ['dependency_kind','dependency_ref','expected_digest','current_digest','change_class'], 'BLOCKED_CURRENTNESS_REQUIRED', 'changed_dependency_ref');
    if (!text(x.dependency_kind) || !text(x.dependency_ref) || !digest(x.expected_digest) || (x.current_digest !== null && !digest(x.current_digest)) || !['MISSING_OR_IDENTITY_CHANGED','DIGEST_CHANGED','NOT_CURRENT'].includes(x.change_class)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'changed_dependency_ref');
  }
  if ([receipt.context_current, receipt.diagnosis_current, receipt.opportunity_ledger_current].some(x => typeof x !== 'boolean')) fail('BLOCKED_CURRENTNESS_REQUIRED', 'current_booleans');
  if (receipt.diagnosis_current && !receipt.context_current) fail('BLOCKED_CURRENTNESS_REQUIRED', 'layer_order');
  if (receipt.opportunity_ledger_current && !receipt.diagnosis_current) fail('BLOCKED_CURRENTNESS_REQUIRED', 'layer_order');
  const expectedRecompute = recomputeLayersV1(receipt.context_current, receipt.diagnosis_current, receipt.opportunity_ledger_current);
  if (stable(receipt.recompute_layers) !== stable(expectedRecompute) || receipt.recompute_layers.some(x => !RECOMPUTE_LAYERS.includes(x))) fail('BLOCKED_CURRENTNESS_REQUIRED', 'recompute_layers');
  if (!CURRENTNESS_STANDINGS.includes(receipt.standing)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'standing');
  const expectedStanding = receipt.changed_dependency_refs.length === 0 ? 'CURRENT' : 'STALE';
  if (receipt.standing !== expectedStanding) fail('BLOCKED_CURRENTNESS_REQUIRED', 'standing_mismatch');
  if (receipt.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  if (!digest(receipt.currentness_digest)) fail('BLOCKED_DIGEST_MISMATCH', 'currentness_digest');
  const dg = literaryCurrentnessDigestV1(receipt);
  if (receipt.currentness_digest !== dg || receipt.currentness_id !== `${CURRENTNESS_PREFIX}${dg}`) fail('BLOCKED_DIGEST_MISMATCH', 'currentness_identity');
  return true;
}

function getLiteraryDiagnosticContextV1(input) {
  if (input.currentness.context_current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', 'diagnostic_context');
  return clone(input.diagnostic_context);
}
function getLiteraryDiagnosisV1(input) {
  if (input.currentness.diagnosis_current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', 'diagnosis');
  return clone(input.diagnosis);
}
function getLiteraryOpportunityLedgerV1(input) {
  if (input.currentness.opportunity_ledger_current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', 'opportunity_ledger');
  return clone(input.opportunity_ledger);
}
function getLiteraryLensEvidenceV1(input) {
  if (input.currentness.diagnosis_current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', 'lens_evidence');
  try { lensRegistry.assertLiteraryDiagnosticLensV1(input.lens_id); }
  catch (err) { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', input.lens_id); }
  const coverage = input.diagnosis.lens_coverage.find(x => x.lens_id === input.lens_id);
  if (!coverage) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', input.lens_id);
  const observationMap = new Map(input.observations.map(x => [x.diagnostic_observation_id, x]));
  const evidence = coverage.observation_refs.map(ref => {
    const observation = observationMap.get(ref.observation_id);
    if (!observation || observation.diagnostic_observation_digest !== ref.observation_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `lens_observation:${ref.observation_id}`);
    return clone(observation);
  });
  return { lens_id: input.lens_id, disposition: coverage.disposition, observation_refs: clone(coverage.observation_refs), observations: evidence, canonical_effect: false };
}

function createBookLiteraryRuntimeV1(input) {
  exactKeys(input, ['diagnostic_context','observations','diagnosis','craft_record_bindings','opportunity_ledger','current_bindings'], 'BLOCKED_CURRENTNESS_REQUIRED', 'runtime_input');
  const subject = {
    diagnostic_context: input.diagnostic_context,
    observations: input.observations,
    diagnosis: input.diagnosis,
    craft_record_bindings: input.craft_record_bindings,
    opportunity_ledger: input.opportunity_ledger
  };
  validateExactSubjectV1(subject);
  const currentness = computeLiteraryDiagnosticInvalidationV1(input);
  const normalizedCurrent = normalizeCurrentBindingsV1(input.current_bindings);
  const craftCurrent = new Map(normalizedCurrent.craft_record_refs.map(x => [x.craft_record_id, x]));
  const currentCraftBindings = input.craft_record_bindings.map(binding => {
    const now = craftCurrent.get(binding.record.craft_record_id);
    return { record: clone(binding.record), current: !!now && now.current === true && now.craft_record_digest === binding.record.craft_record_digest };
  });

  function execute(operationName, args = {}) {
    if (operationName === 'BuildLiteraryDiagnosticContextV1') return contextRuntime.buildLiteraryDiagnosticContextV1(args);
    if (operationName === 'AcceptLiteraryDiagnosticObservationV1') return observationRuntime.acceptLiteraryDiagnosticObservationV1(args);
    if (operationName === 'AssembleLiteraryDiagnosisV1') return diagnosisRuntime.assembleLiteraryDiagnosisV1(args);
    if (operationName === 'AcceptCraftIntelligenceRecordV1') return craftRuntime.acceptCraftIntelligenceRecordV1(args);
    if (operationName === 'AssembleLiteraryOpportunityLedgerV1') return ledgerRuntime.assembleLiteraryOpportunityLedgerV1(args);
    if (operationName === 'ComputeLiteraryDiagnosticInvalidationV1') return computeLiteraryDiagnosticInvalidationV1({ ...subject, current_bindings: args.current_bindings || input.current_bindings });
    if (operationName === 'GetLiteraryDiagnosticContextV1') return getLiteraryDiagnosticContextV1({ diagnostic_context: input.diagnostic_context, currentness });
    if (operationName === 'GetLiteraryDiagnosisV1') return getLiteraryDiagnosisV1({ diagnosis: input.diagnosis, currentness });
    if (operationName === 'GetLiteraryLensEvidenceV1') return getLiteraryLensEvidenceV1({ diagnosis: input.diagnosis, observations: input.observations, currentness, lens_id: args.lens_id });
    if (operationName === 'GetLiteraryOpportunityLedgerV1') return getLiteraryOpportunityLedgerV1({ opportunity_ledger: input.opportunity_ledger, currentness });
    if (operationName === 'RetrieveCraftIntelligenceV1') return craftRuntime.retrieveCraftIntelligenceV1({ record_bindings: currentCraftBindings, query: args });
    if (operationName === 'GetLiteraryDiagnosticCurrentnessV1') return clone(currentness);
    fail('BLOCKED_RUNTIME_OPERATION_UNKNOWN', operationName);
  }
  return Object.freeze({ runtime_schema_version: RUNTIME_SCHEMA_VERSION, command_names: [...COMMAND_NAMES], query_names: [...QUERY_NAMES], canonical_effect: false, execute });
}

module.exports = {
  CURRENTNESS_SCHEMA_VERSION,
  CURRENTNESS_PREFIX,
  RUNTIME_SCHEMA_VERSION,
  CURRENTNESS_STANDINGS,
  RECOMPUTE_LAYERS,
  COMMAND_NAMES,
  QUERY_NAMES,
  BookLiteraryCurrentnessError,
  literaryCurrentnessDigestV1,
  normalizeCurrentBindingsV1,
  validateExactSubjectV1,
  computeLiteraryDiagnosticInvalidationV1,
  validateLiteraryDiagnosticCurrentnessV1,
  getLiteraryDiagnosticContextV1,
  getLiteraryDiagnosisV1,
  getLiteraryLensEvidenceV1,
  getLiteraryOpportunityLedgerV1,
  createBookLiteraryRuntimeV1
};
