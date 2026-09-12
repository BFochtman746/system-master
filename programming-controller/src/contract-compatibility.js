'use strict';

const crypto = require('node:crypto');
const { ContractVersioningError } = require('./contract-versioning');

const COMPATIBILITY_AXES = Object.freeze([
  'SCHEMA_WIRE',
  'SOURCE_GENERATED_CODE',
  'BEHAVIOR',
  'ERROR',
  'AUTHORIZATION_SECURITY',
  'OPERATIONAL_MIGRATION'
]);
const OUTCOMES = Object.freeze(['COMPATIBLE', 'INCOMPATIBLE', 'CONDITIONAL', 'UNKNOWN', 'FAILED', 'NOT_APPLICABLE']);
const DIRECTIONS = Object.freeze(['BACKWARD', 'FORWARD', 'FULL', 'POLICY_SPECIFIC']);
const BASELINE_SCOPES = Object.freeze(['LATEST_ONLY', 'TRANSITIVE']);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function string(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `${field} is required`, { field });
  return value;
}

class CompatibilityPolicyRegistry {
  constructor({ identityAllocator }) {
    if (typeof identityAllocator !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port required');
    this.allocate = identityAllocator;
    this.policies = new Map();
  }

  register(record) {
    const direction = string(record?.direction, 'direction');
    const baselineScope = string(record?.baseline_scope || 'LATEST_ONLY', 'baseline_scope');
    if (!DIRECTIONS.includes(direction)) throw new ContractVersioningError('COMPATIBILITY_POLICY_MISSING', `Unsupported compatibility direction: ${direction}`);
    if (!BASELINE_SCOPES.includes(baselineScope)) throw new ContractVersioningError('COMPATIBILITY_POLICY_MISSING', `Unsupported baseline scope: ${baselineScope}`);
    if (!Array.isArray(record?.axes) || record.axes.length === 0) throw new ContractVersioningError('COMPATIBILITY_POLICY_MISSING', 'Policy must declare axes');
    const axes = record.axes.map((entry) => {
      const axis = typeof entry === 'string' ? entry : entry.axis;
      if (!COMPATIBILITY_AXES.includes(axis)) throw new ContractVersioningError('COMPATIBILITY_POLICY_MISSING', `Unknown compatibility axis: ${axis}`);
      return freeze({ axis, required: typeof entry === 'string' ? true : entry.required !== false, applicability: typeof entry === 'string' ? 'APPLICABLE' : (entry.applicability || 'APPLICABLE') });
    });
    const policyId = String(this.allocate('COMPATIBILITY_POLICY'));
    const payload = {
      compatibility_policy_id: policyId,
      policy_version: string(record.policy_version, 'policy_version'),
      direction,
      baseline_scope: baselineScope,
      axes,
      required_adapter_profile_ids: [...new Set(record.required_adapter_profile_ids || [])].sort(),
      blocking_rules: [...new Set(record.blocking_rules || [])].sort(),
      environment_assumptions: record.environment_assumptions || null
    };
    const policy = freeze({ ...payload, policy_digest: digest(payload) });
    this.policies.set(policyId, policy);
    return policy;
  }

  get(id) {
    const policy = this.policies.get(id);
    if (!policy) throw new ContractVersioningError('COMPATIBILITY_POLICY_MISSING', `Unknown compatibility policy: ${id}`, { compatibility_policy_id: id });
    return policy;
  }
}

class FormatAdapterRegistry {
  constructor({ identityAllocator }) {
    if (typeof identityAllocator !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port required');
    this.allocate = identityAllocator;
    this.profiles = new Map();
    this.evaluators = new Map();
  }

  register(record) {
    const profileId = String(this.allocate('FORMAT_ADAPTER_PROFILE'));
    const supportedAxes = [...new Set(record.supported_axes || [])].sort();
    for (const axis of supportedAxes) if (!COMPATIBILITY_AXES.includes(axis)) throw new ContractVersioningError('UNSUPPORTED_CONTRACT_DIALECT', `Adapter declares unknown axis: ${axis}`);
    if (typeof record.evaluate !== 'function') throw new ContractVersioningError('UNSUPPORTED_CONTRACT_DIALECT', 'Adapter evaluator is required');
    const profile = freeze({
      adapter_profile_id: profileId,
      format: string(record.format, 'format'),
      dialects: [...new Set(record.dialects || [])].sort(),
      tool: string(record.tool, 'tool'),
      tool_version: string(record.tool_version, 'tool_version'),
      adapter_version: string(record.adapter_version || '1', 'adapter_version'),
      supported_axes: supportedAxes,
      execution_boundary: record.execution_boundary || '001X_PROVIDER',
      qualification_standing: record.qualification_standing || 'PROVIDER_PENDING'
    });
    this.profiles.set(profileId, profile);
    this.evaluators.set(profileId, record.evaluate);
    return profile;
  }

  get(id) {
    const profile = this.profiles.get(id);
    if (!profile) throw new ContractVersioningError('UNSUPPORTED_CONTRACT_DIALECT', `Unknown adapter profile: ${id}`, { adapter_profile_id: id });
    return profile;
  }

  evaluate(id, request) {
    const profile = this.get(id);
    if (!profile.dialects.includes(request.source_artifact.dialect) || !profile.dialects.includes(request.target_artifact.dialect) || profile.format !== request.source_artifact.format || profile.format !== request.target_artifact.format) {
      throw new ContractVersioningError('UNSUPPORTED_CONTRACT_DIALECT', 'Adapter format/dialect does not match exact artifacts', { adapter_profile_id: id });
    }
    const result = this.evaluators.get(id)(request);
    return { profile, result };
  }
}

class CompatibilityCache {
  constructor() { this.entries = new Map(); }
  key(inputs) { return digest(inputs); }
  get(inputs) { return this.entries.get(this.key(inputs)) || null; }
  put(inputs, assessment) { this.entries.set(this.key(inputs), assessment); return assessment; }
  invalidateAll() { const count = this.entries.size; this.entries.clear(); return count; }
}

function aggregate(statuses) {
  const material = statuses.filter((status) => status !== 'NOT_APPLICABLE');
  if (material.length === 0) return 'NOT_APPLICABLE';
  if (material.includes('INCOMPATIBLE')) return 'INCOMPATIBLE';
  if (material.includes('FAILED')) return 'FAILED';
  if (material.includes('UNKNOWN')) return 'UNKNOWN';
  if (material.includes('CONDITIONAL')) return 'CONDITIONAL';
  return material.every((status) => status === 'COMPATIBLE') ? 'COMPATIBLE' : 'UNKNOWN';
}

class CompatibilityEvaluator {
  constructor({ identityAllocator, policyRegistry, adapterRegistry, cache = new CompatibilityCache(), maxAdapterInvocations = 100 }) {
    this.allocate = identityAllocator;
    this.policies = policyRegistry;
    this.adapters = adapterRegistry;
    this.cache = cache;
    this.maxAdapterInvocations = maxAdapterInvocations;
  }

  evaluate(request) {
    const source = request.source_version;
    const target = request.target_version;
    const sourceArtifact = request.source_artifact;
    const targetArtifact = request.target_artifact;
    if (!source?.contract_version_id || !target?.contract_version_id || !source?.raw_digest || !target?.raw_digest) {
      throw new ContractVersioningError('DIGEST_MISMATCH', 'Exact source/target version identities and content digests are required');
    }
    if (source.raw_digest !== sourceArtifact?.raw_digest || target.raw_digest !== targetArtifact?.raw_digest) {
      throw new ContractVersioningError('DIGEST_MISMATCH', 'Version digest does not match supplied artifact digest');
    }
    const policy = this.policies.get(request.compatibility_policy_id);
    const baselineIds = (request.historical_baselines || []).map((item) => item.contract_version_id);
    if (policy.baseline_scope === 'TRANSITIVE' && baselineIds.length === 0) {
      throw new ContractVersioningError('HISTORY_GAP', 'Transitive compatibility requires explicit historical baselines');
    }
    if ((request.source_version_id && request.source_version_id !== source.contract_version_id) || (request.target_version_id && request.target_version_id !== target.contract_version_id)) {
      throw new ContractVersioningError('HISTORY_GAP', 'Symbolic or mismatched baseline must be resolved to exact IDs before evaluation');
    }
    const adapterIds = [...new Set(request.adapter_profile_ids || policy.required_adapter_profile_ids)].sort();
    const adapterProfiles = adapterIds.map((id) => this.adapters.get(id));
    const cacheInputs = {
      source_version_id: source.contract_version_id,
      source_digest: source.raw_digest,
      target_version_id: target.contract_version_id,
      target_digest: target.raw_digest,
      policy_id: policy.compatibility_policy_id,
      policy_version: policy.policy_version,
      policy_digest: policy.policy_digest,
      adapter_profiles: adapterProfiles.map((item) => [item.adapter_profile_id, item.adapter_version, item.tool, item.tool_version, item.qualification_standing]),
      consumer_profile: request.consumer_profile || null,
      environment_assumptions: request.environment_assumptions || policy.environment_assumptions || null,
      historical_baseline_ids: baselineIds
    };
    const cached = this.cache.get(cacheInputs);
    if (cached) return cached;

    const axisResults = [];
    const nativeEvidence = [];
    const normalizedFindings = [];
    let invocations = 0;
    for (const axisPolicy of policy.axes) {
      if (axisPolicy.applicability === 'NOT_APPLICABLE') {
        axisResults.push(freeze({ axis: axisPolicy.axis, status: 'NOT_APPLICABLE', findings: [] }));
        continue;
      }
      const supporting = adapterIds.filter((id) => this.adapters.get(id).supported_axes.includes(axisPolicy.axis));
      if (supporting.length === 0) {
        axisResults.push(freeze({ axis: axisPolicy.axis, status: axisPolicy.required ? 'UNKNOWN' : 'NOT_APPLICABLE', findings: axisPolicy.required ? [{ code: 'ADAPTER_EVIDENCE_MISSING' }] : [] }));
        continue;
      }
      const statuses = [];
      const axisFindings = [];
      for (const adapterId of supporting) {
        invocations += 1;
        if (invocations > this.maxAdapterInvocations) throw new ContractVersioningError('RESOURCE_LIMIT_EXCEEDED', 'Compatibility adapter invocation budget exceeded', { max_adapter_invocations: this.maxAdapterInvocations });
        const { profile, result } = this.adapters.evaluate(adapterId, { ...request, axis: axisPolicy.axis, policy });
        const status = result?.status || 'UNKNOWN';
        if (!OUTCOMES.includes(status)) throw new ContractVersioningError('COMPATIBILITY_UNKNOWN', `Adapter returned unsupported outcome: ${status}`);
        statuses.push(status);
        const nativeRef = freeze({
          adapter_profile_id: profile.adapter_profile_id,
          adapter_version: profile.adapter_version,
          tool: profile.tool,
          tool_version: profile.tool_version,
          axis: axisPolicy.axis,
          native_output: result.native_output ?? null,
          evidence_refs: Object.freeze([...(result.evidence_refs || [])])
        });
        nativeEvidence.push(nativeRef);
        for (const finding of result.findings || []) {
          const normalized = freeze({
            finding_id: String(this.allocate('COMPATIBILITY_FINDING')),
            axis: axisPolicy.axis,
            rule_id: finding.rule_id || null,
            native_code: finding.native_code || null,
            severity: finding.severity || null,
            location: finding.location || null,
            message: finding.message || null,
            adapter_profile_id: profile.adapter_profile_id,
            evidence_ref: finding.evidence_ref || null
          });
          axisFindings.push(normalized);
          normalizedFindings.push(normalized);
        }
      }
      const distinct = [...new Set(statuses.filter((item) => item !== 'NOT_APPLICABLE'))];
      let axisStatus = aggregate(statuses);
      if (distinct.includes('COMPATIBLE') && distinct.some((item) => ['INCOMPATIBLE', 'FAILED', 'UNKNOWN'].includes(item))) {
        axisStatus = 'UNKNOWN';
        const conflict = freeze({ finding_id: String(this.allocate('COMPATIBILITY_FINDING')), axis: axisPolicy.axis, rule_id: 'ADAPTER_CONFLICT', native_code: 'COMPATIBILITY_CONFLICT', severity: 'BLOCKING', location: null, message: 'Qualified adapter evidence disagrees materially', adapter_profile_id: null, evidence_ref: null });
        axisFindings.push(conflict);
        normalizedFindings.push(conflict);
      }
      axisResults.push(freeze({ axis: axisPolicy.axis, status: axisStatus, findings: Object.freeze(axisFindings) }));
    }

    const status = aggregate(axisResults.map((item) => item.status));
    const assessment = freeze({
      assessment_id: String(this.allocate('COMPATIBILITY_ASSESSMENT')),
      source_version_id: source.contract_version_id,
      source_digest: source.raw_digest,
      target_version_id: target.contract_version_id,
      target_digest: target.raw_digest,
      compatibility_policy_id: policy.compatibility_policy_id,
      policy_version: policy.policy_version,
      policy_digest: policy.policy_digest,
      direction: policy.direction,
      baseline_scope: policy.baseline_scope,
      historical_baseline_ids: Object.freeze(baselineIds),
      consumer_profile: request.consumer_profile || null,
      axis_results: Object.freeze(axisResults),
      status,
      findings: Object.freeze(normalizedFindings),
      native_evidence: Object.freeze(nativeEvidence),
      cache_key: this.cache.key(cacheInputs),
      completeness: status === 'UNKNOWN' || status === 'FAILED' ? 'INCOMPLETE_OR_CONFLICTED' : 'COMPLETE'
    });
    this.cache.put(cacheInputs, assessment);
    return assessment;
  }
}

module.exports = {
  BASELINE_SCOPES,
  COMPATIBILITY_AXES,
  CompatibilityCache,
  CompatibilityEvaluator,
  CompatibilityPolicyRegistry,
  DIRECTIONS,
  FormatAdapterRegistry,
  OUTCOMES,
  aggregate
};
