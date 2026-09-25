'use strict';

const { SystemModelError } = require('./system-model');

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SystemModelError('INVALID_FIELD', `${field} must be a non-empty string`, { field });
  }
  return value;
}

function uniqueSorted(values) { return [...new Set(values || [])].sort(); }

class AuthorityBoundaryService {
  constructor({ model }) {
    if (!model) throw new SystemModelError('MODEL_REQUIRED', 'AuthorityBoundaryService requires a system model');
    this.model = model;
    this.responsibilities = new Map();
    this.assignments = new Map();
    this.boundaries = new Map();
  }
  registerResponsibility(record) {
    const responsibilityId = requiredString(record?.responsibility_id, 'responsibility_id');
    const key = requiredString(record?.key, 'responsibility.key');
    if (this.responsibilities.has(responsibilityId)) throw new SystemModelError('RESPONSIBILITY_ID_EXISTS', `Responsibility already exists: ${responsibilityId}`, { responsibility_id: responsibilityId });
    if ([...this.responsibilities.values()].some((item) => item.key === key)) throw new SystemModelError('RESPONSIBILITY_KEY_EXISTS', `Responsibility key already exists: ${key}`, { key });
    const normalized = Object.freeze({ responsibility_id: responsibilityId, key, description: record.description || null, required: record.required !== false });
    this.responsibilities.set(responsibilityId, normalized); return normalized;
  }
  getResponsibility(responsibilityId) { return this.responsibilities.get(responsibilityId) || null; }
  assignAuthority(record) {
    const assignmentId = requiredString(record?.assignment_id, 'assignment_id');
    const responsibilityId = requiredString(record?.responsibility_id, 'assignment.responsibility_id');
    const ownerEntityId = requiredString(record?.owner_entity_id, 'assignment.owner_entity_id');
    if (this.assignments.has(assignmentId)) throw new SystemModelError('ASSIGNMENT_ID_EXISTS', `Authority assignment already exists: ${assignmentId}`, { assignment_id: assignmentId });
    if (!this.responsibilities.has(responsibilityId)) throw new SystemModelError('RESPONSIBILITY_UNKNOWN', `Unknown responsibility: ${responsibilityId}`, { responsibility_id: responsibilityId });
    if (!this.model.getEntity(ownerEntityId)) throw new SystemModelError('OWNER_ENTITY_UNKNOWN', `Unknown owner entity: ${ownerEntityId}`, { owner_entity_id: ownerEntityId });
    const existing = [...this.assignments.values()].find((item) => item.responsibility_id === responsibilityId && item.active);
    if (existing) throw new SystemModelError('CANONICAL_OWNER_COLLISION', `Responsibility already has an active canonical owner: ${responsibilityId}`, { responsibility_id: responsibilityId, existing_owner_entity_id: existing.owner_entity_id, attempted_owner_entity_id: ownerEntityId });
    const normalized = Object.freeze({ assignment_id: assignmentId, responsibility_id: responsibilityId, owner_entity_id: ownerEntityId, active: record.active !== false, precedence: Number.isInteger(record.precedence) ? record.precedence : 0, evidence_refs: uniqueSorted(record.evidence_refs) });
    this.assignments.set(assignmentId, normalized); return normalized;
  }
  defineBoundary(record) {
    const boundaryId = requiredString(record?.boundary_id, 'boundary_id');
    const responsibilityId = requiredString(record?.responsibility_id, 'boundary.responsibility_id');
    const canonicalOwnerEntityId = requiredString(record?.canonical_owner_entity_id, 'boundary.canonical_owner_entity_id');
    if (this.boundaries.has(boundaryId)) throw new SystemModelError('BOUNDARY_ID_EXISTS', `Boundary already exists: ${boundaryId}`, { boundary_id: boundaryId });
    const resolution = this.resolveAuthority(responsibilityId);
    if (resolution.owner_entity_id !== canonicalOwnerEntityId) throw new SystemModelError('BOUNDARY_OWNER_MISMATCH', 'Boundary canonical owner must match active authority assignment', { responsibility_id: responsibilityId, assigned_owner_entity_id: resolution.owner_entity_id, boundary_owner_entity_id: canonicalOwnerEntityId });
    const delegates = uniqueSorted(record.delegate_entity_ids);
    for (const delegate of delegates) if (!this.model.getEntity(delegate)) throw new SystemModelError('DELEGATE_ENTITY_UNKNOWN', `Unknown delegate entity: ${delegate}`, { delegate_entity_id: delegate });
    const normalized = Object.freeze({ boundary_id: boundaryId, responsibility_id: responsibilityId, canonical_owner_entity_id: canonicalOwnerEntityId, delegate_entity_ids: delegates, permitted_calls: uniqueSorted(record.permitted_calls), precedence_rule: record.precedence_rule || 'CANONICAL_OWNER_WINS', ownership_transfer_allowed: false });
    this.boundaries.set(boundaryId, normalized); return normalized;
  }
  resolveAuthority(responsibilityId) {
    if (!this.responsibilities.has(responsibilityId)) throw new SystemModelError('RESPONSIBILITY_UNKNOWN', `Unknown responsibility: ${responsibilityId}`, { responsibility_id: responsibilityId });
    const active = [...this.assignments.values()].filter((item) => item.responsibility_id === responsibilityId && item.active).sort((a, b) => b.precedence - a.precedence || a.assignment_id.localeCompare(b.assignment_id));
    if (active.length === 0) throw new SystemModelError('CANONICAL_OWNER_MISSING', `No active canonical owner: ${responsibilityId}`, { responsibility_id: responsibilityId });
    if (active.length > 1 && active[0].precedence === active[1].precedence) throw new SystemModelError('CANONICAL_OWNER_AMBIGUOUS', `Ambiguous active canonical owner: ${responsibilityId}`, { responsibility_id: responsibilityId, owner_entity_ids: active.map((item) => item.owner_entity_id) });
    const assignment = active[0];
    const boundary = [...this.boundaries.values()].find((item) => item.responsibility_id === responsibilityId) || null;
    return Object.freeze({ responsibility_id: responsibilityId, owner_entity_id: assignment.owner_entity_id, assignment_id: assignment.assignment_id, precedence: assignment.precedence, evidence_refs: assignment.evidence_refs, boundary });
  }
  findRequiredUnownedResponsibilities() {
    return [...this.responsibilities.values()].filter((item) => item.required).filter((item) => ![...this.assignments.values()].some((assignment) => assignment.responsibility_id === item.responsibility_id && assignment.active)).map((item) => item.responsibility_id).sort();
  }
  exportDraft() {
    return {
      responsibilities: [...this.responsibilities.values()],
      assignments: [...this.assignments.values()],
      boundaries: [...this.boundaries.values()]
    };
  }
}

class DependencyGraphEngine {
  constructor({ model }) { if (!model) throw new SystemModelError('MODEL_REQUIRED', 'DependencyGraphEngine requires a system model'); this.model = model; }
  getDependents(entityId, relationshipType = 'DEPENDS_ON') { return this.model.queryRelationships({ entity_id: entityId, relationship_type: relationshipType, direction: 'IN' }).map((rel) => rel.source_entity_id).sort(); }
  traverse({ start_entity_id, relationship_type = 'DEPENDS_ON', direction = 'OUT', max_nodes = 1000 }) {
    requiredString(start_entity_id, 'start_entity_id');
    if (!Number.isInteger(max_nodes) || max_nodes <= 0) throw new SystemModelError('INVALID_BUDGET', 'max_nodes must be a positive integer', { max_nodes });
    if (!this.model.getEntity(start_entity_id)) throw new SystemModelError('ENTITY_UNKNOWN', `Unknown start entity: ${start_entity_id}`, { start_entity_id });
    const visited = new Set([start_entity_id]); const queue = [start_entity_id]; const order = []; let truncated = false;
    while (queue.length) {
      const current = queue.shift();
      const edges = this.model.queryRelationships({ entity_id: current, relationship_type, direction });
      const nextIds = edges.map((rel) => direction === 'IN' ? rel.source_entity_id : rel.target_entity_id).sort();
      for (const next of nextIds) {
        if (visited.has(next)) continue;
        if (visited.size >= max_nodes) { truncated = true; queue.length = 0; break; }
        visited.add(next); order.push(next); queue.push(next);
      }
    }
    return Object.freeze({ start_entity_id, relationship_type, direction, max_nodes, visited_entity_ids: Object.freeze(order), truncated });
  }
  evaluateImpact({ entity_id, relationship_types = ['DEPENDS_ON'], max_nodes = 1000 }) {
    requiredString(entity_id, 'entity_id');
    const types = uniqueSorted(relationship_types); const impacted = new Set(); let truncated = false;
    for (const type of types) {
      const result = this.traverse({ start_entity_id: entity_id, relationship_type: type, direction: 'IN', max_nodes });
      for (const id of result.visited_entity_ids) { if (impacted.size >= max_nodes) { truncated = true; break; } impacted.add(id); }
      truncated ||= result.truncated; if (truncated) break;
    }
    return Object.freeze({ entity_id, relationship_types: Object.freeze(types), max_nodes, impacted_entity_ids: Object.freeze([...impacted].sort()), truncated });
  }
}

module.exports = { AuthorityBoundaryService, DependencyGraphEngine };
