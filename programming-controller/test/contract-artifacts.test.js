'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ContractService } = require('../src/contract-versioning');
const { ContractArtifactRegistry, ContractDiffEngine } = require('../src/contract-artifacts');

function registry(options = {}) {
  let n = 0;
  return new ContractArtifactRegistry({ identityAllocator: (kind) => `${kind}:${++n}`, ...options });
}

test('raw digest is retained while deterministic JSON canonicalization normalizes key order/whitespace', () => {
  const artifacts = registry();
  const a = artifacts.ingest({ raw: '{ "b": 2, "a": 1 }', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1', source_provenance: 'fixture:a' });
  const b = artifacts.ingest({ raw: '{"a":1,"b":2}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1', source_provenance: 'fixture:b' });
  assert.notEqual(a.raw_digest, b.raw_digest);
  assert.equal(a.canonical_digest, b.canonical_digest);
  assert.equal(a.canonical_form, '{"a":1,"b":2}');
  assert.equal(a.canonicalization_profile_version, '1');
});

test('canonicalization failure preserves raw digest evidence rather than erasing the artifact record', () => {
  const artifacts = registry();
  const record = artifacts.ingest({ raw: '{bad json', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  assert.equal(record.canonicalization_status, 'FAILED');
  assert.match(record.raw_digest, /^[0-9a-f]{64}$/);
  assert.equal(record.canonical_digest, null);
});

test('digest verification fails closed on corrupted raw bytes', () => {
  const artifacts = registry();
  const record = artifacts.ingest({ raw: '{"a":1}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  assert.throws(() => artifacts.verify({ artifact_id: record.artifact_id, raw: '{"a":2}' }), (error) => error.code === 'DIGEST_MISMATCH');
  assert.equal(artifacts.verify({ artifact_id: record.artifact_id, raw: '{"a":1}' }).verified, true);
});

test('profile format/dialect mismatch fails canonicalization but retains raw integrity identity', () => {
  const artifacts = registry();
  const record = artifacts.ingest({ raw: '{}', format: 'PROTOBUF', dialect: 'PROTO3', canonicalization_profile_id: 'canon:json-sorted-v1' });
  assert.equal(record.canonicalization_status, 'FAILED');
  assert.equal(record.canonicalization_error_code, 'CANONICALIZATION_FAILED');
  assert.match(record.raw_digest, /^[0-9a-f]{64}$/);
});

test('normalized diff is exact-version and exact-profile bound and never emits a compatibility verdict', () => {
  const artifacts = registry();
  const source = artifacts.ingest({ raw: '{"a":1,"nested":{"x":1}}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  const target = artifacts.ingest({ raw: '{"a":2,"nested":{"x":1,"y":3}}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  const diff = new ContractDiffEngine().diff({ source_version_id: 'version:1', target_version_id: 'version:2', source_artifact: source, target_artifact: target });
  assert.equal(diff.source_version_id, 'version:1');
  assert.equal(diff.target_version_id, 'version:2');
  assert.equal(diff.compatibility_verdict, null);
  assert.deepEqual(diff.operations.map((op) => [op.op, op.path]), [['replace', '/a'], ['add', '/nested/y']]);
});

test('normalized diff rejects incomplete canonicalization instead of pretending no change', () => {
  const artifacts = registry();
  const source = artifacts.ingest({ raw: '{bad', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  const target = artifacts.ingest({ raw: '{}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  assert.throws(() => new ContractDiffEngine().diff({ source_version_id: 'v1', target_version_id: 'v2', source_artifact: source, target_artifact: target }), (error) => error.code === 'DIFF_INCOMPLETE');
});

test('secret scanner blocks canonical registry persistence without echoing the secret', () => {
  const artifacts = registry({ secretScanner: (bytes) => bytes.toString('utf8').includes('TOP-SECRET') ? [{ rule: 'fixture-secret' }] : [] });
  assert.throws(
    () => artifacts.ingest({ raw: '{"token":"TOP-SECRET"}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' }),
    (error) => error.code === 'SECRET_DETECTED' && !error.message.includes('TOP-SECRET') && error.details.finding_count === 1
  );
});

test('published ContractVersion binds raw/canonical digest and exact canonicalization profile when artifact resolver is present', () => {
  let n = 0;
  const id = (kind) => `${kind}:${++n}`;
  const artifacts = new ContractArtifactRegistry({ identityAllocator: id });
  const artifact = artifacts.ingest({ raw: '{"kind":"command"}', format: 'JSON', dialect: 'GENERIC_JSON', canonicalization_profile_id: 'canon:json-sorted-v1' });
  const service = new ContractService({ identityAllocator: id, artifactResolver: artifacts });
  const family = service.registerContractFamily({ owner_ref: 'PROGRAMMING', surface_classes: ['COMMAND'], default_version_scheme_id: 'scheme:semver-2.0.0' });
  const draft = service.createContractDraft({ contract_family_id: family.contract_family_id, version_label: '1.0.0', candidate_artifact_ref: artifact.artifact_id });
  const receipt = service.publishContractVersion({ command_id: 'publish:digest-bound', draft_id: draft.draft_id, expected_revision: 0 });
  const version = service.getContractVersion(receipt.contract_version_id);
  assert.equal(version.raw_digest, artifact.raw_digest);
  assert.equal(version.canonical_digest, artifact.canonical_digest);
  assert.equal(version.canonicalization_profile_id, 'canon:json-sorted-v1');
  assert.equal(version.artifact_integrity_standing, 'DIGEST_BOUND');
});
