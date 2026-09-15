'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const source = require('./book-source-recovery-acceptance-v1');
const readerExposure = require('./book-reader-exposure-projection-v1');
const readerUnderstanding = require('./book-reader-understanding-v1');
const readerCurrentness = require('./book-reader-currentness-runtime-v1');
const lenses = require('./book-literary-diagnostic-lens-registry-v1');

const CONTEXT_SCHEMA_VERSION = 'BOOK_LITERARY_DIAGNOSTIC_CONTEXT_V1';
const CONTEXT_PREFIX = 'book-literary-diagnostic-context-v1:';
const SCOPE_KINDS = Object.freeze(['PASSAGE', 'SCENE', 'SECTION', 'CHAPTER']);
const CONTEXT_STANDINGS = Object.freeze([
  'READY_FOR_DIAGNOSIS',
  'BLOCKED_NEEDS_CONTEXT',
  'BLOCKED_OWNER_CONSTRAINT',
  'BLOCKED_STALE',
  'BLOCKED_INVALID'
]);
const SHA256 = /^[a-f0-9]{64}$/;
const SEMANTIC_COLLECTIONS = Object.freeze([
  ['anchors','anchor_id'],
  ['entities','entity_id'],
  ['events','event_id'],
  ['temporal_claims','temporal_claim_id'],
  ['causal_goal_claims','causal_goal_claim_id'],
  ['state_assertions','state_assertion_id'],
  ['character_knowledge_claims','knowledge_claim_id'],
  ['relationships','relationship_id'],
  ['arcs','arc_id'],
  ['motifs','motif_id'],
  ['themes','theme_id'],
  ['promises','promise_id'],
  ['setup_payoffs','setup_payoff_id'],
  ['open_questions','open_question_id']
]);

const FORBIDDEN_KEY_PATTERNS = Object.freeze([
  /raw.*(?:manuscript|source|document|text|bytes)/i,
  /(?:manuscript|source|document).*full.*text/i,
  /quoted.*text/i,
  /full.*text/i,
  /candidate.*text/i,
  /replacement.*prose/i,
  /rewrite.*payload/i,
  /chain.*of.*thought/i,
  /hidden.*reason/i,
  /credential/i,
  /access.*token/i,
  /secret/i,
  /publication.*credential/i,
  /production.*credential/i
]);

class BookLiteraryDiagnosticContextError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLiteraryDiagnosticContextError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookLiteraryDiagnosticContextError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function hash(v) { return kb.sha256(v); }
function stable(v) { return kb.stableStringify(v); }
function sortedStrings(values) { return [...new Set(values)].sort(); }
function req(v, fields, label) {
  if (!obj(v)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', `${label}:OBJECT_REQUIRED`);
  for (const field of fields) if (!own(v, field)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', `${label}.${field}`);
}
function exactKeys(v, fields, code, label) {
  if (!obj(v)) fail(code, `${label}:OBJECT_REQUIRED`);
  const expected = new Set(fields);
  for (const key of Object.keys(v)) if (!expected.has(key)) fail(code, `${label}.unexpected:${key}`);
  for (const field of fields) if (!own(v, field)) fail(code, `${label}.missing:${field}`);
}
function assertNoForbiddenPayload(v, path = '$') {
  if (Array.isArray(v)) return v.forEach((x, i) => assertNoForbiddenPayload(x, `${path}[${i}]`));
  if (!obj(v)) return;
  for (const [key, child] of Object.entries(v)) {
    if (FORBIDDEN_KEY_PATTERNS.some(re => re.test(key))) fail('BLOCKED_RAW_TEXT_FORBIDDEN', `${path}.${key}`);
    assertNoForbiddenPayload(child, `${path}.${key}`);
  }
}
function assertRef(v, label, code = 'BLOCKED_SOURCE_BINDING_MISMATCH') { if (!text(v)) fail(code, label); }
function assertDigest(v, label, code = 'BLOCKED_DIGEST_MISMATCH') { if (!digest(v)) fail(code, label); }
function normalizeRefList(values, label, code) {
  if (!Array.isArray(values)) fail(code, `${label}:ARRAY_REQUIRED`);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < values.length; i += 1) {
    if (!text(values[i])) fail(code, `${label}.${i}`);
    if (seen.has(values[i])) fail(code, `${label}.duplicate:${values[i]}`);
    seen.add(values[i]); out.push(values[i]);
  }
  return out.sort();
}

function validateScopeV1(scope) {
  exactKeys(scope, ['scope_kind','scope_ref','scope_digest'], 'BLOCKED_DIAGNOSTIC_SCOPE_INVALID', 'scope');
  if (!SCOPE_KINDS.includes(scope.scope_kind) || !text(scope.scope_ref) || !digest(scope.scope_digest)) fail('BLOCKED_DIAGNOSTIC_SCOPE_INVALID');
  return true;
}

function literaryDiagnosticAnchorDigestV1(anchor) {
  const semantic = clone(anchor);
  delete semantic.anchor_digest;
  return hash(semantic);
}

function normalizeAnchorsV1(anchorRefs, scope, sourceAcceptance) {
  if (!Array.isArray(anchorRefs) || anchorRefs.length === 0) fail('BLOCKED_DIAGNOSTIC_SCOPE_INVALID', 'source_anchor_refs');
  const ids = new Set();
  const out = anchorRefs.map((anchor, i) => {
    exactKeys(anchor, ['anchor_ref','anchor_digest','scope_ref','scope_digest','source_acceptance_ref','source_acceptance_digest','ordinal'], 'BLOCKED_SOURCE_BINDING_MISMATCH', `source_anchor_refs.${i}`);
    assertRef(anchor.anchor_ref, `source_anchor_refs.${i}.anchor_ref`);
    assertDigest(anchor.anchor_digest, `source_anchor_refs.${i}.anchor_digest`);
    if (!Number.isInteger(anchor.ordinal) || anchor.ordinal < 0) fail('BLOCKED_DIAGNOSTIC_SCOPE_INVALID', `source_anchor_refs.${i}.ordinal`);
    if (anchor.scope_ref !== scope.scope_ref || anchor.scope_digest !== scope.scope_digest) fail('BLOCKED_DIAGNOSTIC_SCOPE_INVALID', `source_anchor_refs.${i}.scope`);
    if (anchor.source_acceptance_ref !== sourceAcceptance.source_acceptance_id || anchor.source_acceptance_digest !== sourceAcceptance.source_acceptance_digest) fail('BLOCKED_SOURCE_BINDING_MISMATCH', `source_anchor_refs.${i}.source`);
    if (literaryDiagnosticAnchorDigestV1(anchor) !== anchor.anchor_digest) fail('BLOCKED_DIGEST_MISMATCH', `source_anchor_refs.${i}.anchor_digest`);
    if (ids.has(anchor.anchor_ref)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', `source_anchor_refs.duplicate:${anchor.anchor_ref}`);
    ids.add(anchor.anchor_ref);
    return clone(anchor);
  });
  out.sort((a, b) => a.ordinal - b.ordinal || a.anchor_ref.localeCompare(b.anchor_ref));
  return out;
}

function validateCurrentBindingV1(binding, expectedRef, expectedDigest, staleCode, label) {
  exactKeys(binding, ['ref','digest','current'], staleCode, label);
  if (binding.ref !== expectedRef || binding.digest !== expectedDigest) fail('BLOCKED_DIGEST_MISMATCH', label);
  if (binding.current !== true) fail(staleCode, label);
  return { dependency_ref: binding.ref, dependency_digest: binding.digest };
}

function validateSourceInputsV1(input) {
  try { source.validateSourceCustodyAcceptanceV1(input.source_acceptance); }
  catch (err) { fail('BLOCKED_SOURCE_BINDING_MISMATCH', err.code || err.message || 'source'); }
  if (input.source_acceptance.book_project_id !== input.book_project_id) fail('BLOCKED_SOURCE_BINDING_MISMATCH', 'book_project_id');
  const deps = [{
    dependency_kind: 'B02_SOURCE_ACCEPTANCE',
    ...validateCurrentBindingV1(input.source_currentness, input.source_acceptance.source_acceptance_id, input.source_acceptance.source_acceptance_digest, 'BLOCKED_SOURCE_CURRENTNESS_REQUIRED', 'source_currentness')
  }];
  let projectionRef = null, projectionDigest = null;
  if (input.normalized_source_projection !== null && input.normalized_source_projection !== undefined) {
    try { source.validateNormalizedSourceProjectionV1(input.normalized_source_projection, input.source_acceptance); }
    catch (err) { fail('BLOCKED_SOURCE_BINDING_MISMATCH', `projection:${err.code || err.message || 'invalid'}`); }
    if (!obj(input.projection_currentness)) fail('BLOCKED_SOURCE_CURRENTNESS_REQUIRED', 'projection_currentness');
    projectionRef = input.normalized_source_projection.projection_id;
    projectionDigest = input.normalized_source_projection.projection_digest;
    deps.push({
      dependency_kind: 'B02_NORMALIZED_SOURCE_PROJECTION',
      ...validateCurrentBindingV1(input.projection_currentness, projectionRef, projectionDigest, 'BLOCKED_SOURCE_CURRENTNESS_REQUIRED', 'projection_currentness')
    });
  } else if (input.projection_currentness !== null && input.projection_currentness !== undefined) {
    fail('BLOCKED_SOURCE_BINDING_MISMATCH', 'projection_currentness_without_projection');
  }
  return { projectionRef, projectionDigest, deps };
}

function semanticRecordIndexV1(knowledge) {
  const map = new Map();
  for (const [collection, idField] of SEMANTIC_COLLECTIONS) {
    for (const record of knowledge[collection] || []) map.set(record[idField], record);
  }
  return map;
}

function validateB03BindingV1(binding, bookProjectId) {
  if (binding === null || binding === undefined) return { output: null, deps: [] };
  exactKeys(binding, ['story_bible_ref','story_bible_digest','current','knowledge','semantic_dependency_refs'], 'BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', 'story_bible_binding');
  assertRef(binding.story_bible_ref, 'story_bible_binding.story_bible_ref', 'BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED');
  assertDigest(binding.story_bible_digest, 'story_bible_binding.story_bible_digest');
  if (binding.current !== true) fail('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', 'story_bible_binding');
  try { kb.validateStoryBibleKnowledgeV1(binding.knowledge, { expected_book_project_id: bookProjectId }); }
  catch (err) { fail(err && /DIGEST|ID_MISMATCH/.test(String(err.code)) ? 'BLOCKED_DIGEST_MISMATCH' : 'BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', `knowledge:${err.code || err.message || 'invalid'}`); }
  const index = semanticRecordIndexV1(binding.knowledge);
  if (!Array.isArray(binding.semantic_dependency_refs)) fail('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', 'semantic_dependency_refs');
  const seen = new Set();
  const semanticRefs = binding.semantic_dependency_refs.map((x, i) => {
    exactKeys(x, ['semantic_ref','semantic_digest'], 'BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', `semantic_dependency_refs.${i}`);
    assertRef(x.semantic_ref, `semantic_dependency_refs.${i}.semantic_ref`, 'BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED');
    assertDigest(x.semantic_digest, `semantic_dependency_refs.${i}.semantic_digest`);
    if (seen.has(x.semantic_ref)) fail('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', `semantic_dependency_refs.duplicate:${x.semantic_ref}`);
    const record = index.get(x.semantic_ref);
    if (!record) fail('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', `semantic_dependency_refs.unknown:${x.semantic_ref}`);
    if (hash(record) !== x.semantic_digest) fail('BLOCKED_DIGEST_MISMATCH', `semantic_dependency_refs.${x.semantic_ref}`);
    seen.add(x.semantic_ref);
    return clone(x);
  }).sort((a, b) => a.semantic_ref.localeCompare(b.semantic_ref));
  const output = {
    story_bible_ref: binding.story_bible_ref,
    story_bible_digest: binding.story_bible_digest,
    knowledge_candidate_id: binding.knowledge.knowledge_candidate_id,
    knowledge_digest: binding.knowledge.knowledge_digest,
    semantic_dependency_refs: semanticRefs
  };
  const deps = [
    { dependency_kind: 'B03_STORY_BIBLE', dependency_ref: output.story_bible_ref, dependency_digest: output.story_bible_digest },
    { dependency_kind: 'B03_KNOWLEDGE', dependency_ref: output.knowledge_candidate_id, dependency_digest: output.knowledge_digest },
    ...semanticRefs.map(x => ({ dependency_kind: 'B03_SEMANTIC', dependency_ref: x.semantic_ref, dependency_digest: x.semantic_digest }))
  ];
  return { output, deps };
}

function validateB04BindingV1(binding, bookProjectId) {
  if (binding === null || binding === undefined) return { output: null, deps: [] };
  exactKeys(binding, ['exposure_projection','understanding_projection','currentness','evidence_refs'], 'BLOCKED_READER_EVIDENCE_STALE', 'reader_binding');
  try { readerExposure.validateReaderExposureProjectionV1(binding.exposure_projection); }
  catch (err) { fail('BLOCKED_READER_EVIDENCE_STALE', `exposure:${err.code || err.message || 'invalid'}`); }
  if (binding.exposure_projection.book_project_id !== bookProjectId) fail('BLOCKED_READER_EVIDENCE_STALE', 'book_project_id');
  if (binding.understanding_projection !== null) {
    try { readerUnderstanding.validateReaderUnderstandingProjectionV1(binding.understanding_projection); }
    catch (err) { fail('BLOCKED_READER_EVIDENCE_STALE', `understanding:${err.code || err.message || 'invalid'}`); }
    if (binding.understanding_projection.book_project_id !== bookProjectId || binding.understanding_projection.exposure_projection_id !== binding.exposure_projection.exposure_projection_id || binding.understanding_projection.exposure_projection_digest !== binding.exposure_projection.exposure_projection_digest) fail('BLOCKED_READER_EVIDENCE_STALE', 'understanding_exposure_binding');
  }
  try { readerCurrentness.validateReaderUnderstandingCurrentnessV1(binding.currentness, binding.exposure_projection, binding.understanding_projection); }
  catch (err) { fail('BLOCKED_READER_EVIDENCE_STALE', `currentness:${err.code || err.message || 'invalid'}`); }
  if (binding.currentness.exposure_current !== true) fail('BLOCKED_READER_EVIDENCE_STALE', 'exposure_stale');
  if (binding.understanding_projection !== null && binding.currentness.understanding_current !== true) fail('BLOCKED_READER_EVIDENCE_STALE', 'understanding_stale');
  if (!Array.isArray(binding.evidence_refs)) fail('BLOCKED_READER_EVIDENCE_STALE', 'evidence_refs');
  const seen = new Set();
  const evidenceRefs = binding.evidence_refs.map((x, i) => {
    exactKeys(x, ['evidence_kind','evidence_ref','projection_ref','projection_digest'], 'BLOCKED_READER_EVIDENCE_STALE', `evidence_refs.${i}`);
    if (x.evidence_kind !== 'DIMENSION' && x.evidence_kind !== 'LENS') fail('BLOCKED_READER_EVIDENCE_STALE', `evidence_refs.${i}.kind`);
    assertRef(x.evidence_ref, `evidence_refs.${i}.evidence_ref`, 'BLOCKED_READER_EVIDENCE_STALE');
    if (binding.understanding_projection === null) fail('BLOCKED_READER_EVIDENCE_STALE', 'evidence_requires_understanding');
    if (x.projection_ref !== binding.understanding_projection.understanding_projection_id || x.projection_digest !== binding.understanding_projection.understanding_projection_digest) fail('BLOCKED_READER_EVIDENCE_STALE', `evidence_refs.${i}.projection`);
    const exists = x.evidence_kind === 'DIMENSION'
      ? binding.understanding_projection.dimension_dispositions.some(d => d.dimension_id === x.evidence_ref)
      : binding.understanding_projection.lens_coverage.some(d => d.perspective_lens_id === x.evidence_ref);
    if (!exists) fail('BLOCKED_READER_EVIDENCE_STALE', `evidence_refs.${i}.unknown`);
    const key = `${x.evidence_kind}:${x.evidence_ref}`;
    if (seen.has(key)) fail('BLOCKED_READER_EVIDENCE_STALE', `evidence_refs.duplicate:${key}`);
    seen.add(key);
    return clone(x);
  }).sort((a, b) => `${a.evidence_kind}:${a.evidence_ref}`.localeCompare(`${b.evidence_kind}:${b.evidence_ref}`));
  const output = {
    exposure_projection_ref: binding.exposure_projection.exposure_projection_id,
    exposure_projection_digest: binding.exposure_projection.exposure_projection_digest,
    understanding_projection_ref: binding.understanding_projection ? binding.understanding_projection.understanding_projection_id : null,
    understanding_projection_digest: binding.understanding_projection ? binding.understanding_projection.understanding_projection_digest : null,
    evidence_refs: evidenceRefs
  };
  const deps = [
    { dependency_kind: 'B04_EXPOSURE', dependency_ref: output.exposure_projection_ref, dependency_digest: output.exposure_projection_digest },
    ...(output.understanding_projection_ref ? [{ dependency_kind: 'B04_UNDERSTANDING', dependency_ref: output.understanding_projection_ref, dependency_digest: output.understanding_projection_digest }] : []),
    ...evidenceRefs.map(x => ({ dependency_kind: `B04_${x.evidence_kind}`, dependency_ref: x.evidence_ref, dependency_digest: x.projection_digest }))
  ];
  return { output, deps };
}

function normalizeExternalEvidenceRefsV1(values, staleCode, label) {
  if (!Array.isArray(values)) fail(staleCode, `${label}:ARRAY_REQUIRED`);
  const seen = new Set();
  return values.map((x, i) => {
    exactKeys(x, ['evidence_ref','evidence_digest','current'], staleCode, `${label}.${i}`);
    assertRef(x.evidence_ref, `${label}.${i}.evidence_ref`, staleCode);
    assertDigest(x.evidence_digest, `${label}.${i}.evidence_digest`);
    if (x.current !== true) fail(staleCode, `${label}.${i}.stale`);
    if (seen.has(x.evidence_ref)) fail(staleCode, `${label}.duplicate:${x.evidence_ref}`);
    seen.add(x.evidence_ref);
    return { evidence_ref: x.evidence_ref, evidence_digest: x.evidence_digest };
  }).sort((a, b) => a.evidence_ref.localeCompare(b.evidence_ref));
}

function validatePurposeHypothesisV1(hypothesis) {
  exactKeys(hypothesis, ['hypothesis','uncertainty_standing','provenance_refs','evidence_refs'], 'BLOCKED_OWNER_CONSTRAINT', 'purpose_hypothesis');
  if (!text(hypothesis.hypothesis) || !text(hypothesis.uncertainty_standing)) fail('BLOCKED_OWNER_CONSTRAINT', 'purpose_hypothesis');
  return {
    hypothesis: hypothesis.hypothesis,
    uncertainty_standing: hypothesis.uncertainty_standing,
    provenance_refs: normalizeRefList(hypothesis.provenance_refs, 'purpose_hypothesis.provenance_refs', 'BLOCKED_OWNER_CONSTRAINT'),
    evidence_refs: normalizeRefList(hypothesis.evidence_refs, 'purpose_hypothesis.evidence_refs', 'BLOCKED_OWNER_CONSTRAINT')
  };
}

function contextSemanticV1(context) {
  const out = clone(context);
  delete out.diagnostic_context_id;
  delete out.diagnostic_context_digest;
  return out;
}
function diagnosticContextDigestV1(context) { return hash(contextSemanticV1(context)); }

function buildLiteraryDiagnosticContextV1(input) {
  if (!obj(input)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', 'input');
  assertNoForbiddenPayload(input, 'input');
  const required = [
    'book_project_id','source_acceptance','source_currentness','normalized_source_projection','projection_currentness','scope','source_anchor_refs',
    'story_bible_binding','reader_binding','voice_evidence_refs','author_constraint_refs','literary_task_class','purpose_hypothesis','requested_lens_ids','craft_retrieval_policy'
  ];
  for (const field of required) if (!own(input, field)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', `input.${field}`);
  assertRef(input.book_project_id, 'book_project_id');
  validateScopeV1(input.scope);
  const sourceBinding = validateSourceInputsV1(input);
  const anchors = normalizeAnchorsV1(input.source_anchor_refs, input.scope, input.source_acceptance);
  const b03 = validateB03BindingV1(input.story_bible_binding, input.book_project_id);
  const b04 = validateB04BindingV1(input.reader_binding, input.book_project_id);
  const voiceRefs = normalizeExternalEvidenceRefsV1(input.voice_evidence_refs, 'BLOCKED_VOICE_EVIDENCE_STALE', 'voice_evidence_refs');
  const authorRefs = normalizeExternalEvidenceRefsV1(input.author_constraint_refs, 'BLOCKED_AUTHOR_CONSTRAINT_STALE', 'author_constraint_refs');
  assertRef(input.literary_task_class, 'literary_task_class', 'BLOCKED_OWNER_CONSTRAINT');
  const purposeHypothesis = validatePurposeHypothesisV1(input.purpose_hypothesis);
  let requestedLensIds;
  try { requestedLensIds = lenses.normalizeRequestedLiteraryLensesV1(input.requested_lens_ids); }
  catch (err) { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', err.detail || err.message || 'requested_lens_ids'); }
  exactKeys(input.craft_retrieval_policy, ['policy_ref','policy_digest','current'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'craft_retrieval_policy');
  assertRef(input.craft_retrieval_policy.policy_ref, 'craft_retrieval_policy.policy_ref', 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED');
  assertDigest(input.craft_retrieval_policy.policy_digest, 'craft_retrieval_policy.policy_digest');
  if (input.craft_retrieval_policy.current !== true) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'craft_retrieval_policy.stale');

  if (requestedLensIds.includes('B05-LENS-016') && (!b03.output || authorRefs.length === 0)) fail('BLOCKED_OWNER_CONSTRAINT', 'B05-LENS-016_requires_B03_and_B10_constraints');

  const dependencies = [
    ...sourceBinding.deps,
    ...b03.deps,
    ...b04.deps,
    ...voiceRefs.map(x => ({ dependency_kind: 'B08_VOICE_PREFERENCE', dependency_ref: x.evidence_ref, dependency_digest: x.evidence_digest })),
    ...authorRefs.map(x => ({ dependency_kind: 'B10_AUTHOR_CONSTRAINT', dependency_ref: x.evidence_ref, dependency_digest: x.evidence_digest })),
    { dependency_kind: 'B05_CRAFT_RETRIEVAL_POLICY', dependency_ref: input.craft_retrieval_policy.policy_ref, dependency_digest: input.craft_retrieval_policy.policy_digest },
    { dependency_kind: 'B05_SCOPE', dependency_ref: `${input.scope.scope_kind}:${input.scope.scope_ref}`, dependency_digest: input.scope.scope_digest },
    ...anchors.map(x => ({ dependency_kind: 'B05_SOURCE_ANCHOR', dependency_ref: x.anchor_ref, dependency_digest: x.anchor_digest }))
  ];
  dependencies.sort((a, b) => `${a.dependency_kind}:${a.dependency_ref}@${a.dependency_digest}`.localeCompare(`${b.dependency_kind}:${b.dependency_ref}@${b.dependency_digest}`));
  const depKeys = new Set();
  for (const dep of dependencies) {
    const key = `${dep.dependency_kind}:${dep.dependency_ref}`;
    if (depKeys.has(key)) fail('BLOCKED_DIGEST_MISMATCH', `duplicate_dependency:${key}`);
    depKeys.add(key);
  }

  const output = {
    context_schema_version: CONTEXT_SCHEMA_VERSION,
    diagnostic_context_id: null,
    diagnostic_context_digest: null,
    book_project_id: input.book_project_id,
    source_acceptance_ref: input.source_acceptance.source_acceptance_id,
    source_acceptance_digest: input.source_acceptance.source_acceptance_digest,
    normalized_source_projection_ref: sourceBinding.projectionRef,
    normalized_source_projection_digest: sourceBinding.projectionDigest,
    scope: clone(input.scope),
    source_anchor_refs: anchors,
    story_bible_ref: b03.output ? b03.output.story_bible_ref : null,
    story_bible_digest: b03.output ? b03.output.story_bible_digest : null,
    knowledge_candidate_id: b03.output ? b03.output.knowledge_candidate_id : null,
    knowledge_digest: b03.output ? b03.output.knowledge_digest : null,
    b03_semantic_dependency_refs: b03.output ? b03.output.semantic_dependency_refs : [],
    reader_exposure_ref: b04.output ? b04.output.exposure_projection_ref : null,
    reader_exposure_digest: b04.output ? b04.output.exposure_projection_digest : null,
    reader_understanding_ref: b04.output ? b04.output.understanding_projection_ref : null,
    reader_understanding_digest: b04.output ? b04.output.understanding_projection_digest : null,
    b04_evidence_refs: b04.output ? b04.output.evidence_refs : [],
    voice_evidence_refs: voiceRefs,
    author_constraint_refs: authorRefs,
    literary_task_class: input.literary_task_class,
    purpose_hypothesis: purposeHypothesis,
    requested_lens_ids: requestedLensIds,
    craft_retrieval_policy_ref: input.craft_retrieval_policy.policy_ref,
    craft_retrieval_policy_digest: input.craft_retrieval_policy.policy_digest,
    dependency_snapshot_refs: dependencies,
    standing: 'READY_FOR_DIAGNOSIS',
    canonical_effect: false
  };
  const d = diagnosticContextDigestV1(output);
  output.diagnostic_context_digest = d;
  output.diagnostic_context_id = `${CONTEXT_PREFIX}${d}`;
  validateLiteraryDiagnosticContextV1(output);
  return output;
}

function validateLiteraryDiagnosticContextV1(context) {
  const fields = [
    'context_schema_version','diagnostic_context_id','diagnostic_context_digest','book_project_id','source_acceptance_ref','source_acceptance_digest',
    'normalized_source_projection_ref','normalized_source_projection_digest','scope','source_anchor_refs','story_bible_ref','story_bible_digest','knowledge_candidate_id','knowledge_digest',
    'b03_semantic_dependency_refs','reader_exposure_ref','reader_exposure_digest','reader_understanding_ref','reader_understanding_digest','b04_evidence_refs',
    'voice_evidence_refs','author_constraint_refs','literary_task_class','purpose_hypothesis','requested_lens_ids','craft_retrieval_policy_ref','craft_retrieval_policy_digest',
    'dependency_snapshot_refs','standing','canonical_effect'
  ];
  exactKeys(context, fields, 'BLOCKED_SOURCE_BINDING_MISMATCH', 'context');
  assertNoForbiddenPayload(context, 'context');
  if (context.context_schema_version !== CONTEXT_SCHEMA_VERSION) fail('BLOCKED_SOURCE_BINDING_MISMATCH', 'schema');
  assertRef(context.book_project_id, 'context.book_project_id');
  assertRef(context.source_acceptance_ref, 'context.source_acceptance_ref');
  assertDigest(context.source_acceptance_digest, 'context.source_acceptance_digest');
  if ((context.normalized_source_projection_ref === null) !== (context.normalized_source_projection_digest === null)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', 'projection_pair');
  if (context.normalized_source_projection_ref !== null) { assertRef(context.normalized_source_projection_ref, 'projection_ref'); assertDigest(context.normalized_source_projection_digest, 'projection_digest'); }
  validateScopeV1(context.scope);
  if (!Array.isArray(context.source_anchor_refs) || context.source_anchor_refs.length === 0) fail('BLOCKED_DIAGNOSTIC_SCOPE_INVALID', 'source_anchor_refs');
  for (const anchor of context.source_anchor_refs) {
    if (anchor.scope_ref !== context.scope.scope_ref || anchor.scope_digest !== context.scope.scope_digest || anchor.source_acceptance_ref !== context.source_acceptance_ref || anchor.source_acceptance_digest !== context.source_acceptance_digest || literaryDiagnosticAnchorDigestV1(anchor) !== anchor.anchor_digest) fail('BLOCKED_DIGEST_MISMATCH', `anchor:${anchor.anchor_ref}`);
  }
  const b03Pairs = [[context.story_bible_ref,context.story_bible_digest],[context.knowledge_candidate_id,context.knowledge_digest]];
  if (b03Pairs.some(([r,d]) => (r === null) !== (d === null))) fail('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', 'b03_pair');
  if ((context.story_bible_ref === null) !== (context.knowledge_candidate_id === null)) fail('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED', 'b03_binding_pair');
  const readerPairs = [[context.reader_exposure_ref,context.reader_exposure_digest],[context.reader_understanding_ref,context.reader_understanding_digest]];
  if (readerPairs.some(([r,d]) => (r === null) !== (d === null))) fail('BLOCKED_READER_EVIDENCE_STALE', 'reader_pair');
  if (context.reader_understanding_ref !== null && context.reader_exposure_ref === null) fail('BLOCKED_READER_EVIDENCE_STALE', 'understanding_without_exposure');
  if (!Array.isArray(context.b03_semantic_dependency_refs) || !Array.isArray(context.b04_evidence_refs) || !Array.isArray(context.voice_evidence_refs) || !Array.isArray(context.author_constraint_refs) || !Array.isArray(context.dependency_snapshot_refs)) fail('BLOCKED_SOURCE_BINDING_MISMATCH', 'reference_arrays');
  assertRef(context.literary_task_class, 'literary_task_class', 'BLOCKED_OWNER_CONSTRAINT');
  validatePurposeHypothesisV1(context.purpose_hypothesis);
  let normalizedLenses;
  try { normalizedLenses = lenses.normalizeRequestedLiteraryLensesV1(context.requested_lens_ids); }
  catch (err) { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', err.detail || err.message || 'requested_lens_ids'); }
  if (stable(normalizedLenses) !== stable(context.requested_lens_ids)) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', 'requested_lens_order_or_duplicate');
  assertRef(context.craft_retrieval_policy_ref, 'craft_retrieval_policy_ref', 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED');
  assertDigest(context.craft_retrieval_policy_digest, 'craft_retrieval_policy_digest');
  if (!CONTEXT_STANDINGS.includes(context.standing)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'context_standing');
  if (context.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  assertDigest(context.diagnostic_context_digest, 'diagnostic_context_digest');
  const d = diagnosticContextDigestV1(context);
  if (context.diagnostic_context_digest !== d || context.diagnostic_context_id !== `${CONTEXT_PREFIX}${d}`) fail('BLOCKED_DIGEST_MISMATCH', 'diagnostic_context');
  return true;
}

module.exports = {
  BookLiteraryDiagnosticContextError,
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_PREFIX,
  SCOPE_KINDS,
  CONTEXT_STANDINGS,
  literaryDiagnosticAnchorDigestV1,
  diagnosticContextDigestV1,
  validateScopeV1,
  buildLiteraryDiagnosticContextV1,
  validateLiteraryDiagnosticContextV1
};
