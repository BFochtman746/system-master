'use strict';

const { ContractVersioningError } = require('./contract-versioning');

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function required(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `${field} is required`, { field });
  }
  if (value.includes('\0')) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `${field} contains NUL`, { field });
  return value;
}

const PROVIDERS = freeze({
  PROTOBUF_BUF: {
    provider_id: 'provider:protobuf:buf:1.72.0',
    contract_format: 'PROTOBUF',
    dialects: ['PROTO2', 'PROTO3', 'EDITION'],
    provider_kind: 'CLI',
    tool: 'buf',
    tool_version: '1.72.0',
    compatibility_role: 'NATIVE_BREAKING_CHANGE_PROVIDER',
    qualification_standing: 'SELECTED_CANDIDATE_EXECUTION_PENDING',
    evidence_model: 'BUF_NATIVE_JSON_VIOLATIONS',
    execution_owner: 'PROGRAMMING-FOUNDATION-001X'
  },
  AVRO_SCHEMA_COMPATIBILITY: {
    provider_id: 'provider:avro:apache-avro:1.12.2',
    contract_format: 'AVRO',
    dialects: ['AVRO_SCHEMA'],
    provider_kind: 'JAVA_LIBRARY_WRAPPER',
    tool: 'org.apache.avro:avro',
    tool_version: '1.12.2',
    compatibility_role: 'READER_WRITER_SCHEMA_RESOLUTION_PROVIDER',
    qualification_standing: 'SELECTED_CANDIDATE_WRAPPER_AND_EXECUTION_PENDING',
    evidence_model: 'AVRO_SCHEMA_COMPATIBILITY_RESULT',
    execution_owner: 'PROGRAMMING-FOUNDATION-001X'
  },
  OPENAPI_OASDIFF: {
    provider_id: 'provider:openapi:oasdiff:1.22.0',
    contract_format: 'OPENAPI',
    dialects: ['OPENAPI_3_0', 'OPENAPI_3_1'],
    provider_kind: 'CLI',
    tool: 'oasdiff',
    tool_version: '1.22.0',
    compatibility_role: 'NATIVE_BREAKING_CHANGE_PROVIDER',
    qualification_standing: 'SELECTED_CANDIDATE_EXECUTION_PENDING',
    evidence_model: 'OASDIFF_NATIVE_JSON',
    execution_owner: 'PROGRAMMING-FOUNDATION-001X'
  },
  JSON_SCHEMA_AJV_VALIDATION: {
    provider_id: 'provider:json-schema:ajv:8.20.0',
    contract_format: 'JSON_SCHEMA',
    dialects: ['DRAFT_07', 'DRAFT_2019_09', 'DRAFT_2020_12'],
    provider_kind: 'NODE_LIBRARY',
    tool: 'ajv',
    tool_version: '8.20.0',
    compatibility_role: 'DIALECT_VALIDATION_ONLY',
    qualification_standing: 'VALIDATOR_SELECTED_COMPATIBILITY_PROVIDER_UNRESOLVED',
    evidence_model: 'AJV_SCHEMA_VALIDATION',
    execution_owner: 'PROGRAMMING-FOUNDATION-001X'
  }
});

function exactSubjects(input) {
  return freeze({
    source: {
      version_id: required(input.source_version_id, 'source_version_id'),
      artifact_ref: required(input.source_artifact_ref, 'source_artifact_ref'),
      raw_digest: required(input.source_raw_digest, 'source_raw_digest')
    },
    target: {
      version_id: required(input.target_version_id, 'target_version_id'),
      artifact_ref: required(input.target_artifact_ref, 'target_artifact_ref'),
      raw_digest: required(input.target_raw_digest, 'target_raw_digest')
    }
  });
}

function baseIntent(profile, input, argv, extra = {}) {
  return freeze({
    intent_version: '001O-NATIVE-PROVIDER-EXECUTION-1',
    execution_owner: profile.execution_owner,
    provider_id: profile.provider_id,
    expected_tool: profile.tool,
    expected_tool_version: profile.tool_version,
    provider_qualification_standing: profile.qualification_standing,
    shell: false,
    argv: Object.freeze(argv),
    subjects: exactSubjects(input),
    timeout_seconds: Number.isInteger(input.timeout_seconds) && input.timeout_seconds > 0 ? input.timeout_seconds : 120,
    output_capture: 'STDOUT_STDERR_AND_EXIT_STATUS',
    native_output_must_be_preserved: true,
    compatibility_result_owner: 'PROGRAMMING-FOUNDATION-001O',
    ...extra
  });
}

class NativeCompatibilityProviderRegistry {
  constructor() {
    this.providers = new Map(Object.values(PROVIDERS).map((profile) => [profile.provider_id, profile]));
  }

  list() { return Object.freeze([...this.providers.values()]); }

  get(providerId) {
    const profile = this.providers.get(providerId);
    if (!profile) throw new ContractVersioningError('UNSUPPORTED_CONTRACT_DIALECT', `Unknown native provider: ${providerId}`, { provider_id: providerId });
    return profile;
  }

  select({ format, dialect }) {
    const matches = [...this.providers.values()].filter((profile) => profile.contract_format === format && profile.dialects.includes(dialect));
    if (matches.length === 0) return freeze({ standing: 'PROVIDER_UNRESOLVED', format, dialect, provider: null });
    const provider = matches[0];
    return freeze({
      standing: provider.compatibility_role === 'DIALECT_VALIDATION_ONLY' ? 'VALIDATOR_ONLY_COMPATIBILITY_UNKNOWN' : 'PROVIDER_SELECTED_EXECUTION_PENDING',
      format,
      dialect,
      provider
    });
  }

  buildProtobufPlan(input) {
    const profile = PROVIDERS.PROTOBUF_BUF;
    const inputPath = required(input.input_path, 'input_path');
    const against = required(input.against_input, 'against_input');
    const configPath = required(input.config_path, 'config_path');
    const configDigest = required(input.config_digest, 'config_digest');
    return baseIntent(profile, input, [
      'breaking', inputPath,
      '--against', against,
      '--error-format=json',
      '--config', configPath
    ], {
      configuration: freeze({ config_path: configPath, config_digest: configDigest }),
      result_semantics: 'BUF_BREAKING_VIOLATIONS__NO_VIOLATIONS_IS_PROVIDER_RESULT_NOT_GLOBAL_COMPATIBILITY',
      required_rule_categories: Object.freeze([...(input.required_rule_categories || [])].sort())
    });
  }

  buildOpenApiPlan(input) {
    const profile = PROVIDERS.OPENAPI_OASDIFF;
    const sourcePath = required(input.source_path, 'source_path');
    const targetPath = required(input.target_path, 'target_path');
    return baseIntent(profile, input, [
      'breaking', '--format', 'json', '--fail-on', 'ERR', sourcePath, targetPath
    ], {
      result_semantics: 'OASDIFF_BREAKING_NATIVE_JSON__PRESERVE_ALL_SEVERITIES'
    });
  }

  buildAvroPlan(input) {
    const profile = PROVIDERS.AVRO_SCHEMA_COMPATIBILITY;
    const wrapperJar = required(input.wrapper_jar, 'wrapper_jar');
    const wrapperDigest = required(input.wrapper_digest, 'wrapper_digest');
    const wrapperMain = required(input.wrapper_main_class, 'wrapper_main_class');
    const sourcePath = required(input.source_path, 'source_path');
    const targetPath = required(input.target_path, 'target_path');
    const direction = required(input.direction, 'direction');
    if (!['BACKWARD', 'FORWARD', 'FULL'].includes(direction)) {
      throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `Unsupported Avro direction: ${direction}`, { direction });
    }
    return baseIntent(profile, input, ['-cp', wrapperJar, wrapperMain, '--reader-writer-direction', direction, '--source', sourcePath, '--target', targetPath, '--format', 'json'], {
      executable: 'java',
      wrapper: freeze({ wrapper_jar: wrapperJar, wrapper_digest: wrapperDigest, wrapper_main_class: wrapperMain }),
      library_binding: freeze({ coordinate: profile.tool, version: profile.tool_version }),
      result_semantics: 'AVRO_READER_WRITER_RESOLUTION_DIRECTION_EXPLICIT'
    });
  }

  jsonSchemaCompatibilityStanding(input) {
    const subjects = exactSubjects(input);
    const dialect = required(input.dialect, 'dialect');
    const selected = this.select({ format: 'JSON_SCHEMA', dialect });
    return freeze({
      status: 'UNKNOWN',
      reason: 'NO_QUALIFIED_UNIVERSAL_JSON_SCHEMA_COMPATIBILITY_PROVIDER',
      selected_validator: selected.provider,
      subjects,
      validation_evidence_may_support_compatibility: false,
      clean_validation_is_not_a_breaking_change_pass: true,
      required_next_evidence: 'PROJECT_OR_POLICY_SPECIFIC_QUALIFIED_COMPATIBILITY_PROVIDER'
    });
  }
}

module.exports = {
  NativeCompatibilityProviderRegistry,
  PROVIDERS
};
