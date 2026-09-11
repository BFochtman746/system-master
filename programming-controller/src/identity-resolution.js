'use strict';

const crypto = require('crypto');
const { IdentityError, uuidVersion } = require('./identity');

const OUTCOMES = Object.freeze(['UNIQUE', 'AMBIGUOUS', 'NOT_FOUND', 'RETIRED', 'SUPERSEDED', 'STALE_LOCATOR', 'CONFLICTED', 'ACCESS_DENIED']);
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; };
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const req = (value, field) => { if (typeof value !== 'string' || !value.trim()) throw new IdentityError('INCOMPLETE_INPUT', `${field} must be a non-empty string`, { field }); return value; };
const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function canonicalEntityId(value) {
  const normalized = req(value, 'entity_id').toLowerCase();
  try { uuidVersion(normalized); } catch (_) { throw new IdentityError('INVALID_CANONICAL_ID', 'entity_id must be canonical UUID'); }
  return normalized;
}

function result(outcome, fields = {}) {
  if (!OUTCOMES.includes(outcome)) throw new IdentityError('INVALID_RESOLUTION_OUTCOME', `Unsupported outcome: ${outcome}`);
  return freeze({ outcome, authoritative: outcome === 'UNIQUE', ...clone(fields) });
}

class ResolutionCache {
  constructor({ max_entries = 1024 } = {}) {
    if (!Number.isInteger(max_entries) || max_entries <= 0) throw new IdentityError('INVALID_CONFIGURATION', 'max_entries must be positive integer');
    this.maxEntries = max_entries;
    this.entries = new Map();
  }

  key(parts) { return fingerprint(parts); }

  get(parts) {
    const key = this.key(parts);
    const entry = this.entries.get(key);
    return entry ? entry.value : null;
  }

  put(parts, value) {
    const key = this.key(parts);
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, freeze({ key, parts: clone(parts), value }));
    return value;
  }

  invalidate(predicate = null) {
    if (!predicate) { const count = this.entries.size; this.entries.clear(); return count; }
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (predicate(entry.parts, entry.value)) { this.entries.delete(key); removed += 1; }
    }
    return removed;
  }

  get size() { return this.entries.size; }
}

class ExternalIdentityRegistry {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.namespaces = new Map();
    this.bindings = new Map();
    this.revision = 0;
  }

  namespaceKey(authority, namespace) { return `${authority}\u001f${namespace}`; }

  registerNamespace({ external_authority, external_namespace, unique_active = true, normalize = null }) {
    const authority = req(external_authority, 'external_authority');
    const namespace = req(external_namespace, 'external_namespace');
    if (normalize !== null && typeof normalize !== 'function') throw new IdentityError('INVALID_PORT', 'external normalize must be function');
    const key = this.namespaceKey(authority, namespace);
    if (this.namespaces.has(key)) throw new IdentityError('EXTERNAL_NAMESPACE_EXISTS', 'external namespace already registered', { external_authority: authority, external_namespace: namespace });
    const record = Object.freeze({ external_authority: authority, external_namespace: namespace, unique_active: unique_active !== false, normalize: normalize || ((value) => value) });
    this.namespaces.set(key, record);
    this.revision += 1;
    return freeze({ external_authority: authority, external_namespace: namespace, unique_active: record.unique_active });
  }

  getNamespace(authority, namespace) {
    const record = this.namespaces.get(this.namespaceKey(req(authority, 'external_authority'), req(namespace, 'external_namespace')));
    if (!record) throw new IdentityError('EXTERNAL_NAMESPACE_UNKNOWN', 'external namespace not registered', { external_authority: authority, external_namespace: namespace });
    return record;
  }

  bind({ binding_id, entity_id, external_authority, external_namespace, external_value, provenance_ref, valid_from = null, data_classification = 'INTERNAL' }) {
    req(binding_id, 'binding_id');
    const entity = canonicalEntityId(entity_id);
    const namespace = this.getNamespace(external_authority, external_namespace);
    const raw = req(external_value, 'external_value');
    const comparison = namespace.normalize(raw);
    if (typeof comparison !== 'string') throw new IdentityError('EXTERNAL_ID_INVALID', 'external namespace normalizer must return string');
    const active = [...this.bindings.values()].filter((x) => x.external_authority === external_authority && x.external_namespace === external_namespace && x.comparison_key === comparison && x.state === 'ACTIVE');
    if (namespace.unique_active && active.length) throw new IdentityError('EXTERNAL_ID_CONFLICT', 'external identity already has active binding', { binding_ids: active.map((x) => x.binding_id).sort() });
    if (this.bindings.has(binding_id)) throw new IdentityError('EXTERNAL_ID_CONFLICT', 'binding_id already exists', { binding_id });
    const record = freeze({
      binding_id,
      entity_id: entity,
      external_authority,
      external_namespace,
      raw_value: raw,
      comparison_key: comparison,
      provenance_ref: req(provenance_ref, 'provenance_ref'),
      data_classification,
      valid_from: valid_from || new Date(this.clock()).toISOString(),
      valid_to: null,
      state: 'ACTIVE'
    });
    this.bindings.set(binding_id, record);
    this.revision += 1;
    return record;
  }

  endBinding(binding_id, valid_to = null) {
    const current = this.bindings.get(req(binding_id, 'binding_id'));
    if (!current) throw new IdentityError('EXTERNAL_ID_NOT_FOUND', 'binding not found', { binding_id });
    if (current.state !== 'ACTIVE') throw new IdentityError('STALE_BASE', 'binding already ended', { binding_id });
    const ended = freeze({ ...current, state: 'ENDED', valid_to: valid_to || new Date(this.clock()).toISOString() });
    this.bindings.set(binding_id, ended);
    this.revision += 1;
    return ended;
  }

  candidates({ external_authority, external_namespace, external_value }) {
    const namespace = this.getNamespace(external_authority, external_namespace);
    const comparison = namespace.normalize(req(external_value, 'external_value'));
    return freeze({
      source_revision: this.revision,
      external_authority,
      external_namespace,
      comparison_key: comparison,
      candidates: [...this.bindings.values()].filter((x) => x.external_authority === external_authority && x.external_namespace === external_namespace && x.comparison_key === comparison && x.state === 'ACTIVE').sort((a,b) => a.binding_id.localeCompare(b.binding_id))
    });
  }
}

function createAliasResolutionSource({ aliasRegistry, namespaceRegistry, versionProvider = () => 0 } = {}) {
  if (!aliasRegistry || !namespaceRegistry || typeof versionProvider !== 'function') throw new IdentityError('INVALID_PORT', 'alias resolution source requires registries and versionProvider');
  return {
    candidates({ namespace_id, raw_value }) {
      const policy = namespaceRegistry.getPolicy(namespace_id);
      const normalized = namespaceRegistry.normalizationProfiles.normalize(policy.normalization_profile_id, policy.normalization_profile_version, raw_value);
      return freeze({
        source_revision: versionProvider(),
        namespace_id,
        policy_version: policy.policy_version,
        normalization_profile_id: policy.normalization_profile_id,
        normalization_profile_version: policy.normalization_profile_version,
        normalized_value: normalized,
        candidates: [...aliasRegistry.aliases.values()].filter((x) => x.namespace_id === namespace_id && x.normalized_value === normalized && x.state !== 'ENDED').sort((a,b) => a.alias_id.localeCompare(b.alias_id))
      });
    }
  };
}

class IdentityResolver {
  constructor({ entitySource, aliasSource = null, locatorSource = null, externalRegistry = null, accessPolicy = null, cache = new ResolutionCache() } = {}) {
    if (!entitySource || typeof entitySource.getEntity !== 'function') throw new IdentityError('INVALID_PORT', 'entitySource.getEntity required');
    if (aliasSource && typeof aliasSource.candidates !== 'function') throw new IdentityError('INVALID_PORT', 'aliasSource.candidates required');
    if (locatorSource && typeof locatorSource.getLocator !== 'function') throw new IdentityError('INVALID_PORT', 'locatorSource.getLocator required');
    if (accessPolicy && typeof accessPolicy !== 'function') throw new IdentityError('INVALID_PORT', 'accessPolicy must be function');
    this.entities = entitySource;
    this.aliases = aliasSource;
    this.locators = locatorSource;
    this.external = externalRegistry;
    this.accessPolicy = accessPolicy;
    this.cache = cache;
  }

  entity(entity_id, reference, source = {}) {
    const id = canonicalEntityId(entity_id);
    const entity = this.entities.getEntity(id);
    if (!entity) return result('NOT_FOUND', { reference: clone(reference), source: clone(source) });
    if (entity.lifecycle === 'RETIRED') return result('RETIRED', { entity: clone(entity), reference: clone(reference), source: clone(source) });
    if (entity.lifecycle === 'SUPERSEDED') return result('SUPERSEDED', { entity: clone(entity), successor_entity_id: entity.successor_entity_id || null, reference: clone(reference), source: clone(source) });
    if (entity.lifecycle === 'CONFLICTED') return result('CONFLICTED', { entity: clone(entity), reference: clone(reference), source: clone(source) });
    if (this.accessPolicy) {
      const decision = this.accessPolicy({ entity: clone(entity), reference: clone(reference) });
      if (!(decision === true || decision?.allowed === true)) return result('ACCESS_DENIED', { reference: clone(reference), source: clone(source), reason: decision?.reason || null });
    }
    return result('UNIQUE', { entity: clone(entity), entity_id: id, reference: clone(reference), source: clone(source) });
  }

  resolveCanonical(entity_id) {
    const ref = { kind: 'CANONICAL_ID', entity_id: canonicalEntityId(entity_id) };
    return this.entity(ref.entity_id, ref, { source_revision: this.entities.revision ?? null });
  }

  resolveAlias({ namespace_id, raw_value }) {
    if (!this.aliases) throw new IdentityError('RESOLVER_UNAVAILABLE', 'alias resolver not configured');
    const source = this.aliases.candidates({ namespace_id, raw_value });
    const cacheParts = { kind: 'ALIAS', namespace_id, raw_value, source_revision: source.source_revision, policy_version: source.policy_version, normalization_profile_id: source.normalization_profile_id, normalization_profile_version: source.normalization_profile_version };
    const cached = this.cache.get(cacheParts);
    if (cached) return cached;
    const conflicted = source.candidates.filter((x) => x.state === 'CONFLICTED');
    if (conflicted.length) return this.cache.put(cacheParts, result('CONFLICTED', { reference: { kind: 'ALIAS', namespace_id, raw_value }, candidates: conflicted.map((x) => x.entity_id), source: clone(source) }));
    const entityIds = [...new Set(source.candidates.filter((x) => ['ACTIVE', 'DEPRECATED'].includes(x.state)).map((x) => x.entity_id))].sort();
    if (!entityIds.length) return this.cache.put(cacheParts, result('NOT_FOUND', { reference: { kind: 'ALIAS', namespace_id, raw_value }, source: clone(source) }));
    if (entityIds.length > 1) return this.cache.put(cacheParts, result('AMBIGUOUS', { reference: { kind: 'ALIAS', namespace_id, raw_value }, candidates: entityIds, source: clone(source) }));
    return this.cache.put(cacheParts, this.entity(entityIds[0], { kind: 'ALIAS', namespace_id, raw_value }, source));
  }

  resolveLocator({ locator_id, as_of_ms = null }) {
    if (!this.locators) throw new IdentityError('RESOLVER_UNAVAILABLE', 'locator resolver not configured');
    const located = this.locators.getLocator(locator_id, { as_of_ms });
    const ref = { kind: 'LOCATOR', locator_id };
    if (located.standing === 'STALE_LOCATOR') return result('STALE_LOCATOR', { reference: ref, candidate_entity_id: located.record.entity_id, source: clone(located.record) });
    if (located.standing === 'ENDED') return result('NOT_FOUND', { reference: ref, source: clone(located.record) });
    return this.entity(located.record.entity_id, ref, located.record);
  }

  resolveExternal({ external_authority, external_namespace, external_value }) {
    if (!this.external) throw new IdentityError('RESOLVER_UNAVAILABLE', 'external identity resolver not configured');
    const source = this.external.candidates({ external_authority, external_namespace, external_value });
    const ref = { kind: 'EXTERNAL_ID', external_authority, external_namespace, external_value };
    const cacheParts = { ...ref, source_revision: source.source_revision, comparison_key: source.comparison_key };
    const cached = this.cache.get(cacheParts);
    if (cached) return cached;
    const entityIds = [...new Set(source.candidates.map((x) => x.entity_id))].sort();
    if (!entityIds.length) return this.cache.put(cacheParts, result('NOT_FOUND', { reference: ref, source: clone(source) }));
    if (entityIds.length > 1) return this.cache.put(cacheParts, result('AMBIGUOUS', { reference: ref, candidates: entityIds, source: clone(source) }));
    return this.cache.put(cacheParts, this.entity(entityIds[0], ref, source));
  }

  resolveReference(reference) {
    if (!reference || typeof reference !== 'object') throw new IdentityError('INVALID_REFERENCE', 'reference object required');
    switch (reference.kind) {
      case 'CANONICAL_ID': return this.resolveCanonical(reference.entity_id);
      case 'ALIAS': return this.resolveAlias(reference);
      case 'LOCATOR': return this.resolveLocator(reference);
      case 'EXTERNAL_ID': return this.resolveExternal(reference);
      case 'CONTENT_DIGEST': return result('NOT_FOUND', { reference: clone(reference), boundary: 'CONTENT_IDENTITY_OWNED_BY_001U_NOT_ENTITY_ID' });
      default: throw new IdentityError('INVALID_REFERENCE', 'unsupported reference kind', { kind: reference.kind });
    }
  }
}

class IdentityReferenceValidator {
  constructor({ resolver } = {}) {
    if (!resolver || typeof resolver.resolveReference !== 'function') throw new IdentityError('INVALID_PORT', 'IdentityResolver required');
    this.resolver = resolver;
  }

  validate({ reference, expected_entity_kind = null, expected_scope = null, high_consequence = true } = {}) {
    const resolved = this.resolver.resolveReference(reference);
    if (resolved.outcome !== 'UNIQUE') return freeze({ valid: false, standing: resolved.outcome, high_consequence, resolution: resolved });
    const entity = resolved.entity;
    if (expected_entity_kind && entity.entity_kind !== expected_entity_kind) return freeze({ valid: false, standing: 'WRONG_ENTITY_KIND', expected_entity_kind, actual_entity_kind: entity.entity_kind, resolution: resolved });
    if (expected_scope && entity.scope !== expected_scope) return freeze({ valid: false, standing: 'WRONG_SCOPE', expected_scope, actual_scope: entity.scope, resolution: resolved });
    return freeze({ valid: true, standing: 'UNIQUE', entity_id: resolved.entity_id, entity: clone(entity), resolution: resolved });
  }
}

module.exports = {
  ExternalIdentityRegistry,
  IdentityReferenceValidator,
  IdentityResolver,
  OUTCOMES,
  ResolutionCache,
  createAliasResolutionSource
};
