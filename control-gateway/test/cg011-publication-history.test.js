import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalize, CG001_MISSION_VERSION } from '../src/active-work-state.js';
import { publicationRevisionPath, validatePublicationEnvelope } from '../src/github-active-work-publication.js';

const required = [
  'CG011_LIVE_REF',
  'CG011_EXPECTED_PUBLICATION_COMMIT',
  'CG011_EXPECTED_PUBLICATION_REVISION',
  'CG011_EXPECTED_PACKET_DIGEST'
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

async function readPublicationAtCommit(sha) {
  const commit = await getJson(`https://api.github.com/repos/${repo}/commits/${sha}`);
  const envelope = JSON.parse(await getRaw(sha, 'control-gateway-state/active-work/head.json'));
  validatePublicationEnvelope(envelope, {
    expectedWorkstreamId: 'SECOND-SHIFT-CONTROL-GATEWAY',
    expectedMissionVersion: CG001_MISSION_VERSION
  });
  assert.equal(commit.parents.length, 1, `publication ${sha} must have exactly one Git parent`);
  assert.equal(commit.parents[0].sha, envelope.predecessor_commit_sha, `publication ${sha} Git parent must equal envelope predecessor`);
  const mirrorPath = publicationRevisionPath(envelope.publication_revision, envelope.packet_digest);
  const mirror = JSON.parse(await getRaw(sha, mirrorPath));
  assert.equal(canonicalize(mirror), canonicalize(envelope), `publication ${sha} immutable mirror must equal head`);
  return { commit, envelope };
}

test('CG-011 live recovery locator has a fully verified predecessor-bound publication history', { skip: !configured && 'CG011 live authority environment not configured' }, async () => {
  const state = await getJson(`https://api.github.com/repos/${repo}/branches/${encodeURIComponent(process.env.CG011_LIVE_REF)}`);
  assert.equal(state.commit.sha, process.env.CG011_EXPECTED_PUBLICATION_COMMIT);

  let sha = state.commit.sha;
  let current = await readPublicationAtCommit(sha);
  assert.equal(current.envelope.publication_revision, Number(process.env.CG011_EXPECTED_PUBLICATION_REVISION));
  assert.equal(current.envelope.packet_digest, process.env.CG011_EXPECTED_PACKET_DIGEST);

  let verified = 0;
  while (true) {
    verified += 1;
    assert.ok(verified <= 1000, 'publication history exceeded verification bound');
    const envelope = current.envelope;
    if (envelope.publication_revision === 1) break;
    const previous = await readPublicationAtCommit(envelope.predecessor_commit_sha);
    assert.equal(previous.envelope.publication_revision, envelope.publication_revision - 1, 'publication revision sequence contains a gap');
    assert.equal(previous.envelope.packet_digest, envelope.predecessor_packet_digest, 'predecessor packet digest fork');
    assert.equal(previous.envelope.publication_digest, envelope.predecessor_publication_digest, 'predecessor publication digest fork');
    sha = envelope.predecessor_commit_sha;
    current = previous;
  }

  assert.equal(current.envelope.publication_revision, 1);
  assert.ok(verified >= Number(process.env.CG011_EXPECTED_PUBLICATION_REVISION));
});
