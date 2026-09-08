'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const POLICY_PATH = path.join(ROOT, 'qualification', 'a01', 'a01-policy.json');
const REGISTRY_PATH = path.join(ROOT, 'qualification', 'a01', 'registry.json');
const RECEIPT_SCHEMA = path.join(ROOT, 'qualification', 'a01', 'schema', 'qualification-receipt.schema.json');
const RETURN_SCHEMA = path.join(ROOT, 'qualification', 'a01', 'schema', 'return-ticket.schema.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, value) { fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n'); }

function validate() {
  const policy = readJson(POLICY_PATH);
  const registry = readJson(REGISTRY_PATH);
  readJson(RECEIPT_SCHEMA);
  readJson(RETURN_SCHEMA);
  assert(policy.control_plane_id === 'A01-CONTROL-PLANE-001', 'unexpected control_plane_id');
  assert(policy.runner.global_concurrency_group === 'a01-global', 'global concurrency must be a01-global');
  assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands must remain disabled');
  assert(policy.admission.require_registered_qualification === true, 'registered qualification must be required');
  assert(registry.registry_version >= 1, 'registry_version missing');
  assert(registry.qualifications && typeof registry.qualifications === 'object', 'qualifications missing');
  for (const [id, q] of Object.entries(registry.qualifications)) {
    assert(q.executable === 'node', `${id}: only registered Node wrappers are allowed`);
    assert(Array.isArray(q.args) && q.args.length === 1, `${id}: expected one wrapper path`);
    assert(q.args[0].startsWith('.github/scripts/') && !q.args[0].includes('..'), `${id}: unsafe wrapper path`);
    assert(['focused', 'consolidated', 'promotion'].includes(q.gate_class), `${id}: invalid gate class`);
    assert(typeof q.workstream_id === 'string' && q.workstream_id.length > 0, `${id}: workstream missing`);
    assert(typeof q.evidence_artifact === 'string' && q.evidence_artifact.length > 0, `${id}: artifact missing`);
    assert(fs.existsSync(path.join(ROOT, q.args[0])), `${id}: wrapper does not exist`);
  }
  return { policy, registry };
}

function gitHead() {
  const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`git rev-parse failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

async function runMetadata() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!token || !repo || !runId || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    });
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

async function execute() {
  const { policy, registry } = validate();
  const id = process.env.A01_QUALIFICATION_ID || 'A01-CONTROL-PLANE-SELFTEST';
  const entry = registry.qualifications[id];
  assert(entry, `UNREGISTERED_QUALIFICATION:${id}`);
  const workstream = process.env.A01_WORKSTREAM_ID || entry.workstream_id;
  assert(workstream === entry.workstream_id, `WORKSTREAM_MISMATCH:${workstream}:${entry.workstream_id}`);
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-fA-F]{40}$/.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  const checkout = gitHead();
  const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || ROOT, `a01-${process.env.GITHUB_RUN_ID || Date.now()}`);
  mkdir(evidenceDir);
  const meta = await runMetadata();
  const requestedAt = meta && meta.created_at ? meta.created_at : null;
  const workflowStartedAt = meta && meta.run_started_at ? meta.run_started_at : null;
  const queueMs = requestedAt && workflowStartedAt ? Math.max(0, Date.parse(workflowStartedAt) - Date.parse(requestedAt)) : null;
  const ticket = returnTicket(id, workstream, subject);
  const request = {
    request_version: 1,
    policy_version: policy.policy_version,
    registry_version: registry.registry_version,
    qualification_id: id,
    workstream_id: workstream,
    gate_class: entry.gate_class,
    subject_sha: subject,
    checkout_sha: checkout,
    requested_at: requestedAt,
    return_ticket: ticket
  };
  writeJson(path.join(evidenceDir, 'request.json'), request);

  const started = new Date();
  let resultClass = 'CONTROL_PLANE_FAILURE';
  let childExitCode = null;
  let stdout = '';
  let stderr = '';

  if (checkout.toLowerCase() !== subject.toLowerCase()) {
    stderr = `SUBJECT_CHECKOUT_MISMATCH expected=${subject} actual=${checkout}`;
  } else {
    const child = cp.spawnSync(entry.executable, entry.args, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
      env: { ...process.env, A01_EVIDENCE_DIR: evidenceDir }
    });
    childExitCode = typeof child.status === 'number' ? child.status : 1;
    stdout = child.stdout || '';
    stderr = child.stderr || '';
    resultClass = child.error ? 'INFRA_FAILURE' : childExitCode === 0 ? 'PASS' : 'SUBJECT_FAILURE';
    if (child.error) stderr += `\n${child.error.stack || child.error.message}`;
  }

  fs.writeFileSync(path.join(evidenceDir, 'qualifier-stdout.txt'), stdout);
  fs.writeFileSync(path.join(evidenceDir, 'qualifier-stderr.txt'), stderr);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

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
    runner: {
      name: process.env.RUNNER_NAME || null,
      os: process.env.RUNNER_OS || null,
      arch: process.env.RUNNER_ARCH || null,
      version: process.env.RUNNER_VERSION || null,
      required_labels: policy.runner.required_labels
    },
    evidence_artifact: entry.evidence_artifact,
    return_ticket: ticket,
    promotion_authorized: promotionAuthorized
  };
  writeJson(path.join(evidenceDir, 'receipt.json'), receipt);
  fs.writeFileSync(path.join(evidenceDir, 'result.txt'), `${resultClass}\n`);
  writeJson(path.join(evidenceDir, 'timing.json'), { queue_ms: queueMs, execution_ms: receipt.execution_ms });
  console.log(`A01_RECEIPT=${JSON.stringify(receipt)}`);
  if (resultClass !== 'PASS') process.exit(childExitCode || 1);
}

(async () => {
  try {
    const command = process.argv[2] || 'validate';
    if (command === 'validate') {
      validate();
      console.log('A01_CONTROL_PLANE_VALID=1');
      return;
    }
    if (command === 'execute') {
      await execute();
      return;
    }
    throw new Error(`UNKNOWN_COMMAND:${command}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(2);
  }
})();
