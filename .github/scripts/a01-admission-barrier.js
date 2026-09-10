'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function safeWrapper(rel) { return typeof rel === 'string' && rel.startsWith('.github/scripts/') && !rel.includes('..') && !path.isAbsolute(rel); }
function isSha(v) { return typeof v === 'string' && /^[0-9a-f]{40}$/i.test(v); }
function gitHead(root) {
  const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`GIT_HEAD_FAILED:${root}:${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value)}\n`);
}
function writeEvidence(value) {
  const p = process.env.A01_ADMISSION_EVIDENCE;
  if (!p) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}
function classify(state, detail, base = {}) {
  const result = {
    admission_version: 1,
    admitted: state === 'ADMITTED',
    admission_state: state,
    detail: detail || null,
    fresh_dispatch_required: state !== 'ADMITTED',
    ...base,
  };
  writeEvidence(result);
  output('admitted', result.admitted ? 'true' : 'false');
  output('admission_state', result.admission_state);
  output('control_plane_sha', result.control_plane_sha || '');
  output('registry_version', result.registry_version ?? '');
  output('policy_version', result.policy_version ?? '');
  console.log(`A01_ADMISSION=${result.admission_state} admitted=${result.admitted} control_plane_sha=${result.control_plane_sha || 'unknown'} subject_sha=${result.subject_sha || 'unknown'}`);
  if (!result.admitted) console.log('A01_FRESH_DISPATCH_REQUIRED=1 reason=registration_or_control_plane_state_must_be_resolved_in_a_new_run');
  return result;
}

function evaluate() {
  const controlRoot = path.resolve(process.env.A01_ADMISSION_CONTROL_ROOT || '.');
  const subjectRoot = path.resolve(process.env.A01_ADMISSION_SUBJECT_ROOT || '.');
  const id = process.env.A01_QUALIFICATION_ID || '';
  const workstream = process.env.A01_WORKSTREAM_ID || '';
  const subjectSha = (process.env.A01_SUBJECT_SHA || '').trim();
  const expectedControl = (process.env.A01_CONTROL_PLANE_SHA || '').trim();
  const executionContext = process.env.A01_EXECUTION_CONTEXT || 'normal';
  const timeout = Number(process.env.A01_QUALIFIER_TIMEOUT_MINUTES || 0);
  const repairTransaction = process.env.A01_REPAIR_TRANSACTION_ID || '';

  let controlHead = null;
  let subjectHead = null;
  let policy = null;
  let registry = null;
  try {
    controlHead = gitHead(controlRoot);
    subjectHead = gitHead(subjectRoot);
    policy = readJson(path.join(controlRoot, 'qualification', 'a01', 'a01-policy.json'));
    registry = readJson(path.join(controlRoot, 'qualification', 'a01', 'registry.json'));
  } catch (error) {
    return classify('CONTROL_PLANE_READ_FAILURE', error.message, {
      qualification_id: id, workstream_id: workstream, subject_sha: subjectSha,
      control_plane_sha: controlHead || expectedControl || null,
    });
  }

  const base = {
    qualification_id: id,
    workstream_id: workstream,
    subject_sha: subjectSha,
    subject_checkout_sha: subjectHead,
    control_plane_sha: controlHead,
    control_plane_expected_sha: expectedControl,
    policy_version: policy.policy_version,
    registry_version: registry.registry_version,
    execution_context: executionContext,
    qualifier_timeout_minutes: timeout,
    repair_transaction_id: repairTransaction || null,
  };

  if (!isSha(expectedControl) || !isSha(controlHead) || controlHead.toLowerCase() !== expectedControl.toLowerCase()) {
    return classify('CONTROL_PLANE_CHECKOUT_MISMATCH', `expected=${expectedControl} actual=${controlHead}`, base);
  }
  if (!isSha(subjectSha) || !isSha(subjectHead) || subjectHead.toLowerCase() !== subjectSha.toLowerCase()) {
    return classify('SUBJECT_CHECKOUT_MISMATCH', `expected=${subjectSha} actual=${subjectHead}`, base);
  }
  if (!isObj(policy) || policy.control_plane_id !== 'A01-CONTROL-PLANE-001' || policy.canonical_ref !== 'main') {
    return classify('INVALID_CONTROL_PLANE_POLICY', null, base);
  }
  if (!isObj(registry) || !isObj(registry.qualifications)) {
    return classify('INVALID_REGISTRY', null, base);
  }
  const entry = registry.qualifications[id];
  if (!entry) return classify('WAITING_FOR_REGISTRATION', `qualification_id=${id}`, base);
  if (entry.workstream_id !== workstream) {
    return classify('WORKSTREAM_MISMATCH', `requested=${workstream} registered=${entry.workstream_id}`, base);
  }
  if (!safeWrapper(entry.args && entry.args[0])) {
    return classify('INVALID_REGISTERED_WRAPPER_PATH', String(entry.args && entry.args[0]), base);
  }
  if (!['subject', 'control_plane'].includes(entry.source)) {
    return classify('INVALID_REGISTERED_WRAPPER_SOURCE', String(entry.source), base);
  }
  if (!['normal', 'overnight'].includes(executionContext)) {
    return classify('INVALID_EXECUTION_CONTEXT', executionContext, base);
  }
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > policy.runtime.max_qualifier_timeout_minutes) {
    return classify('INVALID_QUALIFIER_TIMEOUT', String(timeout), base);
  }
  if (executionContext === 'overnight') {
    if (entry.overnight_eligible !== true) return classify('QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE', id, base);
    if (timeout > entry.overnight_max_runtime_minutes) return classify('QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY', String(timeout), base);
    if ((entry.allowed_post_actions || []).length !== 0) return classify('DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT', id, base);
  }
  const wrapperRoot = entry.source === 'subject' ? subjectRoot : controlRoot;
  const wrapper = path.join(wrapperRoot, entry.args[0]);
  if (!fs.existsSync(wrapper)) {
    return classify('REGISTERED_EXECUTABLE_MISSING', `${entry.source}:${entry.args[0]}`, base);
  }

  return classify('ADMITTED', null, {
    ...base,
    gate_class: entry.gate_class,
    qualifier_source: entry.source,
    qualifier_wrapper: entry.args[0],
  });
}

function selftest() {
  if (!isSha('a'.repeat(40)) || isSha('abc')) throw new Error('SHA_VALIDATION_SELFTEST_FAILED');
  if (!safeWrapper('.github/scripts/test.js')) throw new Error('SAFE_WRAPPER_SELFTEST_FAILED');
  if (safeWrapper('../x.js') || safeWrapper('/tmp/x.js')) throw new Error('UNSAFE_WRAPPER_SELFTEST_FAILED');
  console.log('A01_ADMISSION_BARRIER_SELFTEST=PASS');
}

function integrationSelftest() {
  const root = path.resolve(__dirname, '..', '..');
  const head = gitHead(root);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'a01-admission-selftest-'));
  const run = (id, workstream) => {
    const evidence = path.join(temp, `${id}.json`);
    const child = cp.spawnSync(process.execPath, [__filename, 'evaluate'], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      env: {
        ...process.env,
        A01_ADMISSION_CONTROL_ROOT: root,
        A01_ADMISSION_SUBJECT_ROOT: root,
        A01_QUALIFICATION_ID: id,
        A01_WORKSTREAM_ID: workstream,
        A01_SUBJECT_SHA: head,
        A01_CONTROL_PLANE_SHA: head,
        A01_EXECUTION_CONTEXT: 'normal',
        A01_QUALIFIER_TIMEOUT_MINUTES: '1',
        A01_REPAIR_TRANSACTION_ID: '',
        A01_ADMISSION_EVIDENCE: evidence,
        GITHUB_OUTPUT: ''
      }
    });
    if (child.status !== 0) throw new Error(`ADMISSION_CHILD_FAILED:${id}:${child.stderr || child.stdout}`);
    return { evidence: readJson(evidence), stdout: child.stdout };
  };
  const blocked = run('A01-SYNTHETIC-UNREGISTERED-SELFTEST-DO-NOT-REGISTER', 'SYSTEM-MASTER');
  if (blocked.evidence.admitted !== false || blocked.evidence.admission_state !== 'WAITING_FOR_REGISTRATION') throw new Error('UNREGISTERED_MUST_BLOCK_BEFORE_A01');
  if (!blocked.evidence.fresh_dispatch_required) throw new Error('UNREGISTERED_MUST_REQUIRE_FRESH_DISPATCH');
  const admitted = run('A01-CONTROL-PLANE-SELFTEST', 'SYSTEM-MASTER');
  if (admitted.evidence.admitted !== true || admitted.evidence.admission_state !== 'ADMITTED') throw new Error('REGISTERED_SELFTEST_MUST_ADMIT');
  if (admitted.evidence.control_plane_sha.toLowerCase() !== head.toLowerCase()) throw new Error('CONTROL_SHA_NOT_BOUND');
  if (admitted.evidence.subject_sha.toLowerCase() !== head.toLowerCase()) throw new Error('SUBJECT_SHA_NOT_BOUND');
  console.log('A01_ADMISSION_BARRIER_INTEGRATION_SELFTEST=PASS blocked_unregistered=1 admitted_registered=1 a01_runner_jobs_created=0');
}

const cmd = process.argv[2] || 'evaluate';
if (cmd === 'evaluate') evaluate();
else if (cmd === 'selftest') selftest();
else if (cmd === 'integration-selftest') integrationSelftest();
else { console.error(`UNKNOWN_COMMAND:${cmd}`); process.exit(2); }
