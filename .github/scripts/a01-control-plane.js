'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const SCRIPT_ROOT = path.resolve(__dirname, '..', '..');
const CONTROL_ROOT = path.resolve(process.env.A01_CONTROL_ROOT || SCRIPT_ROOT);
const SUBJECT_ROOT = path.resolve(process.env.A01_SUBJECT_ROOT || CONTROL_ROOT);
const POLICY_PATH = path.join(CONTROL_ROOT, 'qualification', 'a01', 'a01-policy.json');
const REGISTRY_PATH = path.join(CONTROL_ROOT, 'qualification', 'a01', 'registry.json');
const RECEIPT_SCHEMA = path.join(CONTROL_ROOT, 'qualification', 'a01', 'schema', 'qualification-receipt.schema.json');
const RETURN_SCHEMA = path.join(CONTROL_ROOT, 'qualification', 'a01', 'schema', 'return-ticket.schema.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, value) { fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n'); }
function safeWrapper(rel) { return typeof rel === 'string' && rel.startsWith('.github/scripts/') && !rel.includes('..') && !path.isAbsolute(rel); }
function intEnv(name, fallback) {
  if (process.env[name] === undefined || process.env[name] === '') return fallback;
  const value = Number(process.env[name]);
  assert(Number.isInteger(value) && value > 0, `INVALID_${name}:${process.env[name]}`);
  return value;
}
function isoEnv(name) {
  const value = process.env[name];
  if (!value) return null;
  const ms = Date.parse(value);
  assert(Number.isFinite(ms), `INVALID_${name}:${value}`);
  return new Date(ms);
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function validate() {
  const policy = readJson(POLICY_PATH);
  const registry = readJson(REGISTRY_PATH);
  readJson(RECEIPT_SCHEMA);
  readJson(RETURN_SCHEMA);
  assert(policy.control_plane_id === 'A01-CONTROL-PLANE-001', 'unexpected control_plane_id');
  assert(policy.canonical_ref === 'main', 'canonical_ref must be main');
  assert(typeof policy.runner.global_concurrency_group === 'string' && policy.runner.global_concurrency_group.startsWith('a01-global'), 'global concurrency group must remain in the a01-global namespace');
  assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands must remain disabled');
  assert(policy.admission.require_registered_qualification === true, 'registered qualification must be required');
  assert(policy.runtime && policy.runtime.normal_qualifier_timeout_minutes > 0, 'runtime policy missing');
  assert(policy.overnight && policy.overnight.enabled === true, 'overnight policy missing');
  assert(registry.registry_version >= 6, 'registry_version must be >= 6');
  assert(registry.qualifications && typeof registry.qualifications === 'object', 'qualifications missing');
  const allowedActions = new Set((policy.post_actions && policy.post_actions.allowed) || []);
  for (const [id, q] of Object.entries(registry.qualifications)) {
    assert(q.executable === 'node', `${id}: only registered Node wrappers are allowed`);
    assert(Array.isArray(q.args) && q.args.length === 1, `${id}: expected one wrapper path`);
    assert(safeWrapper(q.args[0]), `${id}: unsafe wrapper path`);
    assert(['control_plane', 'subject'].includes(q.source), `${id}: invalid qualifier source`);
    assert(['focused', 'consolidated', 'promotion'].includes(q.gate_class), `${id}: invalid gate class`);
    assert(typeof q.workstream_id === 'string' && q.workstream_id.length > 0, `${id}: workstream missing`);
    assert(typeof q.evidence_artifact === 'string' && q.evidence_artifact.length > 0, `${id}: artifact prefix missing`);
    if (q.source === 'control_plane') assert(fs.existsSync(path.join(CONTROL_ROOT, q.args[0])), `${id}: control-plane wrapper does not exist`);
    if (q.allowed_post_actions !== undefined) {
      assert(Array.isArray(q.allowed_post_actions), `${id}: allowed_post_actions must be an array`);
      for (const action of q.allowed_post_actions) assert(allowedActions.has(action), `${id}: unapproved post action ${action}`);
    }
    if (q.overnight_eligible === true) {
      assert(Number.isInteger(q.overnight_max_runtime_minutes) && q.overnight_max_runtime_minutes > 0 && q.overnight_max_runtime_minutes <= policy.overnight.max_ticket_runtime_minutes, `${id}: invalid overnight runtime cap`);
      assert(typeof q.checkpoint_capable === 'boolean', `${id}: checkpoint_capable must be explicit for overnight qualifier`);
    }
  }
  return { policy, registry };
}

function gitHead(root) {
  const safeRoot = root.replace(/\\/g, '/');
  const r = cp.spawnSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`git rev-parse failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

async function runMetadata() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!token || !repo || !runId || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) { return null; }
}

function returnTicket(id, workstream, subject) {
  return {
    workstream_id: workstream,
    qualification_id: id,
    subject_sha: subject,
    origin_ref: process.env.A01_ORIGIN_REF || process.env.GITHUB_REF || 'unknown',
    resume_on_pass: process.env.A01_RESUME_ON_PASS || 'Adjudicate PASS and continue the next dependency-valid objective.',
    resume_on_failure: process.env.A01_RESUME_ON_FAILURE || 'Adjudicate evidence, repair the failing boundary, and rerun the minimum sufficient gate.',
    notification_target: process.env.A01_NOTIFICATION_TARGET || 'originating-workstream'
  };
}

function readPostAction(evidenceDir, entry, policy) {
  const marker = path.join(evidenceDir, 'post-action.txt');
  if (!fs.existsSync(marker)) return '';
  const action = fs.readFileSync(marker, 'utf8').trim();
  if (!action) return '';
  const allowedByPolicy = new Set((policy.post_actions && policy.post_actions.allowed) || []);
  const allowedByEntry = new Set(entry.allowed_post_actions || []);
  assert(allowedByPolicy.has(action), `POST_ACTION_NOT_ALLOWED_BY_POLICY:${action}`);
  assert(allowedByEntry.has(action), `POST_ACTION_NOT_ALLOWED_BY_REGISTRY:${action}`);
  return action;
}

function emitOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function runRegisteredChild(entry, wrapperPath, evidenceDir, subject, timeoutMinutes) {
  const stdoutPath = path.join(evidenceDir, 'qualifier-stdout.txt');
  const stderrPath = path.join(evidenceDir, 'qualifier-stderr.txt');
  const stdoutFile = fs.createWriteStream(stdoutPath);
  const stderrFile = fs.createWriteStream(stderrPath);
  return await new Promise(resolve => {
    let settled = false;
    let spawnError = null;
    let timedOut = false;
    const child = cp.spawn(entry.executable, [wrapperPath], {
      cwd: SUBJECT_ROOT,
      shell: false,
      windowsHide: true,
      env: { ...process.env, GITHUB_WORKSPACE: SUBJECT_ROOT, GITHUB_SHA: subject, A01_CONTROL_ROOT: CONTROL_ROOT, A01_SUBJECT_ROOT: SUBJECT_ROOT, A01_EVIDENCE_DIR: evidenceDir, A01_QUALIFIER_DEADLINE_UTC: new Date(Date.now() + timeoutMinutes * 60000).toISOString() }
    });
    child.stdout.on('data', chunk => { stdoutFile.write(chunk); process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { stderrFile.write(chunk); process.stderr.write(chunk); });
    child.on('error', error => { spawnError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      const line = `A01_QUALIFIER_TIMEOUT minutes=${timeoutMinutes}\n`;
      stderrFile.write(line); process.stderr.write(line);
      if (process.platform === 'win32' && child.pid) cp.spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8', shell: false, windowsHide: true });
      else child.kill('SIGTERM');
    }, timeoutMinutes * 60000);
    child.on('close', (code, signal) => {
      if (settled) return; settled = true; clearTimeout(timer);
      stdoutFile.end(); stderrFile.end();
      resolve({ code: timedOut ? 124 : (typeof code === 'number' ? code : 1), signal, timedOut, error: spawnError });
    });
  });
}

async function execute() {
  const { policy, registry } = validate();
  const id = process.env.A01_QUALIFICATION_ID || 'A01-CONTROL-PLANE-SELFTEST';
  const entry = registry.qualifications[id];
  assert(entry, `UNREGISTERED_QUALIFICATION:${id}`);
  const workstream = process.env.A01_WORKSTREAM_ID || entry.workstream_id;
  assert(workstream === entry.workstream_id, `WORKSTREAM_MISMATCH:${workstream}:${entry.workstream_id}`);
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-fA-F]{40}$/.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  const context = process.env.A01_EXECUTION_CONTEXT || 'normal';
  assert(['normal', 'recovery', 'repair', 'overnight'].includes(context), `INVALID_EXECUTION_CONTEXT:${context}`);
  const defaultTimeout = context === 'overnight' ? policy.overnight.max_ticket_runtime_minutes : policy.runtime.normal_qualifier_timeout_minutes;
  const qualifierTimeout = intEnv('A01_QUALIFIER_TIMEOUT_MINUTES', defaultTimeout);
  assert(qualifierTimeout <= policy.runtime.max_qualifier_timeout_minutes, `QUALIFIER_TIMEOUT_EXCEEDS_POLICY:${qualifierTimeout}`);
  if (context === 'overnight') {
    assert(entry.overnight_eligible === true, `QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE:${id}`);
    assert(qualifierTimeout <= entry.overnight_max_runtime_minutes, `QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY:${qualifierTimeout}:${entry.overnight_max_runtime_minutes}`);
    assert((entry.allowed_post_actions || []).length === 0, `DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT:${id}`);
  }

  const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || SUBJECT_ROOT, `a01-${process.env.GITHUB_RUN_ID || Date.now()}`);
  mkdir(evidenceDir);
  const checkout = gitHead(SUBJECT_ROOT);
  const wrapperRoot = entry.source === 'subject' ? SUBJECT_ROOT : CONTROL_ROOT;
  const wrapperPath = path.join(wrapperRoot, entry.args[0]);
  assert(fs.existsSync(wrapperPath), `REGISTERED_WRAPPER_MISSING:${entry.source}:${entry.args[0]}`);
  const meta = await runMetadata();
  const requestedAt = meta && meta.created_at ? meta.created_at : null;
  const workflowStartedAt = meta && meta.run_started_at ? meta.run_started_at : null;
  const queueMs = requestedAt && workflowStartedAt ? Math.max(0, Date.parse(workflowStartedAt) - Date.parse(requestedAt)) : null;
  const ticket = returnTicket(id, workstream, subject);
  const artifactName = process.env.A01_ARTIFACT_NAME || `${entry.evidence_artifact}-${process.env.GITHUB_RUN_ID || 'local'}-evidence`;
  const notBefore = context === 'overnight' ? isoEnv('A01_NOT_BEFORE') : null;
  const notAfter = context === 'overnight' ? isoEnv('A01_NOT_AFTER') : null;
  if (context === 'overnight') assert(notBefore && notAfter && notBefore < notAfter, 'OVERNIGHT_ADMISSION_WINDOW_REQUIRED');
  const request = { request_version: 3, policy_version: policy.policy_version, registry_version: registry.registry_version, qualification_id: id, workstream_id: workstream, gate_class: entry.gate_class, subject_sha: subject, checkout_sha: checkout, requested_at: requestedAt, execution_context: context, qualifier_timeout_minutes: qualifierTimeout, not_before: notBefore ? notBefore.toISOString() : null, not_after: notAfter ? notAfter.toISOString() : null, return_ticket: ticket };
  writeJson(path.join(evidenceDir, 'request.json'), request);

  if (context === 'overnight' && Date.now() < notBefore.getTime()) {
    const waitMs = notBefore.getTime() - Date.now();
    console.log(`A01_OVERNIGHT_WAIT_MS=${waitMs}`);
    await sleep(waitMs);
  }

  const started = new Date();
  let resultClass = 'CONTROL_PLANE_FAILURE';
  let childExitCode = null;
  let postAction = '';
  let reason = null;

  if (checkout.toLowerCase() !== subject.toLowerCase()) {
    reason = `SUBJECT_CHECKOUT_MISMATCH expected=${subject} actual=${checkout}`;
    fs.writeFileSync(path.join(evidenceDir, 'qualifier-stdout.txt'), '');
    fs.writeFileSync(path.join(evidenceDir, 'qualifier-stderr.txt'), `${reason}\n`);
  } else if (context === 'overnight' && started >= notAfter) {
    resultClass = 'SUBJECT_FAILURE'; childExitCode = 124; reason = 'OVERNIGHT_WINDOW_EXPIRED';
    fs.writeFileSync(path.join(evidenceDir, 'qualifier-stdout.txt'), '');
    fs.writeFileSync(path.join(evidenceDir, 'qualifier-stderr.txt'), `${reason}\n`);
  } else if (context === 'overnight' && started.getTime() + qualifierTimeout * 60000 > notAfter.getTime()) {
    resultClass = 'SUBJECT_FAILURE'; childExitCode = 124; reason = 'OVERNIGHT_INSUFFICIENT_REMAINING_WINDOW';
    fs.writeFileSync(path.join(evidenceDir, 'qualifier-stdout.txt'), '');
    fs.writeFileSync(path.join(evidenceDir, 'qualifier-stderr.txt'), `${reason}\n`);
  } else {
    const child = await runRegisteredChild(entry, wrapperPath, evidenceDir, subject, qualifierTimeout);
    childExitCode = child.code;
    if (child.timedOut) { resultClass = 'SUBJECT_FAILURE'; reason = 'QUALIFIER_RUNTIME_BUDGET_EXCEEDED'; }
    else if (child.error) { resultClass = 'INFRA_FAILURE'; reason = child.error.message; }
    else resultClass = childExitCode === 0 ? 'PASS' : 'SUBJECT_FAILURE';
    if (resultClass === 'PASS') postAction = readPostAction(evidenceDir, entry, policy);
  }

  if (reason) fs.writeFileSync(path.join(evidenceDir, 'failure-reason.txt'), `${reason}\n`);
  const completed = new Date();
  const promotionAuthorized = resultClass === 'PASS' && checkout.toLowerCase() === subject.toLowerCase() && policy.gate_classes[entry.gate_class].promotion_authority === true;
  const receipt = {
    receipt_version: 1,
    policy_version: policy.policy_version,
    registry_version: registry.registry_version,
    qualification_id: id,
    workstream_id: workstream,
    gate_class: entry.gate_class,
    subject_sha: subject,
    checkout_sha: checkout,
    requested_at: requestedAt,
    started_at: started.toISOString(),
    completed_at: completed.toISOString(),
    queue_ms: queueMs,
    execution_ms: Math.max(0, completed.getTime() - started.getTime()),
    result_class: resultClass,
    child_exit_code: childExitCode,
    runner: { name: process.env.RUNNER_NAME || null, os: process.env.RUNNER_OS || null, arch: process.env.RUNNER_ARCH || null, version: process.env.RUNNER_VERSION || null, required_labels: policy.runner.required_labels },
    evidence_artifact: artifactName,
    return_ticket: ticket,
    promotion_authorized: promotionAuthorized
  };
  writeJson(path.join(evidenceDir, 'receipt.json'), receipt);
  fs.writeFileSync(path.join(evidenceDir, 'result.txt'), `${resultClass}\n`);
  writeJson(path.join(evidenceDir, 'timing.json'), { queue_ms: queueMs, execution_ms: receipt.execution_ms, qualifier_timeout_minutes: qualifierTimeout, execution_context: context });
  if (postAction) fs.writeFileSync(path.join(evidenceDir, 'registered-post-action.txt'), `${postAction}\n`);
  emitOutput('post_action', postAction);
  emitOutput('result_class', resultClass);
  emitOutput('promotion_authorized', String(promotionAuthorized));
  console.log(`A01_RECEIPT=${JSON.stringify(receipt)}`);
  if (postAction) console.log(`A01_POST_ACTION=${postAction}`);
  if (resultClass !== 'PASS') process.exit(childExitCode || 1);
}

(async () => {
  try {
    const command = process.argv[2] || 'validate';
    if (command === 'validate') { validate(); console.log('A01_CONTROL_PLANE_VALID=1'); return; }
    if (command === 'execute') { await execute(); return; }
    throw new Error(`UNKNOWN_COMMAND:${command}`);
  } catch (error) {
    const evidenceDir = process.env.A01_EVIDENCE_DIR;
    if (evidenceDir) {
      try { mkdir(evidenceDir); fs.writeFileSync(path.join(evidenceDir, 'control-plane-failure.txt'), `${error.stack || error.message}\n`); }
      catch (_) {}
    }
    console.error(error.stack || error.message);
    process.exit(2);
  }
})();
