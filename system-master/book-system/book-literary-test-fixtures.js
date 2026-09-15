'use strict';

const source = require('./book-source-recovery-acceptance-v1');
const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const currentness = require('./book-reader-currentness-runtime-v1');
const ctx = require('./book-literary-diagnostic-context-v1');

const BOOK = 'book:test:b05';
const H = ch => String(ch).repeat(64);
const clone = v => JSON.parse(JSON.stringify(v));

function makeSourceAcceptance() {
  const r = {
    source_acceptance_schema_version: source.SOURCE_SCHEMA_VERSION,
    book_project_id: BOOK,
    source_id: 'source:b05:1',
    source_kind: 'MANUSCRIPT',
    source_locator_ref: 'locator:b05:1',
    provider_identity: {
      provider_class: 'TEST_PROVIDER', provider_subject_ref: 'provider:test:1', provider_contract_ref: 'provider-contract:1', provider_contract_digest: H('1'),
      object_id: 'object:b05:1', object_version_or_generation: 'v1', content_address_or_etag: 'etag:b05:1'
    },
    source_digest_sha256: H('2'), source_byte_length: 100, media_type: 'text/plain', rights_record_id: 'rights:b05:1', rights_record_digest: H('3'),
    intended_use_scope: 'BOOK_DIAGNOSIS', private_source_evidence_ref: null, private_source_evidence_digest: null,
    canonical_write_authority: false, author_decision_authority: false, publication_authority: false,
    source_acceptance_id: '', source_acceptance_digest: '', accepted_at: '2026-09-15T00:00:00.000Z'
  };
  r.source_acceptance_digest = source.sourceAcceptanceDigest(r);
  r.source_acceptance_id = source.SOURCE_PREFIX + r.source_acceptance_digest;
  source.validateSourceCustodyAcceptanceV1(r);
  return r;
}

function makeProjection(a) {
  const p = {
    projection_schema_version: source.PROJECTION_SCHEMA_VERSION, projection_id: '', projection_digest: '',
    source_acceptance_id: a.source_acceptance_id, source_acceptance_digest: a.source_acceptance_digest, source_digest_sha256: a.source_digest_sha256,
    extractor_identity: { provider_class: 'TEST_EXTRACTOR', provider_subject_ref: 'provider:extractor:1', provider_service_id: 'service:extract:1', provider_operation_id: 'operation:extract:1', provider_contract_ref: 'extract-contract:1', provider_contract_digest: H('4'), extractor_version: '1' },
    projection_artifact_ref: 'projection-artifact:1', projection_artifact_digest: H('5'), recovered_content_digest_sha256: H('6'), structure: [],
    metadata_ref_or_inline: null, citations_ref_or_inline: null, comments_ref_or_inline: null, todos_ref_or_inline: null, tracked_changes_ref_or_inline: null,
    story_bible_candidate_ref_or_inline: null, nonfiction_knowledge_candidate_ref_or_inline: null, voice_candidate_ref_or_inline: null, unit_evidence: []
  };
  p.projection_digest = source.projectionDigest(p);
  p.projection_id = source.PROJECTION_PREFIX + p.projection_digest;
  source.validateNormalizedSourceProjectionV1(p, a);
  return p;
}

function makeKnowledge() {
  const entity = { entity_id: 'ENTITY:B05:E1', entity_type: 'CHARACTER', aliases: [], source_anchor_ids: [], state_assertion_ids: [], status: 'ASSERTED', confidence: 0.8, provenance_refs: ['provenance:e1'], evidence_refs: [], depends_on_refs: [] };
  const k = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION, book_project_id: BOOK, knowledge_candidate_id: '', knowledge_digest: '', prior_story_bible_ref: null,
    source_subject_refs: [], source_acceptance_refs: [], projection_refs: [], manuscript_refs: [], calibration_policy_ref: 'calibration-policy:b05', calibration_policy_digest: H('8'),
    anchors: [], entities: [entity], events: [], temporal_claims: [], causal_goal_claims: [], state_assertions: [], character_knowledge_claims: [], relationships: [], arcs: [], motifs: [], themes: [], promises: [], setup_payoffs: [], open_questions: [], identity_lineage: [], standing: 'MATERIALIZED_NOT_CANONICAL'
  };
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  kb.validateStoryBibleKnowledgeV1(k);
  return k;
}

function makeB03Binding() {
  const knowledge = makeKnowledge();
  return {
    story_bible_ref: 'story-bible:b05:1', story_bible_digest: H('9'), current: true, knowledge,
    semantic_dependency_refs: [{ semantic_ref: 'ENTITY:B05:E1', semantic_digest: kb.sha256(knowledge.entities[0]) }]
  };
}

function makeReaderBinding() {
  const e = {
    exposure_schema_version: exposure.EXPOSURE_SCHEMA_VERSION, exposure_projection_id: null, exposure_projection_digest: null, book_project_id: BOOK,
    story_bible_ref: 'story-bible:reader:b05', story_bible_digest: H('a'), knowledge_candidate_id: 'book-story-bible-knowledge-v1:' + H('b'), knowledge_digest: H('b'),
    scope: { scope_kind: 'PASSAGE', scope_ref: 'reader-scope:b05', scope_digest: H('c') },
    reveal_frontier: { frontier_anchor_id: 'ANCHOR:reader:b05', frontier_ordinal: 0, frontier_anchor_digest: H('d') },
    visible_anchor_refs: ['ANCHOR:reader:b05'], visible_semantic_refs: {}, dependency_refs: ['dep:reader:b05'], standing: 'READY_FOR_OBSERVATION'
  };
  const es = clone(e); delete es.exposure_projection_id; delete es.exposure_projection_digest;
  e.exposure_projection_digest = kb.sha256(es); e.exposure_projection_id = exposure.EXPOSURE_PREFIX + e.exposure_projection_digest;
  exposure.validateReaderExposureProjectionV1(e);
  const u = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: e, observations: [] });
  const c = {
    currentness_schema_version: currentness.CURRENTNESS_SCHEMA_VERSION, currentness_id: null, currentness_digest: null, book_project_id: BOOK,
    exposure_projection_id: e.exposure_projection_id, exposure_projection_digest: e.exposure_projection_digest,
    understanding_projection_id: u.understanding_projection_id, understanding_projection_digest: u.understanding_projection_digest,
    dependency_snapshot: [], b03_invalidation_impact_ref: null, b03_invalidation_impact_digest: null,
    exposure_current: true, understanding_current: true, exposure_currentness_standing: 'CURRENT', understanding_currentness_standing: 'CURRENT', changed_dependencies: [], stale_dependency_kinds: [], recompute_exposure_required: false, recompute_understanding_required: false, canonical_effect: false
  };
  const cs = clone(c); delete cs.currentness_id; delete cs.currentness_digest;
  c.currentness_digest = kb.sha256(cs); c.currentness_id = currentness.CURRENTNESS_PREFIX + c.currentness_digest;
  currentness.validateReaderUnderstandingCurrentnessV1(c, e, u);
  return {
    exposure_projection: e, understanding_projection: u, currentness: c,
    evidence_refs: [{ evidence_kind: 'DIMENSION', evidence_ref: 'PCE013-DIM-001', projection_ref: u.understanding_projection_id, projection_digest: u.understanding_projection_digest }]
  };
}

function makeScope() { return { scope_kind: 'PASSAGE', scope_ref: 'scope:b05:1', scope_digest: H('7') }; }
function makeAnchor(a, scope) {
  const x = { anchor_ref: 'diagnostic-anchor:b05:1', anchor_digest: '', scope_ref: scope.scope_ref, scope_digest: scope.scope_digest, source_acceptance_ref: a.source_acceptance_id, source_acceptance_digest: a.source_acceptance_digest, ordinal: 0 };
  x.anchor_digest = ctx.literaryDiagnosticAnchorDigestV1(x);
  return x;
}

function makeContext({ lenses = ['B05-LENS-001'], b03 = false, b04 = false, voice = false, author = false } = {}) {
  const a = makeSourceAcceptance(); const scope = makeScope();
  const input = {
    book_project_id: BOOK,
    source_acceptance: a,
    source_currentness: { ref: a.source_acceptance_id, digest: a.source_acceptance_digest, current: true },
    normalized_source_projection: null, projection_currentness: null,
    scope, source_anchor_refs: [makeAnchor(a, scope)],
    story_bible_binding: b03 ? makeB03Binding() : null,
    reader_binding: b04 ? makeReaderBinding() : null,
    voice_evidence_refs: voice ? [{ evidence_ref: 'voice:b05:1', evidence_digest: H('e'), current: true }] : [],
    author_constraint_refs: author ? [{ evidence_ref: 'author-constraint:b05:1', evidence_digest: H('f'), current: true }] : [],
    literary_task_class: 'PASSAGE_DIAGNOSIS',
    purpose_hypothesis: { hypothesis: 'Establish movement while preserving project constraints.', uncertainty_standing: 'TENTATIVE', provenance_refs: ['purpose:prov:b05'], evidence_refs: ['purpose:evidence:b05'] },
    requested_lens_ids: lenses,
    craft_retrieval_policy: { policy_ref: 'craft-policy:b05:1', policy_digest: H('0'), current: true }
  };
  return ctx.buildLiteraryDiagnosticContextV1(input);
}

function sourceDeps(context) {
  return context.dependency_snapshot_refs.filter(x => ['B02_SOURCE_ACCEPTANCE','B05_SOURCE_ANCHOR'].includes(x.dependency_kind));
}
function allContextDeps(context) { return clone(context.dependency_snapshot_refs); }
function makeProviderAdmission() {
  return { provider_capability_id: 'BOOK.LITERARY.DIAGNOSE', provider_operation_id: 'DIAGNOSE_PASSAGE', provider_subject_ref: 'provider-subject:b05:1', provider_admission_ref: 'provider-admission:b05:1', provider_admission_digest: H('6'), current: true };
}
function makeObservationPayload(context, lensId, overrides = {}) {
  return {
    lens_id: lensId,
    finding_class: 'STRENGTH',
    target_anchor_refs: [context.source_anchor_refs[0].anchor_ref],
    evidence_refs: [{ evidence_ref: `evidence:${lensId}:1`, evidence_digest: H('5') }],
    upstream_dependency_refs: sourceDeps(context),
    source_class: 'DETERMINISTIC',
    evidence_strength_class: 'SUPPORTED',
    purpose_relevance_class: 'HIGH',
    preservation_risk_class: 'LOW',
    collateral_risk_class: 'LOW',
    related_observation_refs: [],
    external_owner_signal_refs: [],
    scope_limits: clone(context.scope),
    abstention_or_blocker_reason: null,
    standing: 'ACCEPTED_UNCALIBRATED',
    canonical_effect: false,
    ...overrides
  };
}

module.exports = { BOOK, H, clone, makeSourceAcceptance, makeProjection, makeKnowledge, makeB03Binding, makeReaderBinding, makeContext, sourceDeps, allContextDeps, makeProviderAdmission, makeObservationPayload };
