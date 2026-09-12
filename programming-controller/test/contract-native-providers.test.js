'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ContractVersioningError } = require('../src/contract-versioning');
const { NativeCompatibilityProviderRegistry, PROVIDERS } = require('../src/contract-native-providers');

function subjects() {
  return {
    source_version_id: 'version:source',
    source_artifact_ref: 'artifact:source',
    source_raw_digest: 'a'.repeat(64),
    target_version_id: 'version:target',
    target_artifact_ref: 'artifact:target',
    target_raw_digest: 'b'.repeat(64)
  };
}

test('provider manifest freezes exact selected candidate versions and execution ownership', () => {
  assert.equal(PROVIDERS.PROTOBUF_BUF.tool_version, '1.72.0');
  assert.equal(PROVIDERS.AVRO_SCHEMA_COMPATIBILITY.tool_version, '1.12.2');
  assert.equal(PROVIDERS.OPENAPI_OASDIFF.tool_version, '1.22.0');
  assert.equal(PROVIDERS.JSON_SCHEMA_AJV_VALIDATION.tool_version, '8.20.0');
  for (const profile of Object.values(PROVIDERS)) {
    assert.equal(profile.execution_owner, 'PROGRAMMING-FOUNDATION-001X');
  }
});

test('Buf plan is an argv-array 001X intent with exact tool/version, subject digests and config digest', () => {
  const registry = new NativeCompatibilityProviderRegistry();
  const plan = registry.buildProtobufPlan({
    ...subjects(), input_path: 'proto', against_input: '.git#branch=main', config_path: 'buf.yaml', config_digest: 'c'.repeat(64), required_rule_categories: ['WIRE', 'FILE']
  });
  assert.equal(plan.shell, false);
  assert.equal(plan.expected_tool, 'buf');
  assert.equal(plan.expected_tool_version, '1.72.0');
  assert.deepEqual(plan.argv, ['breaking', 'proto', '--against', '.git#branch=main', '--error-format=json', '--config', 'buf.yaml']);
  assert.deepEqual(plan.required_rule_categories, ['FILE', 'WIRE']);
  assert.equal(plan.subjects.source.raw_digest, 'a'.repeat(64));
  assert.equal(plan.configuration.config_digest, 'c'.repeat(64));
});

test('OpenAPI plan uses exact oasdiff version, machine-readable output and no shell', () => {
  const registry = new NativeCompatibilityProviderRegistry();
  const plan = registry.buildOpenApiPlan({ ...subjects(), source_path: 'old.yaml', target_path: 'new.yaml' });
  assert.equal(plan.shell, false);
  assert.equal(plan.expected_tool, 'oasdiff');
  assert.equal(plan.expected_tool_version, '1.22.0');
  assert.deepEqual(plan.argv, ['breaking', '--format', 'json', '--fail-on', 'ERR', 'old.yaml', 'new.yaml']);
});

test('Avro plan requires an exact wrapper artifact/digest and preserves explicit reader-writer direction', () => {
  const registry = new NativeCompatibilityProviderRegistry();
  assert.throws(
    () => registry.buildAvroPlan({ ...subjects(), source_path: 'writer.avsc', target_path: 'reader.avsc', direction: 'BACKWARD' }),
    (error) => error instanceof ContractVersioningError && error.code === 'INCOMPLETE_CONTRACT_INPUT'
  );
  const plan = registry.buildAvroPlan({
    ...subjects(), source_path: 'writer.avsc', target_path: 'reader.avsc', direction: 'BACKWARD', wrapper_jar: 'avro-compat-wrapper.jar', wrapper_digest: 'd'.repeat(64), wrapper_main_class: 'dev.systemmaster.avro.CompatibilityMain'
  });
  assert.equal(plan.executable, 'java');
  assert.equal(plan.library_binding.coordinate, 'org.apache.avro:avro');
  assert.equal(plan.library_binding.version, '1.12.2');
  assert.ok(plan.argv.includes('BACKWARD'));
  assert.equal(plan.wrapper.wrapper_digest, 'd'.repeat(64));
});

test('JSON Schema selection is validator-only and changed-schema compatibility remains UNKNOWN', () => {
  const registry = new NativeCompatibilityProviderRegistry();
  const selected = registry.select({ format: 'JSON_SCHEMA', dialect: 'DRAFT_2020_12' });
  assert.equal(selected.standing, 'VALIDATOR_ONLY_COMPATIBILITY_UNKNOWN');
  assert.equal(selected.provider.tool, 'ajv');
  assert.equal(selected.provider.tool_version, '8.20.0');
  const standing = registry.jsonSchemaCompatibilityStanding({ ...subjects(), dialect: 'DRAFT_2020_12' });
  assert.equal(standing.status, 'UNKNOWN');
  assert.equal(standing.validation_evidence_may_support_compatibility, false);
  assert.equal(standing.clean_validation_is_not_a_breaking_change_pass, true);
});

test('unknown format/dialect remains PROVIDER_UNRESOLVED rather than falling back to a generic parser', () => {
  const registry = new NativeCompatibilityProviderRegistry();
  const result = registry.select({ format: 'THRIFT', dialect: 'THRIFT' });
  assert.equal(result.standing, 'PROVIDER_UNRESOLVED');
  assert.equal(result.provider, null);
});

test('execution plans reject incomplete exact subject identity instead of running against symbolic/unknown bytes', () => {
  const registry = new NativeCompatibilityProviderRegistry();
  assert.throws(
    () => registry.buildOpenApiPlan({ ...subjects(), source_raw_digest: '', source_path: 'old.yaml', target_path: 'new.yaml' }),
    (error) => error.code === 'INCOMPLETE_CONTRACT_INPUT'
  );
});
