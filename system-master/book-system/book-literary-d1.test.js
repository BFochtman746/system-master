'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const source = require('./book-source-recovery-acceptance-v1');
const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const currentness = require('./book-reader-currentness-runtime-v1');
const registry = require('./book-literary-diagnostic-lens-registry-v1');
const ctx = require('./book-literary-diagnostic-context-v1');

const H = ch => String(ch).repeat(64);
const BOOK = 'book:test';
const clone = v => JSON.parse(JSON.stringify(v));
const expectCode = code => err => err && err.code === code;

function makeSourceAcceptance() {
  const r = {
    source_acceptance_schema_version: source.SOURCE_SCHEMA_VERSION,
    book_project_id: BOOK,
    source_id: 'source:1',
    source_kind: 'MANUSCRIPT',
    source_locator_ref: 'locator:1',
    provider_identity: {
      provider_class: 'TEST_PROVIDER',
      provider_subject_ref: 'provider:test:1',
      provider_contract_ref: 'provider-contract:1',
      provider_contract_digest: H('1'),
      object_id: 'object:1',
      object_version_or_generation: 'v1',
      content_address_or_etag: 'etag:1'
    },
    source_digest_sha256: H('2'),
    source_byte_length: 100,
    media_type: 'text/plain',
    rights_record_id: 'rights:1',
    rights_record_digest: H('3'),
    intended_use_scope: 'BOOK_DIAGNOSIS',
    private_source_evidence_ref: null,
    private_source_evidence_digest: null,
    canonical_write_authority: false,
    author_decision_authority: false,
    publication_authority: false,
    source_acceptance_id: '',
    source_acceptance_digest: '',
    accepted_at: '2026-09-15T00:00:00.000Z'
  };
  r.source_acceptance_digest = source.sourceAcceptanceDigest(r);
  r.source_acceptance_id = source.SOURCE_PREFIX + r.source_acceptance_digest;
  source.validateSourceCustodyAcceptanceV1(r);
  return r;
}

function makeProjection(a) {
  const p = {
    projection_schema_version: source.PROJECTION_SCHEMA_VERSION,
    projection_id: '',
    projection_digest: '',
    source_acceptance_id: a.source_acceptance_id,
    source_acceptance_digest: a.source_acceptance_digest,
    source_digest_sha256: a.source_digest_sha256,
    extractor_identity: {
      provider_class: 'TEST_EXTRACTOR',
      provider_subject_ref: 'provider:extractor:1',
      provider_service_id: 'service:extract:1',
      provider_operation_id: 'operation:extract:1',
      provider_contract_ref: 'extract-contract:1',
      provider_contract_digest: H('4'),
      extractor_version: '1'
    },
    projection_artifact_ref: 'projection-artifact:1',
    projection_artifact_digest: H('5'),
    recovered_content_digest_sha256: H('6'),
    structure: [],
    metadata_ref_or_inline: null,
    citations_ref_or_inline: null,
    comments_ref_or_inline: null,
    todos_ref_or_inline: null,
    tracked_changes_ref_or_inline: null,
    story_bible_candidate_ref_or_inline: null,
    nonfiction_knowledge_candidate_ref_or_inline: null,
    voice_candidate_ref_or_inline: null,
    unit_evidence: []
  };
  p.projection_digest = source.projectionDigest(p);
  p.projection_id = source.PROJECTION_PREFIX + p.projection_digest;
  source.validateNormalizedSourceProjectionV1(p, a);
  return p;
}

function makeScope(kind = 'PASSAGE') {
  return { scope_kind: kind, scope_ref: 'scope:1', scope_digest: H('7') };
}

function makeAnchor(a, scope, overrides = {}) {
  const x = {
    anchor_ref: 'diagnostic-anchor:1',
    anchor_digest: '',
    scope_ref: scope.scope_ref,
    scope_digest: scope.scope_digest,
    source_acceptance_ref: a.source_acceptance_id,
    source_acceptance_digest: a.source_acceptance_digest,
    ordinal: 0,
    ...overrides
  };
  x.anchor_digest = ctx.literaryDiagnosticAnchorDigestV1(x);
  return x;
}

function makeKnowledge({ withEntity = false } = {}) {
  const entity = {
    entity_id: 'ENTITY:E1',
    entity_type: 'CHARACTER',
    aliases: [],
    source_anchor_ids: [],
    state_assertion_ids: [],
    status: 'ASSERTED',
    confidence: 0.8,
    provenance_refs: ['provenance:e1'],
    evidence_refs: [],
    depends_on_refs: []
  };
  const k = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: BOOK,
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: [],
    source_acceptance_refs: [],
    projection_refs: [],
    manuscript_refs: [],
    calibration_policy_ref: 'calibration-policy:1',
    calibration_policy_digest: H('8'),
    anchors: [],
    entities: withEntity ? [entity] : [],
    events: [],
    temporal_claims: [],
    causal_goal_claims: [],
    state_assertions: [],
    character_knowledge_claims: [],
    relationships: [],
    arcs: [],
    motifs: [],
    themes: [],
    promises: [],
    setup_payoffs: [],
    open_questions: [],
    identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL'
  };
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  kb.validateStoryBibleKnowledgeV1(k);
  return k;
}

function makeB03Binding({ withEntity = false, current = true } = {}) {
  const knowledge = makeKnowledge({ withEntity });
  return {
    story_bible_ref: 'story-bible:1',
    story_bible_digest: H('9'),
    current,
    knowledge,
    semantic_dependency_refs: withEntity ? [{ semantic_ref: 'ENTITY:E1', semantic_digest: kb.sha256(knowledge.entities[0]) }] : []
  };
}

function makeReaderBinding() {
  const e = {
    exposure_schema_version: exposure.EXPOSURE_SCHEMA_VERSION,
    exposure_projection_id: null,
    exposure_projection_digest: null,
    book_project_id: BOOK,
    story_bible_ref: 'story-bible:reader',
    story_bible_digest: H('a'),
    knowledge_candidate_id: 'book-story-bible-knowledge-v1:' + H('b'),
    knowledge_digest: H('b'),
    scope: { scope_kind: 'PASSAGE', scope_ref: 'reader-scope:1', scope_digest: H('c') },
    reveal_frontier: { frontier_anchor_id: 'ANCHOR:reader', frontier_ordinal: 0, frontier_anchor_digest: H('d') },
    visible_anchor_refs: ['ANCHOR:reader'],
    visible_semantic_refs: {},
    dependency_refs: ['dep:reader'],
    standing: 'READY_FOR_OBSERVATION'
  };
  const es = clone(e); delete es.exposure_projection_id; delete es.exposure_projection_digest;
  e.exposure_projection_digest = kb.sha256(es);
  e.exposure_projection_id = exposure.EXPOSURE_PREFIX + e.exposure_projection_digest;
  exposure.validateReaderExposureProjectionV1(e);
  const u = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: e, observations: [] });
  const c = {
    currentness_schema_version: currentness.CURRENTNESS_SCHEMA_VERSION,
    currentness_id: null,
    currentness_digest: null,
    book_project_id: BOOK,
    exposure_projection_id: e.exposure_projection_id,
    exposure_projection_digest: e.exposure_projection_digest,
    understanding_projection_id: u.understanding_projection_id,
    understanding_projection_digest: u.understanding_projection_digest,
    dependency_snapshot: [],
    b03_invalidation_impact_ref: null,
    b03_invalidation_impact_digest: null,
    exposure_current: true,
    understanding_current: true,
    exposure_currentness_standing: 'CURRENT',
    understanding_currentness_standing: 'CURRENT',
    changed_dependencies: [],
    stale_dependency_kinds: [],
    recompute_exposure_required: false,
    recompute_understanding_required: false,
    canonical_effect: false
  };
  const cs = clone(c); delete cs.currentness_id; delete cs.currentness_digest;
  c.currentness_digest = kb.sha256(cs);
  c.currentness_id = currentness.CURRENTNESS_PREFIX + c.currentness_digest;
  currentness.validateReaderUnderstandingCurrentnessV1(c, e, u);
  return {
    exposure_projection: e,
    understanding_projection: u,
    currentness: c,
    evidence_refs: [{
      evidence_kind: 'DIMENSION',
      evidence_ref: 'PCE013-DIM-001',
      projection_ref: u.understanding_projection_id,
      projection_digest: u.understanding_projection_digest
    }]
  };
}

function makeInput(overrides = {}) {
  const a = makeSourceAcceptance();
  const scope = makeScope();
  const base = {
    book_project_id: BOOK,
    source_acceptance: a,
    source_currentness: { ref: a.source_acceptance_id, digest: a.source_acceptance_digest, current: true },
    normalized_source_projection: null,
    projection_currentness: null,
    scope,
    source_anchor_refs: [makeAnchor(a, scope)],
    story_bible_binding: null,
    reader_binding: null,
    voice_evidence_refs: [],
    author_constraint_refs: [],
    literary_task_class: 'PASSAGE_DIAGNOSIS',
    purpose_hypothesis: {
      hypothesis: 'Establish local movement and pressure.',
      uncertainty_standing: 'TENTATIVE',
      provenance_refs: ['purpose:provenance:1'],
      evidence_refs: ['purpose:evidence:1']
    },
    requested_lens_ids: ['B05-LENS-001'],
    craft_retrieval_policy: { policy_ref: 'craft-policy:1', policy_digest: H('e'), current: true }
  };
  return Object.assign(base, overrides);
}

function staleReaderBinding() {
  const b = makeReaderBinding();
  b.currentness.understanding_current = false;
  b.currentness.understanding_currentness_standing = 'BLOCKED_STALE';
  b.currentness.recompute_understanding_required = true;
  b.currentness.changed_dependencies = [{ dependency_kind: 'OBSERVATION', ref: 'obs:changed' }];
  b.currentness.stale_dependency_kinds = ['OBSERVATION'];
  b.currentness.currentness_id = null; b.currentness.currentness_digest = null;
  const s = clone(b.currentness); delete s.currentness_id; delete s.currentness_digest;
  b.currentness.currentness_digest = kb.sha256(s);
  b.currentness.currentness_id = currentness.CURRENTNESS_PREFIX + b.currentness.currentness_digest;
  return b;
}

test('REG01 frozen lens registry is exactly 16', () => {
  assert.equal(registry.validateLiteraryDiagnosticLensRegistryV1(), true);
  assert.equal(registry.LENSES.length, 16);
});
test('REG02 lens ids and labels are unique', () => {
  assert.equal(new Set(registry.LENSES.map(x => x.lens_id)).size, 16);
  assert.equal(new Set(registry.LENSES.map(x => x.label)).size, 16);
});
test('REG03 exactly two external B08 seams remain outside primary registry', () => {
  assert.deepEqual(registry.EXTERNAL_B08_SEAMS, ['VOICE_PRESERVATION_EVOLUTION','HOMOGENIZATION_OVEROPTIMIZATION']);
});
test('REG04 unknown lens fails closed', () => {
  assert.throws(() => registry.assertLiteraryDiagnosticLensV1('B05-LENS-999'), expectCode('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN'));
});
test('REG05 duplicate requested lens fails closed', () => {
  assert.throws(() => registry.normalizeRequestedLiteraryLensesV1(['B05-LENS-001','B05-LENS-001']), expectCode('BLOCKED_DIAGNOSTIC_LENS_DUPLICATE'));
});

test('C01 exact B02 source acceptance identity/digest bind context', () => {
  const input = makeInput(); const out = ctx.buildLiteraryDiagnosticContextV1(input);
  assert.equal(out.source_acceptance_ref, input.source_acceptance.source_acceptance_id);
  assert.equal(out.source_acceptance_digest, input.source_acceptance.source_acceptance_digest);
});
test('C02 stale source acceptance blocks current diagnostic context', () => {
  const input = makeInput(); input.source_currentness.current = false;
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_SOURCE_CURRENTNESS_REQUIRED'));
});
test('C03 source acceptance digest mismatch fails closed', () => {
  const input = makeInput(); input.source_acceptance.source_acceptance_digest = H('f');
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input));
});
test('C04 normalized source projection binds exactly when consumed', () => {
  const input = makeInput(); const p = makeProjection(input.source_acceptance);
  input.normalized_source_projection = p;
  input.projection_currentness = { ref: p.projection_id, digest: p.projection_digest, current: true };
  const out = ctx.buildLiteraryDiagnosticContextV1(input);
  assert.equal(out.normalized_source_projection_ref, p.projection_id);
  assert.equal(out.normalized_source_projection_digest, p.projection_digest);
});
test('C05 scope is restricted to PASSAGE SCENE SECTION CHAPTER', () => {
  for (const kind of ['PASSAGE','SCENE','SECTION','CHAPTER']) assert.equal(ctx.validateScopeV1({ scope_kind: kind, scope_ref: 's', scope_digest: H('1') }), true);
  assert.throws(() => ctx.validateScopeV1({ scope_kind: 'BOOK', scope_ref: 's', scope_digest: H('1') }), expectCode('BLOCKED_DIAGNOSTIC_SCOPE_INVALID'));
});
test('C06 scope reference and digest bind exactly', () => {
  const input = makeInput(); const out = ctx.buildLiteraryDiagnosticContextV1(input);
  assert.deepEqual(out.scope, input.scope);
});
test('C07 source anchor is nonempty valid and bounded to scope', () => {
  const input = makeInput(); input.source_anchor_refs = [];
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_DIAGNOSTIC_SCOPE_INVALID'));
  const bad = makeInput(); bad.source_anchor_refs[0].scope_ref = 'other';
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(bad), expectCode('BLOCKED_DIAGNOSTIC_SCOPE_INVALID'));
});
test('C08 source anchor digest mismatch fails closed', () => {
  const input = makeInput(); input.source_anchor_refs[0].anchor_digest = H('1');
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_DIGEST_MISMATCH'));
});
test('C09 B03 Story Bible and knowledge identities bind exactly when consumed', () => {
  const input = makeInput({ story_bible_binding: makeB03Binding() });
  const out = ctx.buildLiteraryDiagnosticContextV1(input);
  assert.equal(out.story_bible_ref, input.story_bible_binding.story_bible_ref);
  assert.equal(out.knowledge_candidate_id, input.story_bible_binding.knowledge.knowledge_candidate_id);
});
test('C10 stale B03 Story Bible blocks dependent context', () => {
  const input = makeInput({ story_bible_binding: makeB03Binding({ current: false }) });
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED'));
});
test('C11 exact B03 semantic dependency refs are preserved', () => {
  const input = makeInput({ story_bible_binding: makeB03Binding({ withEntity: true }) });
  const out = ctx.buildLiteraryDiagnosticContextV1(input);
  assert.deepEqual(out.b03_semantic_dependency_refs, input.story_bible_binding.semantic_dependency_refs);
});
test('C12 B04 exposure and understanding bindings are exact when consumed', () => {
  const rb = makeReaderBinding(); const out = ctx.buildLiteraryDiagnosticContextV1(makeInput({ reader_binding: rb }));
  assert.equal(out.reader_exposure_ref, rb.exposure_projection.exposure_projection_id);
  assert.equal(out.reader_understanding_ref, rb.understanding_projection.understanding_projection_id);
});
test('C13 stale B04 evidence blocks consuming context and does not affect nonconsumer', () => {
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(makeInput({ reader_binding: staleReaderBinding() })), expectCode('BLOCKED_READER_EVIDENCE_STALE'));
  assert.equal(ctx.buildLiteraryDiagnosticContextV1(makeInput()).standing, 'READY_FOR_DIAGNOSIS');
});
test('C14 B04 dimension/lens evidence must belong to exact bound projection', () => {
  const rb = makeReaderBinding(); rb.evidence_refs[0].projection_digest = H('0');
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(makeInput({ reader_binding: rb })), expectCode('BLOCKED_READER_EVIDENCE_STALE'));
});
test('C15 B08 evidence ref and digest bind exactly when consumed', () => {
  const refs = [{ evidence_ref: 'voice:1', evidence_digest: H('1'), current: true }];
  const out = ctx.buildLiteraryDiagnosticContextV1(makeInput({ voice_evidence_refs: refs }));
  assert.deepEqual(out.voice_evidence_refs, [{ evidence_ref: 'voice:1', evidence_digest: H('1') }]);
});
test('C16 absent B08 evidence cannot synthesize governing voice standing', () => {
  const out = ctx.buildLiteraryDiagnosticContextV1(makeInput({ requested_lens_ids: ['B05-LENS-003'], voice_evidence_refs: [] }));
  assert.deepEqual(out.voice_evidence_refs, []);
  assert.equal(Object.hasOwn(out, 'voice_standing'), false);
});
test('C17 B10/Book author constraint refs bind exactly when consumed', () => {
  const refs = [{ evidence_ref: 'author-constraint:1', evidence_digest: H('2'), current: true }];
  const out = ctx.buildLiteraryDiagnosticContextV1(makeInput({ author_constraint_refs: refs }));
  assert.deepEqual(out.author_constraint_refs, [{ evidence_ref: 'author-constraint:1', evidence_digest: H('2') }]);
});
test('C18 literary purpose hypothesis remains structurally distinct from author intent', () => {
  const out = ctx.buildLiteraryDiagnosticContextV1(makeInput());
  assert.equal(typeof out.purpose_hypothesis.hypothesis, 'string');
  assert.equal(Object.hasOwn(out.purpose_hypothesis, 'author_intent'), false);
});
test('C19 requested lenses are exact frozen-registry subset', () => {
  const out = ctx.buildLiteraryDiagnosticContextV1(makeInput({ requested_lens_ids: ['B05-LENS-004','B05-LENS-001'] }));
  assert.deepEqual(out.requested_lens_ids, ['B05-LENS-001','B05-LENS-004']);
});
test('C20 unknown diagnostic lens fails closed', () => {
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(makeInput({ requested_lens_ids: ['B05-LENS-999'] })), expectCode('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN'));
});
test('C21 craft retrieval policy reference/digest bind exactly', () => {
  const input = makeInput(); const out = ctx.buildLiteraryDiagnosticContextV1(input);
  assert.equal(out.craft_retrieval_policy_ref, input.craft_retrieval_policy.policy_ref);
  assert.equal(out.craft_retrieval_policy_digest, input.craft_retrieval_policy.policy_digest);
});
test('C22 durable context rejects raw/full source payload', () => {
  const input = makeInput(); input.raw_manuscript_text = 'forbidden';
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_RAW_TEXT_FORBIDDEN'));
});
test('C23 context construction is deterministic and content-addressed', () => {
  const a = ctx.buildLiteraryDiagnosticContextV1(makeInput({ requested_lens_ids: ['B05-LENS-004','B05-LENS-001'] }));
  const b = ctx.buildLiteraryDiagnosticContextV1(makeInput({ requested_lens_ids: ['B05-LENS-001','B05-LENS-004'] }));
  assert.equal(a.diagnostic_context_id, b.diagnostic_context_id);
  assert.equal(a.diagnostic_context_digest, b.diagnostic_context_digest);
  assert.equal(ctx.validateLiteraryDiagnosticContextV1(a), true);
});
test('C24 context preserves canonical_effect false', () => {
  const out = ctx.buildLiteraryDiagnosticContextV1(makeInput());
  assert.equal(out.canonical_effect, false);
  const tampered = clone(out); tampered.canonical_effect = true;
  assert.throws(() => ctx.validateLiteraryDiagnosticContextV1(tampered), expectCode('BLOCKED_CANONICAL_EFFECT_FORBIDDEN'));
});

test('D1A canonical constraint lens requires B03 and B10 evidence', () => {
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(makeInput({ requested_lens_ids: ['B05-LENS-016'] })), expectCode('BLOCKED_OWNER_CONSTRAINT'));
});
test('D1B canonical constraint lens accepts exact B03 + B10 evidence', () => {
  const input = makeInput({
    requested_lens_ids: ['B05-LENS-016'],
    story_bible_binding: makeB03Binding(),
    author_constraint_refs: [{ evidence_ref: 'author-constraint:canon', evidence_digest: H('3'), current: true }]
  });
  assert.equal(ctx.buildLiteraryDiagnosticContextV1(input).standing, 'READY_FOR_DIAGNOSIS');
});
test('D1C stale craft policy fails closed', () => {
  const input = makeInput(); input.craft_retrieval_policy.current = false;
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED'));
});
test('D1D stale B08 evidence fails closed when supplied', () => {
  const input = makeInput({ voice_evidence_refs: [{ evidence_ref: 'voice:1', evidence_digest: H('4'), current: false }] });
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_VOICE_EVIDENCE_STALE'));
});
test('D1E stale B10 evidence fails closed when supplied', () => {
  const input = makeInput({ author_constraint_refs: [{ evidence_ref: 'author:1', evidence_digest: H('5'), current: false }] });
  assert.throws(() => ctx.buildLiteraryDiagnosticContextV1(input), expectCode('BLOCKED_AUTHOR_CONSTRAINT_STALE'));
});
