'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const GATEWAY = '.github/workflows/a01-control-plane-gateway.yml';
const BROKER = '.github/workflows/a01-control-plane-admission-broker.yml';
const EXECUTOR = '.github/workflows/a01-control-plane-executor.yml';
const NIGHT_SHIFT = '.github/workflows/a01-overnight-night-shift.yml';
const ALLOWLIST = path.join(ROOT, 'qualification', 'a01', 'legacy-direct-workflows.json');
const TRUSTED_CONTROL = path.join(ROOT, 'qualification', 'a01', 'trusted-control-workflows.json');

function canonicalWorkflowBytes(buffer) { return Buffer.from(buffer.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8'); }
function gitBlobSha(buffer) {
  const canonical = canonicalWorkflowBytes(buffer);
  const header = Buffer.from(`blob ${canonical.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, canonical])).digest('hex');
}
function leadingIndent(line) {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].length : 0;
}
function normalizedLines(content) { return content.toString('utf8').replace(/\r\n?/g, '\n').split('\n'); }
function isDirectSelfHosted(content) {
  const lines = normalizedLines(content);
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)runs-on\s*:\s*(.*)$/i.exec(lines[i]);
    if (!match) continue;
    const indent = match[1].length;
    const inlineValue = match[2].replace(/\s+#.*$/, '').trim();
    if (inlineValue && /(^|[\[,\s])self-hosted([\],\s]|$)/i.test(inlineValue)) return true;
    if (inlineValue) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const childIndent = leadingIndent(line);
      if (childIndent <= indent) break;
      if (/^\s*-\s*self-hosted\s*(?:#.*)?$/i.test(line)) return true;
    }
  }
  return false;
}
function parseOn(content) {
  const lines = normalizedLines(content);
  const result = { keys: new Set(), pushBranches: [], workflowDispatchHasInputs: false };
  let onIndex = -1; let onIndent = -1; let inline = '';
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)on\s*:\s*(.*?)\s*(?:#.*)?$/i.exec(lines[i]);
    if (m) { onIndex = i; onIndent = m[1].length; inline = m[2].trim(); break; }
  }
  if (onIndex < 0) return result;
  if (inline) {
    for (const key of inline.replace(/[\[\]]/g, '').split(',').map(x => x.trim()).filter(Boolean)) result.keys.add(key);
    return result;
  }
  let currentEvent = null;
  let eventIndent = -1;
  let branchesIndent = -1;
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = leadingIndent(line);
    if (indent <= onIndent) break;
    const key = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (key && indent === onIndent + 2) {
      currentEvent = key[1]; eventIndent = indent; branchesIndent = -1; result.keys.add(currentEvent); continue;
    }
    if (currentEvent === 'workflow_dispatch' && indent > eventIndent && /^\s*inputs\s*:/i.test(line)) result.workflowDispatchHasInputs = true;
    if (currentEvent === 'push') {
      if (/^\s*branches\s*:\s*$/i.test(line)) { branchesIndent = indent; continue; }
      const item = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/.exec(line);
      if (branchesIndent >= 0 && item && indent > branchesIndent) result.pushBranches.push(item[1].trim());
    }
  }
  return result;
}
function parseTopLevelMap(content, keyName) {
  const lines = normalizedLines(content);
  const result = {};
  let start = -1; let baseIndent = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const m = new RegExp(`^(\\s*)${keyName}\\s*:\\s*$`, 'i').exec(lines[i]);
    if (m) { start = i; baseIndent = m[1].length; break; }
  }
  if (start < 0) return result;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = leadingIndent(line);
    if (indent <= baseIndent) break;
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*([^#]+?)\s*(?:#.*)?$/.exec(line);
    if (m && indent === baseIndent + 2) result[m[1]] = m[2].trim();
  }
  return result;
}
function isScheduled(content) { return parseOn(content).keys.has('schedule'); }
function calls(content, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*uses\\s*:\\s*[^\\r\\n]*${escaped}(?:@[^\\s#'\"]+)?\\s*(?:#.*)?$`, 'im').test(content.toString('utf8'));
}
function callsGateway(content) { return calls(content, 'a01-control-plane-gateway.yml'); }
function callsBroker(content) { return calls(content, 'a01-control-plane-admission-broker.yml'); }
function callsExecutor(content) { return calls(content, 'a01-control-plane-executor.yml'); }
function workflowFiles() { return fs.readdirSync(WORKFLOWS).filter(name => /\.ya?ml$/i.test(name)).map(name => `.github/workflows/${name}`).sort(); }

function validateTrustedControl(rel, bytes, entry) {
  const failures = [];
  const actual = gitBlobSha(bytes);
  if (!entry || typeof entry !== 'object') return [`${rel}: TRUSTED_CONTROL_REGISTRATION_INVALID`];
  if (actual !== entry.blob_sha) failures.push(`${rel}: TRUSTED_CONTROL_BLOB_MISMATCH; pinned=${entry.blob_sha} actual=${actual}`);
  const on = parseOn(bytes);
  const allow = {
    workflow_dispatch: entry.allow_workflow_dispatch === true,
    schedule: entry.allow_schedule === true,
    pull_request: entry.allow_pull_request === true,
    repository_dispatch: entry.allow_repository_dispatch === true,
    push: Array.isArray(entry.allowed_push_branches) && entry.allowed_push_branches.length > 0
  };
  for (const key of on.keys) if (Object.prototype.hasOwnProperty.call(allow, key) && !allow[key]) failures.push(`${rel}: TRUSTED_CONTROL_TRIGGER_FORBIDDEN:${key}`);
  if (entry.allow_workflow_dispatch === true && !on.keys.has('workflow_dispatch')) failures.push(`${rel}: TRUSTED_CONTROL_WORKFLOW_DISPATCH_REQUIRED`);
  if (on.keys.has('push')) {
    const expected = [...(entry.allowed_push_branches || [])].sort();
    const actualBranches = [...on.pushBranches].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actualBranches)) failures.push(`${rel}: TRUSTED_CONTROL_PUSH_BRANCH_SET_MISMATCH expected=${expected.join(',')} actual=${actualBranches.join(',')}`);
  }
  const text = bytes.toString('utf8').replace(/\r\n?/g, '\n');
  if (entry.allow_arbitrary_inputs !== true && (on.workflowDispatchHasInputs || /\$\{\{\s*inputs\./i.test(text))) failures.push(`${rel}: TRUSTED_CONTROL_ARBITRARY_INPUTS_FORBIDDEN`);
  if (entry.allow_gateway_call !== true && callsGateway(bytes)) failures.push(`${rel}: TRUSTED_CONTROL_GATEWAY_CALL_FORBIDDEN`);
  if (entry.allow_broker_call !== true && callsBroker(bytes)) failures.push(`${rel}: TRUSTED_CONTROL_BROKER_CALL_FORBIDDEN`);
  if (entry.allow_executor_call !== true && callsExecutor(bytes)) failures.push(`${rel}: TRUSTED_CONTROL_EXECUTOR_CALL_FORBIDDEN`);
  if (entry.qualification_payload_execution === false && /^\s*qualification_id\s*:/im.test(text)) failures.push(`${rel}: TRUSTED_CONTROL_QUALIFICATION_PAYLOAD_FORBIDDEN`);
  if (entry.required_concurrency_group && !new RegExp(`^\\s*group:\\s*${entry.required_concurrency_group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi').test(text)) failures.push(`${rel}: TRUSTED_CONTROL_CONCURRENCY_GROUP_MISSING`);
  if (entry.required_exact_subject_checkout === true && !/ref:\s*\$\{\{\s*github\.sha\s*\}\}/i.test(text)) failures.push(`${rel}: TRUSTED_CONTROL_EXACT_SUBJECT_CHECKOUT_MISSING`);
  if (entry.required_persist_credentials_false === true && !/persist-credentials:\s*false/i.test(text)) failures.push(`${rel}: TRUSTED_CONTROL_PERSIST_CREDENTIALS_FALSE_MISSING`);
  if (entry.max_permissions) {
    const permissions = parseTopLevelMap(bytes, 'permissions');
    if (entry.max_permissions.contents === 'read' && String(permissions.contents || '').toLowerCase() !== 'read') failures.push(`${rel}: TRUSTED_CONTROL_CONTENTS_READ_PERMISSION_REQUIRED`);
    for (const [key, value] of Object.entries(permissions)) if (String(value).toLowerCase() === 'write') failures.push(`${rel}: TRUSTED_CONTROL_WRITE_PERMISSION_FORBIDDEN:${key}`);
  }
  if (!isDirectSelfHosted(bytes)) failures.push(`${rel}: TRUSTED_CONTROL_SELF_HOSTED_RUNNER_MISSING`);
  return failures;
}

function scan() {
  const legacy = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  const trusted = fs.existsSync(TRUSTED_CONTROL) ? JSON.parse(fs.readFileSync(TRUSTED_CONTROL, 'utf8')) : { workflows: {} };
  const failures = [];
  const direct = [];
  const trustedSeen = [];
  const files = workflowFiles();
  for (const required of [GATEWAY, BROKER, EXECUTOR, NIGHT_SHIFT]) if (!files.includes(required)) failures.push(`${required}: REQUIRED_A01_CONTROL_WORKFLOW_MISSING`);
  for (const rel of Object.keys(trusted.workflows || {})) if (!files.includes(rel)) failures.push(`${rel}: TRUSTED_CONTROL_WORKFLOW_MISSING`);

  for (const rel of files) {
    const full = path.join(ROOT, ...rel.split('/'));
    const bytes = fs.readFileSync(full);
    const trustedEntry = (trusted.workflows || {})[rel];
    if (trustedEntry) {
      trustedSeen.push(rel);
      failures.push(...validateTrustedControl(rel, bytes, trustedEntry));
    }
    if (rel !== NIGHT_SHIFT && isScheduled(bytes) && (callsGateway(bytes) || callsBroker(bytes) || callsExecutor(bytes) || isDirectSelfHosted(bytes)) && !trustedEntry) {
      failures.push(`${rel}: INDEPENDENT_SCHEDULED_A01_WORKFLOW_PROHIBITED; submit an overnight ticket to ${NIGHT_SHIFT}`);
    }
    if (callsExecutor(bytes) && rel !== BROKER) failures.push(`${rel}: DIRECT_A01_EXECUTOR_CALL_PROHIBITED; route through ${GATEWAY} -> ${BROKER}`);
    if (callsBroker(bytes) && rel !== GATEWAY) failures.push(`${rel}: DIRECT_A01_ADMISSION_BROKER_CALL_PROHIBITED_IN_REPO_WORKFLOWS; route through ${GATEWAY}`);
    if (!isDirectSelfHosted(bytes)) continue;
    direct.push(rel);
    if (rel === EXECUTOR || trustedEntry) continue;
    const pinned = legacy.workflows[rel];
    const actual = gitBlobSha(bytes);
    if (!pinned) failures.push(`${rel}: DIRECT_SELF_HOSTED_WORKFLOW_NOT_REGISTERED; use ${GATEWAY} or an explicitly user-authorized exact-pinned trusted-control registration`);
    else if (actual !== pinned) failures.push(`${rel}: LEGACY_DIRECT_WORKFLOW_MODIFIED; pinned=${pinned} actual=${actual}; migrate through ${GATEWAY} instead of updating the legacy pin`);
  }

  const gateway = fs.existsSync(path.join(ROOT, ...GATEWAY.split('/'))) ? fs.readFileSync(path.join(ROOT, ...GATEWAY.split('/')), 'utf8') : '';
  const broker = fs.existsSync(path.join(ROOT, ...BROKER.split('/'))) ? fs.readFileSync(path.join(ROOT, ...BROKER.split('/')), 'utf8') : '';
  const executor = fs.existsSync(path.join(ROOT, ...EXECUTOR.split('/'))) ? fs.readFileSync(path.join(ROOT, ...EXECUTOR.split('/')), 'utf8') : '';
  if (!callsBroker(Buffer.from(gateway))) failures.push(`${GATEWAY}: MUST_ROUTE_THROUGH_HOSTED_ADMISSION_BROKER`);
  if (!callsExecutor(Buffer.from(broker))) failures.push(`${BROKER}: MUST_ROUTE_ONLY_ADMITTED_REQUESTS_TO_EXECUTOR`);
  if (!/runs-on:\s*\[self-hosted,\s*Windows,\s*X64\]/i.test(executor)) failures.push(`${EXECUTOR}: CANONICAL_A01_RUNNER_LABELS_MISSING`);
  if (!/control_plane_sha/i.test(executor)) failures.push(`${EXECUTOR}: CONTROL_PLANE_SHA_BINDING_MISSING`);
  if (failures.length) {
    console.error('A01_ENFORCEMENT=FAIL');
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  console.log(`A01_ENFORCEMENT=PASS direct_legacy=${direct.filter(x => x !== EXECUTOR && !(trusted.workflows || {})[x]).length} trusted_control=${trustedSeen.length} canonical_executor=${EXECUTOR} admission_broker=${BROKER} canonical_night_shift=${fs.existsSync(path.join(ROOT, ...NIGHT_SHIFT.split('/')))}`);
}

function selftest() {
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: [self-hosted, Windows, X64]\n'))) throw new Error('inline self-hosted detection failed');
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on:\n      - self-hosted\n      - Windows\n      - X64\n'))) throw new Error('multiline self-hosted detection failed');
  if (isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: ubuntu-latest\n'))) throw new Error('false positive for hosted runner');
  if (isDirectSelfHosted(Buffer.from("jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo 'No self-hosted runner was acquired'\n"))) throw new Error('self-hosted prose after hosted runs-on must not classify the job as self-hosted');
  if (!callsGateway(Buffer.from('uses: ./.github/workflows/a01-control-plane-gateway.yml\n'))) throw new Error('gateway call detection failed');
  if (!callsBroker(Buffer.from('uses: ./.github/workflows/a01-control-plane-admission-broker.yml\n'))) throw new Error('broker call detection failed');
  if (!callsExecutor(Buffer.from('uses: ./.github/workflows/a01-control-plane-executor.yml\n'))) throw new Error('executor call detection failed');
  if (callsExecutor(Buffer.from("on:\n  push:\n    paths:\n      - '.github/workflows/a01-control-plane-executor.yml'\n"))) throw new Error('workflow path mention must not count as an executor call');
  if (callsBroker(Buffer.from("on:\n  push:\n    paths:\n      - '.github/workflows/a01-control-plane-admission-broker.yml'\n"))) throw new Error('workflow path mention must not count as a broker call');
  const scheduledCaller = Buffer.from("on:\n  schedule:\n    - cron: '7 1 * * *'\njobs:\n  q:\n    uses: ./.github/workflows/a01-control-plane-gateway.yml\n");
  if (!isScheduled(scheduledCaller) || !callsGateway(scheduledCaller)) throw new Error('scheduled gateway caller detection failed');
  const parsed = parseOn(Buffer.from("on:\n  workflow_dispatch:\n  push:\n    branches:\n      - 'candidate/test'\npermissions:\n  contents: read\n"));
  if (!parsed.keys.has('workflow_dispatch') || !parsed.keys.has('push') || parsed.pushBranches.length !== 1 || parsed.pushBranches[0] !== 'candidate/test') throw new Error('trigger parser failed');
  const dispatchInputs = parseOn(Buffer.from("on:\n  workflow_dispatch:\n    inputs:\n      subject:\n        required: true\n"));
  if (!dispatchInputs.workflowDispatchHasInputs) throw new Error('workflow_dispatch input detection failed');
  const permissions = parseTopLevelMap(Buffer.from("permissions:\n  contents: read\n  actions: write\njobs:\n  t:\n    runs-on: ubuntu-latest\n"), 'permissions');
  if (permissions.contents !== 'read' || permissions.actions !== 'write') throw new Error('permissions parser failed');
  const lf = Buffer.from('hello\n'); const crlf = Buffer.from('hello\r\n'); const expected = 'ce013625030ba8dba906f756967f9e9ca394464a';
  if (gitBlobSha(lf) !== expected || gitBlobSha(crlf) !== expected) throw new Error('git blob SHA implementation failed');
  console.log('A01_ENFORCEMENT_SELFTEST=PASS');
}

const command = process.argv[2] || 'scan';
if (command === 'scan') scan();
else if (command === 'selftest') selftest();
else { console.error(`UNKNOWN_COMMAND:${command}`); process.exit(2); }