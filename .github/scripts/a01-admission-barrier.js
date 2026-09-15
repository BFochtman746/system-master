'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const https = require('https');
const os = require('os');

const EXECUTION_CONTEXTS = Object.freeze(['normal', 'recovery', 'repair', 'overnight']);

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
    admission_version: 2,
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
  console.log(`A01_ADMISSION=${result.admission_state} admitted=${result.admitted} mode=${result.admission_mode || 'local'} control_plane_sha=${result.control_plane_sha || 'unknown'} subject_sha=${result.subject_sha || 'unknown'}`);
  if (!result.admitted) console.log('A01_FRESH_DISPATCH_REQUIRED=1 reason=registration_or_control_plane_state_must_be_resolved_in_a_new_run');
  return result;
}

function loadControlState(controlRoot, expectedControl, id, workstream, subjectSha, executionContext, timeout, repairTransaction) {
  let controlHead = null;
  let policy = null;
  let registry = null;
  try {
    controlHead = gitHead(controlRoot);
    policy = readJson(path.join(controlRoot, 'qualification', 'a01', 'a01-policy.json'));
    registry = readJson(path.join(controlRoot, 'qualification', 'a01', 'registry.json'));
  } catch (error) {
    return { blocked: classify('CONTROL_PLANE_READ_FAILURE', error.message, {
      qualification_id: id, workstream_id: workstream, subject_sha: subjectSha,
      control_plane_sha: controlHead || expectedControl || null,
    }) };
  }
  const base = {
    qualification_id: id,
    workstream_id: workstream,
    subject_sha: subjectSha,
    control_plane_sha: controlHead,
    control_plane_expected_sha: expectedControl,
    policy_version: policy.policy_version,
    registry_version: registry.registry_version,
    execution_context: executionContext,
    qualifier_timeout_minutes: timeout,
    repair_transaction_id: repairTransaction || null,
  };
  if (!isSha(expectedControl) || !isSha(controlHead) || controlHead.toLowerCase() !== expectedControl.toLowerCase()) {
    return { blocked: classify('CONTROL_PLANE_CHECKOUT_MISMATCH', `expected=${expectedControl} actual=${controlHead}`, base) };
  }
  if (!isSha(subjectSha)) return { blocked: classify('INVALID_SUBJECT_SHA', subjectSha, base) };
  if (!isObj(policy) || policy.control_plane_id !== 'A01-CONTROL-PLANE-001' || policy.canonical_ref !== 'main') {
    return { blocked: classify('INVALID_CONTROL_PLANE_POLICY', null, base) };
  }
  if (!isObj(registry) || !isObj(registry.qualifications)) {
    return { blocked: classify('INVALID_REGISTRY', null, base) };
  }
  const entry = registry.qualifications[id];
  if (!entry) return { blocked: classify('WAITING_FOR_REGISTRATION', `qualification_id=${id}`, base) };
  if (entry.workstream_id !== workstream) {
    return { blocked: classify('WORKSTREAM_MISMATCH', `requested=${workstream} registered=${entry.workstream_id}`, base) };
  }
  if (!safeWrapper(entry.args && entry.args[0])) {
    return { blocked: classify('INVALID_REGISTERED_WRAPPER_PATH', String(entry.args && entry.args[0]), base) };
  }
  if (!['subject', 'control_plane'].includes(entry.source)) {
    return { blocked: classify('INVALID_REGISTERED_WRAPPER_SOURCE', String(entry.source), base) };
  }
  if (!EXECUTION_CONTEXTS.includes(executionContext)) {
    return { blocked: classify('INVALID_EXECUTION_CONTEXT', executionContext, base) };
  }
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > policy.runtime.max_qualifier_timeout_minutes) {
    return { blocked: classify('INVALID_QUALIFIER_TIMEOUT', String(timeout), base) };
  }
  if (executionContext === 'overnight') {
    if (entry.overnight_eligible !== true) return { blocked: classify('QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE', id, base) };
    if (timeout > entry.overnight_max_runtime_minutes) return { blocked: classify('QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY', String(timeout), base) };
    if ((entry.allowed_post_actions || []).length !== 0) return { blocked: classify('DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT', id, base) };
  }
  return { policy, registry, entry, base, controlHead };
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
  const state = loadControlState(controlRoot, expectedControl, id, workstream, subjectSha, executionContext, timeout, repairTransaction);
  if (state.blocked) return state.blocked;
  let subjectHead = null;
  try { subjectHead = gitHead(subjectRoot); }
  catch (error) { return classify('SUBJECT_CHECKOUT_MISMATCH', error.message, state.base); }
  const base = { ...state.base, subject_checkout_sha: subjectHead, admission_mode: 'LOCAL_CHECKOUT_COMPATIBILITY' };
  if (!isSha(subjectHead) || subjectHead.toLowerCase() !== subjectSha.toLowerCase()) {
    return classify('SUBJECT_CHECKOUT_MISMATCH', `expected=${subjectSha} actual=${subjectHead}`, base);
  }
  const wrapperRoot = state.entry.source === 'subject' ? subjectRoot : controlRoot;
  const wrapper = path.join(wrapperRoot, state.entry.args[0]);
  if (!fs.existsSync(wrapper)) return classify('REGISTERED_EXECUTABLE_MISSING', `${state.entry.source}:${state.entry.args[0]}`, base);
  return classify('ADMITTED', null, {
    ...base,
    gate_class: state.entry.gate_class,
    qualifier_source: state.entry.source,
    qualifier_wrapper: state.entry.args[0],
  });
}

function githubGetJson(apiPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'system-master-a01-admission-v2',
      },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`GITHUB_API_${res.statusCode}:${apiPath}:${body.slice(0, 300)}`));
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(new Error(`GITHUB_API_JSON:${apiPath}:${error.message}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function evaluateRemote() {
  const controlRoot = path.resolve(process.env.A01_ADMISSION_CONTROL_ROOT || '.');
  const id = process.env.A01_QUALIFICATION_ID || '';
  const workstream = process.env.A01_WORKSTREAM_ID || '';
  const subjectSha = (process.env.A01_SUBJECT_SHA || '').trim();
  const expectedControl = (process.env.A01_CONTROL_PLANE_SHA || '').trim();
  const executionContext = process.env.A01_EXECUTION_CONTEXT || 'normal';
  const timeout = Number(process.env.A01_QUALIFIER_TIMEOUT_MINUTES || 0);
  const repairTransaction = process.env.A01_REPAIR_TRANSACTION_ID || '';
  const repository = (process.env.GITHUB_REPOSITORY || '').trim();
  const token = process.env.GITHUB_TOKEN || '';
  const state = loadControlState(controlRoot, expectedControl, id, workstream, subjectSha, executionContext, timeout, repairTransaction);
  if (state.blocked) return state.blocked;
  const base = {
    ...state.base,
    admission_mode: 'TRUSTED_SELF_HOSTED_METADATA_ONLY',
    pre_admission_subject_checkout: false,
    pre_admission_subject_execution: false,
  };
  if (state.policy.policy_version < 8 || state.policy.admission.trusted_metadata_barrier_required_before_subject_checkout !== true || state.policy.admission.pre_admission_subject_checkout_forbidden !== true) {
    return classify('INVALID_CONTROL_PLANE_POLICY', 'policy_v8_metadata_admission_required', base);
  }
  if ((state.entry.allowed_post_actions || []).length !== 0) {
    return classify('DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER', id, base);
  }
  if (!/^[^/]+\/[^/]+$/.test(repository) || !token) {
    return classify('SUBJECT_METADATA_READ_FAILURE', 'missing_repository_or_token', base);
  }
  let commit;
  let tree;
  try {
    commit = await githubGetJson(`/repos/${repository}/git/commits/${subjectSha}`, token);
    if (!commit || !isSha(commit.sha) || commit.sha.toLowerCase() !== subjectSha.toLowerCase() || !commit.tree || !isSha(commit.tree.sha)) {
      return classify('SUBJECT_METADATA_IDENTITY_MISMATCH', `requested=${subjectSha} observed=${commit && commit.sha}`, base);
    }
    tree = await githubGetJson(`/repos/${repository}/git/trees/${commit.tree.sha}?recursive=1`, token);
  } catch (error) {
    return classify('SUBJECT_METADATA_READ_FAILURE', error.message, base);
  }
  if (!tree || tree.truncated === true || !Array.isArray(tree.tree)) {
    return classify('SUBJECT_METADATA_TREE_TRUNCATED', `tree_sha=${commit.tree.sha}`, base);
  }
  if (state.entry.source === 'control_plane') {
    const wrapper = path.join(controlRoot, state.entry.args[0]);
    if (!fs.existsSync(wrapper) || !fs.statSync(wrapper).isFile()) return classify('REGISTERED_EXECUTABLE_MISSING', `control_plane:${state.entry.args[0]}`, base);
  } else {
    const node = tree.tree.find(x => x.path === state.entry.args[0]);
    if (!node || node.type !== 'blob' || !/^[0-9a-f]{40}$/i.test(String(node.sha || ''))) {
      return classify('REGISTERED_EXECUTABLE_MISSING', `subject_metadata:${state.entry.args[0]}`, base);
    }
  }
  return classify('ADMITTED', null, {
    ...base,
    subject_metadata_commit_sha: commit.sha,
    subject_metadata_tree_sha: commit.tree.sha,
    gate_class: state.entry.gate_class,
    qualifier_source: state.entry.source,
    qualifier_wrapper: state.entry.args[0],
  });
}

function selftest() {
  if (!isSha('a'.repeat(40)) || isSha('abc')) throw new Error('SHA_VALIDATION_SELFTEST_FAILED');
  if (!safeWrapper('.github/scripts/test.js')) throw new Error('SAFE_WRAPPER_SELFTEST_FAILED');
  if (safeWrapper('../x.js') || safeWrapper('/tmp/x.js')) throw new Error('UNSAFE_WRAPPER_SELFTEST_FAILED');
  if (JSON.stringify(EXECUTION_CONTEXTS) !== JSON.stringify(['normal', 'recovery', 'repair', 'overnight'])) throw new Error('EXECUTION_CONTEXT_ALLOWLIST_SELFTEST_FAILED');
  console.log('A01_ADMISSION_BARRIER_SELFTEST=PASS contexts=4');
}

function integrationSelftest() {
  const root = path.resolve(__dirname, '..', '..');
  const head = gitHead(root);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'a01-admission-selftest-'));
  const run = (id, workstream, executionContext = 'normal', timeout = '1', repairTransaction = '') => {
    const evidence = path.join(temp, `${id}-${executionContext}.json`);
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
        A01_EXECUTION_CONTEXT: executionContext,
        A01_QUALIFIER_TIMEOUT_MINUTES: timeout,
        A01_REPAIR_TRANSACTION_ID: repairTransaction,
        A01_ADMISSION_EVIDENCE: evidence,
        GITHUB_OUTPUT: ''
      }
    });
    if (child.status !== 0) throw new Error(`ADMISSION_CHILD_FAILED:${id}:${executionContext}:${child.stderr || child.stdout}`);
    return { evidence: readJson(evidence), stdout: child.stdout };
  };

  const blocked = run('A01-SYNTHETIC-UNREGISTERED-SELFTEST-DO-NOT-REGISTER', 'SYSTEM-MASTER');
  if (blocked.evidence.admitted !== false || blocked.evidence.admission_state !== 'WAITING_FOR_REGISTRATION') throw new Error('UNREGISTERED_MUST_BLOCK');
  if (!blocked.evidence.fresh_dispatch_required) throw new Error('UNREGISTERED_MUST_REQUIRE_FRESH_DISPATCH');

  let admittedRegistered = 0;
  for (const executionContext of ['normal', 'recovery', 'repair']) {
    const admitted = run(
      'A01-CONTROL-PLANE-SELFTEST',
      'SYSTEM-MASTER',
      executionContext,
      '1',
      executionContext === 'repair' ? 'P07-INTEGRATION-SELFTEST' : ''
    );
    if (admitted.evidence.admitted !== true || admitted.evidence.admission_state !== 'ADMITTED') throw new Error(`REGISTERED_SELFTEST_MUST_ADMIT:${executionContext}`);
    if (admitted.evidence.execution_context !== executionContext) throw new Error(`EXECUTION_CONTEXT_NOT_BOUND:${executionContext}`);
    if (admitted.evidence.control_plane_sha.toLowerCase() !== head.toLowerCase()) throw new Error(`CONTROL_SHA_NOT_BOUND:${executionContext}`);
    if (admitted.evidence.subject_sha.toLowerCase() !== head.toLowerCase()) throw new Error(`SUBJECT_SHA_NOT_BOUND:${executionContext}`);
    admittedRegistered += 1;
  }

  const invalidContext = run('A01-CONTROL-PLANE-SELFTEST', 'SYSTEM-MASTER', 'invalid-context');
  if (invalidContext.evidence.admitted !== false || invalidContext.evidence.admission_state !== 'INVALID_EXECUTION_CONTEXT') throw new Error('INVALID_CONTEXT_MUST_BLOCK');
  if (!invalidContext.evidence.fresh_dispatch_required) throw new Error('INVALID_CONTEXT_MUST_REQUIRE_FRESH_DISPATCH');

  const overnightPolicy = run('A01-CONTROL-PLANE-SELFTEST', 'SYSTEM-MASTER', 'overnight');
  if (overnightPolicy.evidence.admitted !== false || overnightPolicy.evidence.admission_state !== 'QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE') throw new Error('OVERNIGHT_CONTEXT_MUST_REACH_OVERNIGHT_POLICY');
  if (!overnightPolicy.evidence.fresh_dispatch_required) throw new Error('OVERNIGHT_POLICY_BLOCK_MUST_REQUIRE_FRESH_DISPATCH');

  console.log(`A01_ADMISSION_BARRIER_INTEGRATION_SELFTEST=PASS blocked_unregistered=1 admitted_registered=${admittedRegistered} invalid_context_blocked=1 overnight_policy_blocked=1`);
}

async function main() {
  const cmd = process.argv[2] || 'evaluate';
  if (cmd === 'evaluate') evaluate();
  else if (cmd === 'evaluate-remote') await evaluateRemote();
  else if (cmd === 'selftest') selftest();
  else if (cmd === 'integration-selftest') integrationSelftest();
  else { console.error(`UNKNOWN_COMMAND:${cmd}`); process.exit(2); }
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
