'use strict';

const SURFACE_CLASSES = new Set(['COMMAND', 'QUERY', 'EVENT', 'HTTP', 'FILE', 'SCHEMA']);

class ContractVersioningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ContractVersioningError';
    this.code = code;
    this.details = details;
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `${field} must be a non-empty string`, { field });
  }
  return value;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseSemVer(label) {
  const text = requiredString(label, 'version_label');
  const match = SEMVER_RE.exec(text);
  if (!match) {
    throw new ContractVersioningError('INVALID_VERSION_LABEL', `Invalid SemVer 2.0.0 label: ${text}`, { label: text, scheme_type: 'SEMVER_2_0_0' });
  }
  return deepFreeze({
    label: text,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : []
  });
}

function compareIdentifier(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSemVer(a, b) {
  const left = typeof a === 'string' ? parseSemVer(a) : a;
  const right = typeof b === 'string' ? parseSemVer(b) : b;
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    if (left.prerelease[i] === undefined) return -1;
    if (right.prerelease[i] === undefined) return 1;
    const compared = compareIdentifier(left.prerelease[i], right.prerelease[i]);
    if (compared !== 0) return compared < 0 ? -1 : 1;
  }
  return 0;
}

function parseIntegerVersion(label) {
  const text = requiredString(label, 'version_label');
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    throw new ContractVersioningError('INVALID_VERSION_LABEL', `Invalid integer version label: ${text}`, { label: text, scheme_type: 'INTEGER' });
  }
  return deepFreeze({ label: text, value: Number(text) });
}

class VersionSchemeRegistry {
  constructor() {
    this.profiles = new Map();
    this.implementations = new Map();
    this.registerVersionScheme({
      version_scheme_id: 'scheme:semver-2.0.0',
      scheme_type: 'SEMVER_2_0_0',
      parser_version: '2.0.0',
      syntax: 'MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]',
      stability_semantics: 'SEMVER_DEFINED',
      parse: parseSemVer,
      compare: compareSemVer
    });
    this.registerVersionScheme({
      version_scheme_id: 'scheme:integer-v1',
      scheme_type: 'INTEGER',
      parser_version: '1',
      syntax: 'NON_NEGATIVE_INTEGER',
      stability_semantics: 'POLICY_DEFINED',
      parse: parseIntegerVersion,
      compare: (a, b) => (typeof a === 'string' ? parseIntegerVersion(a) : a).value - (typeof b === 'string' ? parseIntegerVersion(b) : b).value
    });
  }

  registerVersionScheme(definition) {
    const id = requiredString(definition?.version_scheme_id, 'version_scheme_id');
    const type = requiredString(definition?.scheme_type, 'scheme_type');
    if (this.profiles.has(id)) {
      throw new ContractVersioningError('VERSION_SCHEME_EXISTS', `Version scheme already exists: ${id}`, { version_scheme_id: id });
    }
    if (typeof definition.parse !== 'function' || typeof definition.compare !== 'function') {
      throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'Version scheme requires deterministic parse and compare implementations', { version_scheme_id: id });
    }
    const profile = deepFreeze({
      version_scheme_id: id,
      scheme_type: type,
      parser_version: requiredString(definition.parser_version || '1', 'parser_version'),
      syntax: definition.syntax || null,
      stability_semantics: definition.stability_semantics || 'POLICY_DEFINED'
    });
    this.profiles.set(id, profile);
    this.implementations.set(id, { parse: definition.parse, compare: definition.compare });
    return profile;
  }

  getProfile(id) {
    return this.profiles.get(id) || null;
  }

  parse(id, label) {
    const impl = this.implementations.get(id);
    if (!impl) throw new ContractVersioningError('UNKNOWN_VERSION_SCHEME', `Unknown version scheme: ${id}`, { version_scheme_id: id });
    return impl.parse(label);
  }

  compare(id, a, b) {
    const impl = this.implementations.get(id);
    if (!impl) throw new ContractVersioningError('UNKNOWN_VERSION_SCHEME', `Unknown version scheme: ${id}`, { version_scheme_id: id });
    return Math.sign(impl.compare(a, b));
  }
}

class DelegatedIdentityPort {
  constructor(allocate) {
    if (typeof allocate !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port is required');
    this.allocate = allocate;
  }

  issue(kind) {
    const value = this.allocate(kind);
    return requiredString(value, `001N.${kind}`);
  }
}

class ContractFamilyRegistry {
  constructor({ identityPort }) {
    this.identity = identityPort;
    this.families = new Map();
  }

  register(record) {
    const ownerRef = requiredString(record?.owner_ref, 'owner_ref');
    if (!Array.isArray(record?.surface_classes) || record.surface_classes.length === 0) {
      throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'At least one typed contract surface is required');
    }
    const surfaceClasses = [...new Set(record.surface_classes)];
    for (const kind of surfaceClasses) {
      if (!SURFACE_CLASSES.has(kind)) {
        throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `Unsupported contract surface class: ${kind}`, { surface_class: kind });
      }
    }
    const familyId = this.identity.issue('CONTRACT_FAMILY');
    const surfaces = surfaceClasses.sort().map((kind) => deepFreeze({
      surface_id: this.identity.issue('CONTRACT_SURFACE'),
      contract_family_id: familyId,
      kind,
      element_scope: clone(record.element_scope?.[kind] || null)
    }));
    const family = deepFreeze({
      contract_family_id: familyId,
      name: record.name || null,
      owner_ref: ownerRef,
      surfaces,
      default_version_scheme_id: record.default_version_scheme_id || null,
      default_compatibility_policy_id: record.default_compatibility_policy_id || null,
      lifecycle: 'ACTIVE'
    });
    this.families.set(familyId, family);
    return family;
  }

  get(id) {
    const record = this.families.get(id);
    if (!record) throw new ContractVersioningError('UNKNOWN_CONTRACT_FAMILY', `Unknown contract family: ${id}`, { contract_family_id: id });
    return record;
  }
}

class ContractDraftManager {
  constructor({ identityPort, families, versions }) {
    this.identity = identityPort;
    this.families = families;
    this.versions = versions;
    this.drafts = new Map();
  }

  create(record) {
    const family = this.families.get(record.contract_family_id);
    if (record.base_version_id) {
      const base = this.versions.get(record.base_version_id);
      if (base.contract_family_id !== family.contract_family_id) {
        throw new ContractVersioningError('STALE_DRAFT_BASE', 'Base version belongs to a different contract family');
      }
    }
    const draft = deepFreeze({
      draft_id: this.identity.issue('CONTRACT_DRAFT'),
      contract_family_id: family.contract_family_id,
      base_version_id: record.base_version_id || null,
      base_family_revision: this.versions.familyRevision(family.contract_family_id),
      draft_revision: 0,
      version_scheme_id: record.version_scheme_id || family.default_version_scheme_id || null,
      version_label: record.version_label || null,
      candidate_artifact_ref: record.candidate_artifact_ref || null,
      semantic_metadata: clone(record.semantic_metadata || {}),
      actor_ref: record.actor_ref || null,
      state: 'DRAFT'
    });
    this.drafts.set(draft.draft_id, draft);
    return draft;
  }

  get(id) {
    const draft = this.drafts.get(id);
    if (!draft) throw new ContractVersioningError('UNKNOWN_DRAFT', `Unknown contract draft: ${id}`, { draft_id: id });
    return draft;
  }

  applyChange({ draft_id, expected_revision, patch }) {
    const current = this.get(draft_id);
    if (current.state !== 'DRAFT' || current.draft_revision !== expected_revision) {
      throw new ContractVersioningError('STALE_DRAFT_BASE', 'Draft revision does not match current draft state', {
        draft_id,
        expected_revision,
        actual_revision: current.draft_revision,
        state: current.state
      });
    }
    const allowed = ['version_scheme_id', 'version_label', 'candidate_artifact_ref', 'semantic_metadata'];
    const changes = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(patch || {}, key)) changes[key] = clone(patch[key]);
    const next = deepFreeze({ ...current, ...changes, draft_revision: current.draft_revision + 1 });
    this.drafts.set(draft_id, next);
    return next;
  }

  markPublished(draftId) {
    const current = this.get(draftId);
    const published = deepFreeze({ ...current, state: 'PUBLISHED' });
    this.drafts.set(draftId, published);
    return published;
  }
}

class ContractVersionRegistry {
  constructor() {
    this.versions = new Map();
    this.uniqueLabels = new Map();
    this.familyRevisions = new Map();
  }

  familyRevision(familyId) {
    return this.familyRevisions.get(familyId) || 0;
  }

  publish(version) {
    const key = `${version.contract_family_id}\u0000${version.version_scheme_id}\u0000${version.version_label}`;
    if (this.uniqueLabels.has(key)) {
      throw new ContractVersioningError('DUPLICATE_VERSION_LABEL', 'Family + scheme + version label already exists', {
        existing_contract_version_id: this.uniqueLabels.get(key),
        contract_family_id: version.contract_family_id,
        version_scheme_id: version.version_scheme_id,
        version_label: version.version_label
      });
    }
    const frozen = deepFreeze(clone(version));
    this.versions.set(frozen.contract_version_id, frozen);
    this.uniqueLabels.set(key, frozen.contract_version_id);
    this.familyRevisions.set(frozen.contract_family_id, this.familyRevision(frozen.contract_family_id) + 1);
    return frozen;
  }

  get(id) {
    const version = this.versions.get(id);
    if (!version) throw new ContractVersioningError('UNKNOWN_CONTRACT_VERSION', `Unknown contract version: ${id}`, { contract_version_id: id });
    return version;
  }

  list(familyId, schemeRegistry) {
    const records = [...this.versions.values()].filter((record) => record.contract_family_id === familyId);
    return records.sort((a, b) => {
      if (a.version_scheme_id !== b.version_scheme_id) return a.version_scheme_id.localeCompare(b.version_scheme_id);
      return schemeRegistry.compare(a.version_scheme_id, a.version_label, b.version_label);
    });
  }

  resolveExact(familyId, schemeId, label) {
    const key = `${familyId}\u0000${schemeId}\u0000${label}`;
    const id = this.uniqueLabels.get(key);
    return id ? [this.get(id)] : [];
  }
}

class ContractService {
  constructor({ identityAllocator }) {
    this.identity = new DelegatedIdentityPort(identityAllocator);
    this.schemes = new VersionSchemeRegistry();
    this.families = new ContractFamilyRegistry({ identityPort: this.identity });
    this.versions = new ContractVersionRegistry();
    this.drafts = new ContractDraftManager({ identityPort: this.identity, families: this.families, versions: this.versions });
    this.receipts = new Map();
    this.persistence_standing = 'PORTABLE_IN_MEMORY_CANDIDATE__001P_NOT_BOUND';
  }

  registerVersionScheme(definition) { return this.schemes.registerVersionScheme(definition); }
  registerContractFamily(record) { return this.families.register(record); }
  getContractFamily(id) { return this.families.get(id); }
  createContractDraft(record) { return this.drafts.create(record); }
  applyContractDraftChange(record) { return this.drafts.applyChange(record); }
  getContractVersion(id) { return this.versions.get(id); }
  listContractVersions(familyId) { this.families.get(familyId); return this.versions.list(familyId, this.schemes); }
  resolveContractVersion({ contract_family_id, version_scheme_id, version_label }) {
    this.families.get(contract_family_id);
    this.schemes.parse(version_scheme_id, version_label);
    return this.versions.resolveExact(contract_family_id, version_scheme_id, version_label);
  }

  publishContractVersion(record) {
    const commandId = requiredString(record?.command_id, 'command_id');
    const semanticRequest = stable({
      draft_id: record.draft_id,
      expected_revision: record.expected_revision,
      actor_ref: record.actor_ref || null
    });
    const prior = this.receipts.get(commandId);
    if (prior) {
      if (prior.semantic_request !== semanticRequest) {
        throw new ContractVersioningError('DUPLICATE_COMMAND', 'command_id was already used for a different semantic request', { command_id: commandId });
      }
      return prior.receipt;
    }

    const draft = this.drafts.get(record.draft_id);
    if (draft.state !== 'DRAFT' || draft.draft_revision !== record.expected_revision) {
      throw new ContractVersioningError('STALE_DRAFT_BASE', 'Draft revision changed before publish', {
        draft_id: draft.draft_id,
        expected_revision: record.expected_revision,
        actual_revision: draft.draft_revision,
        state: draft.state
      });
    }
    const currentFamilyRevision = this.versions.familyRevision(draft.contract_family_id);
    if (currentFamilyRevision !== draft.base_family_revision) {
      throw new ContractVersioningError('STALE_DRAFT_BASE', 'Contract family advanced after draft creation', {
        draft_id: draft.draft_id,
        base_family_revision: draft.base_family_revision,
        current_family_revision: currentFamilyRevision
      });
    }
    const schemeId = requiredString(draft.version_scheme_id, 'draft.version_scheme_id');
    const versionLabel = requiredString(draft.version_label, 'draft.version_label');
    this.schemes.parse(schemeId, versionLabel);
    if (!draft.candidate_artifact_ref) {
      throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'candidate_artifact_ref is required before publish');
    }

    const version = this.versions.publish({
      contract_version_id: this.identity.issue('CONTRACT_VERSION'),
      contract_family_id: draft.contract_family_id,
      version_scheme_id: schemeId,
      version_label: versionLabel,
      artifact_ref: draft.candidate_artifact_ref,
      semantic_metadata: clone(draft.semantic_metadata),
      state: 'PUBLISHED',
      published_at: record.published_at || null,
      actor_ref: record.actor_ref || null
    });
    this.drafts.markPublished(draft.draft_id);
    const receipt = deepFreeze({
      receipt_id: this.identity.issue('CONTRACT_RECEIPT'),
      command_id: commandId,
      command: 'PublishContractVersion',
      contract_version_id: version.contract_version_id,
      draft_id: draft.draft_id,
      result: 'PUBLISHED',
      persistence_standing: this.persistence_standing
    });
    this.receipts.set(commandId, { semantic_request: semanticRequest, receipt });
    return receipt;
  }
}

module.exports = {
  ContractService,
  ContractVersioningError,
  DelegatedIdentityPort,
  SURFACE_CLASSES,
  VersionSchemeRegistry,
  compareSemVer,
  parseSemVer
};
