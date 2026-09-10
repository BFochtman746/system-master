'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function isSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || '').trim());
}
function safeWrapper(rel) {
  return typeof rel === 'string' && rel.startsWith('.github/scripts/') && !rel.includes('..') && !path.isAbsolute(rel);
}
function gitHead(root) {
  const safeRoot = path.resolve(root).replace(/\\/g, '/');
  const result = cp.spawnSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) throw new Error(`GIT_HEAD_UNAVAILABLE:${root}:${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function writeJson(file, value) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function emit(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value)}\n`);
}

function evaluate(options = {}) {
  const controlRoot = path.resolve(options.controlRoot || process.env.A01_CONTROL_ROOT || path.resolve(__dirname, '..', '..'));
  const subjectRoot = path.resolve(options.subjectRoot || process.env.A01_SUBJECT_ROOT || controlRoot);
  const qualificationId = String(options.qualificationId || process.env.A01_QUALIFICATION_ID || '').trim();
  const workstreamId = String(options.workstreamId || process.env.A01_WORKSTREAM_ID || '').trim();
  const subjectSha = String(options.subjectSha || process.env.A01_SUBJECT_SHA || '').trim().toLowerCase();
  const expectedControlPlaneSha = String(options.expectedControlPlaneSha || process.env.A01_EXPECTED_CONTROL_PLANE_SHA || '').trim().toLowerCase();

  assert(qualificationId, 'QUALIFICATION_ID_REQUIRED');
  assert(workstreamId, 'WORKSTREAM_ID_REQUIRED');
  assert(isSha(subjectSha), `INVALID_SUBJECT_SHA:${subjectSha}`);
  assert(isSha(expectedControlPlaneSha), `INVALID_EXPECTED_CONTROL_PLANE_SHA:${expectedControlPlaneSha}`);

  const policyPath = path.join(controlRoot, 'qualification', 'a01', 'a01-policy.json');
  const registryPath = path.join(controlRoot, 'qualification', 'a01', 'registry.json');
  const policy = readJson(policyPath);
  const registry = readJson(registryPath);
  const controlPlaneSha = gitHead(controlRoot).toLowerCase();

  assert(controlPlaneSha === expectedControlPlaneSha, `CONTROL_PLANE_SHA_MISMATCH:expected=${expectedControlPlaneSha}:actual=${controlPlaneSha}`);
  assert(policy.canonical_ref === 'main', `INVALID_CANONICAL_REF:${policy.canonical_ref}`);
  assert(policy.admission && policy.admission.require_registered_qualification === true, 'REGISTERED_QUALIFICATION_POLICY_REQUIRED');
  assert(policy.admission.allow_arbitrary_command_input === false, 'ARBITRARY_COMMAND_INPUT_MUST_REMAIN_DISABLED');

  const entry = registry.qualifications && registry.qualifications[qualificationId];
  assert(entry, `REGISTRATION_PENDING:${qualificationId}`);
  assert(entry.workstream_id === workstreamId, `WORKSTREAM_MISMATCH:requested=${workstreamId}:registered=${entry.workstream_id}`);
  assert(entry.executable === 'node', `UNSUPPORTED_EXECUTABLE:${entry.executable}`);
  assert(Array.isArray(entry.args) && entry.args.length === 1 && safeWrapper(entry.args[0]), `UNSAFE_OR_INVALID_WRAPPER:${qualificationId}`);
  assert(['subject', 'control_plane'].includes(entry.source), `INVALID_QUALIFIER_SOURCE:${entry.source}`);

  const subjectCheckoutSha = gitHead(subjectRoot).toLowerCase();
  assert(subjectCheckoutSha === subjectSha, `SUBJECT_CHECKOUT_MISMATCH:expected=${subjectSha}:actual=${subjectCheckoutSha}`);

  const wrapperRoot = entry.source === 'subject' ? subjectRoot : controlRoot;
  const wrapperPath = path.join(wrapperRoot, entry.args[0]);
  assert(fs.existsSync(wrapperPath), `REGISTERED_WRAPPER_MISSING:${entry.source}:${entry.args[0]}`);
  assert(fs.statSync(wrapperPath).isFile(), `REGISTERED_WRAPPER_NOT_FILE:${entry.source}:${entry.args[0]}`);

  return {
    admission_version: 1,
    admission_state: 'READY',
    result_class: 'PASS',
    control_plane_sha: controlPlaneSha,
    policy_version: policy.policy_version,
    registry_version: registry.registry_version,
    qualification_id: qualificationId,
    workstream_id: workstreamId,
    gate_class: entry.gate_class,
    qualifier_source: entry.source,
    wrapper_path: entry.args[0],
    subject_sha: subjectSha,
    subject_checkout_sha: subjectCheckoutSha,
    arbitrary_command_input: false
  };
}

function main() {
  const outputPath = process.env.A01_ADMISSION_EVIDENCE_PATH || '';
  try {
    const result = evaluate();
    writeJson(outputPath, result);
    emit('admission_state', result.admission_state);
    emit('result_class', result.result_class);
    emit('control_plane_sha', result.control_plane_sha);
    emit('policy_version', result.policy_version);
    emit('registry_version', result.registry_version);
    emit('gate_class', result.gate_class);
    emit('qualifier_source', result.qualifier_source);
    emit('wrapper_path', result.wrapper_path);
    console.log(`A01_ADMISSION_PRECHECK=READY qualification=${result.qualification_id} subject=${result.subject_sha} control_plane=${result.control_plane_sha} registry_version=${result.registry_version}`);
  } catch (error) {
    const reason = String(error && error.message ? error.message : error);
    const classification = reason.startsWith('REGISTRATION_PENDING:') ? 'REGISTRATION_PENDING' : 'CONTROL_PLANE_BLOCKED';
    const failure = {
      admission_version: 1,
      admission_state: 'BLOCKED',
      result_class: 'CONTROL_PLANE_FAILURE',
      classification,
      reason,
      qualification_id: process.env.A01_QUALIFICATION_ID || null,
      workstream_id: process.env.A01_WORKSTREAM_ID || null,
      subject_sha: process.env.A01_SUBJECT_SHA || null,
      expected_control_plane_sha: process.env.A01_EXPECTED_CONTROL_PLANE_SHA || null
    };
    writeJson(outputPath, failure);
    emit('admission_state', failure.admission_state);
    emit('result_class', failure.result_class);
    emit('classification', failure.classification);
    console.error(`A01_ADMISSION_PRECHECK=BLOCKED classification=${classification} reason=${reason}`);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { evaluate, gitHead, safeWrapper, isSha };
