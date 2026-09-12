'use strict';

const kb = require('./book-story-bible-knowledge-v1');

const IMPACT_SCHEMA_VERSION = 'BOOK_KNOWLEDGE_INVALIDATION_IMPACT_V1';
const SUCCESSOR_SCHEMA_VERSION = 'BOOK_KNOWLEDGE_SUCCESSOR_RECONCILIATION_V1';
const INVALIDATION_SUBJECT_REF = 'BOOK.KNOWLEDGE.COMPUTE_STORY_BIBLE_INVALIDATION:v1:20260912';
const OPERATION_PREFIX = 'book-knowledge-invalidation-v1:';
const IMPACT_PREFIX = 'book-knowledge-invalidation-impact-v1:';
const SUCCESSOR_PREFIX = 'book-knowledge-successor-v1:';
const SHA256 = /^[a-f0-9]{64}$/;

const CHANGE_KINDS = new Set([
  'SOURCE_ACCEPTANCE',
  'PROJECTION',
  'MANUSCRIPT',
  'ANCHOR',
  'SEMANTIC_IDENTITY',
  'AUTHORITY_INVALIDATION'
]);

const REASON_BY_KIND = Object.freeze({
  SOURCE_ACCEPTANCE: 'SOURCE_ACCEPTANCE_CHANGED',
  PROJECTION: 'PROJECTION_CHANGED',
  MANUSCRIPT: 'MANUSCRIPT_CHANGED',
  ANCHOR: 'ANCHOR_CHANGED',
  SEMANTIC_IDENTITY: 'SEMANTIC_IDENTITY_SUPERSEDED',
  AUTHORITY_INVALIDATION: 'AUTHORITY_INVALIDATED'
});

const COLLECTIONS = [
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
];

class BookKnowledgeInvalidationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookKnowledgeInvalidationError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookKnowledgeInvalidationError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const field of fields) if (!Object.prototype.hasOwnProperty.call(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function str(v, label) { if (!text(v)) fail('REFERENCE_REQUIRED', label); }
function digest(v, label) { if (typeof v !== 'string' || !SHA256.test(v)) fail('INVALID_SHA256', label); }
function array(v, label) { if (!Array.isArray(v)) fail('ARRAY_REQUIRED', label); }
function stable(v) { return kb.stableStringify(v); }
function hash(v) { return kb.sha256(v); }
function sorted(values) { return [...new Set(values)].sort(); }

function semanticRecords(knowledge) {
  const out = new Map();
  for (const [collection, idField] of COLLECTIONS) {
    array(knowledge[collection], collection);
    for (const record of knowledge[collection]) {
      const id = record && record[idField];
      str(id, `${collection}.${idField}`);
      if (out.has(id)) fail('BLOCKED_REFERENCE_INTEGRITY', `duplicate:${id}`);
      out.set(id, { collection, idField, record });
    }
  }
  return out;
}

function operationSemantic(input) {
  const x = clone(input);
  delete x.invalidation_operation_id;
  delete x.invalidation_operation_digest;
  delete x.audit_metadata;
  delete x.transport_metadata;
  return x;
}
function invalidationOperationDigest(input) { return hash(operationSemantic(input)); }
function invalidationOperationId(inputOrDigest) {
  const d = typeof inputOrDigest === 'string' ? inputOrDigest : invalidationOperationDigest(inputOrDigest);
  return `${OPERATION_PREFIX}${d}`;
}
function sealInvalidationInputV1(input) {
  const out = clone(input);
  if (!out.invalidation_subject_ref) out.invalidation_subject_ref = INVALIDATION_SUBJECT_REF;
  out.invalidation_operation_digest = invalidationOperationDigest(out);
  out.invalidation_operation_id = invalidationOperationId(out.invalidation_operation_digest);
  return out;
}

function findBaseBinding(base, change, recordMap) {
  if (change.kind === 'SOURCE_ACCEPTANCE') {
    const x = base.source_acceptance_refs.find(v => v.source_acceptance_id === change.identity_ref);
    return x ? x.source_acceptance_digest : null;
  }
  if (change.kind === 'PROJECTION') {
    const x = base.projection_refs.find(v => v.projection_id === change.identity_ref);
    return x ? x.projection_digest : null;
  }
  if (change.kind === 'MANUSCRIPT') {
    const x = base.manuscript_refs.find(v => v.manuscript_ref === change.identity_ref);
    return x ? x.manuscript_digest : null;
  }
  if (change.kind === 'ANCHOR') {
    const x = base.anchors.find(v => v.anchor_id === change.identity_ref);
    return x ? x.span_sha256 : null;
  }
  const x = recordMap.get(change.identity_ref);
  return x ? hash(x.record) : null;
}

function validateChange(base, change, i, recordMap) {
  req(change, ['kind', 'identity_ref', 'prior_digest', 'current_digest', 'current_identity_ref'], `changed_identities.${i}`);
  if (!CHANGE_KINDS.has(change.kind)) fail('BLOCKED_INVALIDATION_REQUIRED', `kind:${change.kind}`);
  str(change.identity_ref, `changed_identities.${i}.identity_ref`);
  digest(change.prior_digest, `changed_identities.${i}.prior_digest`);
  if (change.current_digest !== null) digest(change.current_digest, `changed_identities.${i}.current_digest`);
  if (change.current_identity_ref !== null) str(change.current_identity_ref, `changed_identities.${i}.current_identity_ref`);
  const actual = findBaseBinding(base, change, recordMap);
  if (!actual || actual !== change.prior_digest) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', change.identity_ref);
  const identityChanged = change.current_identity_ref !== null && change.current_identity_ref !== change.identity_ref;
  const digestChanged = change.current_digest === null || change.current_digest !== change.prior_digest;
  if (!identityChanged && !digestChanged && change.kind !== 'AUTHORITY_INVALIDATION') fail('BLOCKED_INVALIDATION_REQUIRED', `unchanged:${change.identity_ref}`);
  if (change.kind === 'AUTHORITY_INVALIDATION' && !recordMap.has(change.identity_ref)) fail('BLOCKED_REFERENCE_INTEGRITY', change.identity_ref);
  if (change.kind === 'SEMANTIC_IDENTITY' && !recordMap.has(change.identity_ref)) fail('BLOCKED_REFERENCE_INTEGRITY', change.identity_ref);
}

function changeRef(change) {
  const nextIdentity = change.current_identity_ref === null ? change.identity_ref : change.current_identity_ref;
  const nextDigest = change.current_digest === null ? 'REMOVED' : change.current_digest;
  return `${change.kind}:${change.identity_ref}@${change.prior_digest}->${nextIdentity}@${nextDigest}`;
}

function staleAnchorsForChange(base, change) {
  if (change.kind === 'ANCHOR') return [change.identity_ref];
  if (change.kind === 'SOURCE_ACCEPTANCE') return base.anchors.filter(a => a.source_acceptance_id === change.identity_ref).map(a => a.anchor_id);
  if (change.kind === 'PROJECTION') return base.anchors.filter(a => a.projection_id === change.identity_ref).map(a => a.anchor_id);
  if (change.kind === 'MANUSCRIPT') return base.anchors.filter(a => a.manuscript_ref === change.identity_ref).map(a => a.anchor_id);
  return [];
}

function reverseDependencyGraph(recordMap) {
  const reverse = new Map();
  for (const [id, entry] of recordMap) {
    const deps = Array.isArray(entry.record.depends_on_refs) ? entry.record.depends_on_refs : [];
    for (const dep of deps) {
      if (!recordMap.has(dep)) continue;
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep).add(id);
    }
  }
  return reverse;
}

function directAffected(base, changes, recordMap) {
  const direct = new Set();
  const staleAnchors = new Set();
  for (const change of changes) {
    for (const anchorId of staleAnchorsForChange(base, change)) staleAnchors.add(anchorId);
    if (change.kind === 'SEMANTIC_IDENTITY' || change.kind === 'AUTHORITY_INVALIDATION') direct.add(change.identity_ref);
  }
  for (const [id, entry] of recordMap) {
    const anchors = Array.isArray(entry.record.source_anchor_ids) ? entry.record.source_anchor_ids : [];
    const deps = Array.isArray(entry.record.depends_on_refs) ? entry.record.depends_on_refs : [];
    if (anchors.some(a => staleAnchors.has(a)) || deps.some(a => staleAnchors.has(a))) direct.add(id);
  }
  return { direct, staleAnchors };
}

function propagate(direct, reverse) {
  const affected = new Set(direct);
  const transitive = new Set();
  const queue = [...direct].sort();
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    const next = [...(reverse.get(current) || [])].sort();
    for (const id of next) {
      if (affected.has(id)) continue;
      affected.add(id);
      transitive.add(id);
      queue.push(id);
    }
  }
  return { affected, transitive };
}

function cycleRefs(recordMap, affected) {
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = new Set();
  let nextIndex = 0;
  function visit(id) {
    index.set(id, nextIndex); low.set(id, nextIndex); nextIndex += 1;
    stack.push(id); onStack.add(id);
    const deps = (recordMap.get(id).record.depends_on_refs || []).filter(d => affected.has(d) && recordMap.has(d)).sort();
    for (const dep of deps) {
      if (!index.has(dep)) { visit(dep); low.set(id, Math.min(low.get(id), low.get(dep))); }
      else if (onStack.has(dep)) low.set(id, Math.min(low.get(id), index.get(dep)));
    }
    if (low.get(id) === index.get(id)) {
      const component = [];
      let member;
      do {
        member = stack.pop(); onStack.delete(member); component.push(member);
      } while (member !== id);
      const selfLoop = component.length === 1 && (recordMap.get(component[0]).record.depends_on_refs || []).includes(component[0]);
      if (component.length > 1 || selfLoop) component.forEach(x => cycles.add(x));
    }
  }
  for (const id of [...affected].sort()) if (!index.has(id)) visit(id);
  return [...cycles].sort();
}

function invalidateRecord(record, reasonCodes) {
  const out = clone(record);
  const prior = out.status;
  out.status = 'INVALIDATED';
  out.invalidation = { prior_status: prior, reason_codes: sorted(reasonCodes) };
  return out;
}

function successorSemantic(successor) {
  const x = clone(successor);
  delete x.successor_candidate_id;
  delete x.successor_candidate_digest;
  return x;
}
function successorDigest(successor) { return hash(successorSemantic(successor)); }
function impactSemantic(impact) {
  const x = clone(impact);
  delete x.impact_id;
  delete x.impact_digest;
  return x;
}
function impactDigest(impact) { return hash(impactSemantic(impact)); }

function buildSuccessor(base, input, affected, staleAnchors, reasonCodes) {
  const knowledge = clone(base);
  knowledge.prior_story_bible_ref = input.base_story_bible_ref;
  for (const [collection, idField] of COLLECTIONS) {
    knowledge[collection] = knowledge[collection].map(record => affected.has(record[idField]) ? invalidateRecord(record, reasonCodes) : clone(record));
  }
  knowledge.standing = staleAnchors.size ? 'BLOCKED_STALE' : 'MATERIALIZED_NOT_CANONICAL';
  knowledge.knowledge_digest = kb.knowledgeDigest(knowledge);
  knowledge.knowledge_candidate_id = kb.knowledgeCandidateId(knowledge.knowledge_digest);
  try {
    kb.validateStoryBibleKnowledgeV1(knowledge, { expected_book_project_id: input.book_project_id, prior_knowledge: base });
  } catch (err) {
    fail('BLOCKED_GRAPH_INTEGRITY', `${err.code || err.name}:${err.detail || ''}`);
  }
  const successor = {
    successor_schema_version: SUCCESSOR_SCHEMA_VERSION,
    successor_candidate_id: '',
    successor_candidate_digest: '',
    base_story_bible_ref: input.base_story_bible_ref,
    base_knowledge_candidate_id: base.knowledge_candidate_id,
    base_knowledge_digest: base.knowledge_digest,
    proposed_knowledge_candidate_id: knowledge.knowledge_candidate_id,
    proposed_knowledge_digest: knowledge.knowledge_digest,
    stale_anchor_refs: [...staleAnchors].sort(),
    invalidated_record_refs: [...affected].sort(),
    preserved_record_refs: [...semanticRecords(base).keys()].filter(id => !affected.has(id)).sort(),
    proposed_knowledge: knowledge,
    canonical_write_performed: false
  };
  successor.successor_candidate_digest = successorDigest(successor);
  successor.successor_candidate_id = `${SUCCESSOR_PREFIX}${successor.successor_candidate_digest}`;
  return successor;
}

function validateInput(input) {
  req(input, ['invalidation_operation_id', 'invalidation_operation_digest', 'invalidation_subject_ref', 'book_project_id', 'base_story_bible_ref', 'base_story_bible_digest', 'base_knowledge', 'changed_identities'], 'invalidation');
  if (input.invalidation_subject_ref !== INVALIDATION_SUBJECT_REF) fail('BLOCKED_REFERENCE_INTEGRITY', 'subject_ref');
  str(input.book_project_id, 'book_project_id'); str(input.base_story_bible_ref, 'base_story_bible_ref'); digest(input.base_story_bible_digest, 'base_story_bible_digest');
  digest(input.invalidation_operation_digest, 'invalidation_operation_digest');
  if (input.invalidation_operation_digest !== invalidationOperationDigest(input) || input.invalidation_operation_id !== invalidationOperationId(input.invalidation_operation_digest)) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'invalidation_operation');
  array(input.changed_identities, 'changed_identities');
  if (!input.changed_identities.length) fail('BLOCKED_INVALIDATION_REQUIRED', 'changed_identities');
  try { kb.validateStoryBibleKnowledgeV1(input.base_knowledge, { expected_book_project_id: input.book_project_id }); }
  catch (err) { fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', `${err.code || err.name}:${err.detail || ''}`); }
  const recordMap = semanticRecords(input.base_knowledge);
  input.changed_identities.forEach((change, i) => validateChange(input.base_knowledge, change, i, recordMap));
  const refs = input.changed_identities.map(changeRef);
  if (new Set(refs).size !== refs.length) fail('BLOCKED_REFERENCE_INTEGRITY', 'duplicate_change');
  return recordMap;
}

function computeStoryBibleInvalidationImpactV1(input) {
  const baseSnapshot = stable(input.base_knowledge);
  const recordMap = validateInput(input);
  const reverse = reverseDependencyGraph(recordMap);
  const { direct, staleAnchors } = directAffected(input.base_knowledge, input.changed_identities, recordMap);
  const { affected, transitive } = propagate(direct, reverse);
  const allRefs = [...recordMap.keys()].sort();
  const unaffected = allRefs.filter(id => !affected.has(id));
  const cycles = cycleRefs(recordMap, affected);
  const reasonCodes = sorted(input.changed_identities.map(change => REASON_BY_KIND[change.kind]));
  const successor = buildSuccessor(input.base_knowledge, input, affected, staleAnchors, reasonCodes);
  const impact = {
    impact_schema_version: IMPACT_SCHEMA_VERSION,
    impact_id: '',
    impact_digest: '',
    invalidation_operation_id: input.invalidation_operation_id,
    invalidation_operation_digest: input.invalidation_operation_digest,
    base_story_bible_ref: input.base_story_bible_ref,
    base_story_bible_digest: input.base_story_bible_digest,
    base_knowledge_candidate_id: input.base_knowledge.knowledge_candidate_id,
    base_knowledge_digest: input.base_knowledge.knowledge_digest,
    changed_identity_refs: input.changed_identities.map(changeRef).sort(),
    directly_affected_refs: [...direct].sort(),
    transitively_affected_refs: [...transitive].filter(id => !direct.has(id)).sort(),
    unaffected_refs: unaffected,
    cycle_refs: cycles,
    reason_codes: reasonCodes,
    proposed_successor_candidate_ref: successor.successor_candidate_id,
    proposed_successor_candidate_digest: successor.successor_candidate_digest,
    canonical_write_performed: false,
    historical_story_bible_mutated: false
  };
  impact.impact_digest = impactDigest(impact);
  impact.impact_id = `${IMPACT_PREFIX}${impact.impact_digest}`;
  if (stable(input.base_knowledge) !== baseSnapshot) fail('BLOCKED_GRAPH_INTEGRITY', 'historical_mutation');
  return {
    result: 'INVALIDATION_COMPUTED',
    impact,
    successor,
    canonical_effect: false,
    historical_story_bible_mutated: false,
    b01_registry_modified: false,
    author_decision_synthesized: false,
    historical_pass_transferred: 0,
    canonical_admission_implemented: false
  };
}

function validateInvalidationImpactV1(result) {
  req(result, ['impact', 'successor'], 'result');
  const impact = result.impact;
  req(impact, ['impact_schema_version', 'impact_id', 'impact_digest', 'base_story_bible_ref', 'changed_identity_refs', 'directly_affected_refs', 'transitively_affected_refs', 'unaffected_refs', 'cycle_refs', 'reason_codes', 'proposed_successor_candidate_ref', 'proposed_successor_candidate_digest', 'canonical_write_performed', 'historical_story_bible_mutated'], 'impact');
  if (impact.impact_schema_version !== IMPACT_SCHEMA_VERSION) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', 'impact_schema');
  if (impact.impact_digest !== impactDigest(impact) || impact.impact_id !== `${IMPACT_PREFIX}${impact.impact_digest}`) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'impact');
  const successor = result.successor;
  if (successor.successor_schema_version !== SUCCESSOR_SCHEMA_VERSION || successor.successor_candidate_digest !== successorDigest(successor) || successor.successor_candidate_id !== `${SUCCESSOR_PREFIX}${successor.successor_candidate_digest}`) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'successor');
  if (impact.proposed_successor_candidate_ref !== successor.successor_candidate_id || impact.proposed_successor_candidate_digest !== successor.successor_candidate_digest) fail('BLOCKED_REFERENCE_INTEGRITY', 'successor_binding');
  const parts = [...impact.directly_affected_refs, ...impact.transitively_affected_refs, ...impact.unaffected_refs];
  if (new Set(parts).size !== parts.length) fail('BLOCKED_GRAPH_INTEGRITY', 'impact_partition_overlap');
  if (impact.canonical_write_performed !== false || impact.historical_story_bible_mutated !== false || successor.canonical_write_performed !== false) fail('BLOCKED_GRAPH_INTEGRITY', 'forbidden_effect');
  return true;
}

module.exports = {
  BookKnowledgeInvalidationError,
  IMPACT_SCHEMA_VERSION,
  SUCCESSOR_SCHEMA_VERSION,
  INVALIDATION_SUBJECT_REF,
  invalidationOperationDigest,
  invalidationOperationId,
  sealInvalidationInputV1,
  impactDigest,
  successorDigest,
  computeStoryBibleInvalidationImpactV1,
  validateInvalidationImpactV1
};