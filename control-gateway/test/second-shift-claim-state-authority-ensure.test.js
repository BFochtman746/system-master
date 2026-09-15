import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureSecondShiftClaimStateAuthority
} from '../src/second-shift-claim-state-authority-ensure.js';
import {
  SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
  SECOND_SHIFT_CLAIM_STATE_TARGET_REF,
  buildSecondShiftClaimStateAuthorityGenesis
} from '../src/second-shift-claim-state-authority.js';

const repository = 'BFochtman746/system-master';
const predecessor = '7ccb4cfc6c9217e6fe354995ac67fec4861db7cd';
const publication = 'a'.repeat(40);

function ambiguousError() {
  const error = new Error('ambiguous');
  error.code = 'GITHUB_NETWORK_AMBIGUOUS';
  return error;
}

class FakeTransport {
  constructor() {
    this.authoritySha = null;
    this.targetSha = predecessor;
    this.predecessorHead = null;
    this.created = [];
  }

  async getRef(ref) {
    if (ref === SECOND_SHIFT_CLAIM_STATE_TARGET_REF) return { ref, sha: this.targetSha };
    if (ref === SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF) {
      if (this.authoritySha === null) {
        const error = new Error('missing');
        error.details = { status: 404 };
        throw error;
      }
      return { ref, sha: this.authoritySha };
    }
    throw new Error(`unexpected ref ${ref}`);
  }

  async readFile(sha, path) {
    if (sha === this.targetSha && path === 'control-gateway-state/active-work/head.json') return this.predecessorHead;
    return null;
  }

  async createCommitFromFiles(args) {
    this.created.push(args);
    return { sha: publication };
  }
}

class FakePublisher {
  constructor(transport) {
    this.transport = transport;
    this.genesis = buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha: predecessor });
    this.packet = structuredClone(this.genesis.packet);
    this.readCalls = 0;
    this.historyCalls = 0;
    this.reconstructCalls = 0;
  }

  async readEnvelopeAtCommit(sha) {
    this.readCalls += 1;
    assert.equal(sha, publication);
    return { envelope: structuredClone(this.genesis.envelope) };
  }

  async verifyHistory(sha) {
    this.historyCalls += 1;
    assert.equal(sha, publication);
    return { revisions_verified: 1, genesis_commit_sha: predecessor };
  }

  async reconstruct() {
    this.reconstructCalls += 1;
    if (this.transport.authoritySha === null) throw new Error('authority missing in fake reconstruct');
    return {
      head_commit_sha: this.transport.authoritySha,
      publication_revision: this.packet.authority_epoch,
      packet_digest: this.genesis.envelope.packet_digest,
      publication_digest: this.genesis.envelope.publication_digest,
      envelope: { packet: structuredClone(this.packet) }
    };
  }
}

test('existing exact authority is verified and preserves epoch high-water without dispatch', async () => {
  const transport = new FakeTransport();
  transport.authoritySha = 'b'.repeat(40);
  const publisher = new FakePublisher(transport);
  publisher.packet.authority_epoch = 9;
  publisher.packet.authoritative_subject = { algorithm: 'sha1', oid: 'c'.repeat(40) };
  let dispatches = 0;

  const result = await ensureSecondShiftClaimStateAuthority({
    repository,
    transport,
    publisher,
    dispatchBootstrap: async () => { dispatches += 1; },
    pollAttempts: 2,
    pollDelayMs: 0
  });

  assert.equal(result.state, 'EXISTING_VERIFIED');
  assert.equal(result.authority_epoch, 9);
  assert.equal(result.authority_commit_sha, 'b'.repeat(40));
  assert.equal(dispatches, 0);
  assert.equal(transport.created.length, 0);
});

test('missing authority prepares unattached exact genesis and dispatches protected bootstrap once', async () => {
  const transport = new FakeTransport();
  const publisher = new FakePublisher(transport);
  const requests = [];

  const result = await ensureSecondShiftClaimStateAuthority({
    repository,
    transport,
    publisher,
    dispatchBootstrap: async (request) => {
      requests.push(request);
      transport.authoritySha = publication;
    },
    pollAttempts: 2,
    pollDelayMs: 0
  });

  assert.equal(result.state, 'BOOTSTRAPPED_VERIFIED');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].state_ref, SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF);
  assert.equal(requests[0].expected_predecessor_sha, predecessor);
  assert.equal(requests[0].publication_commit_sha, publication);
  assert.equal(requests[0].expected_target_ref, SECOND_SHIFT_CLAIM_STATE_TARGET_REF);
  assert.equal(transport.created.length, 1);
  assert.equal(transport.created[0].parentSha, predecessor);
  assert.deepEqual(Object.keys(transport.created[0].files).sort(), [
    'control-gateway-state/active-work/head.json',
    publisher.genesis.revision_path
  ].sort());
  assert.equal(transport.created[0].files['control-gateway-state/active-work/head.json'], publisher.genesis.body);
  assert.equal(publisher.readCalls, 1);
  assert.equal(publisher.historyCalls, 1);
});

test('ambiguous bootstrap dispatch is reconciliation-only and never redispatched', async () => {
  const transport = new FakeTransport();
  const publisher = new FakePublisher(transport);
  let dispatches = 0;

  await assert.rejects(
    ensureSecondShiftClaimStateAuthority({
      repository,
      transport,
      publisher,
      dispatchBootstrap: async () => { dispatches += 1; throw ambiguousError(); },
      pollAttempts: 3,
      pollDelayMs: 0
    }),
    (error) => error?.code === 'CLAIM_STATE_AUTHORITY_BOOTSTRAP_DISPATCH_UNCERTAIN'
  );
  assert.equal(dispatches, 1);
  assert.equal(transport.created.length, 1);
});

test('a valid create-only race is adopted before dispatch instead of duplicating bootstrap', async () => {
  const transport = new FakeTransport();
  const publisher = new FakePublisher(transport);
  const originalCreate = transport.createCommitFromFiles.bind(transport);
  transport.createCommitFromFiles = async (args) => {
    const result = await originalCreate(args);
    transport.authoritySha = 'd'.repeat(40);
    publisher.packet.authority_epoch = 4;
    publisher.packet.authoritative_subject = { algorithm: 'sha1', oid: 'e'.repeat(40) };
    return result;
  };
  let dispatches = 0;

  const result = await ensureSecondShiftClaimStateAuthority({
    repository,
    transport,
    publisher,
    dispatchBootstrap: async () => { dispatches += 1; },
    pollAttempts: 2,
    pollDelayMs: 0
  });

  assert.equal(result.state, 'RACE_EXISTING_VERIFIED');
  assert.equal(result.authority_epoch, 4);
  assert.equal(dispatches, 0);
});

test('dirty genesis predecessor fails closed before commit or dispatch', async () => {
  const transport = new FakeTransport();
  transport.predecessorHead = '{"unexpected":true}';
  const publisher = new FakePublisher(transport);
  let dispatches = 0;

  await assert.rejects(
    ensureSecondShiftClaimStateAuthority({
      repository,
      transport,
      publisher,
      dispatchBootstrap: async () => { dispatches += 1; },
      pollAttempts: 2,
      pollDelayMs: 0
    }),
    (error) => error?.code === 'CLAIM_STATE_AUTHORITY_GENESIS_PREDECESSOR_DIRTY'
  );
  assert.equal(dispatches, 0);
  assert.equal(transport.created.length, 0);
});

test('invalid existing authority fails closed and is never replaced', async () => {
  const transport = new FakeTransport();
  transport.authoritySha = 'f'.repeat(40);
  const publisher = new FakePublisher(transport);
  publisher.packet.allowed_paths_or_effects.paths = ['execution/**'];
  let dispatches = 0;

  await assert.rejects(
    ensureSecondShiftClaimStateAuthority({
      repository,
      transport,
      publisher,
      dispatchBootstrap: async () => { dispatches += 1; },
      pollAttempts: 2,
      pollDelayMs: 0
    }),
    (error) => error?.code === 'CLAIM_STATE_AUTHORITY_MISMATCH'
  );
  assert.equal(dispatches, 0);
  assert.equal(transport.created.length, 0);
});
