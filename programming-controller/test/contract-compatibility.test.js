'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ContractVersioningError } = require('../src/contract-versioning');
const {
  COMPATIBILITY_AXES,
  CompatibilityEvaluator,
  CompatibilityPolicyRegistry,
  FormatAdapterRegistry
} = require('../src/contract-compatibility');

function fixture({ baseline_scope = 'LATEST_ONLY', axes = [{ axis: 'SCHEMA_WIRE', required: true }] } = {}) {
  let n = 0;
  const id = (kind) => `${kind}:${++n}`;
  const policies = new CompatibilityPolicyRegistry({ identityAllocator: id });
  const adapters = new FormatAdapterRegistry({ identityAllocator: id });
  const policy = policies.register({ policy_version: '1', direction: 'BACKWARD', baseline_scope, axes });
  return { id, policies, adapters, policy };
}

function pair() {
  const source_artifact = { format: 'PROTOBUF', dialect: 'PROTO3', raw_digest: 'a'.repeat(64) };
  const target_artifact = { format: 'PROTOBUF', dialect: 'PROTO3', raw_digest: 'b'.repeat(64) };
  return {
    source_version: { contract_version_id: 'v1', raw_digest: source_artifact.raw_digest },
    target_version: { contract_version_id: 'v2', raw_digest: target_artifact.raw_digest },
    source_artifact,
    target_artifact
  };
}

test('policy identity includes explicit direction, baseline scope, axes, version and digest', () => {
  const { policy } = fixture({ axes: COMPATIBILITY_AXES.map((axis) => ({ axis, required: true })) });
  assert.equal(policy.direction, 'BACKWARD');
  assert.equal(policy.baseline_scope, 'LATEST_ONLY');
  assert.equal(policy.axes.length, 6);
  assert.match(policy.policy_digest, /^[0-9a-f]{64}$/);
});

test('assessment binds exact source/target IDs and digests plus exact policy version/digest', () => {
  const { id, policies, adapters, policy } = fixture();
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1.0.0', adapter_version: '1', supported_axes: ['SCHEMA_WIRE'], qualification_standing: 'FIXTURE_ONLY', evaluate: () => ({ status: 'COMPATIBLE', native_output: { ok: true } }) });
  const assessment = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id] });
  assert.equal(assessment.source_version_id, 'v1');
  assert.equal(assessment.target_version_id, 'v2');
  assert.equal(assessment.policy_version, '1');
  assert.equal(assessment.policy_digest, policy.policy_digest);
  assert.equal(assessment.status, 'COMPATIBLE');
});

test('required axis with no qualified adapter evidence stays UNKNOWN and cannot aggregate to compatible', () => {
  const { id, policies, adapters, policy } = fixture();
  const assessment = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [] });
  assert.equal(assessment.axis_results[0].status, 'UNKNOWN');
  assert.equal(assessment.status, 'UNKNOWN');
});

test('native adapter evidence is retained separately from normalized findings', () => {
  const { id, policies, adapters, policy } = fixture();
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1.2.3', supported_axes: ['SCHEMA_WIRE'], qualification_standing: 'FIXTURE_ONLY', evaluate: () => ({ status: 'INCOMPATIBLE', native_output: { native_code: 'FIELD_NUMBER_REUSE', raw_detail: 'tag 7 reused' }, evidence_refs: ['fixture:e1'], findings: [{ native_code: 'FIELD_NUMBER_REUSE', rule_id: 'PROTO_TAG_REUSE', severity: 'BLOCKING', location: 'Message.field' }] }) });
  const assessment = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id] });
  assert.equal(assessment.status, 'INCOMPATIBLE');
  assert.equal(assessment.native_evidence[0].native_output.native_code, 'FIELD_NUMBER_REUSE');
  assert.equal(assessment.findings[0].native_code, 'FIELD_NUMBER_REUSE');
  assert.notEqual(assessment.native_evidence[0], assessment.findings[0]);
});

test('material adapter disagreement becomes explicit conflict/UNKNOWN rather than a clean pass', () => {
  const { id, policies, adapters, policy } = fixture();
  const a = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'a', tool_version: '1', supported_axes: ['SCHEMA_WIRE'], evaluate: () => ({ status: 'COMPATIBLE' }) });
  const b = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'b', tool_version: '1', supported_axes: ['SCHEMA_WIRE'], evaluate: () => ({ status: 'INCOMPATIBLE' }) });
  const assessment = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [a.adapter_profile_id, b.adapter_profile_id] });
  assert.equal(assessment.status, 'UNKNOWN');
  assert.ok(assessment.findings.some((item) => item.native_code === 'COMPATIBILITY_CONFLICT'));
});

test('transitive policy requires explicit supported historical baselines', () => {
  const { id, policies, adapters, policy } = fixture({ baseline_scope: 'TRANSITIVE' });
  assert.throws(() => new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id }), (error) => error.code === 'HISTORY_GAP');
});

test('explicit historical baseline IDs are stored in transitive assessment evidence', () => {
  const { id, policies, adapters, policy } = fixture({ baseline_scope: 'TRANSITIVE' });
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1', supported_axes: ['SCHEMA_WIRE'], evaluate: () => ({ status: 'COMPATIBLE' }) });
  const assessment = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id], historical_baselines: [{ contract_version_id: 'v0' }] });
  assert.deepEqual(assessment.historical_baseline_ids, ['v0']);
});

test('version/artifact digest mismatch fails closed before adapter execution', () => {
  const { id, policies, adapters, policy } = fixture();
  let called = false;
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1', supported_axes: ['SCHEMA_WIRE'], evaluate: () => { called = true; return { status: 'COMPATIBLE' }; } });
  const request = pair();
  request.source_version.raw_digest = 'c'.repeat(64);
  assert.throws(() => new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...request, compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id] }), (error) => error.code === 'DIGEST_MISMATCH');
  assert.equal(called, false);
});

test('cache key changes when policy or adapter version material changes', () => {
  const { id, policies, adapters, policy } = fixture();
  let calls = 0;
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1', adapter_version: '1', supported_axes: ['SCHEMA_WIRE'], evaluate: () => { calls += 1; return { status: 'COMPATIBLE' }; } });
  const evaluator = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters });
  const request = { ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id] };
  const first = evaluator.evaluate(request);
  const second = evaluator.evaluate(request);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.match(first.cache_key, /^[0-9a-f]{64}$/);
});

test('compatibility work fails bounded when adapter invocation budget is exceeded', () => {
  const { id, policies, adapters, policy } = fixture({ axes: [{ axis: 'SCHEMA_WIRE', required: true }, { axis: 'ERROR', required: true }] });
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1', supported_axes: ['SCHEMA_WIRE', 'ERROR'], evaluate: () => ({ status: 'COMPATIBLE' }) });
  assert.throws(() => new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters, maxAdapterInvocations: 1 }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id] }), (error) => error instanceof ContractVersioningError && error.code === 'RESOURCE_LIMIT_EXCEEDED');
});

test('authorization/error axes remain independent from structural schema pass', () => {
  const { id, policies, adapters, policy } = fixture({ axes: [{ axis: 'SCHEMA_WIRE', required: true }, { axis: 'ERROR', required: true }, { axis: 'AUTHORIZATION_SECURITY', required: true }] });
  const profile = adapters.register({ format: 'PROTOBUF', dialects: ['PROTO3'], tool: 'fixture-proto', tool_version: '1', supported_axes: ['SCHEMA_WIRE', 'ERROR', 'AUTHORIZATION_SECURITY'], evaluate: ({ axis }) => axis === 'SCHEMA_WIRE' ? { status: 'COMPATIBLE' } : axis === 'ERROR' ? { status: 'INCOMPATIBLE', findings: [{ native_code: 'ERROR_CONTRACT_BREAK' }] } : { status: 'INCOMPATIBLE', findings: [{ native_code: 'AUTHORIZATION_BREAK' }] } });
  const assessment = new CompatibilityEvaluator({ identityAllocator: id, policyRegistry: policies, adapterRegistry: adapters }).evaluate({ ...pair(), compatibility_policy_id: policy.compatibility_policy_id, adapter_profile_ids: [profile.adapter_profile_id] });
  assert.equal(assessment.axis_results.find((item) => item.axis === 'SCHEMA_WIRE').status, 'COMPATIBLE');
  assert.equal(assessment.axis_results.find((item) => item.axis === 'ERROR').status, 'INCOMPATIBLE');
  assert.equal(assessment.axis_results.find((item) => item.axis === 'AUTHORIZATION_SECURITY').status, 'INCOMPATIBLE');
  assert.equal(assessment.status, 'INCOMPATIBLE');
});
