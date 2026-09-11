'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { IdentityError } = require('../src/identity');
const {
  IdentityPerformanceEvidenceRegistry,
  IdentityPortabilityProbe,
  IdentityPortableClosure,
  IdentityQualificationProfile001N,
  IdentityResourceBudget,
  IdentityTargetEvidenceRegister,
  TARGET_REQUIREMENTS
} = require('../src/identity-qualification');

test('001N qualification profile binds all 42 requirements and all 14 qualification families', () => {
  const plan = new IdentityQualificationProfile001N().getPlan();
  assert.equal(plan.requirement_count, 42);
  assert.equal(plan.qualification_family_count, 14);
  assert.equal(plan.coverage_standing, '42_OF_42_DESTINATIONS_BOUND');
  assert.equal(new Set(plan.requirements.map((item) => item.requirement_id)).size, 42);
  const byId = new Map(plan.requirements.map((item) => [item.requirement_id, item]));
  assert.deepEqual(byId.get('BS-001N-031').implementation_packages, ['IMPL-001N-01', 'IMPL-001N-05']);
  assert.deepEqual(byId.get('BS-001N-041').implementation_packages, ['IMPL-001N-01', 'IMPL-001N-07']);
  assert.deepEqual(byId.get('BS-001N-042').implementation_packages, ['IMPL-001N-07']);
});

test('resource budgets fail explicitly instead of silently truncating authoritative identity results', () => {
  const budget = new IdentityResourceBudget({ limits: { RESOLUTION_CANDIDATES: 2, MIGRATION_BATCH_RECORDS: 3 } });
  assert.equal(budget.admit('RESOLUTION_CANDIDATES', 2).complete, true);
  assert.throws(
    () => budget.admit('RESOLUTION_CANDIDATES', 3),
    (error) => error instanceof IdentityError && error.code === 'TOO_MANY_MATCHES' && error.details.complete === false
  );
  assert.throws(
    () => budget.admit('MIGRATION_BATCH_RECORDS', 4),
    (error) => error instanceof IdentityError && error.code === 'IMPORT_LIMIT' && error.details.complete === false
  );
});

test('performance standing is exact-store workload and environment bound and never generalized from another subject', () => {
  const registry = new IdentityPerformanceEvidenceRegistry();
  registry.recordMeasurement({
    store_adapter_id: 'store-a',
    store_adapter_version: '1.0.0',
    workload_profile_id: 'identity-lookup',
    workload_profile_version: '1',
    environment_fingerprint: 'linux-x64-node20',
    operation: 'GetIdentity',
    unit: 'ms',
    samples: [1, 2, 3, 4, 5],
    subject_sha: 'abc123'
  });
  const measured = registry.standing({
    store_adapter_id: 'store-a',
    store_adapter_version: '1.0.0',
    workload_profile_id: 'identity-lookup',
    workload_profile_version: '1',
    environment_fingerprint: 'linux-x64-node20',
    operation: 'GetIdentity'
  });
  assert.equal(measured.standing, 'MEASURED');
  assert.equal(measured.tuning_claim_allowed, true);
  assert.equal(measured.records[0].median, 3);
  assert.equal(measured.records[0].p95, 5);

  const differentEnvironment = registry.standing({
    store_adapter_id: 'store-a',
    store_adapter_version: '1.0.0',
    workload_profile_id: 'identity-lookup',
    workload_profile_version: '1',
    environment_fingerprint: 'different-target',
    operation: 'GetIdentity'
  });
  assert.equal(differentEnvironment.standing, 'NOT_MEASURED');
  assert.equal(differentEnvironment.tuning_claim_allowed, false);
});

test('RFC 9562 UUIDv4 and UUIDv7 canonical vectors preserve 128-bit text/byte equality across adapters', () => {
  const probe = new IdentityPortabilityProbe({ environment: { runtime: 'node:test', platform: 'portable', arch: 'test' } });
  const adapters = [
    { adapter_id: 'uppercase-text', encode: (value) => value.toUpperCase(), decode: (value) => value },
    { adapter_id: 'buffer-text', encode: (value) => Buffer.from(value, 'utf8'), decode: (value) => Buffer.from(value).toString('utf8') }
  ];
  const v4 = probe.verifyCanonicalVector({ value: '919108f7-52d1-4320-9bac-f847db4148a8', expected_version: 4, adapters });
  const v7 = probe.verifyCanonicalVector({ value: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f', expected_version: 7, adapters });
  assert.equal(v4.byte_length, 16);
  assert.equal(v7.byte_length, 16);
  assert.equal(v4.cross_platform_standing, 'MULTI_ADAPTER_PASS');
  assert.equal(v7.cross_platform_standing, 'MULTI_ADAPTER_PASS');
});

test('target evidence cannot be satisfied by portable evidence and requires every AUD-036 target class', () => {
  const register = new IdentityTargetEvidenceRegister();
  assert.equal(register.standing().standing, 'TARGET_NATIVE_PENDING');
  assert.deepEqual(register.standing().missing.slice().sort(), TARGET_REQUIREMENTS.slice().sort());
  assert.throws(
    () => register.add({ requirement: TARGET_REQUIREMENTS[0], evidence_stage: 'PORTABLE', target_id: 'target', evidence_ref: 'ev', exact_subject_sha: 'sha' }),
    (error) => error instanceof IdentityError && error.code === 'INVALID_TARGET_EVIDENCE'
  );
  for (const requirement of TARGET_REQUIREMENTS) {
    register.add({ requirement, evidence_stage: 'AUD-036', target_id: 'target-a', evidence_ref: `evidence:${requirement}`, exact_subject_sha: 'deadbeef' });
  }
  assert.equal(register.standing().standing, 'TARGET_NATIVE_QUALIFIED');
  assert.deepEqual(register.standing().missing, []);
});

test('portable closure can pass while production target standing remains explicitly pending', () => {
  const closure = new IdentityPortableClosure();
  const standing = closure.standing({ hosted_test_total: 121, hosted_test_passed: 121, exact_head_sha: 'candidate-sha' });
  assert.equal(standing.standing, 'PORTABLE_HOSTED_QUALIFIED');
  assert.equal(standing.requirement_coverage, '42_OF_42_DESTINATIONS_BOUND');
  assert.equal(standing.target.standing, 'TARGET_NATIVE_PENDING');
  assert.equal(standing.production_target_claim_allowed, false);
});

test('portable closure refuses a qualification claim when the hosted suite is incomplete', () => {
  const closure = new IdentityPortableClosure();
  const standing = closure.standing({ hosted_test_total: 10, hosted_test_passed: 9, exact_head_sha: 'candidate-sha' });
  assert.equal(standing.standing, 'PORTABLE_QUALIFICATION_INCOMPLETE');
  assert.equal(standing.hosted_test_total, 10);
  assert.equal(standing.hosted_test_passed, 9);
});
