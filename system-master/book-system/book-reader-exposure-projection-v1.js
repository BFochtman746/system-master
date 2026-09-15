'use strict';

const kb = require('./book-story-bible-knowledge-v1');

const EXPOSURE_SCHEMA_VERSION = 'BOOK_READER_EXPOSURE_V1';
const EXPOSURE_PREFIX = 'book-reader-exposure-v1:';
const SCOPE_KINDS = new Set(['PASSAGE', 'SCENE', 'CHAPTER']);
const ELIGIBLE_STANDINGS = new Set(['READY_FOR_GOVERNED_ADMISSION', 'MATERIALIZED_NOT_CANONICAL']);
const SHA256 = /^[a-f0-9]{64}$/;

const COLLECTIONS = Object.freeze([
  ['entities', 'entity_id'],
  ['events', 'event_id'],
  ['temporal_claims', 'temporal_claim_id'],
  ['causal_goal_claims', 'causal_goal_claim_id'],
  ['state_assertions', 'state_assertion_id'],
  ['character_knowledge_claims', 'knowledge_claim_id'],
  ['relationships', 'relationship_id'],
  ['arcs', 'arc_id'],
  ['motifs', 'motif_id'],
  ['themes', 'theme_id'],
  ['promises', 'promise_id'],
  ['setup_payoffs', 'setup_payoff_id'],
  ['open_questions', 'open_question_id']
]);

class BookReaderExposureError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookReaderExposureError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookReaderExposureError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function hash(v) { return kb.sha256(v); }
function sorted(values) { return [...new Set(values)].sort(); }

function req(v, fields, label) {
  if (!obj(v)) fail('BLOCKED_KNOWLEDGE_INVALID', `${label}:OBJECT_REQUIRED`);
  for (const field of fields) if (!Object.prototype.hasOwnProperty.call(v, field)) fail('BLOCKED_KNOWLEDGE_INVALID', `${label}.${field}`);
}

function assertNoRawText(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((x, i) => assertNoRawText(x, `${path}[${i}]`));
  if (!obj(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (/raw.*(?:manuscript|source|document|text|bytes)/i.test(key) || /quoted.*text/i.test(key) || /full.*text/i.test(key)) {
      fail('BLOCKED_RAW_TEXT_FORBIDDEN', `${path}.${key}`);
    }
    assertNoRawText(child, `${path}.${key}`);
  }
}

function anchorDigestV1(anchor) {
  return hash({
    anchor_id: anchor.anchor_id,
    source_acceptance_id: anchor.source_acceptance_id,
    source_acceptance_digest: anchor.source_acceptance_digest,
    projection_id: anchor.projection_id,
    projection_digest: anchor.projection_digest,
    manuscript_ref: anchor.manuscript_ref,
    unit_ref: anchor.unit_ref,
    ordinal: anchor.ordinal,
    span_start: anchor.span_start,
    span_end: anchor.span_end,
    span_sha256: anchor.span_sha256,
    source_current: anchor.source_current,
    provenance_refs: sorted(anchor.provenance_refs || [])
  });
}

function validateScope(scope) {
  if (!obj(scope) || !SCOPE_KINDS.has(scope.scope_kind) || !text(scope.scope_ref) || !digest(scope.scope_digest)) {
    fail('BLOCKED_SCOPE_INVALID');
  }
}

function validateStoryBibleBinding(binding, knowledge) {
  if (!obj(binding) || !text(binding.story_bible_ref) || !digest(binding.story_bible_digest) || binding.current !== true) {
    fail('BLOCKED_STORY_BIBLE_BINDING_MISMATCH');
  }
  if (binding.knowledge_candidate_id !== knowledge.knowledge_candidate_id || binding.knowledge_digest !== knowledge.knowledge_digest) {
    fail('BLOCKED_STORY_BIBLE_BINDING_MISMATCH', 'knowledge');
  }
}

function validateKnowledge(knowledge) {
  assertNoRawText(knowledge, 'knowledge');
  try { kb.validateStoryBibleKnowledgeV1(knowledge); }
  catch (err) { fail('BLOCKED_KNOWLEDGE_INVALID', err && err.code ? err.code : err && err.message ? err.message : 'INVALID'); }
  if (!ELIGIBLE_STANDINGS.has(knowledge.standing)) fail('BLOCKED_KNOWLEDGE_INVALID', `standing:${knowledge.standing}`);
}

function semanticIndex(knowledge) {
  const map = new Map();
  for (const [collection, idField] of COLLECTIONS) {
    const list = knowledge[collection] || [];
    for (const record of list) map.set(record[idField], { collection, idField, record });
  }
  return map;
}

function pushRef(out, value) {
  if (typeof value === 'string' && value.length) out.add(value);
}
function pushRefs(out, values) {
  if (Array.isArray(values)) values.forEach(v => pushRef(out, v));
}

function typedSemanticDependencies(entry, semanticIds) {
  const r = entry.record;
  const refs = new Set();
  pushRefs(refs, r.depends_on_refs);
  switch (entry.collection) {
    case 'entities': break;
    case 'events': pushRefs(refs, r.participant_entity_ids); break;
    case 'temporal_claims': pushRef(refs, r.subject_ref); pushRef(refs, r.object_ref); break;
    case 'causal_goal_claims': pushRef(refs, r.subject_ref); pushRef(refs, r.object_ref); break;
    case 'state_assertions':
      pushRef(refs, r.subject_ref); pushRef(refs, r.valid_from_event_ref); break;
    case 'character_knowledge_claims':
      pushRef(refs, r.character_entity_id); pushRef(refs, r.object_ref); pushRefs(refs, r.exposure_event_refs); break;
    case 'relationships': pushRefs(refs, r.participant_entity_ids); break;
    case 'arcs': pushRefs(refs, r.subject_refs); break;
    case 'motifs': break;
    case 'themes': break;
    case 'promises': pushRefs(refs, r.introduced_event_refs); break;
    case 'setup_payoffs': pushRefs(refs, r.setup_event_refs); break;
    case 'open_questions': pushRefs(refs, r.introduced_event_refs); break;
  }
  return sorted([...refs].filter(ref => semanticIds.has(ref)));
}

function directAnchorDependencies(entry) {
  const refs = new Set(entry.record.source_anchor_ids || []);
  if (entry.collection === 'motifs') pushRefs(refs, entry.record.occurrence_anchor_ids);
  return sorted(refs);
}

function buildReaderExposureProjectionV1(input) {
  req(input, ['knowledge', 'story_bible_binding', 'scope', 'reveal_frontier'], 'input');
  validateKnowledge(input.knowledge);
  validateStoryBibleBinding(input.story_bible_binding, input.knowledge);
  validateScope(input.scope);
  const frontier = input.reveal_frontier;
  if (!obj(frontier) || !text(frontier.frontier_anchor_id) || !Number.isInteger(frontier.frontier_ordinal) || frontier.frontier_ordinal < 0 || !digest(frontier.frontier_anchor_digest)) {
    fail('BLOCKED_FRONTIER_UNRESOLVED');
  }
  const anchors = new Map(input.knowledge.anchors.map(a => [a.anchor_id, a]));
  const frontierAnchor = anchors.get(frontier.frontier_anchor_id);
  if (!frontierAnchor) fail('BLOCKED_FRONTIER_UNRESOLVED', frontier.frontier_anchor_id);
  if (frontierAnchor.ordinal !== frontier.frontier_ordinal || anchorDigestV1(frontierAnchor) !== frontier.frontier_anchor_digest) {
    fail('BLOCKED_FRONTIER_BINDING_MISMATCH', frontier.frontier_anchor_id);
  }

  const visibleAnchors = new Set();
  for (const anchor of input.knowledge.anchors) {
    if (anchor.source_current === true && anchor.ordinal <= frontier.frontier_ordinal) visibleAnchors.add(anchor.anchor_id);
  }
  if (!visibleAnchors.has(frontier.frontier_anchor_id)) fail('BLOCKED_FRONTIER_BINDING_MISMATCH', 'not_visible');

  const index = semanticIndex(input.knowledge);
  const semanticIds = new Set(index.keys());
  const memo = new Map();
  const visiting = new Set();

  function eligible(id) {
    if (memo.has(id)) return memo.get(id);
    const entry = index.get(id);
    if (!entry) return false;
    if (visiting.has(id)) fail('BLOCKED_FUTURE_TEXT_LEAKAGE', `dependency_cycle:${id}`);
    visiting.add(id);
    const directAnchors = directAnchorDependencies(entry);
    const semanticDeps = typedSemanticDependencies(entry, semanticIds);
    const anchorsVisible = directAnchors.every(a => visibleAnchors.has(a));
    const depsVisible = semanticDeps.every(dep => eligible(dep));
    const hasVisibleBasis = directAnchors.some(a => visibleAnchors.has(a)) || semanticDeps.some(dep => memo.get(dep) === true);
    const result = anchorsVisible && depsVisible && hasVisibleBasis;
    visiting.delete(id);
    memo.set(id, result);
    return result;
  }

  const visibleSemanticRefs = {};
  const dependencyRefs = new Set([
    `knowledge:${input.knowledge.knowledge_candidate_id}@${input.knowledge.knowledge_digest}`,
    `story_bible:${input.story_bible_binding.story_bible_ref}@${input.story_bible_binding.story_bible_digest}`,
    `scope:${input.scope.scope_kind}:${input.scope.scope_ref}@${input.scope.scope_digest}`,
    `frontier:${frontier.frontier_anchor_id}@${frontier.frontier_anchor_digest}:${frontier.frontier_ordinal}`
  ]);

  for (const [collection, idField] of COLLECTIONS) {
    const visible = [];
    for (const record of input.knowledge[collection] || []) {
      const id = record[idField];
      if (!eligible(id)) continue;
      visible.push(id);
      directAnchorDependencies(index.get(id)).filter(a => visibleAnchors.has(a)).forEach(a => dependencyRefs.add(`anchor:${a}@${anchorDigestV1(anchors.get(a))}`));
      typedSemanticDependencies(index.get(id), semanticIds).filter(dep => eligible(dep)).forEach(dep => dependencyRefs.add(`semantic:${dep}`));
    }
    if (visible.length) visibleSemanticRefs[collection] = visible.sort();
  }

  const output = {
    exposure_schema_version: EXPOSURE_SCHEMA_VERSION,
    exposure_projection_id: null,
    exposure_projection_digest: null,
    book_project_id: input.knowledge.book_project_id,
    story_bible_ref: input.story_bible_binding.story_bible_ref,
    story_bible_digest: input.story_bible_binding.story_bible_digest,
    knowledge_candidate_id: input.knowledge.knowledge_candidate_id,
    knowledge_digest: input.knowledge.knowledge_digest,
    scope: clone(input.scope),
    reveal_frontier: clone(frontier),
    visible_anchor_refs: [...visibleAnchors].sort(),
    visible_semantic_refs: visibleSemanticRefs,
    dependency_refs: [...dependencyRefs].sort(),
    standing: 'READY_FOR_OBSERVATION'
  };
  const semantic = clone(output);
  delete semantic.exposure_projection_id;
  delete semantic.exposure_projection_digest;
  const d = hash(semantic);
  output.exposure_projection_digest = d;
  output.exposure_projection_id = `${EXPOSURE_PREFIX}${d}`;
  assertNoRawText(output, 'output');
  return output;
}

function validateReaderExposureProjectionV1(projection) {
  req(projection, ['exposure_schema_version','exposure_projection_id','exposure_projection_digest','book_project_id','story_bible_ref','story_bible_digest','knowledge_candidate_id','knowledge_digest','scope','reveal_frontier','visible_anchor_refs','visible_semantic_refs','dependency_refs','standing'], 'projection');
  if (projection.exposure_schema_version !== EXPOSURE_SCHEMA_VERSION) fail('BLOCKED_KNOWLEDGE_INVALID', 'schema');
  validateScope(projection.scope);
  if (!digest(projection.story_bible_digest) || !digest(projection.knowledge_digest) || !digest(projection.exposure_projection_digest)) fail('BLOCKED_DIGEST_MISMATCH');
  const semantic = clone(projection);
  delete semantic.exposure_projection_id;
  delete semantic.exposure_projection_digest;
  const d = hash(semantic);
  if (d !== projection.exposure_projection_digest || projection.exposure_projection_id !== `${EXPOSURE_PREFIX}${d}`) fail('BLOCKED_DIGEST_MISMATCH');
  if (projection.standing !== 'READY_FOR_OBSERVATION') fail('BLOCKED_CURRENTNESS_REQUIRED');
  assertNoRawText(projection, 'projection');
  return true;
}

module.exports = {
  BookReaderExposureError,
  EXPOSURE_SCHEMA_VERSION,
  EXPOSURE_PREFIX,
  SCOPE_KINDS,
  anchorDigestV1,
  buildReaderExposureProjectionV1,
  validateReaderExposureProjectionV1
};