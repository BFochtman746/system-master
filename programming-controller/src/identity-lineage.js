'use strict';

const crypto = require('crypto');
const { IdentityError, uuidVersion } = require('./identity');

const DECISION_TYPES = Object.freeze(['EQUIVALENT', 'SUPERSEDE', 'REPLACE', 'MERGE', 'SPLIT', 'DERIVE']);
const LINEAGE_TYPES = Object.freeze(['SUPERSEDED_BY', 'REPLACED_BY', 'MERGED_INTO', 'SPLIT_INTO', 'DERIVED_INTO']);
const SUCCESSOR_TYPES = new Set(['SUPERSEDED_BY', 'REPLACED_BY', 'MERGED_INTO', 'SPLIT_INTO']);

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const req = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('INCOMPLETE_INPUT', `${field} must be a non-empty string`, { field });
  return value;
};
const canonicalId = (value, field = 'entity_id') => {
  const id = req(value, field).toLowerCase();
  try { uuidVersion(id); } catch (_) { throw new IdentityError('INVALID_CANONICAL_ID', `${field} must be a canonical UUID`, { field, value }); }
  return id;
};
const stableId = (prefix, parts) => `${prefix}:sha256:${crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex')}`;
const nowIso = (clock) => new Date(clock()).toISOString();

class IdentityLifecycleRegistry {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.identities = new Map();
  }

  register({ entity_id, entity_kind, scope, owner_authority_ref, created_at = null, attributes = {} }) {
    const id = canonicalId(entity_id);
    if (this.identities.has(id)) {
      throw new IdentityError('IDENTITY_REASSIGNMENT_FORBIDDEN', 'Canonical entity ID is permanently reserved and cannot be reassigned', { entity_id: id });
    }
    const record = freeze({
      entity_id: id,
      entity_kind: req(entity_kind, 'entity_kind'),
      scope: req(scope, 'scope'),
      owner_authority_ref: req(owner_authority_ref, 'owner_authority_ref'),
      lifecycle: 'ACTIVE',
      created_at: created_at || nowIso(this.clock),
      ended_at: null,
      terminal_decision_id: null,
      successor_entity_ids: [],
      attributes: clone(attributes),
      persistence_standing: 'NOT_PERSISTED'
    });
    this.identities.set(id, record);
    return record;
  }

  get(entity_id) {
    const id = canonicalId(entity_id);
    const value = this.identities.get(id);
    if (!value) throw new IdentityError('UNKNOWN_ENTITY', 'Canonical identity is not registered', { entity_id: id });
    return value;
  }

  has(entity_id) {
    try { return this.identities.has(canonicalId(entity_id)); } catch (_) { return false; }
  }

  transitionTerminal(entity_id, { lifecycle, decision_id = null, successor_entity_ids = [], effective_at = null } = {}) {
    const id = canonicalId(entity_id);
    const current = this.get(id);
    if (!['RETIRED', 'TOMBSTONED', 'SUPERSEDED'].includes(lifecycle)) throw new IdentityError('INVALID_LIFECYCLE', 'Unsupported terminal lifecycle', { lifecycle });
    if (current.lifecycle !== 'ACTIVE') throw new IdentityError('STALE_BASE', 'Identity is already terminal', { entity_id: id, lifecycle: current.lifecycle });
    const successors = [...new Set(successor_entity_ids.map((candidate) => canonicalId(candidate, 'successor_entity_id')))].sort();
    for (const successor of successors) this.get(successor);
    const updated = freeze({
      ...current,
      lifecycle,
      ended_at: effective_at || nowIso(this.clock),
      terminal_decision_id: decision_id,
      successor_entity_ids: successors
    });
    this.identities.set(id, updated);
    return updated;
  }

  retire(entity_id, { tombstone = false, effective_at = null } = {}) {
    return this.transitionTerminal(entity_id, { lifecycle: tombstone ? 'TOMBSTONED' : 'RETIRED', effective_at });
  }

  list() {
    return freeze([...this.identities.values()].sort((a, b) => a.entity_id.localeCompare(b.entity_id)));
  }
}

class IdentityCorrelationService {
  constructor({ identityRegistry, clock = () => Date.now(), max_evidence_refs = 64 } = {}) {
    if (!identityRegistry) throw new IdentityError('IDENTITY_REGISTRY_REQUIRED', 'identityRegistry required');
    if (!Number.isInteger(max_evidence_refs) || max_evidence_refs <= 0) throw new IdentityError('INVALID_CONFIGURATION', 'max_evidence_refs must be positive integer');
    this.identities = identityRegistry;
    this.clock = clock;
    this.maxEvidenceRefs = max_evidence_refs;
    this.correlations = new Map();
  }

  propose({ correlation_id = null, left_entity_id, right_entity_id, method, confidence = null, evidence_refs, method_version = null, model_ref = null, metadata = {} }) {
    const left = canonicalId(left_entity_id, 'left_entity_id');
    const right = canonicalId(right_entity_id, 'right_entity_id');
    if (left === right) throw new IdentityError('CORRELATION_INVALID', 'Correlation endpoints must be distinct canonical identities');
    this.identities.get(left);
    this.identities.get(right);
    req(method, 'method');
    if (confidence !== null && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) throw new IdentityError('CORRELATION_INVALID', 'confidence must be null or between 0 and 1');
    if (!Array.isArray(evidence_refs) || evidence_refs.length === 0 || evidence_refs.length > this.maxEvidenceRefs) throw new IdentityError('CORRELATION_UNCERTAIN', 'Correlation requires bounded non-empty evidence_refs');
    const refs = evidence_refs.map((ref) => req(ref, 'evidence_ref'));
    const created = nowIso(this.clock);
    const resolvedId = correlation_id || stableId('correlation', [left, right, method, method_version || '', created]);
    if (this.correlations.has(resolvedId)) throw new IdentityError('CORRELATION_EXISTS', 'correlation_id already exists', { correlation_id: resolvedId });
    const record = freeze({
      correlation_id: resolvedId,
      left_entity_id: left,
      right_entity_id: right,
      method,
      method_version,
      confidence,
      model_ref,
      evidence_refs: refs.slice(),
      metadata: clone(metadata),
      standing: 'CANDIDATE_ONLY',
      authoritative_equivalence: false,
      adjudication_decision_id: null,
      created_at: created,
      persistence_standing: 'NOT_PERSISTED'
    });
    this.correlations.set(resolvedId, record);
    return record;
  }

  get(correlation_id) {
    const value = this.correlations.get(req(correlation_id, 'correlation_id'));
    if (!value) throw new IdentityError('CORRELATION_UNKNOWN', 'Correlation not found', { correlation_id });
    return value;
  }

  markAdjudicated(correlation_id, decision_id) {
    const current = this.get(correlation_id);
    if (current.adjudication_decision_id && current.adjudication_decision_id !== decision_id) throw new IdentityError('STALE_BASE', 'Correlation already adjudicated by another decision', { correlation_id, prior_decision_id: current.adjudication_decision_id });
    const updated = freeze({ ...current, standing: 'ADJUDICATED', adjudication_decision_id: decision_id });
    this.correlations.set(correlation_id, updated);
    return updated;
  }
}

class IdentityLineageGraph {
  constructor({ identityRegistry, clock = () => Date.now() } = {}) {
    if (!identityRegistry) throw new IdentityError('IDENTITY_REGISTRY_REQUIRED', 'identityRegistry required');
    this.identities = identityRegistry;
    this.clock = clock;
    this.edges = new Map();
  }

  #successorAdjacency(extraEdge = null) {
    const adjacency = new Map();
    const all = [...this.edges.values(), ...(extraEdge ? [extraEdge] : [])].filter((edge) => SUCCESSOR_TYPES.has(edge.lineage_type));
    for (const edge of all) {
      if (!adjacency.has(edge.from_entity_id)) adjacency.set(edge.from_entity_id, []);
      adjacency.get(edge.from_entity_id).push(edge.to_entity_id);
    }
    return adjacency;
  }

  #wouldCreateSuccessorCycle(edge) {
    if (!SUCCESSOR_TYPES.has(edge.lineage_type)) return false;
    const adjacency = this.#successorAdjacency(edge);
    const target = edge.from_entity_id;
    const stack = [edge.to_entity_id];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (node === target) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of adjacency.get(node) || []) stack.push(next);
    }
    return false;
  }

  addEdge({ edge_id = null, lineage_type, from_entity_id, to_entity_id, decision_id, effective_at = null, metadata = {} }) {
    if (!LINEAGE_TYPES.includes(lineage_type)) throw new IdentityError('FORBIDDEN_LINEAGE', 'Unsupported lineage type', { lineage_type });
    const from = canonicalId(from_entity_id, 'from_entity_id');
    const to = canonicalId(to_entity_id, 'to_entity_id');
    if (from === to) throw new IdentityError('FORBIDDEN_LINEAGE', 'Lineage self-edge is forbidden', { entity_id: from, lineage_type });
    this.identities.get(from);
    this.identities.get(to);
    const decision = req(decision_id, 'decision_id');
    const resolvedId = edge_id || stableId('lineage', [lineage_type, from, to, decision]);
    if (this.edges.has(resolvedId)) throw new IdentityError('FORBIDDEN_LINEAGE', 'lineage edge already exists', { edge_id: resolvedId });
    const edge = freeze({
      edge_id: resolvedId,
      lineage_type,
      from_entity_id: from,
      to_entity_id: to,
      decision_id: decision,
      effective_at: effective_at || nowIso(this.clock),
      metadata: clone(metadata),
      persistence_standing: 'NOT_PERSISTED'
    });
    if (this.#wouldCreateSuccessorCycle(edge)) throw new IdentityError('FORBIDDEN_LINEAGE', 'Successor lineage would create a cycle', { lineage_type, from_entity_id: from, to_entity_id: to });
    this.edges.set(resolvedId, edge);
    return edge;
  }

  getLineage(entity_id) {
    const id = canonicalId(entity_id);
    this.identities.get(id);
    return freeze([...this.edges.values()].filter((edge) => edge.from_entity_id === id || edge.to_entity_id === id).sort((a, b) => a.edge_id.localeCompare(b.edge_id)));
  }

  traceSuccessors(entity_id, { max_nodes = 256 } = {}) {
    const start = canonicalId(entity_id);
    this.identities.get(start);
    if (!Number.isInteger(max_nodes) || max_nodes <= 0) throw new IdentityError('RESOURCE_LIMIT', 'max_nodes must be positive integer');
    const adjacency = this.#successorAdjacency();
    const queue = [start];
    const visited = new Set([start]);
    const edges = [];
    let truncated = false;
    while (queue.length) {
      const current = queue.shift();
      for (const next of (adjacency.get(current) || []).sort()) {
        const matching = [...this.edges.values()].filter((edge) => SUCCESSOR_TYPES.has(edge.lineage_type) && edge.from_entity_id === current && edge.to_entity_id === next);
        edges.push(...matching);
        if (!visited.has(next)) {
          if (visited.size >= max_nodes) { truncated = true; continue; }
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return freeze({ start_entity_id: start, entity_ids: [...visited].sort(), edges: edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id)), truncated });
  }
}

class IdentityAdjudicationService {
  constructor({ identityRegistry, correlationService, lineageGraph, policyPort, clock = () => Date.now() } = {}) {
    if (!identityRegistry || !correlationService || !lineageGraph) throw new IdentityError('ADJUDICATION_DEPENDENCY_REQUIRED', 'identity registry, correlation service and lineage graph required');
    if (!policyPort || typeof policyPort.authorizeDecision !== 'function') throw new IdentityError('POLICY_UNAVAILABLE', 'IdentityPolicyPort.authorizeDecision is required');
    this.identities = identityRegistry;
    this.correlations = correlationService;
    this.lineage = lineageGraph;
    this.policy = policyPort;
    this.clock = clock;
    this.decisions = new Map();
  }

  #authorize(request) {
    let decision;
    try { decision = this.policy.authorizeDecision(clone(request)); }
    catch (error) { throw new IdentityError('POLICY_UNAVAILABLE', 'Owning-domain identity policy unavailable', { cause: error?.message || String(error) }); }
    if (!(decision === true || decision?.allowed === true)) throw new IdentityError('OWNER_REQUIRED', 'Owning semantic domain did not authorize identity decision', { reason: decision?.reason || null });
    return decision === true ? { allowed: true } : decision;
  }

  #checkActive(ids) {
    return ids.map((id) => {
      const identity = this.identities.get(id);
      if (identity.lifecycle !== 'ACTIVE') throw new IdentityError('STALE_BASE', 'Identity decision requires active predecessor/successor subject', { entity_id: identity.entity_id, lifecycle: identity.lifecycle });
      return identity;
    });
  }

  adjudicate({ decision_id, decision_type, owner_authority_ref, actor_ref, rationale, evidence_refs, predecessor_entity_ids = [], successor_entity_ids = [], correlation_ids = [], effective_at = null, metadata = {} }) {
    const id = req(decision_id, 'decision_id');
    if (this.decisions.has(id)) throw new IdentityError('STALE_BASE', 'decision_id already exists', { decision_id: id });
    if (!DECISION_TYPES.includes(decision_type)) throw new IdentityError('INVALID_DECISION', 'Unsupported identity decision type', { decision_type });
    const owner = req(owner_authority_ref, 'owner_authority_ref');
    const actor = req(actor_ref, 'actor_ref');
    const why = req(rationale, 'rationale');
    if (!Array.isArray(evidence_refs) || evidence_refs.length === 0) throw new IdentityError('INCOMPLETE_INPUT', 'identity decision requires evidence_refs');
    const evidence = evidence_refs.map((ref) => req(ref, 'evidence_ref'));
    const predecessors = [...new Set(predecessor_entity_ids.map((value) => canonicalId(value, 'predecessor_entity_id')))].sort();
    const successors = [...new Set(successor_entity_ids.map((value) => canonicalId(value, 'successor_entity_id')))].sort();
    const correlations = [...new Set(correlation_ids.map((value) => req(value, 'correlation_id')))].sort();
    this.#checkActive(predecessors);
    this.#checkActive(successors);
    correlations.forEach((correlationId) => this.correlations.get(correlationId));

    const cardinality = {
      EQUIVALENT: predecessors.length === 2 && successors.length === 0,
      SUPERSEDE: predecessors.length === 1 && successors.length === 1,
      REPLACE: predecessors.length === 1 && successors.length === 1,
      MERGE: predecessors.length >= 2 && successors.length === 1,
      SPLIT: predecessors.length === 1 && successors.length >= 2,
      DERIVE: predecessors.length >= 1 && successors.length >= 1
    }[decision_type];
    if (!cardinality) throw new IdentityError('INVALID_DECISION', 'Decision predecessor/successor cardinality is invalid', { decision_type, predecessor_count: predecessors.length, successor_count: successors.length });
    if (successors.some((successor) => predecessors.includes(successor))) throw new IdentityError('FORBIDDEN_LINEAGE', 'Predecessor cannot also be its own successor', { decision_type });

    const auth = this.#authorize({ decision_id: id, decision_type, owner_authority_ref: owner, actor_ref: actor, predecessor_entity_ids: predecessors, successor_entity_ids: successors, correlation_ids: correlations, rationale: why, evidence_refs: evidence });
    const time = effective_at || nowIso(this.clock);
    const record = freeze({
      decision_id: id,
      decision_type,
      owner_authority_ref: owner,
      actor_ref: actor,
      rationale: why,
      evidence_refs: evidence,
      correlation_ids: correlations,
      predecessor_entity_ids: predecessors,
      successor_entity_ids: successors,
      effective_at: time,
      policy_decision_ref: auth.decision_ref || auth.decision_id || null,
      metadata: clone(metadata),
      persistence_standing: 'NOT_PERSISTED'
    });

    const edgeType = { SUPERSEDE: 'SUPERSEDED_BY', REPLACE: 'REPLACED_BY', MERGE: 'MERGED_INTO', SPLIT: 'SPLIT_INTO', DERIVE: 'DERIVED_INTO' }[decision_type] || null;
    const proposedEdges = [];
    if (edgeType) {
      for (const from of predecessors) for (const to of successors) proposedEdges.push({ lineage_type: edgeType, from_entity_id: from, to_entity_id: to, decision_id: id, effective_at: time });
      // Validate all proposed successor edges against a temporary graph before mutating live state.
      const temp = new IdentityLineageGraph({ identityRegistry: this.identities, clock: this.clock });
      for (const existing of this.lineage.edges.values()) temp.addEdge(existing);
      for (const edge of proposedEdges) temp.addEdge(edge);
    }

    this.decisions.set(id, record);
    const committedEdges = proposedEdges.map((edge) => this.lineage.addEdge(edge));
    if (['SUPERSEDE', 'REPLACE', 'MERGE', 'SPLIT'].includes(decision_type)) {
      for (const predecessor of predecessors) this.identities.transitionTerminal(predecessor, { lifecycle: 'SUPERSEDED', decision_id: id, successor_entity_ids: successors, effective_at: time });
    }
    correlations.forEach((correlationId) => this.correlations.markAdjudicated(correlationId, id));
    return freeze({ decision: record, lineage_edges: committedEdges, persistence_standing: 'NOT_PERSISTED' });
  }

  getDecision(decision_id) {
    const value = this.decisions.get(req(decision_id, 'decision_id'));
    if (!value) throw new IdentityError('DECISION_UNKNOWN', 'Identity decision not found', { decision_id });
    return value;
  }
}

module.exports = {
  DECISION_TYPES,
  IdentityAdjudicationService,
  IdentityCorrelationService,
  IdentityLifecycleRegistry,
  IdentityLineageGraph,
  LINEAGE_TYPES,
  SUCCESSOR_TYPES
};
