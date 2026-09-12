import test from 'node:test';
import assert from 'node:assert/strict';

const required = [
  'CG010_REPAIR_LIVE_REF', 'CG010_REPAIR_EXPECTED_PUBLICATION_COMMIT',
  'CG010_REPAIR_EXPECTED_PACKET_DIGEST', 'CG010_REPAIR_EXPECTED_AUTHORITY_SUBJECT',
  'CG010_REPAIR_EXPECTED_WORK_REF', 'CG010_REPAIR_EXPECTED_OPERATION',
  'CG010_REPAIR_EXPECTED_TERMINAL_RECEIPT', 'CG010_REPAIR_EXPECTED_SUCCESSOR'
];
const configured = required.every((key) => typeof process.env[key] === 'string' && process.env[key].length > 0);
const repo = process.env.GITHUB_REPOSITORY ?? 'BFochtman746/system-master';
const token = process.env.CG010_REPAIR_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';

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

test('CG-010 closure repair is anchored to the exact premature terminal receipt and frozen successor', { skip: !configured && 'CG010 repair live authority environment not configured' }, async () => {
  const api = `https://api.github.com/repos/${repo}`;
  const state = await getJson(`${api}/branches/${encodeURIComponent(process.env.CG010_REPAIR_LIVE_REF)}`);
  assert.equal(state.commit.sha, process.env.CG010_REPAIR_EXPECTED_PUBLICATION_COMMIT);
  const envelope = JSON.parse(await getRaw(state.commit.sha, 'control-gateway-state/active-work/head.json'));
  assert.equal(envelope.packet_digest, process.env.CG010_REPAIR_EXPECTED_PACKET_DIGEST);
  assert.equal(envelope.packet.authoritative_subject.oid, process.env.CG010_REPAIR_EXPECTED_AUTHORITY_SUBJECT);
  assert.equal(envelope.packet.current_operation.operation_id, process.env.CG010_REPAIR_EXPECTED_OPERATION);
  assert.equal(envelope.packet.current_operation.state, 'TERMINAL');
  assert.equal(envelope.packet.last_terminal_receipt.receipt_id, process.env.CG010_REPAIR_EXPECTED_TERMINAL_RECEIPT);
  assert.equal(envelope.packet.last_terminal_receipt.subject.oid, process.env.CG010_REPAIR_EXPECTED_AUTHORITY_SUBJECT);
  assert.deepEqual(envelope.packet.next_legal_operation, {
    kind: 'START_SUCCESSOR',
    operation_id: process.env.CG010_REPAIR_EXPECTED_SUCCESSOR,
    predecessor_receipt_id: process.env.CG010_REPAIR_EXPECTED_TERMINAL_RECEIPT,
    reason: 'EXACTLY_ONE_DEPENDENCY_VALID_SUCCESSOR'
  });

  const work = await getJson(`${api}/branches/${encodeURIComponent(process.env.CG010_REPAIR_EXPECTED_WORK_REF)}`);
  if (process.env.GITHUB_SHA) assert.equal(work.commit.sha, process.env.GITHUB_SHA, 'repair qualification must run against live CG-010 repair head');

  let cursor = work.commit.sha;
  let found = cursor === process.env.CG010_REPAIR_EXPECTED_AUTHORITY_SUBJECT;
  for (let depth = 0; !found && depth < 30; depth += 1) {
    const commit = await getJson(`${api}/commits/${cursor}`);
    assert.equal(commit.parents.length, 1, `nonlinear repair ancestry at ${cursor}`);
    cursor = commit.parents[0].sha;
    found = cursor === process.env.CG010_REPAIR_EXPECTED_AUTHORITY_SUBJECT;
  }
  assert.equal(found, true, 'prematurely-qualified CG-010 subject must remain on repair ancestry');
});
