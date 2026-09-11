'use strict';

const crypto = require('crypto');
const { IdentityError, uuidVersion } = require('./identity');

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
const nowIso = (clock) => new Date(clock()).toISOString();
const id = (prefix, parts) => `${prefix}:sha256:${crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex')}`;

function assertCanonicalEntityId(value) {
  try { uuidVersion(req(value, 'entity_id')); }
  catch (error) { if (error instanceof IdentityError) throw new IdentityError('UNKNOWN_ENTITY', 'entity_id must be a canonical UUID identity', { entity_id: value }); throw error; }
  return value.toLowerCase();
}

class NormalizationProfileRegistry {
  constructor() {
    this.profiles = new Map();
    this.register({
      profile_id: 'unicode-nfc-case-sensitive',
      version: 1,
      unicode_version: 'RUNTIME',
      framework: 'ECMASCRIPT_STRING_NORMALIZE',
      normalization: 'NFC',
      case_mapping: 'NONE',
      normalize: (raw) => raw.normalize('NFC')
    });
    this.register({
      profile_id: 'unicode-nfkc-lower',
      version: 1,
      unicode_version: 'RUNTIME',
      framework: 'ECMASCRIPT_STRING_NORMALIZE',
      normalization: 'NFKC',
      case_mapping: 'LOWERCASE_RUNTIME',
      normalize: (raw) => raw.normalize('NFKC').toLowerCase()
    });
  }

  key(profileId, version) { return `${profileId}@${version}`; }

  register(profile) {
    const profileId = req(profile?.profile_id, 'normalization_profile.profile_id');
    if (!Number.isInteger(profile?.version) || profile.version <= 0) throw new IdentityError('INVALID_NORMALIZATION_PROFILE', 'normalization profile version must be positive integer');
    if (typeof profile.normalize !== 'function') throw new IdentityError('INVALID_NORMALIZATION_PROFILE', 'normalization profile requires normalize function');
    const key = this.key(profileId, profile.version);
    if (this.profiles.has(key)) throw new IdentityError('NORMALIZATION_PROFILE_EXISTS', `Normalization profile exists: ${key}`);
    const record = Object.freeze({
      profile_id: profileId,
      version: profile.version,
      unicode_version: profile.unicode_version || 'UNSPECIFIED',
      framework: profile.framework || 'CUSTOM_ADAPTER',
      normalization: profile.normalization || 'CUSTOM',
      case_mapping: profile.case_mapping || 'CUSTOM',
      normalize: profile.normalize
    });
    this.profiles.set(key, record);
    return record;
  }

  get(profileId, version) {
    const profile = this.profiles.get(this.key(req(profileId, 'normalization_profile_id'), version));
    if (!profile) throw new IdentityError('NORMALIZATION_PROFILE_UNKNOWN', 'Unknown normalization profile/version', { profile_id: profileId, version });
    return profile;
  }

  normalize(profileId, version, raw) {
    if (typeof raw !== 'string') throw new IdentityError('INVALID_ALIAS', 'alias must be a string');
    const profile = this.get(profileId, version);
    let normalized;
    try { normalized = profile.normalize(raw); }
    catch (error) { throw new IdentityError('NORMALIZATION_FAILED', 'normalization adapter failed', { profile_id: profileId, version, cause: error?.message || String(error) }); }
    if (typeof normalized !== 'string') throw new IdentityError('NORMALIZATION_FAILED', 'normalization adapter must return string');
    return normalized;
  }
}

class UnicodeSecurityPort {
  constructor({ inspect = null, detector_id = 'NO_DETECTOR_BOUND', detector_version = '0' } = {}) {
    if (inspect !== null && typeof inspect !== 'function') throw new IdentityError('INVALID_PORT', 'Unicode security inspect port must be function');
    this.inspectFn = inspect;
    this.detectorId = detector_id;
    this.detectorVersion = detector_version;
  }

  inspect({ raw_value, namespace_id, normalized_value }) {
    if (!this.inspectFn) return freeze({ standing: 'NOT_EVALUATED', detector_id: this.detectorId, detector_version: this.detectorVersion, findings: [] });
    let result;
    try { result = this.inspectFn({ raw_value, namespace_id, normalized_value }); }
    catch (error) { throw new IdentityError('UNICODE_SECURITY_UNAVAILABLE', 'Unicode security detector unavailable', { cause: error?.message || String(error) }); }
    const findings = Array.isArray(result?.findings) ? result.findings.map((finding) => freeze({
      finding_type: req(finding.finding_type, 'finding.finding_type'),
      severity: finding.severity || 'REVIEW',
      evidence: clone(finding.evidence || null)
    })) : [];
    return freeze({ standing: result?.standing || (findings.length ? 'FINDINGS' : 'CLEAR'), detector_id: result?.detector_id || this.detectorId, detector_version: result?.detector_version || this.detectorVersion, findings });
  }
}

class IdentityNamespaceRegistry {
  constructor({ normalizationProfiles = new NormalizationProfileRegistry() } = {}) {
    this.normalizationProfiles = normalizationProfiles;
    this.namespaces = new Map();
    this.policies = new Map();
    this.retiredKeys = new Set();
  }

  registerNamespace({ namespace_id, namespace_key, purpose, owner_authority_ref, scope_kind = 'GLOBAL', initial_policy }) {
    req(namespace_id, 'namespace_id'); req(namespace_key, 'namespace_key'); req(purpose, 'purpose'); req(owner_authority_ref, 'owner_authority_ref');
    if (this.namespaces.has(namespace_id) || [...this.namespaces.values()].some((x) => x.namespace_key === namespace_key) || this.retiredKeys.has(namespace_key)) {
      throw new IdentityError('DUPLICATE_NAMESPACE', 'namespace id/key is already assigned or retired', { namespace_id, namespace_key });
    }
    const policy = this.#validatePolicy({ ...initial_policy, namespace_id, policy_version: 1 });
    const namespace = freeze({ namespace_id, namespace_key, purpose, owner_authority_ref, scope_kind, policy_version: 1, lifecycle: 'ACTIVE' });
    this.namespaces.set(namespace_id, namespace);
    this.policies.set(`${namespace_id}@1`, policy);
    return namespace;
  }

  #validatePolicy(policy) {
    if (!Number.isInteger(policy?.policy_version) || policy.policy_version <= 0) throw new IdentityError('INVALID_POLICY', 'policy_version must be positive integer');
    const normalization_profile_id = req(policy?.normalization_profile_id, 'normalization_profile_id');
    const normalization_profile_version = policy?.normalization_profile_version;
    if (!Number.isInteger(normalization_profile_version) || normalization_profile_version <= 0) throw new IdentityError('INVALID_POLICY', 'normalization_profile_version must be positive integer');
    this.normalizationProfiles.get(normalization_profile_id, normalization_profile_version);
    const uniqueness_class = policy.uniqueness_class || 'UNIQUE_ACTIVE';
    if (!['UNIQUE_ACTIVE', 'NON_UNIQUE'].includes(uniqueness_class)) throw new IdentityError('INVALID_POLICY', 'unsupported uniqueness_class', { uniqueness_class });
    const reuse_policy = policy.reuse_policy || 'NEVER_REUSE';
    if (!['NEVER_REUSE', 'AFTER_END'].includes(reuse_policy)) throw new IdentityError('INVALID_POLICY', 'unsupported reuse_policy', { reuse_policy });
    const confusable_policy = policy.confusable_policy || 'NONE';
    if (!['NONE', 'WARN', 'BLOCK', 'ESCALATE'].includes(confusable_policy)) throw new IdentityError('INVALID_POLICY', 'unsupported confusable_policy', { confusable_policy });
    const max_aliases = policy.max_aliases ?? 32;
    if (!Number.isInteger(max_aliases) || max_aliases <= 0) throw new IdentityError('INVALID_POLICY', 'max_aliases must be positive integer');
    return freeze({
      namespace_id: policy.namespace_id,
      policy_version: policy.policy_version,
      normalization_profile_id,
      normalization_profile_version,
      uniqueness_class,
      reuse_policy,
      confusable_policy,
      max_aliases,
      max_raw_length: policy.max_raw_length ?? 512,
      syntax_pattern: policy.syntax_pattern || null
    });
  }

  changePolicy({ namespace_id, expected_policy_version, new_policy }) {
    const current = this.namespaces.get(req(namespace_id, 'namespace_id'));
    if (!current) throw new IdentityError('NAMESPACE_UNKNOWN', 'namespace not found', { namespace_id });
    if (current.lifecycle !== 'ACTIVE') throw new IdentityError('NAMESPACE_RETIRED', 'namespace is not active', { namespace_id });
    if (current.policy_version !== expected_policy_version) throw new IdentityError('STALE_POLICY', 'namespace policy version changed', { expected_policy_version, actual_policy_version: current.policy_version });
    const nextVersion = current.policy_version + 1;
    const policy = this.#validatePolicy({ ...new_policy, namespace_id, policy_version: nextVersion });
    const updated = freeze({ ...current, policy_version: nextVersion });
    this.namespaces.set(namespace_id, updated);
    this.policies.set(`${namespace_id}@${nextVersion}`, policy);
    return policy;
  }

  getNamespace(namespace_id) {
    const value = this.namespaces.get(req(namespace_id, 'namespace_id'));
    if (!value) throw new IdentityError('NAMESPACE_UNKNOWN', 'namespace not found', { namespace_id });
    return value;
  }

  getPolicy(namespace_id, version = null) {
    const ns = this.getNamespace(namespace_id);
    const selected = version ?? ns.policy_version;
    const value = this.policies.get(`${namespace_id}@${selected}`);
    if (!value) throw new IdentityError('INVALID_POLICY', 'namespace policy version not found', { namespace_id, version: selected });
    return value;
  }

  retireNamespace(namespace_id) {
    const current = this.getNamespace(namespace_id);
    if (current.lifecycle === 'RETIRED') return current;
    const retired = freeze({ ...current, lifecycle: 'RETIRED' });
    this.namespaces.set(namespace_id, retired);
    this.retiredKeys.add(current.namespace_key);
    return retired;
  }
}

class AliasRegistry {
  constructor({ namespaceRegistry, unicodeSecurity = new UnicodeSecurityPort(), clock = () => Date.now(), entityExists = null } = {}) {
    if (!namespaceRegistry) throw new IdentityError('NAMESPACE_REGISTRY_REQUIRED', 'namespace registry required');
    if (entityExists !== null && typeof entityExists !== 'function') throw new IdentityError('INVALID_PORT', 'entityExists must be function');
    this.namespaces = namespaceRegistry;
    this.unicode = unicodeSecurity;
    this.clock = clock;
    this.entityExists = entityExists;
    this.aliases = new Map();
    this.findings = new Map();
    this.usedKeys = new Set();
  }

  registerAlias({ alias_id = null, entity_id, namespace_id, raw_value, valid_from = null }) {
    const canonicalEntityId = assertCanonicalEntityId(entity_id);
    if (this.entityExists && this.entityExists(canonicalEntityId) !== true) throw new IdentityError('UNKNOWN_ENTITY', 'entity does not exist', { entity_id: canonicalEntityId });
    if (typeof raw_value !== 'string' || !raw_value.length) throw new IdentityError('INVALID_ALIAS', 'raw alias must be non-empty string');
    const ns = this.namespaces.getNamespace(namespace_id);
    if (ns.lifecycle !== 'ACTIVE') throw new IdentityError('NAMESPACE_RETIRED', 'cannot add alias to retired namespace', { namespace_id });
    const policy = this.namespaces.getPolicy(namespace_id);
    if (raw_value.length > policy.max_raw_length) throw new IdentityError('INVALID_ALIAS', 'raw alias exceeds namespace limit', { max_raw_length: policy.max_raw_length });
    if (policy.syntax_pattern && !(new RegExp(policy.syntax_pattern, 'u')).test(raw_value)) throw new IdentityError('INVALID_ALIAS', 'alias violates namespace syntax profile');
    const normalized = this.namespaces.normalizationProfiles.normalize(policy.normalization_profile_id, policy.normalization_profile_version, raw_value);
    const activeForEntity = [...this.aliases.values()].filter((x) => x.entity_id === canonicalEntityId && x.namespace_id === namespace_id && ['ACTIVE', 'DEPRECATED'].includes(x.state));
    if (activeForEntity.length >= policy.max_aliases) throw new IdentityError('RESOURCE_LIMIT', 'namespace alias cardinality exceeded', { max_aliases: policy.max_aliases });
    const lookupKey = `${namespace_id}\u001f${normalized}`;
    const conflicting = [...this.aliases.values()].find((x) => x.namespace_id === namespace_id && x.normalized_value === normalized && ['ACTIVE', 'DEPRECATED'].includes(x.state) && x.entity_id !== canonicalEntityId);
    if (policy.uniqueness_class === 'UNIQUE_ACTIVE' && conflicting) throw new IdentityError('DUPLICATE_ALIAS', 'normalized alias already active for another entity', { namespace_id, conflicting_alias_id: conflicting.alias_id });
    if (policy.reuse_policy === 'NEVER_REUSE' && this.usedKeys.has(lookupKey) && ![...this.aliases.values()].some((x) => x.namespace_id === namespace_id && x.normalized_value === normalized && x.entity_id === canonicalEntityId)) {
      throw new IdentityError('DUPLICATE_ALIAS', 'namespace policy prohibits alias-key reuse', { namespace_id });
    }

    const security = policy.confusable_policy === 'NONE' ? freeze({ standing: 'NOT_REQUIRED', detector_id: 'NONE', detector_version: '0', findings: [] }) : this.unicode.inspect({ raw_value, namespace_id, normalized_value: normalized });
    if (security.standing === 'NOT_EVALUATED' && ['BLOCK', 'ESCALATE'].includes(policy.confusable_policy)) throw new IdentityError('UNICODE_SECURITY_UNAVAILABLE', 'namespace requires Unicode spoofing detector', { namespace_id, policy: policy.confusable_policy });
    if (security.findings.length && policy.confusable_policy === 'BLOCK') throw new IdentityError('CONFUSABLE_IDENTIFIER', 'alias blocked by namespace Unicode security policy', { namespace_id, finding_types: security.findings.map((x) => x.finding_type) });

    const createdAt = nowIso(this.clock);
    const resolvedAliasId = alias_id || id('alias', [namespace_id, canonicalEntityId, raw_value, createdAt]);
    if (this.aliases.has(resolvedAliasId)) throw new IdentityError('DUPLICATE_ALIAS', 'alias_id already exists', { alias_id: resolvedAliasId });
    const record = freeze({
      alias_id: resolvedAliasId,
      entity_id: canonicalEntityId,
      namespace_id,
      raw_value,
      normalized_value: normalized,
      normalization_profile_id: policy.normalization_profile_id,
      normalization_profile_version: policy.normalization_profile_version,
      namespace_policy_version: policy.policy_version,
      state: security.findings.length && policy.confusable_policy === 'ESCALATE' ? 'CONFLICTED' : 'ACTIVE',
      valid_from: valid_from || createdAt,
      valid_to: null,
      created_at: createdAt
    });
    this.aliases.set(record.alias_id, record);
    this.usedKeys.add(lookupKey);
    security.findings.forEach((finding, index) => {
      const findingId = id('alias-finding', [record.alias_id, security.detector_id, security.detector_version, String(index), finding.finding_type]);
      this.findings.set(findingId, freeze({ finding_id: findingId, alias_id: record.alias_id, finding_type: finding.finding_type, severity: finding.severity, detector_id: security.detector_id, detector_version: security.detector_version, evidence: clone(finding.evidence), disposition: policy.confusable_policy === 'WARN' ? 'WARNED' : 'REVIEW_REQUIRED' }));
    });
    return record;
  }

  transition(alias_id, target, { effective_at = null } = {}) {
    const current = this.aliases.get(req(alias_id, 'alias_id'));
    if (!current) throw new IdentityError('UNKNOWN_ALIAS', 'alias not found', { alias_id });
    const allowed = target === 'DEPRECATED' ? current.state === 'ACTIVE' : target === 'ENDED' ? ['ACTIVE', 'DEPRECATED', 'CONFLICTED'].includes(current.state) : false;
    if (!allowed) throw new IdentityError('STALE_BASE', 'alias lifecycle transition not allowed', { alias_id, state: current.state, target });
    const updated = freeze({ ...current, state: target, valid_to: target === 'ENDED' ? (effective_at || nowIso(this.clock)) : current.valid_to });
    this.aliases.set(alias_id, updated);
    return updated;
  }

  deprecateAlias(alias_id) { return this.transition(alias_id, 'DEPRECATED'); }
  endAlias(alias_id, effective_at = null) { return this.transition(alias_id, 'ENDED', { effective_at }); }
  getAlias(alias_id) { const value = this.aliases.get(req(alias_id, 'alias_id')); if (!value) throw new IdentityError('UNKNOWN_ALIAS', 'alias not found'); return value; }
  listAliases(entity_id) { const canonical = assertCanonicalEntityId(entity_id); return freeze([...this.aliases.values()].filter((x) => x.entity_id === canonical).sort((a,b) => a.alias_id.localeCompare(b.alias_id))); }
  listFindings(alias_id) { req(alias_id, 'alias_id'); return freeze([...this.findings.values()].filter((x) => x.alias_id === alias_id).sort((a,b) => a.finding_id.localeCompare(b.finding_id))); }
}

class LocatorRegistry {
  constructor({ clock = () => Date.now(), entityExists = null, maxLocatorsPerEntity = 64 } = {}) {
    if (entityExists !== null && typeof entityExists !== 'function') throw new IdentityError('INVALID_PORT', 'entityExists must be function');
    if (!Number.isInteger(maxLocatorsPerEntity) || maxLocatorsPerEntity <= 0) throw new IdentityError('INVALID_CONFIGURATION', 'maxLocatorsPerEntity must be positive integer');
    this.clock = clock;
    this.entityExists = entityExists;
    this.maxLocatorsPerEntity = maxLocatorsPerEntity;
    this.locators = new Map();
  }

  registerLocator({ locator_id = null, entity_id, locator_kind, value, context_scope, source_ref, observed_at = null, freshness_ms = null }) {
    const canonical = assertCanonicalEntityId(entity_id);
    if (this.entityExists && this.entityExists(canonical) !== true) throw new IdentityError('UNKNOWN_ENTITY', 'entity does not exist', { entity_id: canonical });
    req(locator_kind, 'locator_kind'); req(value, 'locator.value'); req(context_scope, 'context_scope'); req(source_ref, 'source_ref');
    if (freshness_ms !== null && (!Number.isInteger(freshness_ms) || freshness_ms < 0)) throw new IdentityError('INVALID_LOCATOR', 'freshness_ms must be non-negative integer or null');
    const count = [...this.locators.values()].filter((x) => x.entity_id === canonical && x.state === 'ACTIVE').length;
    if (count >= this.maxLocatorsPerEntity) throw new IdentityError('RESOURCE_LIMIT', 'active locator limit exceeded', { maxLocatorsPerEntity: this.maxLocatorsPerEntity });
    const observedAt = observed_at || nowIso(this.clock);
    if (!Number.isFinite(Date.parse(observedAt))) throw new IdentityError('INVALID_LOCATOR', 'observed_at must be ISO date/time');
    const resolvedId = locator_id || id('locator', [canonical, locator_kind, value, context_scope, source_ref, observedAt]);
    if (this.locators.has(resolvedId)) throw new IdentityError('INVALID_LOCATOR', 'locator_id already exists', { locator_id: resolvedId });
    const record = freeze({ locator_id: resolvedId, entity_id: canonical, locator_kind, raw_locator: value, context_scope, source_ref, observed_at: observedAt, valid_from: observedAt, valid_to: null, freshness_ms, state: 'ACTIVE' });
    this.locators.set(resolvedId, record);
    return record;
  }

  getLocator(locator_id, { as_of_ms = null } = {}) {
    const record = this.locators.get(req(locator_id, 'locator_id'));
    if (!record) throw new IdentityError('UNKNOWN_LOCATOR', 'locator not found', { locator_id });
    const now = as_of_ms ?? this.clock();
    const stale = record.state === 'ACTIVE' && record.freshness_ms !== null && now - Date.parse(record.observed_at) > record.freshness_ms;
    return freeze({ record, standing: record.state === 'ENDED' ? 'ENDED' : stale ? 'STALE_LOCATOR' : 'CURRENT' });
  }

  endLocator(locator_id, effective_at = null) {
    const current = this.locators.get(req(locator_id, 'locator_id'));
    if (!current) throw new IdentityError('UNKNOWN_LOCATOR', 'locator not found', { locator_id });
    if (current.state !== 'ACTIVE') throw new IdentityError('STALE_BASE', 'locator already ended', { locator_id, state: current.state });
    const updated = freeze({ ...current, state: 'ENDED', valid_to: effective_at || nowIso(this.clock) });
    this.locators.set(locator_id, updated);
    return updated;
  }

  listLocators(entity_id) { const canonical = assertCanonicalEntityId(entity_id); return freeze([...this.locators.values()].filter((x) => x.entity_id === canonical).sort((a,b) => a.locator_id.localeCompare(b.locator_id))); }
}

module.exports = {
  AliasRegistry,
  IdentityNamespaceRegistry,
  LocatorRegistry,
  NormalizationProfileRegistry,
  UnicodeSecurityPort,
  assertCanonicalEntityId
};
