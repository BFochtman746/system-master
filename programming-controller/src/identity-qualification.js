'use strict';

const { IdentityError, bytesToUuid, uuidToBytes, uuidVersion } = require('./identity');

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

const REQUIREMENT_PACKAGES = Object.freeze({
  'IMPL-001N-01': [1,2,3,4,5,6,31,41],
  'IMPL-001N-02': [7,8,9,10,11,12],
  'IMPL-001N-03': [13,14,15,16,17,25,38],
  'IMPL-001N-04': [18,19,20,21,22,23,24],
  'IMPL-001N-05': [26,27,28,29,30,31,32,33],
  'IMPL-001N-06': [34,35,36,37],
  'IMPL-001N-07': [39,40,41,42]
});

const QUALIFICATION_FAMILIES = Object.freeze([
  ['QUAL-001N-01','UUID conformance','UNIT;PROPERTY;RFC_VECTOR;CROSS_PLATFORM','PORTABLE'],
  ['QUAL-001N-02','Collision and uniqueness','PROPERTY;CONCURRENCY;FAULT_INJECTION','PORTABLE_PLUS_STORE'],
  ['QUAL-001N-03','Namespace/alias semantics','UNIT;STATE;PROPERTY;CONCURRENCY','PORTABLE'],
  ['QUAL-001N-04','Unicode identifier security','UNICODE;FUZZ;SECURITY;COMPATIBILITY','PORTABLE_ADAPTER'],
  ['QUAL-001N-05','Resolution truth','PROPERTY;ADVERSARIAL;E2E','PORTABLE'],
  ['QUAL-001N-06','External bindings','CONTRACT;INTEGRATION;SECURITY','PORTABLE_FIXTURE'],
  ['QUAL-001N-07','Lineage/adjudication','GRAPH;STATE;AUTHZ;PROPERTY;E2E','PORTABLE'],
  ['QUAL-001N-08','Concurrency/idempotency/crash','CONCURRENCY;CRASH_RESTART;IDEMPOTENCY;FAULT_INJECTION','PORTABLE_PORTS'],
  ['QUAL-001N-09','Migration/rollback','MIGRATION;E2E;ADVERSARIAL;CRASH_RESTART','PORTABLE_FIXTURE'],
  ['QUAL-001N-10','Security/privacy','SECURITY;PRIVACY;ADVERSARIAL','PORTABLE_PORTS'],
  ['QUAL-001N-11','Performance/resource','BENCHMARK;LOAD;RESOURCE;SOAK','EXACT_STORE_WORKLOAD'],
  ['QUAL-001N-12','Schema/compatibility','SCHEMA;CONTRACT;COMPATIBILITY;MIGRATION','PORTABLE'],
  ['QUAL-001N-13','Evidence/provenance','EVIDENCE;LOG_REDACTION;FAULT_INJECTION','PORTABLE_PORTS'],
  ['QUAL-001N-14','Target qualification','REAL_DEVICE;TARGET_STORE;CRASH_RESTART;PERFORMANCE','AUD-036_TARGET_ONLY']
]);

class IdentityQualificationProfile001N {
  constructor() {
    const packageByRequirement = new Map();
    for (const [implementationPackage, numbers] of Object.entries(REQUIREMENT_PACKAGES)) {
      for (const number of numbers) {
        if (!packageByRequirement.has(number)) packageByRequirement.set(number, []);
        packageByRequirement.get(number).push(implementationPackage);
      }
    }
    this.requirements = Object.freeze(Array.from({ length: 42 }, (_, index) => {
      const number = index + 1;
      const packages = packageByRequirement.get(number) || [];
      if (!packages.length) throw new IdentityError('QUALIFICATION_DESTINATION_MISSING', `No implementation package for BS-001N-${String(number).padStart(3,'0')}`);
      return freeze({
        requirement_id: `BS-001N-${String(number).padStart(3,'0')}`,
        implementation_packages: packages.slice().sort(),
        qualification_destination: number >= 39 ? 'QUAL-001N-11/14' : 'REGRESSION_MATRIX'
      });
    }));
    this.families = Object.freeze(QUALIFICATION_FAMILIES.map(([qualification_id, subject, methods, evidence_stage]) => freeze({ qualification_id, subject, methods: methods.split(';'), evidence_stage })));
  }

  getPlan() {
    return freeze({
      profile_id: 'IdentityQualificationProfile001N',
      authority_id: 'PROGRAMMING-FOUNDATION-001N',
      requirement_count: this.requirements.length,
      qualification_family_count: this.families.length,
      requirements: this.requirements,
      qualification_families: this.families,
      coverage_standing: this.requirements.length === 42 ? '42_OF_42_DESTINATIONS_BOUND' : 'INCOMPLETE',
      target_family: 'QUAL-001N-14'
    });
  }
}

class IdentityResourceBudget {
  constructor({ limits = {} } = {}) {
    this.limits = freeze({
      ALIASES_PER_ENTITY: limits.ALIASES_PER_ENTITY ?? 64,
      LOCATORS_PER_ENTITY: limits.LOCATORS_PER_ENTITY ?? 64,
      EXTERNAL_BINDINGS_PER_ENTITY: limits.EXTERNAL_BINDINGS_PER_ENTITY ?? 64,
      RESOLUTION_CANDIDATES: limits.RESOLUTION_CANDIDATES ?? 256,
      NORMALIZATION_INPUT_BYTES: limits.NORMALIZATION_INPUT_BYTES ?? 4096,
      LINEAGE_TRAVERSAL_NODES: limits.LINEAGE_TRAVERSAL_NODES ?? 1024,
      MIGRATION_BATCH_RECORDS: limits.MIGRATION_BATCH_RECORDS ?? 10000
    });
    for (const [kind, limit] of Object.entries(this.limits)) {
      if (!Number.isInteger(limit) || limit <= 0) throw new IdentityError('INVALID_CONFIGURATION', 'Identity resource limits must be positive integers', { kind, limit });
    }
  }

  admit(kind, requested) {
    const limit = this.limits[req(kind, 'resource_kind')];
    if (limit === undefined) throw new IdentityError('INVALID_CONFIGURATION', `Unknown identity resource budget: ${kind}`);
    if (!Number.isInteger(requested) || requested < 0) throw new IdentityError('INVALID_CONFIGURATION', 'requested resource must be non-negative integer', { kind, requested });
    if (requested > limit) {
      const code = kind === 'RESOLUTION_CANDIDATES' ? 'TOO_MANY_MATCHES' : kind === 'MIGRATION_BATCH_RECORDS' ? 'IMPORT_LIMIT' : 'RESOURCE_LIMIT';
      throw new IdentityError(code, 'Identity operation exceeds admitted resource budget; authoritative completeness cannot be claimed', { kind, requested, limit, complete: false });
    }
    return freeze({ kind, requested, limit, standing: 'ADMITTED_COMPLETE', complete: true });
  }

  admitNormalization(raw) {
    if (typeof raw !== 'string') throw new IdentityError('INVALID_ALIAS', 'normalization input must be string');
    return this.admit('NORMALIZATION_INPUT_BYTES', Buffer.byteLength(raw, 'utf8'));
  }
}

const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
};

class IdentityPerformanceEvidenceRegistry {
  constructor() { this.records = []; }

  recordMeasurement({ store_adapter_id, store_adapter_version, workload_profile_id, workload_profile_version, environment_fingerprint, operation, unit, samples, subject_sha = null }) {
    const values = Array.isArray(samples) ? samples.slice() : [];
    if (!values.length || values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new IdentityError('PERFORMANCE_EVIDENCE_INVALID', 'Performance evidence requires non-empty finite non-negative numeric samples');
    }
    const sorted = values.slice().sort((a,b) => a-b);
    const record = freeze({
      store_adapter_id: req(store_adapter_id, 'store_adapter_id'),
      store_adapter_version: req(store_adapter_version, 'store_adapter_version'),
      workload_profile_id: req(workload_profile_id, 'workload_profile_id'),
      workload_profile_version: req(workload_profile_version, 'workload_profile_version'),
      environment_fingerprint: req(environment_fingerprint, 'environment_fingerprint'),
      operation: req(operation, 'operation'),
      unit: req(unit, 'unit'),
      subject_sha,
      sample_count: sorted.length,
      min: sorted[0],
      median: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted[sorted.length - 1],
      standing: 'MEASURED_EXACT_SUBJECT'
    });
    this.records.push(record);
    return record;
  }

  standing(query) {
    const required = ['store_adapter_id','store_adapter_version','workload_profile_id','workload_profile_version','environment_fingerprint','operation'];
    for (const field of required) req(query?.[field], field);
    const matches = this.records.filter((record) => required.every((field) => record[field] === query[field]));
    return freeze(matches.length
      ? { standing: 'MEASURED', records: matches.slice(), tuning_claim_allowed: true, exact_store_workload_bound: true }
      : { standing: 'NOT_MEASURED', records: [], tuning_claim_allowed: false, exact_store_workload_bound: true });
  }
}

class IdentityPortabilityProbe {
  constructor({ environment = {} } = {}) {
    this.environment = freeze({
      runtime: environment.runtime || `node:${process.version}`,
      platform: environment.platform || process.platform,
      arch: environment.arch || process.arch
    });
  }

  verifyCanonicalVector({ value, expected_version, adapters = [] }) {
    const canonical = req(value, 'uuid').toLowerCase();
    if (uuidVersion(canonical) !== expected_version) throw new IdentityError('INVALID_ID_PROFILE', 'UUID vector has unexpected version', { expected_version, actual_version: uuidVersion(canonical) });
    const bytes = uuidToBytes(canonical);
    if (bytesToUuid(bytes) !== canonical) throw new IdentityError('INVALID_ID_PROFILE', 'Canonical bytes/text round-trip changed UUID equality');
    const results = [freeze({ adapter_id: 'builtin-rfc9562-bytes-text', standing: 'PASS', value: canonical })];
    for (const adapter of adapters) {
      req(adapter?.adapter_id, 'adapter_id');
      if (typeof adapter.encode !== 'function' || typeof adapter.decode !== 'function') throw new IdentityError('INVALID_PORT', 'Portability adapter requires encode/decode');
      const encoded = adapter.encode(canonical);
      const decoded = String(adapter.decode(encoded)).toLowerCase();
      if (decoded !== canonical) throw new IdentityError('INVALID_ID_PROFILE', 'Store/language adapter changed canonical UUID equality', { adapter_id: adapter.adapter_id, expected: canonical, actual: decoded });
      results.push(freeze({ adapter_id: adapter.adapter_id, standing: 'PASS', value: decoded }));
    }
    return freeze({
      value: canonical,
      expected_version,
      byte_length: bytes.length,
      environment: this.environment,
      adapters: results,
      standing: 'PORTABLE_CANONICAL_ROUNDTRIP_PASS',
      cross_platform_standing: adapters.length >= 2 ? 'MULTI_ADAPTER_PASS' : 'ADDITIONAL_PLATFORM_EVIDENCE_PENDING'
    });
  }
}

const TARGET_REQUIREMENTS = Object.freeze([
  'TARGET_UUID_LIBRARY',
  'TARGET_PHYSICAL_DATABASE_INDEX',
  'TARGET_ENCRYPTION_PROVIDER',
  'TARGET_OS_NORMALIZATION'
]);

class IdentityTargetEvidenceRegister {
  constructor() { this.evidence = new Map(); }

  add({ requirement, evidence_stage, target_id, evidence_ref, exact_subject_sha, provider_id = null }) {
    if (!TARGET_REQUIREMENTS.includes(requirement)) throw new IdentityError('INVALID_TARGET_EVIDENCE', 'Unknown target evidence requirement', { requirement });
    if (evidence_stage !== 'AUD-036') throw new IdentityError('INVALID_TARGET_EVIDENCE', 'Off-target evidence cannot satisfy AUD-036 target evidence', { requirement, evidence_stage });
    const record = freeze({
      requirement,
      evidence_stage,
      target_id: req(target_id, 'target_id'),
      evidence_ref: req(evidence_ref, 'evidence_ref'),
      exact_subject_sha: req(exact_subject_sha, 'exact_subject_sha'),
      provider_id,
      standing: 'TARGET_EVIDENCE_PRESENT'
    });
    this.evidence.set(requirement, record);
    return record;
  }

  standing() {
    const missing = TARGET_REQUIREMENTS.filter((requirement) => !this.evidence.has(requirement));
    return freeze({
      standing: missing.length ? 'TARGET_NATIVE_PENDING' : 'TARGET_NATIVE_QUALIFIED',
      required: TARGET_REQUIREMENTS.slice(),
      present: [...this.evidence.keys()].sort(),
      missing,
      portable_evidence_cannot_satisfy_missing: true
    });
  }
}

class IdentityPortableClosure {
  constructor({ qualificationProfile = new IdentityQualificationProfile001N(), targetEvidence = new IdentityTargetEvidenceRegister() } = {}) {
    this.profile = qualificationProfile;
    this.targetEvidence = targetEvidence;
  }

  standing({ hosted_test_total, hosted_test_passed, exact_head_sha }) {
    if (!Number.isInteger(hosted_test_total) || hosted_test_total <= 0 || hosted_test_passed !== hosted_test_total) {
      return freeze({ standing: 'PORTABLE_QUALIFICATION_INCOMPLETE', exact_head_sha: exact_head_sha || null, hosted_test_total, hosted_test_passed, target: this.targetEvidence.standing() });
    }
    const plan = this.profile.getPlan();
    if (plan.coverage_standing !== '42_OF_42_DESTINATIONS_BOUND') throw new IdentityError('QUALIFICATION_DESTINATION_MISSING', '001N 42/42 destination map incomplete');
    return freeze({
      standing: 'PORTABLE_HOSTED_QUALIFIED',
      exact_head_sha: req(exact_head_sha, 'exact_head_sha'),
      hosted_test_total,
      hosted_test_passed,
      requirement_coverage: plan.coverage_standing,
      target: this.targetEvidence.standing(),
      production_target_claim_allowed: this.targetEvidence.standing().standing === 'TARGET_NATIVE_QUALIFIED'
    });
  }
}

module.exports = {
  IdentityPerformanceEvidenceRegistry,
  IdentityPortabilityProbe,
  IdentityPortableClosure,
  IdentityQualificationProfile001N,
  IdentityResourceBudget,
  IdentityTargetEvidenceRegister,
  QUALIFICATION_FAMILIES,
  REQUIREMENT_PACKAGES,
  TARGET_REQUIREMENTS
};
