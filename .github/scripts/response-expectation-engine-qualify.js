#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const outputPath = path.join(root, 'qualification-output', 'c11-foundation-1.0.json');

const PATHS = Object.freeze({
  authority: 'governance/CURRENT-AUTHORITY.json',
  contract: 'governance/contracts/EXPECTATION-FOUNDATION-CONTRACT-001.md',
  engine: 'control-gateway/src/response-expectation-engine.js',
  engineTest: 'control-gateway/test/response-expectation-engine.test.js',
  c04Adapter: 'control-gateway/src/development-response-governor.js',
  c04AdapterTest: 'control-gateway/test/development-response-governor.test.js',
  c11Qualifier: '.github/scripts/response-expectation-engine-qualify.js',
  c04Qualifier: '.github/scripts/development-response-governor-qualify.js',
  workflow: '.github/workflows/c11-response-expectation-foundation-qualification.yml'
});

const tests = [PATHS.engineTest, PATHS.c04AdapterTest];

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? ` detail=${detail}` : ''}`);
}

function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail('C11_GIT_COMMAND_FAILED', `${args.join(' ')}:${String(result.stderr ?? '').trim()}`);
  return String(result.stdout ?? '').trim();
}

function blob(rel) {
  return git('rev-parse', `HEAD:${rel}`);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function runNode(args, failureCode) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    fail(failureCode, `exit=${result.status ?? 'null'}`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

// Machine-readable qualifier output lives on stdout only. Node writes runtime
// warnings (e.g. MODULE_TYPELESS_PACKAGE_JSON) to stderr; merging them into the
// JSON text made C11_C04_QUALIFIER_OUTPUT_INVALID fire on a PASSing C04.
function runNodeStdout(args, failureCode) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    fail(failureCode, `exit=${result.status ?? 'null'}`);
  }
  return result.stdout ?? '';
}

function parseTestSummary(combined) {
  // Accept either reporter's counter line (TAP `# pass N`, spec `ℹ pass N`).
  // Unparseable counters yield pass=0 / fail=-1, which trips the non-vacuity
  // gate rather than producing a silently vacuous PASS.
  const pass = Number(combined.match(/^[#\u2139]\s*pass\s+(\d+)\s*$/m)?.[1] ?? 0);
  const failCount = Number(combined.match(/^[#\u2139]\s*fail\s+(\d+)\s*$/m)?.[1] ?? -1);
  return { pass, fail: failCount };
}

function main() {
  const subjectSha = git('rev-parse', 'HEAD');
  if (process.env.C11_SUBJECT_SHA) {
    assert(process.env.C11_SUBJECT_SHA.toLowerCase() === subjectSha.toLowerCase(), 'C11_SUBJECT_SHA_ENV_MISMATCH', `${process.env.C11_SUBJECT_SHA}:${subjectSha}`);
  }

  const authority = readJson(PATHS.authority);
  assert(authority.authority_id === 'CURRENT-AUTHORITY-005', 'C11_AUTHORITY_ID_MISMATCH', authority.authority_id);
  assert(typeof authority.topology === 'string' && authority.topology.length > 0, 'C11_TOPOLOGY_POINTER_MISSING');
  assert(typeof authority.capability_crosswalk === 'string' && authority.capability_crosswalk.length > 0, 'C11_CROSSWALK_POINTER_MISSING');

  const topology = readJson(authority.topology);
  const crosswalk = readJson(authority.capability_crosswalk);
  assert(topology.topology_id === 'SYSTEM-TOPOLOGY-007', 'C11_TOPOLOGY_ID_MISMATCH', topology.topology_id);
  assert(crosswalk.crosswalk_id === 'SYSTEM-MASTER-CAPABILITY-CROSSWALK-003', 'C11_CROSSWALK_ID_MISMATCH', crosswalk.crosswalk_id);

  const subjectPaths = [
    PATHS.authority,
    authority.topology,
    authority.capability_crosswalk,
    PATHS.contract,
    PATHS.engine,
    PATHS.engineTest,
    PATHS.c04Adapter,
    PATHS.c04AdapterTest,
    PATHS.c11Qualifier,
    PATHS.c04Qualifier,
    PATHS.workflow
  ];
  for (const rel of subjectPaths) {
    assert(fs.existsSync(path.join(root, rel)), 'C11_SUBJECT_PATH_MISSING', rel);
  }

  // Pin the reporter — see parseTestSummary: the counters are a load-bearing gate,
  // so the output format must not be inherited from the node default.
  const testOutput = runNode(['--test', '--test-reporter=tap', ...tests], 'C11_TEST_EXECUTION_FAILED');
  const summary = parseTestSummary(testOutput);
  assert(summary.pass >= 21 && summary.fail === 0, 'C11_NON_VACUOUS_TEST_GATE_FAILED', `pass=${summary.pass} fail=${summary.fail}`);

  const c04Output = runNodeStdout([PATHS.c04Qualifier], 'C11_C04_QUALIFIER_FAILED');
  let c04Result;
  try {
    c04Result = JSON.parse(c04Output.trim());
  } catch {
    fail('C11_C04_QUALIFIER_OUTPUT_INVALID');
  }
  assert(c04Result.status === 'PASS' && c04Result.capability_id === 'C04', 'C11_C04_QUALIFIER_NOT_PASS');
  assert(Number(c04Result.tests_failed) === 0, 'C11_C04_QUALIFIER_FAILURE_COUNT', String(c04Result.tests_failed));

  const contract = fs.readFileSync(path.join(root, PATHS.contract), 'utf8');
  for (const required of [
    'RESPONSE-EXPECTATION-ENGINE-001',
    'FOUNDATION-C11-RESPONSE-EXPECTATION-ENGINE-001',
    'FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json',
    'governance/EXPECTATION-REGISTRY-007.json` remains governance input',
    'C04 CHAT composes C11 rather than duplicating it'
  ]) {
    assert(contract.includes(required), 'C11_CONTRACT_BINDING_MISSING', required);
  }

  const evidence = {
    evidence_schema: '2.0',
    qualification_id: 'C11-RESPONSE-EXPECTATION-FOUNDATION-QUALIFICATION-001',
    contract_id: 'EXPECTATION-FOUNDATION-CONTRACT-001',
    engine_id: 'RESPONSE-EXPECTATION-ENGINE-001',
    requirement_or_capability_id: 'C11',
    owner_path: 'SYSTEM_MASTER/CORE',
    authority_id: authority.authority_id,
    topology_id: topology.topology_id,
    crosswalk_id: crosswalk.crosswalk_id,
    status: 'PASS',
    subject_sha: subjectSha,
    subjects: subjectPaths.map((rel) => ({ path: rel, git_blob_sha: blob(rel) })),
    tests: {
      c11_and_c04_adapter_passed: summary.pass,
      c11_and_c04_adapter_failed: summary.fail,
      c04_governor_qualifier_passed: Number(c04Result.tests_passed),
      c04_governor_qualifier_failed: Number(c04Result.tests_failed)
    },
    logs: {
      c11_test_output_sha256: sha256Text(testOutput),
      c04_qualifier_output_sha256: sha256Text(c04Output)
    },
    assertions: {
      generic_policy_engine: 'PASS',
      exact_line_section_boundaries: 'PASS',
      inline_heading_spoofing_fail_closed: 'PASS',
      prototype_key_class_handling: 'PASS',
      c04_adapter_regression: 'PASS',
      deterministic_policy_digest: 'PASS',
      governance_registry_used_as_implementation_evidence: false,
      native_chatgpt_binding_claimed: false,
      historical_receipt_relabeling: false
    }
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`C11_FOUNDATION_QUALIFICATION=PASS subject_sha=${subjectSha} tests=${summary.pass} c04_tests=${c04Result.tests_passed}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`C11_FOUNDATION_QUALIFICATION=FAIL ${error.message}\n`);
  process.exit(2);
}
