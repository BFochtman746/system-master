import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const required = [
  'CG011_LIVE_REF', 'CG011_EXPECTED_PUBLICATION_COMMIT', 'CG011_EXPECTED_PACKET_DIGEST',
  'CG011_EXPECTED_AUTHORITY_SUBJECT', 'CG011_EXPECTED_FREEZE_HEAD', 'CG011_EXPECTED_WORK_REF',
  'CG011_EXPECTED_OPERATION', 'CG011_EXPECTED_PREDECESSOR_RECEIPT', 'CG011_EXPECTED_PUBLICATION_REVISION'
];
const configured = required.every((key) => typeof process.env[key] === 'string' && process.env[key].length > 0);
const repo = process.env.GITHUB_REPOSITORY ?? 'BFochtman746/system-master';
const token = process.env.CG011_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';

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

test('CG-011 reconstructs exact durable ACTIVE authority with zero prior-chat state', { skip: !configured && 'CG011 live authority environment not configured' }, async () => {
  const api = `https://api.github.com/repos/${repo}`;
  const state = await getJson(`${api}/branches/${encodeURIComponent(process.env.CG011_LIVE_REF)}`);
  assert.equal(state.commit.sha, process.env.CG011_EXPECTED_PUBLICATION_COMMIT);

  const envelope = JSON.parse(await getRaw(state.commit.sha, 'control-gateway-state/active-work/head.json'));
  assert.equal(envelope.publication_revision, Number(process.env.CG011_EXPECTED_PUBLICATION_REVISION));
  assert.equal(envelope.packet_digest, process.env.CG011_EXPECTED_PACKET_DIGEST);
  assert.equal(envelope.packet.authoritative_subject.oid, process.env.CG011_EXPECTED_AUTHORITY_SUBJECT);
  assert.equal(envelope.packet.current_operation.operation_id, process.env.CG011_EXPECTED_OPERATION);
  assert.equal(envelope.packet.current_operation.state, 'ACTIVE');
  assert.equal(envelope.packet.current_operation.predecessor_receipt_id, process.env.CG011_EXPECTED_PREDECESSOR_RECEIPT);
  assert.equal(envelope.packet.branch_or_ref, process.env.CG011_EXPECTED_WORK_REF);
  assert.equal(envelope.packet.qualification_state, 'PENDING');
  assert.equal(envelope.packet.github_admission_state, 'PENDING');
  assert.equal(envelope.packet.a01_state, 'NOT_REQUIRED');
  assert.deepEqual(envelope.packet.next_legal_operation, {
    kind: 'CONTINUE_CURRENT',
    operation_id: process.env.CG011_EXPECTED_OPERATION,
    predecessor_receipt_id: process.env.CG011_EXPECTED_PREDECESSOR_RECEIPT,
    reason: 'CURRENT_OPERATION_NONTERMINAL'
  });

  const localPacket = JSON.parse(fs.readFileSync('../governance/control-gateway/SECOND-SHIFT-CONTROL-GATEWAY-ACTIVE-WORK-PACKET.json', 'utf8'));
  assert.deepEqual(localPacket, envelope.packet, 'CG-011 governance mirror must equal durable packet exactly');
});

test('CG-011 work branch descends from the exact CG-010 single-parent freeze', { skip: !configured && 'CG011 live authority environment not configured' }, async () => {
  const api = `https://api.github.com/repos/${repo}`;
  const work = await getJson(`${api}/branches/${encodeURIComponent(process.env.CG011_EXPECTED_WORK_REF)}`);
  if (process.env.GITHUB_SHA) assert.equal(work.commit.sha, process.env.GITHUB_SHA, 'qualification must run against live CG-011 head');

  let cursor = work.commit.sha;
  let found = cursor === process.env.CG011_EXPECTED_FREEZE_HEAD;
  for (let depth = 0; !found && depth < 40; depth += 1) {
    const commit = await getJson(`${api}/commits/${cursor}`);
    assert.equal(commit.parents.length, 1, `nonlinear CG-011 ancestry at ${cursor}`);
    cursor = commit.parents[0].sha;
    found = cursor === process.env.CG011_EXPECTED_FREEZE_HEAD;
  }
  assert.equal(found, true, 'CG-011 must descend from exact CG-010 freeze');

  const freeze = await getJson(`${api}/commits/${process.env.CG011_EXPECTED_FREEZE_HEAD}`);
  assert.equal(freeze.parents.length, 1);
  assert.equal(freeze.parents[0].sha, process.env.CG011_EXPECTED_AUTHORITY_SUBJECT);
});
