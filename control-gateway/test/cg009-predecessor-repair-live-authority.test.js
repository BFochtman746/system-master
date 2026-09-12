import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../src/active-work-state.js';

const required = [
  'CG009_REPAIR_LIVE_REF', 'CG009_REPAIR_EXPECTED_PUBLICATION_COMMIT',
  'CG009_REPAIR_EXPECTED_PACKET_DIGEST', 'CG009_REPAIR_EXPECTED_AUTHORITY_SUBJECT',
  'CG009_REPAIR_EXPECTED_WORK_REF', 'CG009_REPAIR_EXPECTED_OPERATION',
  'CG009_REPAIR_EXPECTED_PREDECESSOR_RECEIPT'
];
const configured = required.every((key) => typeof process.env[key] === 'string' && process.env[key].length > 0);
const repo = process.env.GITHUB_REPOSITORY ?? 'BFochtman746/system-master';
const token = process.env.CG009_REPAIR_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';

async function getJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200, `GET ${url} returned ${response.status}`);
  return response.json();
}

async function getRaw(sha, file) {
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`);
  assert.equal(response.status, 200, `raw ${file}@${sha} returned ${response.status}`);
  return response.text();
}

test('live authority blocks CG-010 until audited CG-009 predecessor repair qualifies', { skip: !configured && 'CG009 repair live authority environment not configured' }, async () => {
  const api = `https://api.github.com/repos/${repo}`;
  const state = await getJson(`${api}/branches/${encodeURIComponent(process.env.CG009_REPAIR_LIVE_REF)}`);
  assert.equal(state.commit.sha, process.env.CG009_REPAIR_EXPECTED_PUBLICATION_COMMIT);
  const envelope = JSON.parse(await getRaw(state.commit.sha, 'control-gateway-state/active-work/head.json'));
  assert.equal(envelope.packet_digest, process.env.CG009_REPAIR_EXPECTED_PACKET_DIGEST);
  assert.equal(envelope.packet.authoritative_subject.oid, process.env.CG009_REPAIR_EXPECTED_AUTHORITY_SUBJECT);
  assert.equal(envelope.packet.current_operation.operation_id, process.env.CG009_REPAIR_EXPECTED_OPERATION);
  assert.equal(envelope.packet.current_operation.state, 'BLOCKED');
  assert.equal(envelope.packet.current_operation.predecessor_receipt_id, process.env.CG009_REPAIR_EXPECTED_PREDECESSOR_RECEIPT);
  assert.deepEqual(envelope.packet.next_legal_operation, {
    kind: 'RECONCILE_CURRENT',
    operation_id: process.env.CG009_REPAIR_EXPECTED_OPERATION,
    predecessor_receipt_id: process.env.CG009_REPAIR_EXPECTED_PREDECESSOR_RECEIPT,
    reason: 'CURRENT_OPERATION_BLOCKED'
  });

  const work = await getJson(`${api}/branches/${encodeURIComponent(process.env.CG009_REPAIR_EXPECTED_WORK_REF)}`);
  if (process.env.GITHUB_SHA) assert.equal(work.commit.sha, process.env.GITHUB_SHA, 'repair qualification must run against live repair head');
  const governance = JSON.parse(await getRaw(work.commit.sha, 'governance/control-gateway/SECOND-SHIFT-CONTROL-GATEWAY-ACTIVE-WORK-PACKET.json'));
  assert.equal(canonicalize(governance), canonicalize(envelope.packet));

  let cursor = work.commit.sha;
  let found = cursor === process.env.CG009_REPAIR_EXPECTED_AUTHORITY_SUBJECT;
  for (let depth = 0; !found && depth < 24; depth += 1) {
    const commit = await getJson(`${api}/commits/${cursor}`);
    assert.equal(commit.parents.length, 1, `nonlinear repair ancestry at ${cursor}`);
    cursor = commit.parents[0].sha;
    found = cursor === process.env.CG009_REPAIR_EXPECTED_AUTHORITY_SUBJECT;
  }
  assert.equal(found, true, 'flawed CG-009 qualified subject must remain visible in repair ancestry');
});
