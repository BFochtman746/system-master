'use strict';

const crypto = require('node:crypto');
const { ContractVersioningError } = require('./contract-versioning');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

class CanonicalizationProfileRegistry {
  constructor() {
    this.profiles = new Map();
    this.implementations = new Map();
    this.register({
      canonicalization_profile_id: 'canon:json-sorted-v1',
      profile_version: '1',
      format: 'JSON',
      dialect: 'GENERIC_JSON',
      canonicalize: (raw) => canonicalJson(JSON.parse(raw.toString('utf8')))
    });
  }

  register(definition) {
    const id = String(definition?.canonicalization_profile_id || '');
    if (!id) throw new ContractVersioningError('CANONICALIZATION_FAILED', 'canonicalization_profile_id is required');
    if (this.profiles.has(id)) throw new ContractVersioningError('CANONICALIZATION_PROFILE_EXISTS', `Profile already registered: ${id}`);
    if (typeof definition.canonicalize !== 'function') throw new ContractVersioningError('CANONICALIZATION_FAILED', 'canonicalize implementation is required', { canonicalization_profile_id: id });
    const profile = freeze({
      canonicalization_profile_id: id,
      profile_version: String(definition.profile_version || '1'),
      format: String(definition.format || 'UNKNOWN'),
      dialect: String(definition.dialect || 'UNKNOWN')
    });
    this.profiles.set(id, profile);
    this.implementations.set(id, definition.canonicalize);
    return profile;
  }

  resolve(id) {
    const profile = this.profiles.get(id);
    if (!profile) throw new ContractVersioningError('CANONICALIZATION_FAILED', `Unknown canonicalization profile: ${id}`, { canonicalization_profile_id: id });
    return { profile, canonicalize: this.implementations.get(id) };
  }
}

class ContractArtifactRegistry {
  constructor({ identityAllocator, secretScanner = null, maxBytes = 1024 * 1024 } = {}) {
    if (typeof identityAllocator !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port is required for artifacts');
    this.identityAllocator = identityAllocator;
    this.secretScanner = secretScanner;
    this.maxBytes = maxBytes;
    this.profiles = new CanonicalizationProfileRegistry();
    this.artifacts = new Map();
  }

  registerCanonicalizationProfile(definition) { return this.profiles.register(definition); }

  ingest({ raw, format, dialect, source_provenance, canonicalization_profile_id = null }) {
    const bytes = Buffer.isBuffer(raw) ? Buffer.from(raw) : Buffer.from(String(raw), 'utf8');
    if (bytes.length > this.maxBytes) {
      throw new ContractVersioningError('RESOURCE_LIMIT_EXCEEDED', 'Contract artifact exceeds admitted size', { size: bytes.length, max_bytes: this.maxBytes });
    }
    const rawDigest = sha256(bytes);
    const artifactId = String(this.identityAllocator('CONTRACT_ARTIFACT'));
    if (!artifactId) throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N returned an empty artifact identity');

    if (this.secretScanner) {
      const findings = this.secretScanner(bytes) || [];
      if (findings.length) {
        throw new ContractVersioningError('SECRET_DETECTED', 'Contract artifact rejected by secret exclusion policy', {
          artifact_id: artifactId,
          raw_digest: rawDigest,
          finding_count: findings.length
        });
      }
    }

    const base = {
      artifact_id: artifactId,
      format: String(format || 'UNKNOWN'),
      dialect: String(dialect || 'UNKNOWN'),
      raw_digest: rawDigest,
      raw_size: bytes.length,
      source_provenance: source_provenance || null,
      canonicalization_profile_id: canonicalization_profile_id || null,
      canonicalization_profile_version: null,
      canonical_digest: null,
      canonical_form: null,
      canonicalization_status: canonicalization_profile_id ? 'REQUESTED' : 'NOT_REQUESTED'
    };

    if (!canonicalization_profile_id) {
      const record = freeze(base);
      this.artifacts.set(artifactId, record);
      return record;
    }

    try {
      const { profile, canonicalize } = this.profiles.resolve(canonicalization_profile_id);
      if (profile.format !== base.format || profile.dialect !== base.dialect) {
        throw new ContractVersioningError('CANONICALIZATION_FAILED', 'Canonicalization profile format/dialect does not match artifact', {
          profile_format: profile.format,
          artifact_format: base.format,
          profile_dialect: profile.dialect,
          artifact_dialect: base.dialect
        });
      }
      const canonicalText = String(canonicalize(bytes));
      const canonicalBytes = Buffer.from(canonicalText, 'utf8');
      const record = freeze({
        ...base,
        canonicalization_profile_version: profile.profile_version,
        canonical_digest: sha256(canonicalBytes),
        canonical_form: canonicalText,
        canonicalization_status: 'COMPLETE'
      });
      this.artifacts.set(artifactId, record);
      return record;
    } catch (error) {
      const record = freeze({
        ...base,
        canonicalization_status: 'FAILED',
        canonicalization_error_code: error.code || 'CANONICALIZATION_FAILED'
      });
      this.artifacts.set(artifactId, record);
      return record;
    }
  }

  getArtifact(id) {
    const record = this.artifacts.get(id);
    if (!record) throw new ContractVersioningError('UNKNOWN_CONTRACT_ARTIFACT', `Unknown contract artifact: ${id}`, { artifact_id: id });
    return record;
  }

  verify({ artifact_id, raw }) {
    const artifact = this.getArtifact(artifact_id);
    const bytes = Buffer.isBuffer(raw) ? Buffer.from(raw) : Buffer.from(String(raw), 'utf8');
    const actualRaw = sha256(bytes);
    if (actualRaw !== artifact.raw_digest) {
      throw new ContractVersioningError('DIGEST_MISMATCH', 'Raw contract artifact digest mismatch', { artifact_id, expected: artifact.raw_digest, actual: actualRaw });
    }
    if (artifact.canonical_digest) {
      const { canonicalize } = this.profiles.resolve(artifact.canonicalization_profile_id);
      const actualCanonical = sha256(Buffer.from(String(canonicalize(bytes)), 'utf8'));
      if (actualCanonical !== artifact.canonical_digest) {
        throw new ContractVersioningError('DIGEST_MISMATCH', 'Canonical contract digest mismatch', { artifact_id, expected: artifact.canonical_digest, actual: actualCanonical });
      }
    }
    return freeze({ artifact_id, verified: true, raw_digest: artifact.raw_digest, canonical_digest: artifact.canonical_digest });
  }
}

function pointerEscape(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

function diffValues(source, target, path, operations) {
  if (Object.is(source, target)) return;
  const sourceObject = source && typeof source === 'object';
  const targetObject = target && typeof target === 'object';
  if (!sourceObject || !targetObject || Array.isArray(source) !== Array.isArray(target)) {
    operations.push({ op: 'replace', path: path || '/', before: source, after: target });
    return;
  }
  if (Array.isArray(source)) {
    const max = Math.max(source.length, target.length);
    for (let index = 0; index < max; index += 1) {
      const child = `${path}/${index}`;
      if (index >= source.length) operations.push({ op: 'add', path: child, after: target[index] });
      else if (index >= target.length) operations.push({ op: 'remove', path: child, before: source[index] });
      else diffValues(source[index], target[index], child, operations);
    }
    return;
  }
  const keys = [...new Set([...Object.keys(source), ...Object.keys(target)])].sort();
  for (const key of keys) {
    const child = `${path}/${pointerEscape(key)}`;
    if (!Object.prototype.hasOwnProperty.call(source, key)) operations.push({ op: 'add', path: child, after: target[key] });
    else if (!Object.prototype.hasOwnProperty.call(target, key)) operations.push({ op: 'remove', path: child, before: source[key] });
    else diffValues(source[key], target[key], child, operations);
  }
}

class ContractDiffEngine {
  diff({ source_version_id, target_version_id, source_artifact, target_artifact }) {
    if (!source_version_id || !target_version_id) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'Exact source and target version IDs are required');
    if (!source_artifact?.canonical_digest || !target_artifact?.canonical_digest) {
      throw new ContractVersioningError('DIFF_INCOMPLETE', 'Both artifacts require canonical forms for normalized diff');
    }
    if (source_artifact.canonicalization_profile_id !== target_artifact.canonicalization_profile_id ||
        source_artifact.canonicalization_profile_version !== target_artifact.canonicalization_profile_version) {
      throw new ContractVersioningError('DIFF_INCOMPLETE', 'Canonicalization profile drift prevents a normalized diff');
    }
    let source;
    let target;
    try {
      source = JSON.parse(source_artifact.canonical_form);
      target = JSON.parse(target_artifact.canonical_form);
    } catch (_) {
      throw new ContractVersioningError('DIFF_INCOMPLETE', 'Current portable diff adapter requires JSON canonical forms');
    }
    const operations = [];
    diffValues(source, target, '', operations);
    return freeze({
      source_version_id,
      target_version_id,
      source_canonical_digest: source_artifact.canonical_digest,
      target_canonical_digest: target_artifact.canonical_digest,
      canonicalization_profile_id: source_artifact.canonicalization_profile_id,
      canonicalization_profile_version: source_artifact.canonicalization_profile_version,
      operations: operations.map((op) => freeze(op)),
      complete: true,
      compatibility_verdict: null
    });
  }
}

module.exports = {
  CanonicalizationProfileRegistry,
  ContractArtifactRegistry,
  ContractDiffEngine,
  canonicalJson,
  sha256
};
