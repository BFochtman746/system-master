'use strict';

const CYCLE_POLICIES = new Set(['ALLOW', 'ACYCLIC']);

class SystemModelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SystemModelError';
    this.code = code;
    this.details = details;
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SystemModelError('INVALID_FIELD', `${field} must be a non-empty string`, { field });
  }
  return value;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function freezeRecord(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeRecord(child);
  return value;
}

class ModelSchemaRegistry {
  constructor() {
    this.entityTypes = new Map();
    this.relationshipTypes = new Map();
  }

  registerEntityType(definition) {
    const type = requireNonEmptyString(definition?.type, 'entityType.type');
    if (this.entityTypes.has(type)) {
      throw new SystemModelError('ENTITY_TYPE_EXISTS', `Entity type already registered: ${type}`, { type });
    }
    const record = freezeRecord({
      type,
      required_attributes: [...new Set(definition.required_attributes || [])].sort(),
      description: definition.description || null
    });
    this.entityTypes.set(type, record);
    return record;
  }

  registerRelationshipType(definition) {
    const type = requireNonEmptyString(definition?.type, 'relationshipType.type');
    if (this.relationshipTypes.has(type)) {
      throw new SystemModelError('RELATIONSHIP_TYPE_EXISTS', `Relationship type already registered: ${type}`, { type });
    }
    const cyclePolicy = definition.cycle_policy || 'ALLOW';
    if (!CYCLE_POLICIES.has(cyclePolicy)) {
      throw new SystemModelError('INVALID_CYCLE_POLICY', `Unsupported cycle policy: ${cyclePolicy}`, { type, cyclePolicy });
    }
    const record = freezeRecord({
      type,
      cycle_policy: cyclePolicy,
      description: definition.description || null
    });
    this.relationshipTypes.set(type, record);
    return record;
  }

  getEntityType(type) {
    return this.entityTypes.get(type) || null;
  }

  getRelationshipType(type) {
    return this.relationshipTypes.get(type) || null;
  }
}

class ModelValidator {
  constructor(schemaRegistry) {
    this.schemas = schemaRegistry;
  }

  validateEntity(entity) {
    const id = requireNonEmptyString(entity?.entity_id, 'entity.entity_id');
    const type = requireNonEmptyString(entity?.entity_type, 'entity.entity_type');
    const typeDef = this.schemas.getEntityType(type);
    if (!typeDef) {
      throw new SystemModelError('UNKNOWN_ENTITY_TYPE', `Unknown entity type: ${type}`, { entity_id: id, entity_type: type });
    }
    const attributes = entity.attributes && typeof entity.attributes === 'object' && !Array.isArray(entity.attributes)
      ? entity.attributes
      : {};
    const missing = typeDef.required_attributes.filter((key) => attributes[key] === undefined || attributes[key] === null);
    if (missing.length) {
      throw new SystemModelError('MISSING_REQUIRED_ATTRIBUTE', `Entity ${id} is missing required attributes`, { entity_id: id, missing });
    }
    return true;
  }

  validateRelationship(relationship, entities) {
    const id = requireNonEmptyString(relationship?.relationship_id, 'relationship.relationship_id');
    const source = requireNonEmptyString(relationship?.source_entity_id, 'relationship.source_entity_id');
    const target = requireNonEmptyString(relationship?.target_entity_id, 'relationship.target_entity_id');
    const type = requireNonEmptyString(relationship?.relationship_type, 'relationship.relationship_type');
    if (!this.schemas.getRelationshipType(type)) {
      throw new SystemModelError('UNKNOWN_RELATIONSHIP_TYPE', `Unknown relationship type: ${type}`, { relationship_id: id, relationship_type: type });
    }
    if (!entities.has(source) || !entities.has(target)) {
      throw new SystemModelError('RELATIONSHIP_ENDPOINT_MISSING', `Relationship ${id} references a missing endpoint`, {
        relationship_id: id,
        source_entity_id: source,
        target_entity_id: target,
        source_exists: entities.has(source),
        target_exists: entities.has(target)
      });
    }
    return true;
  }

  validateAcyclicRelationships(relationships) {
    const byType = new Map();
    for (const rel of relationships.values()) {
      const typeDef = this.schemas.getRelationshipType(rel.relationship_type);
      if (typeDef?.cycle_policy !== 'ACYCLIC') continue;
      if (!byType.has(rel.relationship_type)) byType.set(rel.relationship_type, []);
      byType.get(rel.relationship_type).push(rel);
    }

    for (const [type, rels] of byType.entries()) {
      const adjacency = new Map();
      for (const rel of rels) {
        if (!adjacency.has(rel.source_entity_id)) adjacency.set(rel.source_entity_id, []);
        adjacency.get(rel.source_entity_id).push(rel.target_entity_id);
      }
      const visiting = new Set();
      const visited = new Set();
      const stack = [];

      const visit = (node) => {
        if (visiting.has(node)) {
          const start = stack.indexOf(node);
          const cycle = [...stack.slice(start), node];
          throw new SystemModelError('RELATIONSHIP_CYCLE', `Cycle detected for relationship type ${type}`, { relationship_type: type, cycle });
        }
        if (visited.has(node)) return;
        visiting.add(node);
        stack.push(node);
        for (const next of adjacency.get(node) || []) visit(next);
        stack.pop();
        visiting.delete(node);
        visited.add(node);
      };

      for (const node of adjacency.keys()) visit(node);
    }
    return true;
  }

  validateModel(entities, relationships) {
    for (const entity of entities.values()) this.validateEntity(entity);
    for (const relationship of relationships.values()) this.validateRelationship(relationship, entities);
    this.validateAcyclicRelationships(relationships);
    return { valid: true, errors: [] };
  }
}

class SystemModelService {
  constructor({ workspace_id, identityValidator = null } = {}) {
    this.workspaceId = requireNonEmptyString(workspace_id, 'workspace_id');
    this.identityValidator = identityValidator;
    this.schemas = new ModelSchemaRegistry();
    this.validator = new ModelValidator(this.schemas);
    this.entities = new Map();
    this.relationships = new Map();
  }

  validateIdentity(id, kind) {
    if (!this.identityValidator) return;
    const accepted = this.identityValidator(id, kind);
    if (accepted !== true) {
      throw new SystemModelError('IDENTITY_REJECTED', `Identity rejected by 001N port: ${id}`, { id, kind });
    }
  }

  registerEntityType(definition) {
    return this.schemas.registerEntityType(definition);
  }

  registerRelationshipType(definition) {
    return this.schemas.registerRelationshipType(definition);
  }

  upsertEntity(entity) {
    this.validateIdentity(entity?.entity_id, 'MODEL_ENTITY');
    this.validator.validateEntity(entity);
    const normalized = freezeRecord({
      entity_id: entity.entity_id,
      entity_type: entity.entity_type,
      name: entity.name || null,
      attributes: cloneJson(entity.attributes || {}),
      metadata: cloneJson(entity.metadata || {})
    });
    this.entities.set(normalized.entity_id, normalized);
    return normalized;
  }

  getEntity(entityId) {
    return this.entities.get(entityId) || null;
  }

  declareRelationship(relationship) {
    this.validateIdentity(relationship?.relationship_id, 'MODEL_RELATIONSHIP');
    this.validator.validateRelationship(relationship, this.entities);
    if (this.relationships.has(relationship.relationship_id)) {
      throw new SystemModelError('RELATIONSHIP_ID_EXISTS', `Relationship id already exists: ${relationship.relationship_id}`, { relationship_id: relationship.relationship_id });
    }
    const normalized = freezeRecord({
      relationship_id: relationship.relationship_id,
      source_entity_id: relationship.source_entity_id,
      target_entity_id: relationship.target_entity_id,
      relationship_type: relationship.relationship_type,
      semantics: relationship.semantics || null,
      metadata: cloneJson(relationship.metadata || {})
    });
    this.relationships.set(normalized.relationship_id, normalized);
    try {
      this.validator.validateAcyclicRelationships(this.relationships);
    } catch (error) {
      this.relationships.delete(normalized.relationship_id);
      throw error;
    }
    return normalized;
  }

  queryRelationships({ entity_id = null, relationship_type = null, direction = 'BOTH' } = {}) {
    if (!['IN', 'OUT', 'BOTH'].includes(direction)) {
      throw new SystemModelError('INVALID_DIRECTION', `Unsupported relationship direction: ${direction}`, { direction });
    }
    return [...this.relationships.values()].filter((rel) => {
      if (relationship_type && rel.relationship_type !== relationship_type) return false;
      if (!entity_id) return true;
      if (direction === 'IN') return rel.target_entity_id === entity_id;
      if (direction === 'OUT') return rel.source_entity_id === entity_id;
      return rel.source_entity_id === entity_id || rel.target_entity_id === entity_id;
    });
  }

  validate() {
    return this.validator.validateModel(this.entities, this.relationships);
  }

  exportDraft() {
    return {
      workspace_id: this.workspaceId,
      entity_types: [...this.schemas.entityTypes.values()],
      relationship_types: [...this.schemas.relationshipTypes.values()],
      entities: [...this.entities.values()],
      relationships: [...this.relationships.values()]
    };
  }
}

module.exports = {
  CYCLE_POLICIES,
  ModelSchemaRegistry,
  ModelValidator,
  SystemModelError,
  SystemModelService
};
