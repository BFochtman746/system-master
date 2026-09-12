import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubReadConsistentReceiptCasRestTransport } from '../src/github-production-read-consistency.js';
import { GitHubProductionMutationError } from '../src/github-production-mutation.js';

const OLD_SHA = '1'.repeat(40);
const NEW_SHA = '2'.repeat(40);
const REF = 'control-gateway-r01-proof/receipt-cas';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

function transportFor(fetchImpl, delays = [0, 0, 0]) {
  return new GitHubReadConsistentReceiptCasRestTransport({
    owner: 'BFochtman746',
    repo: 'system-master',
    tokenProvider: async () => 'test-token',
    fetchImpl,
    postWriteVerifyDelaysMs: delays,
    sleepImpl: async () => {}
  });
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof GitHubProductionMutationError && error.code === code);
}

test('acknowledged CAS reconciles bounded stale predecessor reads without retrying mutation', async () => {
  let patchCalls = 0;
  let getCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.method === 'PATCH') {
      patchCalls += 1;
      return response(200, { object: { sha: NEW_SHA } });
    }
    if (init.method === 'GET') {
      getCalls += 1;
      return response(200, { object: { sha: getCalls < 3 ? OLD_SHA : NEW_SHA } });
    }
    throw new Error(`unexpected method ${init.method}`);
  };
  const transport = transportFor(fetchImpl);
  const ack = await transport.updateRefFastForward(REF, NEW_SHA);
  assert.equal(ack.sha, NEW_SHA);
  const observed = await transport.getRef(REF);
  assert.equal(observed.sha, NEW_SHA);
  assert.equal(patchCalls, 1);
  assert.equal(getCalls, 3);
});

test('ambiguous PATCH outcome is reconciled by bounded reads without a second PATCH', async () => {
  let patchCalls = 0;
  let getCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.method === 'PATCH') {
      patchCalls += 1;
      throw new Error('socket reset after send');
    }
    if (init.method === 'GET') {
      getCalls += 1;
      return response(200, { object: { sha: getCalls === 1 ? OLD_SHA : NEW_SHA } });
    }
    throw new Error(`unexpected method ${init.method}`);
  };
  const transport = transportFor(fetchImpl);
  await rejectsCode(transport.updateRefFastForward(REF, NEW_SHA), 'GITHUB_NETWORK_AMBIGUOUS');
  const observed = await transport.getRef(REF);
  assert.equal(observed.sha, NEW_SHA);
  assert.equal(patchCalls, 1);
  assert.equal(getCalls, 2);
});

test('bounded read reconciliation fails closed when the ref never converges', async () => {
  let patchCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.method === 'PATCH') {
      patchCalls += 1;
      return response(200, { object: { sha: NEW_SHA } });
    }
    if (init.method === 'GET') return response(200, { object: { sha: OLD_SHA } });
    throw new Error(`unexpected method ${init.method}`);
  };
  const transport = transportFor(fetchImpl, [0, 0]);
  await transport.updateRefFastForward(REF, NEW_SHA);
  await rejectsCode(transport.getRef(REF), 'PRODUCTION_MUTATION_POSTWRITE_RECONCILIATION_EXHAUSTED');
  assert.equal(patchCalls, 1);
});

test('PATCH acknowledgment must bind the exact requested commit', async () => {
  let patchCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.method === 'PATCH') {
      patchCalls += 1;
      return response(200, { object: { sha: OLD_SHA } });
    }
    throw new Error(`unexpected method ${init.method}`);
  };
  const transport = transportFor(fetchImpl);
  await rejectsCode(transport.updateRefFastForward(REF, NEW_SHA), 'PRODUCTION_MUTATION_CAS_ACK_MISMATCH');
  assert.equal(patchCalls, 1);
});
