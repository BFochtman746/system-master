import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, uuidv7 } from '../src/canonical.js';
import { ControllerKernel } from '../src/kernel.js';
import { ControllerRuntime } from '../src/lifecycle.js';
import { INGRESS_REF_PREFIX } from '../src/durable-command-ingress.js';
import { parseStrictJsonBytes, parseStrictJsonText } from '../src/strict-json.js';
import {
  FrameDecoder,
  LocalCommandClient,
  LocalCommandServer,
  MAX_COMMAND_FRAME_BYTES,
  MAX_RESPONSE_FRAME_BYTES,
  buildAuthenticatedRequestPayload,
  buildAuthenticatedResponsePayload,
  createServerChallenge,
  encodeFrame,
  handleLocalCommandRequestBytes,
  localEndpointForDatabase,
  projectLocalCommandRequest,
  uuidV7CreatedAt,
  validateLocalCredential,
  verifyAuthenticatedRequestPayload,
  verifyAuthenticatedResponsePayload,
  verifyServerChallenge
} from '../src/local-command-intake.js';

const SUBJECT = { algorithm: 'sha1', oid: 'a'.repeat(40) };

function credential({ secret = Buffer.alloc(32, 0x53), key_id = 'local-test-v1', principal_label = 'transport:test-client' } = {}) {
  return { secret, key_id, principal_label };
}

function request(overrides = {}) {
  return {
    protocol_version: '1.0',
    command_id: uuidv7(),
    command_type: 'controller.reconcile',
    target: { repository: 'BFochtman746/system-master', expected_subject: { ...SUBJECT } },
    preconditions: {},
    intent: { operation: 'local-intake-test' },
    constraints: {},
    required_policy_version: 'pending-admission',
    ...overrides
  };
}

function bytes(value) { return Buffer.from(canonicalize(value), 'utf8'); }
function countRows(kernel, table) { return Number(kernel.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n); }

function memoryRuntime() {
  const kernel = new ControllerKernel(':memory:');
  return { ready: true, kernel, instance_id: uuidv7(), paths: { database_path: join(tmpdir(), `sm-f005-${uuidv7()}.sqlite`) } };
}

function handle(req, runtime, cred = credential()) {
  return handleLocalCommandRequestBytes(bytes(req), {
    runtime,
    credential: cred,
    controllerVersion: 'controller-test',
    policyVersion: 'policy-runtime-v1'
  });
}

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'controller-v2-f005-'));
  const database = join(dir, 'controller.sqlite');
  const runtime = new ControllerRuntime(database, { reconcile: () => ({ standing: 'test-ready' }) });
  runtime.start();
  const cred = credential();
  const server = new LocalCommandServer({
    runtime,
    credential: cred,
    controllerVersion: 'controller-test',
    policyVersion: 'policy-runtime-v1',
    timeoutMs: 3000
  });
  await server.start();
  const client = new LocalCommandClient({ endpoint: server.endpoint, instanceId: runtime.instance_id, credential: cred, timeoutMs: 3000 });
  return {
    dir, database, runtime, cred, server, client,
    async close() {
      try { await server.stop(); } finally {
        try { runtime.stop(); } finally { rmSync(dir, { recursive: true, force: true }); }
      }
    }
  };
}

function readFrame(socket, decoder, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (timer) clearTimeout(timer);
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error('socket closed')); };
    const onData = (chunk) => {
      try {
        const frames = decoder.push(chunk);
        if (frames.length) { cleanup(); resolve(frames[0]); }
      } catch (error) { cleanup(); reject(error); }
    };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    timer = setTimeout(() => { cleanup(); reject(new Error('frame timeout')); }, timeoutMs);
  });
}

// Endpoint / lifecycle — L005 qualification cases 001..008.
test('F005-T001 endpoint token is deterministic for canonical DB + instance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f005-endpoint-'));
  try {
    const db = join(dir, 'controller.sqlite');
    const id = uuidv7();
    assert.equal(localEndpointForDatabase(db, id), localEndpointForDatabase(db, id));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('F005-T002 path aliases resolve to the same endpoint identity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f005-endpoint-'));
  try {
    const id = uuidv7();
    assert.equal(localEndpointForDatabase(join(dir, 'controller.sqlite'), id), localEndpointForDatabase(join(dir, '.', 'controller.sqlite'), id));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('F005-T003 different Controller instance IDs produce different endpoints', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f005-endpoint-'));
  try {
    const db = join(dir, 'controller.sqlite');
    assert.notEqual(localEndpointForDatabase(db, uuidv7()), localEndpointForDatabase(db, uuidv7()));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('F005-T004 endpoint does not expose raw database path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f005-sensitive-db-path-'));
  try {
    const db = join(dir, 'very-sensitive-controller-name.sqlite');
    const endpoint = localEndpointForDatabase(db, uuidv7());
    assert.equal(endpoint.includes('very-sensitive-controller-name'), false);
    assert.equal(endpoint.includes(dir), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('F005-T005 pre-existing POSIX endpoint fails closed rather than being deleted', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture();
  try {
    await f.server.stop();
    const replacement = new LocalCommandServer({ runtime: f.runtime, credential: f.cred });
    const endpoint = replacement.endpoint;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(endpoint, 'occupied', 'utf8');
    await assert.rejects(replacement.start(), (error) => error.code === 'LOCAL_ENDPOINT_IN_USE');
    assert.equal(readFileSync(endpoint, 'utf8'), 'occupied');
    rmSync(endpoint, { force: true });
  } finally {
    try { f.runtime.stop(); } catch {}
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('F005-T006 POSIX endpoint is mode 0600 before admission', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture();
  try { assert.equal(statSync(f.server.endpoint).mode & 0o777, 0o600); }
  finally { await f.close(); }
});

test('F005-T007 not-READY runtime cannot start local intake or mutate commands', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f005-not-ready-'));
  const kernel = new ControllerKernel(':memory:');
  try {
    const runtime = { ready: false, kernel, instance_id: uuidv7(), paths: { database_path: join(dir, 'controller.sqlite') } };
    const server = new LocalCommandServer({ runtime, credential: credential() });
    await assert.rejects(server.start(), (error) => error.code === 'CONTROLLER_NOT_READY');
    assert.equal(countRows(kernel, 'commands'), 0);
  } finally { kernel.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('F005-T008 stopped server cannot admit a later command', async () => {
  const f = await fixture();
  const req = request();
  try {
    await f.server.stop();
    await assert.rejects(f.client.request(req));
    assert.equal(countRows(f.runtime.kernel, 'commands'), 0);
  } finally {
    f.runtime.stop();
    rmSync(f.dir, { recursive: true, force: true });
  }
});

// Authentication — cases 009..021.
test('F005-T009 minimum 32-byte local credential is accepted', () => {
  assert.equal(validateLocalCredential(credential({ secret: Buffer.alloc(32, 1) })).secret.byteLength, 32);
});

test('F005-T010 short local credential is rejected', () => {
  assert.throws(() => validateLocalCredential(credential({ secret: Buffer.alloc(31, 1) })), (error) => error.code === 'TRANSPORT_AUTH_FAILED');
});

test('F005-T011 wrong key cannot authenticate server challenge', () => {
  const good = credential({ secret: Buffer.alloc(32, 1) });
  const bad = credential({ secret: Buffer.alloc(32, 2) });
  const id = uuidv7();
  const challenge = createServerChallenge(good, id);
  assert.throws(() => verifyServerChallenge(bytes(challenge.frame), bad, id), (error) => error.code === 'TRANSPORT_SERVER_AUTH_FAILED');
});

test('F005-T012 wrong key cannot authenticate request', () => {
  const good = credential({ secret: Buffer.alloc(32, 1) });
  const bad = credential({ secret: Buffer.alloc(32, 2) });
  const id = uuidv7();
  const nonce = Buffer.alloc(32, 3);
  const payload = buildAuthenticatedRequestPayload(bytes(request()), good, id, nonce);
  assert.throws(() => verifyAuthenticatedRequestPayload(payload, bad, id, nonce), (error) => error.code === 'TRANSPORT_AUTH_FAILED');
});

test('F005-T013 server challenge MAC bit flip is rejected', () => {
  const cred = credential();
  const id = uuidv7();
  const { frame } = createServerChallenge(cred, id);
  const changed = { ...frame, server_mac: `${frame.server_mac[0] === 'A' ? 'B' : 'A'}${frame.server_mac.slice(1)}` };
  assert.throws(() => verifyServerChallenge(bytes(changed), cred, id), (error) => error.code === 'TRANSPORT_SERVER_AUTH_FAILED');
});

test('F005-T014 request MAC bit flip is rejected', () => {
  const cred = credential();
  const id = uuidv7();
  const nonce = Buffer.alloc(32, 4);
  const payload = Buffer.from(buildAuthenticatedRequestPayload(bytes(request()), cred, id, nonce));
  payload[5] ^= 0x01;
  assert.throws(() => verifyAuthenticatedRequestPayload(payload, cred, id, nonce), (error) => error.code === 'TRANSPORT_AUTH_FAILED');
});

test('F005-T015 command-byte bit flip after MAC creation is rejected before parsing', () => {
  const cred = credential();
  const id = uuidv7();
  const nonce = Buffer.alloc(32, 5);
  const payload = Buffer.from(buildAuthenticatedRequestPayload(bytes(request()), cred, id, nonce));
  payload[payload.length - 1] ^= 0x01;
  assert.throws(() => verifyAuthenticatedRequestPayload(payload, cred, id, nonce), (error) => error.code === 'TRANSPORT_AUTH_FAILED');
});

test('F005-T016 captured request cannot validate under a new server nonce', () => {
  const cred = credential();
  const id = uuidv7();
  const oldNonce = Buffer.alloc(32, 6);
  const newNonce = Buffer.alloc(32, 7);
  const payload = buildAuthenticatedRequestPayload(bytes(request()), cred, id, oldNonce);
  assert.throws(() => verifyAuthenticatedRequestPayload(payload, cred, id, newNonce), (error) => error.code === 'TRANSPORT_AUTH_FAILED');
});

test('F005-T017 unexpected key ID fails server authentication', () => {
  const id = uuidv7();
  const a = credential({ key_id: 'key-a' });
  const b = credential({ key_id: 'key-b' });
  const { frame } = createServerChallenge(a, id);
  assert.throws(() => verifyServerChallenge(bytes(frame), b, id), (error) => error.code === 'TRANSPORT_SERVER_AUTH_FAILED');
});

test('F005-T018 one connection can create at most one semantic command', async () => {
  const f = await fixture();
  const first = request();
  const second = request();
  const socket = createConnection({ path: f.server.endpoint });
  try {
    await once(socket, 'connect');
    const decoder = new FrameDecoder(MAX_RESPONSE_FRAME_BYTES);
    const challengeBytes = await readFrame(socket, decoder);
    const challenge = verifyServerChallenge(challengeBytes, f.cred, f.runtime.instance_id);
    const p1 = buildAuthenticatedRequestPayload(bytes(first), f.cred, f.runtime.instance_id, challenge.nonce);
    const p2 = buildAuthenticatedRequestPayload(bytes(second), f.cred, f.runtime.instance_id, challenge.nonce);
    socket.write(Buffer.concat([encodeFrame(p1), encodeFrame(p2)]));
    await readFrame(socket, decoder);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(countRows(f.runtime.kernel, 'commands'), 1);
  } finally { socket.destroy(); await f.close(); }
});

test('F005-T019 raw authentication material is absent from endpoint, DB, status and protocol values', async () => {
  const secret = Buffer.from('S'.repeat(32), 'ascii');
  const dir = mkdtempSync(join(tmpdir(), 'controller-v2-f005-secret-'));
  const database = join(dir, 'controller.sqlite');
  const runtime = new ControllerRuntime(database, { reconcile: () => ({ standing: 'ready' }) });
  runtime.start();
  const cred = credential({ secret });
  const server = new LocalCommandServer({ runtime, credential: cred });
  await server.start();
  const client = new LocalCommandClient({ endpoint: server.endpoint, instanceId: runtime.instance_id, credential: cred });
  try {
    const result = await client.request(request());
    assert.equal(server.endpoint.includes('S'.repeat(32)), false);
    assert.equal(JSON.stringify(result).includes('S'.repeat(32)), false);
    assert.equal(readFileSync(runtime.paths.status_path, 'utf8').includes('S'.repeat(32)), false);
    assert.equal(readFileSync(database).includes(secret), false);
    if (existsSync(`${database}-wal`)) assert.equal(readFileSync(`${database}-wal`).includes(secret), false);
  } finally { await server.stop(); runtime.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('F005-T020 authenticated response verifies for valid transcript', () => {
  const cred = credential();
  const id = uuidv7();
  const nonce = Buffer.alloc(32, 8);
  const reqDigest = Buffer.alloc(32, 9);
  const response = bytes({ protocol_version: '1.0', status: 'ACCEPTED', command_id: uuidv7(), transaction_id: uuidv7(), duplicate: false, fingerprint: 'a'.repeat(64) });
  const payload = buildAuthenticatedResponsePayload(response, cred, id, nonce, reqDigest);
  assert.deepEqual(verifyAuthenticatedResponsePayload(payload, cred, id, nonce, reqDigest), response);
});

test('F005-T021 forged response MAC is rejected', () => {
  const cred = credential();
  const id = uuidv7();
  const nonce = Buffer.alloc(32, 8);
  const reqDigest = Buffer.alloc(32, 9);
  const payload = Buffer.from(buildAuthenticatedResponsePayload(bytes({ status: 'ERROR', error_code: 'X', protocol_version: '1.0' }), cred, id, nonce, reqDigest));
  payload[5] ^= 0x01;
  assert.throws(() => verifyAuthenticatedResponsePayload(payload, cred, id, nonce, reqDigest), (error) => error.code === 'TRANSPORT_SERVER_AUTH_FAILED');
});

// Framing / parser — cases 022..036.
test('F005-T022 fragmented length prefix reconstructs exactly one frame', () => {
  const encoded = encodeFrame(Buffer.from('abc'));
  const decoder = new FrameDecoder(16);
  assert.equal(decoder.push(encoded.subarray(0, 2)).length, 0);
  assert.equal(decoder.push(encoded.subarray(2, 4)).length, 0);
  const frames = decoder.push(encoded.subarray(4));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].toString(), 'abc');
});

test('F005-T023 fragmented body reconstructs exactly', () => {
  const encoded = encodeFrame(Buffer.from('abcdef'));
  const decoder = new FrameDecoder(16);
  assert.equal(decoder.push(encoded.subarray(0, 7)).length, 0);
  const frames = decoder.push(encoded.subarray(7));
  assert.equal(frames[0].toString(), 'abcdef');
});

test('F005-T024 coalesced frames remain two distinct messages', () => {
  const decoder = new FrameDecoder(16);
  const frames = decoder.push(Buffer.concat([encodeFrame(Buffer.from('a')), encodeFrame(Buffer.from('b'))]));
  assert.deepEqual(frames.map((x) => x.toString()), ['a', 'b']);
});

test('F005-T025 zero-length frame is rejected', () => {
  assert.throws(() => new FrameDecoder(16).push(Buffer.alloc(4)), (error) => error.code === 'TRANSPORT_FRAME_INVALID');
});

test('F005-T026 oversized declared frame is rejected from the header alone', () => {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(1025, 0);
  assert.throws(() => new FrameDecoder(1024).push(header), (error) => error.code === 'TRANSPORT_FRAME_TOO_LARGE');
});

test('F005-T027 invalid UTF-8 is rejected', () => {
  assert.throws(() => parseStrictJsonBytes(Buffer.from([0xc3, 0x28])), (error) => error.code === 'PROTOCOL_INVALID_UTF8');
});

test('F005-T028 malformed JSON is rejected', () => {
  assert.throws(() => parseStrictJsonText('{"a":'), (error) => error.code === 'PROTOCOL_INVALID_JSON');
});

test('F005-T029 top-level non-object is rejected by local request contract', () => {
  const runtime = memoryRuntime();
  try {
    const result = handleLocalCommandRequestBytes(Buffer.from('[1,2,3]'), { runtime, credential: credential(), controllerVersion: 'x', policyVersion: 'y' });
    assert.equal(result.error_code, 'PROTOCOL_INVALID_REQUEST');
    assert.equal(countRows(runtime.kernel, 'commands'), 0);
  } finally { runtime.kernel.close(); }
});

test('F005-T030 duplicate top-level JSON key is rejected', () => {
  assert.throws(() => parseStrictJsonText('{"a":1,"a":2}'), (error) => error.code === 'PROTOCOL_DUPLICATE_KEY');
});

test('F005-T031 duplicate nested JSON key is rejected', () => {
  assert.throws(() => parseStrictJsonText('{"x":{"a":1,"a":2}}'), (error) => error.code === 'PROTOCOL_DUPLICATE_KEY');
});

test('F005-T032 duplicate key inside array object is rejected', () => {
  assert.throws(() => parseStrictJsonText('{"x":[{"a":1,"a":2}]}'), (error) => error.code === 'PROTOCOL_DUPLICATE_KEY');
});

test('F005-T033 trailing non-whitespace is rejected', () => {
  assert.throws(() => parseStrictJsonText('{"a":1}x'), (error) => error.code === 'PROTOCOL_INVALID_JSON');
});

test('F005-T034 nesting beyond 64 levels is rejected', () => {
  const text = `${'['.repeat(66)}0${']'.repeat(66)}`;
  assert.throws(() => parseStrictJsonText(text, { maxDepth: 64 }), (error) => error.code === 'PROTOCOL_NESTING_LIMIT');
});

test('F005-T035 prototype-like JSON member names cannot mutate Object.prototype', () => {
  const value = parseStrictJsonText('{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal(value.__proto__.polluted, true);
  assert.equal(Object.prototype.polluted, undefined);
});

test('F005-T036 unknown top-level local request field is rejected', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle({ ...request(), surprise: true }, runtime);
    assert.equal(result.error_code, 'PROTOCOL_UNKNOWN_FIELD');
    assert.equal(countRows(runtime.kernel, 'commands'), 0);
  } finally { runtime.kernel.close(); }
});

// Projection / semantic authority — cases 037..050.
test('F005-T037 valid local request projects exactly onto frozen 002B command schema', () => {
  const req = request();
  const cmd = projectLocalCommandRequest(req, credential());
  assert.deepEqual(Object.keys(cmd), ['protocol_version','schema','command_id','created_at','issuer','command_type','target','preconditions','intent','constraints','required_policy_version']);
  assert.equal(cmd.schema, 'controller://schemas/command/v1');
  assert.equal(cmd.command_id, req.command_id);
});

test('F005-T038 client cannot supply or override issuer', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle({ ...request(), issuer: { principal: 'admin', source: 'spoof' } }, runtime);
    assert.equal(result.error_code, 'PROTOCOL_UNKNOWN_FIELD');
    assert.equal(countRows(runtime.kernel, 'commands'), 0);
  } finally { runtime.kernel.close(); }
});

test('F005-T039 client cannot supply or override command schema', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle({ ...request(), schema: 'controller://schemas/evil/v1' }, runtime);
    assert.equal(result.error_code, 'PROTOCOL_UNKNOWN_FIELD');
  } finally { runtime.kernel.close(); }
});

test('F005-T040 client cannot supply or override created_at', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle({ ...request(), created_at: '1999-01-01T00:00:00.000Z' }, runtime);
    assert.equal(result.error_code, 'PROTOCOL_UNKNOWN_FIELD');
  } finally { runtime.kernel.close(); }
});

test('F005-T041 UUIDv7 timestamp projection is deterministic across delayed replay', async () => {
  const req = request();
  const first = projectLocalCommandRequest(req, credential());
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = projectLocalCommandRequest(req, credential());
  assert.equal(first.created_at, second.created_at);
  assert.equal(first.created_at, uuidV7CreatedAt(req.command_id));
  assert.equal(canonicalize(first), canonicalize(second));
});

test('F005-T042 client cannot supply runtime Controller/policy/worker/qualification/promotion authority', () => {
  const runtime = memoryRuntime();
  try {
    for (const field of ['controller_version', 'policy_version', 'worker_id', 'qualification_state', 'promotion_state']) {
      const result = handle({ ...request(), [field]: 'spoof' }, runtime);
      assert.equal(result.error_code, 'PROTOCOL_UNKNOWN_FIELD');
    }
    assert.equal(countRows(runtime.kernel, 'commands'), 0);
  } finally { runtime.kernel.close(); }
});

test('F005-T043 valid authenticated request creates exactly one command and one OPEN transaction', async () => {
  const f = await fixture();
  try {
    const result = await f.client.request(request());
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(result.duplicate, false);
    assert.equal(countRows(f.runtime.kernel, 'commands'), 1);
    assert.equal(countRows(f.runtime.kernel, 'transactions'), 1);
    assert.equal(f.runtime.kernel.db.prepare('SELECT state FROM transactions').get().state, 'OPEN');
    const tx = f.runtime.kernel.db.prepare('SELECT controller_version,policy_version FROM transactions').get();
    assert.equal(tx.controller_version, 'controller-test');
    assert.equal(tx.policy_version, 'policy-runtime-v1');
  } finally { await f.close(); }
});

test('F005-T044 exact replay returns original transaction with duplicate=true', async () => {
  const f = await fixture();
  const req = request();
  try {
    const first = await f.client.request(req);
    const second = await f.client.request(req);
    assert.equal(second.status, 'ACCEPTED');
    assert.equal(second.duplicate, true);
    assert.equal(second.transaction_id, first.transaction_id);
    assert.equal(countRows(f.runtime.kernel, 'commands'), 1);
  } finally { await f.close(); }
});

test('F005-T045 same command ID with changed semantic intent hard-conflicts without second transaction', async () => {
  const f = await fixture();
  const req = request();
  try {
    await f.client.request(req);
    const changed = { ...req, intent: { operation: 'changed' } };
    const result = await f.client.request(changed);
    assert.equal(result.status, 'ERROR');
    assert.equal(result.error_code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(countRows(f.runtime.kernel, 'commands'), 1);
    assert.equal(countRows(f.runtime.kernel, 'transactions'), 1);
  } finally { await f.close(); }
});

test('F005-T046 unknown response after durable accept reconciles by exact semantic replay', () => {
  const runtime = memoryRuntime();
  const req = request();
  try {
    const first = handle(req, runtime);
    const replay = handle(req, runtime);
    assert.equal(first.status, 'ACCEPTED');
    assert.equal(replay.status, 'ACCEPTED');
    assert.equal(replay.duplicate, true);
    assert.equal(replay.transaction_id, first.transaction_id);
    assert.equal(countRows(runtime.kernel, 'commands'), 1);
  } finally { runtime.kernel.close(); }
});

test('F005-T047 local transport acceptance never auto-admits or activates transaction', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle(request(), runtime);
    const tx = runtime.kernel.db.prepare('SELECT state,completion_contract_json FROM transactions WHERE transaction_id=?').get(result.transaction_id);
    assert.equal(tx.state, 'OPEN');
    assert.equal(tx.completion_contract_json, null);
  } finally { runtime.kernel.close(); }
});

test('F005-T048 authenticated transport principal is provenance only and creates no execution operation', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle(request(), runtime);
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(countRows(runtime.kernel, 'operations'), 0);
    assert.equal(countRows(runtime.kernel, 'external_effects'), 0);
    const payload = JSON.parse(runtime.kernel.db.prepare('SELECT payload_json FROM commands').get().payload_json);
    assert.equal(payload.issuer.source, 'local-ipc-hmac-v1');
  } finally { runtime.kernel.close(); }
});

test('F005-T049 unsupported historical parent/relation fields fail rather than creating hidden lineage', () => {
  const runtime = memoryRuntime();
  try {
    const result = handle({ ...request(), parent_transaction_id: uuidv7(), relation_to_parent: 'SUCCESSOR' }, runtime);
    assert.equal(result.error_code, 'PROTOCOL_UNKNOWN_FIELD');
    assert.equal(countRows(runtime.kernel, 'commands'), 0);
  } finally { runtime.kernel.close(); }
});

test('F005-T050 internal exception maps to bounded error without leaking exception text or stack', () => {
  const runtime = {
    ready: true,
    kernel: { acceptCommand() { throw new Error('VERY_SECRET_INTERNAL_EXCEPTION'); } },
    instance_id: uuidv7(),
    paths: { database_path: join(tmpdir(), `f005-${uuidv7()}.sqlite`) }
  };
  const result = handle(request(), runtime);
  assert.deepEqual({ ...result }, { protocol_version: '1.0', status: 'ERROR', error_code: 'INTERNAL_ERROR' });
  assert.equal(JSON.stringify(result).includes('VERY_SECRET_INTERNAL_EXCEPTION'), false);
});

// Architecture / cumulative boundary — cases 051..052.
test('F005-T051 local intake source has no provider/scheduler/worker/admission/promotion execution path', async () => {
  const source = readFileSync(new URL('../src/local-command-intake.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/(?:external-effect|github|worker|scheduler|qualification|promotion)/);
  assert.doesNotMatch(source, /\.admitTransaction\s*\(/);
  assert.doesNotMatch(source, /\.activateTransaction\s*\(/);
});

test('F005-T052 Foundation-002D durable inbox contract remains present for offline rediscovery', () => {
  assert.equal(INGRESS_REF_PREFIX, 'refs/tags/controller-inbox/v1/');
  const source = readFileSync(new URL('../src/durable-command-ingress.js', import.meta.url), 'utf8');
  assert.match(source, /reconcileIngressRef/);
  assert.match(source, /DEFERRED_TRANSIENT/);
  assert.match(source, /acceptCommand/);
});
