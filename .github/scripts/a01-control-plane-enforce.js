'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const GATEWAY = '.github/workflows/a01-control-plane-gateway.yml';
const ALLOWLIST = path.join(ROOT, 'qualification', 'a01', 'legacy-direct-workflows.json');

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
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

function workflowFiles() {
  return fs.readdirSync(WORKFLOWS)
    .filter(name => /\.ya?ml$/i.test(name))
    .map(name => `.github/workflows/${name}`)
    .sort();
}

function scan() {
  const legacy = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  const failures = [];
  const direct = [];
  for (const rel of workflowFiles()) {
    if (rel === GATEWAY) continue;
    const full = path.join(ROOT, ...rel.split('/'));
    const bytes = fs.readFileSync(full);
    if (!isDirectSelfHosted(bytes)) continue;
    direct.push(rel);
    const pinned = legacy.workflows[rel];
    const actual = gitBlobSha(bytes);
    if (!pinned) {
      failures.push(`${rel}: DIRECT_SELF_HOSTED_WORKFLOW_NOT_REGISTERED; use ${GATEWAY}`);
    } else if (actual !== pinned) {
      failures.push(`${rel}: LEGACY_DIRECT_WORKFLOW_MODIFIED; pinned=${pinned} actual=${actual}; migrate through ${GATEWAY} instead of updating the legacy pin`);
    }
  }
  if (failures.length) {
    console.error('A01_ENFORCEMENT=FAIL');
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  console.log(`A01_ENFORCEMENT=PASS direct_legacy=${direct.length}`);
}

function selftest() {
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: [self-hosted, Windows, X64]\n'))) throw new Error('inline self-hosted detection failed');
  if (!isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on:\n      - self-hosted\n      - Windows\n      - X64\n'))) throw new Error('multiline self-hosted detection failed');
  if (isDirectSelfHosted(Buffer.from('jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/workflows/a01-control-plane-gateway.yml\n'))) throw new Error('false positive for gateway caller');
  const sample = Buffer.from('hello\n');
  if (gitBlobSha(sample) !== 'ce013625030ba8dba906f756967f9e9ca394464a') throw new Error('git blob SHA implementation failed');
  console.log('A01_ENFORCEMENT_SELFTEST=PASS');
}

const command = process.argv[2] || 'scan';
if (command === 'scan') scan();
else if (command === 'selftest') selftest();
else {
  console.error(`UNKNOWN_COMMAND:${command}`);
  process.exit(2);
}
