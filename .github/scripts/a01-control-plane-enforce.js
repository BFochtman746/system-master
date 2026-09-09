'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const GATEWAY = '.github/workflows/a01-control-plane-gateway.yml';
const NIGHT_SHIFT = '.github/workflows/a01-overnight-night-shift.yml';
const ALLOWLIST = path.join(ROOT, 'qualification', 'a01', 'legacy-direct-workflows.json');

function canonicalWorkflowBytes(buffer) { return Buffer.from(buffer.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8'); }
function gitBlobSha(buffer) {
  const canonical = canonicalWorkflowBytes(buffer);
  const header = Buffer.from(`blob ${canonical.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, canonical])).digest('hex');
}
function isDirectSelfHosted(content) {
  const text = content.toString('utf8');
  const re = /runs-on\s*:/ig;
  let match;
  while ((match = re.exec(text)) !== null) {
    const stanza = text.slice(match.index, match.index + 350);
    if (/self-hosted/i.test(stanza)) return true;
  }
  return false;
}
function isScheduled(content) { return /(^|\n)\s*schedule\s*:/m.test(content.toString('utf8')); }
function callsA01Gateway(content) {
  const text = content.toString('utf8');
  return /a01-control-plane-gateway\.yml/i.test(text);
}
function workflowFiles() {
  return fs.readdirSync(WORKFLOWS).filter(name => /\.ya?ml$/i.test(name)).map(name => `.github/workflows/${name}`).sort();
}

function scan() {
  const legacy = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  const failures = [];
  const direct = [];
  for (const rel of workflowFiles()) {
    const full = path.join(ROOT, ...rel.split('/'));
    const bytes = fs.readFileSync(full);
    if (rel !== NIGHT_SHIFT && isScheduled(bytes) && (callsA01Gateway(bytes) || isDirectSelfHosted(bytes))) {
      failures.push(`${rel}: INDEPENDENT_SCHEDULED_A01_WORKFLOW_PROHIBITED; submit an overnight ticket to ${NIGHT_SHIFT}`);
    }
    if (rel === GATEWAY) continue;
    if (!isDirectSelfHosted(bytes)) continue;
    direct.push(rel);
    const pinned = legacy.workflows[rel];
    const actual = gitBlobSha(bytes);
    if (!pinned) failures.push(`${rel}: DIRECT_SELF_HOSTED_WORKFLOW_NOT_REGISTERED; use ${GATEWAY}`);
    else if (actual !== pinned) failures.push(`${rel}: LEGACY_DIRECT_WORKFLOW_MODIFIED; pinned=${pinned} actual=${actual}; migrate through ${GATEWAY} instead of updating the legacy pin`);
  }
  if (failures.length) {
    console.error('A01_ENFORCEMENT=FAIL');
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  console.log(`A01_ENFORCEMENT=PASS direct_legacy=${direct.length} canonical_night_shift=${fs.existsSync(path.join(ROOT, ...NIGHT_SHIFT.split('/')))}`);
}

function selftest() {
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: [self-hosted, Windows, X64]\n'))) throw new Error('inline self-hosted detection failed');
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on:\n      - self-hosted\n      - Windows\n      - X64\n'))) throw new Error('multiline self-hosted detection failed');
  if (isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/workflows/a01-control-plane-gateway.yml\n'))) throw new Error('false positive for gateway caller');
  const scheduledCaller = Buffer.from("on:\n  schedule:\n    - cron: '7 1 * * *'\njobs:\n  q:\n    uses: ./.github/workflows/a01-control-plane-gateway.yml\n");
  if (!isScheduled(scheduledCaller) || !callsA01Gateway(scheduledCaller)) throw new Error('scheduled gateway caller detection failed');
  const lf = Buffer.from('hello\n'); const crlf = Buffer.from('hello\r\n'); const expected = 'ce013625030ba8dba906f756967f9e9ca394464a';
  if (gitBlobSha(lf) !== expected) throw new Error('git blob SHA implementation failed');
  if (gitBlobSha(crlf) !== expected) throw new Error('CRLF canonicalization failed');
  console.log('A01_ENFORCEMENT_SELFTEST=PASS');
}

const command = process.argv[2] || 'scan';
if (command === 'scan') scan();
else if (command === 'selftest') selftest();
else { console.error(`UNKNOWN_COMMAND:${command}`); process.exit(2); }
