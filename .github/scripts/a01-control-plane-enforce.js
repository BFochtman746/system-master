'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const EXECUTOR = '.github/workflows/a01-control-plane-executor.yml';
const GATEWAY = '.github/workflows/a01-control-plane-gateway.yml';
const FRONT_DOOR = '.github/workflows/a01-qualification-dispatch.yml';
const REPAIR_RERUN = '.github/workflows/a01-repair-rerun.yml';
const NIGHT_SHIFT = '.github/workflows/a01-overnight-night-shift.yml';
const LEGACY = path.join(ROOT, 'qualification', 'a01', 'legacy-direct-workflows.json');

function canonicalWorkflowBytes(buffer) { return Buffer.from(buffer.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8'); }
function gitBlobSha(buffer) {
  const canonical = canonicalWorkflowBytes(buffer);
  const header = Buffer.from(`blob ${canonical.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, canonical])).digest('hex');
}
function text(content) { return content.toString('utf8'); }
function isDirectSelfHosted(content) {
  const source = text(content); const re = /runs-on\s*:/ig; let match;
  while ((match = re.exec(source)) !== null) if (/self-hosted/i.test(source.slice(match.index, match.index + 350))) return true;
  return false;
}
function isScheduled(content) { return /(^|\n)\s*schedule\s*:/m.test(text(content)); }
function calls(content, name) { return text(content).includes(name); }
function relativeCall(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`uses\\s*:\\s*['\"]?\\.\\/${escaped}['\"]?(?:\\s|$)`, 'm').test(text(content));
}
function floatingCall(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}@([^\\s'\"}]+)`, 'ig'); const refs = []; let match;
  while ((match = re.exec(text(content))) !== null) if (!/^[0-9a-f]{40}$/i.test(match[1])) refs.push(match[1]);
  return refs;
}
function workflowFiles() {
  return fs.readdirSync(WORKFLOWS).filter(name => /\.ya?ml$/i.test(name)).map(name => `.github/workflows/${name}`).sort();
}

function scan() {
  const legacy = JSON.parse(fs.readFileSync(LEGACY, 'utf8'));
  const failures = []; const direct = [];
  for (const rel of workflowFiles()) {
    const full = path.join(ROOT, ...rel.split('/')); const bytes = fs.readFileSync(full);

    if (rel !== NIGHT_SHIFT && isScheduled(bytes) && (calls(bytes, GATEWAY) || calls(bytes, EXECUTOR) || isDirectSelfHosted(bytes))) {
      failures.push(`${rel}: INDEPENDENT_SCHEDULED_A01_WORKFLOW_PROHIBITED; submit an overnight ticket to ${NIGHT_SHIFT}`);
    }

    for (const target of [GATEWAY, EXECUTOR]) {
      for (const ref of floatingCall(bytes, target)) {
        failures.push(`${rel}: FLOATING_A01_WORKFLOW_REF_PROHIBITED target=${target} ref=${ref}; use same-repository relative control workflow or reviewed full 40-hex control-plane pin`);
      }
    }

    if (relativeCall(bytes, EXECUTOR) && rel !== GATEWAY) {
      failures.push(`${rel}: INTERNAL_A01_EXECUTOR_BYPASS; only ${GATEWAY} may call ${EXECUTOR}`);
    }

    if (rel === EXECUTOR) continue;
    if (!isDirectSelfHosted(bytes)) continue;
    direct.push(rel);
    const pinned = legacy.workflows[rel]; const actual = gitBlobSha(bytes);
    if (!pinned) failures.push(`${rel}: DIRECT_SELF_HOSTED_WORKFLOW_NOT_REGISTERED; use ${FRONT_DOOR} or an immutable full-SHA ${GATEWAY} call`);
    else if (actual !== pinned) failures.push(`${rel}: LEGACY_DIRECT_WORKFLOW_MODIFIED; pinned=${pinned} actual=${actual}; migrate through ${GATEWAY} instead of updating the legacy pin`);
  }

  for (const required of [EXECUTOR, GATEWAY, FRONT_DOOR, REPAIR_RERUN, NIGHT_SHIFT]) {
    if (!fs.existsSync(path.join(ROOT, ...required.split('/')))) failures.push(`${required}: REQUIRED_A01_CONTROL_FILE_MISSING`);
  }
  if (fs.existsSync(path.join(ROOT, ...GATEWAY.split('/')))) {
    const gatewayBytes = fs.readFileSync(path.join(ROOT, ...GATEWAY.split('/')));
    if (!relativeCall(gatewayBytes, EXECUTOR)) failures.push(`${GATEWAY}: HOSTED_GATEWAY_MUST_CALL_INTERNAL_EXECUTOR_RELATIVELY`);
    if (!text(gatewayBytes).includes('a01-admission-preflight.js')) failures.push(`${GATEWAY}: HOSTED_ADMISSION_PREFLIGHT_MISSING`);
  }
  for (const caller of [FRONT_DOOR, REPAIR_RERUN, NIGHT_SHIFT]) {
    if (fs.existsSync(path.join(ROOT, ...caller.split('/')))) {
      const bytes = fs.readFileSync(path.join(ROOT, ...caller.split('/')));
      if (!relativeCall(bytes, GATEWAY)) failures.push(`${caller}: CANONICAL_CALLER_MUST_USE_SAME_COMMIT_GATEWAY`);
    }
  }

  if (failures.length) {
    console.error('A01_ENFORCEMENT=FAIL');
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  console.log(`A01_ENFORCEMENT=PASS direct_legacy=${direct.length} hosted_gateway=true internal_executor_frozen=true canonical_front_door=true canonical_night_shift=true`);
}

function selftest() {
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: [self-hosted, Windows, X64]\n'))) throw new Error('inline self-hosted detection failed');
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on:\n      - self-hosted\n      - Windows\n      - X64\n'))) throw new Error('multiline self-hosted detection failed');
  if (isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: ubuntu-latest\n'))) throw new Error('hosted runner false positive');
  if (!relativeCall(Buffer.from('jobs:\n  q:\n    uses: ./.github/workflows/a01-control-plane-gateway.yml\n'), GATEWAY)) throw new Error('relative gateway detection failed');
  if (!relativeCall(Buffer.from('jobs:\n  q:\n    uses: ./.github/workflows/a01-control-plane-executor.yml\n'), EXECUTOR)) throw new Error('relative executor detection failed');
  const floating = floatingCall(Buffer.from('jobs:\n  q:\n    uses: BFochtman746/system-master/.github/workflows/a01-control-plane-gateway.yml@main\n'), GATEWAY);
  if (floating.length !== 1 || floating[0] !== 'main') throw new Error('floating ref detection failed');
  if (floatingCall(Buffer.from('uses: BFochtman746/system-master/.github/workflows/a01-control-plane-gateway.yml@49dac6aa75a3b617092c0a20c66fa692ee04f5a2\n'), GATEWAY).length !== 0) throw new Error('full SHA incorrectly rejected');
  const scheduledCaller = Buffer.from("on:\n  schedule:\n    - cron: '7 1 * * *'\njobs:\n  q:\n    uses: ./.github/workflows/a01-control-plane-gateway.yml\n");
  if (!isScheduled(scheduledCaller) || !calls(scheduledCaller, GATEWAY)) throw new Error('scheduled gateway detection failed');
  const lf = Buffer.from('hello\n'); const crlf = Buffer.from('hello\r\n'); const expected = 'ce013625030ba8dba906f756967f9e9ca394464a';
  if (gitBlobSha(lf) !== expected || gitBlobSha(crlf) !== expected) throw new Error('git blob SHA canonicalization failed');
  console.log('A01_ENFORCEMENT_SELFTEST=PASS admission_generation=1');
}

const command = process.argv[2] || 'scan';
if (command === 'scan') scan();
else if (command === 'selftest') selftest();
else { console.error(`UNKNOWN_COMMAND:${command}`); process.exit(2); }
