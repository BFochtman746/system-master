import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, isRfc3339, isUuidV7 } from './canonical.js';
import { ControllerError } from './errors.js';
import { validateCommand } from './kernel.js';
import { resolveControllerRuntimePaths } from './lifecycle.js';
import { assertCanonicalSubjectRef } from './subject.js';
import { StrictJsonError, parseStrictJsonBytes } from './strict-json.js';

export const LOCAL_IPC_AUTH_PROTOCOL = 'controller-local-ipc-hmac.v1';
export const LOCAL_COMMAND_PROTOCOL_VERSION = '1.0';
export const LOCAL_COMMAND_SCHEMA = 'controller://schemas/command/v1';
export const MAX_AUTH_FRAME_BYTES = 4 * 1024;
export const MAX_COMMAND_FRAME_BYTES = 64 * 1024;
export const MAX_RESPONSE_FRAME_BYTES = 64 * 1024;
export const DEFAULT_IO_TIMEOUT_MS = 5_000;

const MAGIC = Buffer.from('SMC1', 'ascii');
const REQUEST_TYPE = 0x02;
const RESPONSE_TYPE = 0x03;
const MAC_BYTES = 32;
const MIN_AUTHKEY_BYTES = 32;
const MAX_AUTHKEY_BYTES = 128;
const KEY_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const PRINCIPAL_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const BASE64URL_32_RE = /^[A-Za-z0-9_-]{43}$/;

function localError(code, message, details = {}) {
  return new ControllerError(code, message, details);
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(asBuffer(bytes)).digest();
}

function transcriptMac(secret, domain, parts) {
  const h = createHmac('sha256', secret);
  h.update(domain, 'utf8');
  for (const part of parts) {
    h.update(Buffer.from([0]));
    h.update(typeof part === 'string' ? Buffer.from(part, 'utf8') : asBuffer(part));
  }
  return h.digest();
}

function safeEqual(a, b) {
  const x = asBuffer(a);
  const y = asBuffer(b);
  return x.byteLength === y.byteLength && timingSafeEqual(x, y);
}

function strictObject(value, code = 'PROTOCOL_INVALID_REQUEST') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw localError(code, 'object required');
  return value;
}

function exactKeys(value, allowed, required = allowed, code = 'PROTOCOL_INVALID_REQUEST') {
  strictObject(value, code);
  const keys = Object.keys(value);
  for (const key of keys) if (!allowed.includes(key)) throw localError('PROTOCOL_UNKNOWN_FIELD', 'unknown protocol field');
  for (const key of required) if (!(key in value)) throw localError(code, 'required protocol field missing');
}

export function validateLocalCredential(candidate) {
  strictObject(candidate, 'TRANSPORT_AUTH_FAILED');
  if (typeof candidate.key_id !== 'string' || !KEY_ID_RE.test(candidate.key_id)) throw localError('TRANSPORT_AUTH_FAILED', 'invalid local credential key id');
  if (!(candidate.secret instanceof Uint8Array)) throw localError('TRANSPORT_AUTH_FAILED', 'local credential secret must be bytes');
  if (candidate.secret.byteLength < MIN_AUTHKEY_BYTES || candidate.secret.byteLength > MAX_AUTHKEY_BYTES) throw localError('TRANSPORT_AUTH_FAILED', 'local credential secret length invalid');
  if (typeof candidate.principal_label !== 'string' || !PRINCIPAL_RE.test(candidate.principal_label)) throw localError('TRANSPORT_AUTH_FAILED', 'local credential principal label invalid');
  return Object.freeze({
    key_id: candidate.key_id,
    secret: Buffer.from(candidate.secret),
    principal_label: candidate.principal_label
  });
}

export function localEndpointForDatabase(databasePath, instanceId, { platform = process.platform, tempDir = tmpdir() } = {}) {
  if (typeof instanceId !== 'string' || instanceId.length === 0) throw new TypeError('instanceId required');
  const canonical = resolveControllerRuntimePaths(databasePath).database_path;
  const token = createHash('sha256').update(`${canonical}\0${instanceId}`, 'utf8').digest('hex').slice(0, 32);
  if (platform === 'win32') return `\\\\.\\pipe\\system-master-controller-v2-${token}`;
  return join(tempDir, `sm-controller-v2-${token}.sock`);
}

export function encodeFrame(payload, { maxPayload = MAX_COMMAND_FRAME_BYTES } = {}) {
  const body = asBuffer(payload);
  if (body.byteLength === 0) throw localError('TRANSPORT_FRAME_INVALID', 'zero-length frame is invalid');
  if (body.byteLength > maxPayload) throw localError('TRANSPORT_FRAME_TOO_LARGE', 'frame payload exceeds configured bound');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(body.byteLength, 0);
  return Buffer.concat([header, body]);
}

export class FrameDecoder {
  constructor(maxPayload = MAX_COMMAND_FRAME_BYTES) {
    if (!Number.isSafeInteger(maxPayload) || maxPayload < 1) throw new RangeError('maxPayload must be positive');
    this.maxPayload = maxPayload;
    this.buffer = Buffer.alloc(0);
  }

  get pendingBytes() { return this.buffer.byteLength; }

  push(chunk) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('frame chunk must be bytes');
    this.buffer = Buffer.concat([this.buffer, asBuffer(chunk)]);
    const frames = [];
    while (this.buffer.byteLength >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (length === 0) throw localError('TRANSPORT_FRAME_INVALID', 'zero-length frame is invalid');
      if (length > this.maxPayload) throw localError('TRANSPORT_FRAME_TOO_LARGE', 'declared frame exceeds configured bound');
      if (this.buffer.byteLength < 4 + length) break;
      frames.push(this.buffer.subarray(4, 4 + length));
      this.buffer = this.buffer.subarray(4 + length);
    }
    return frames;
  }
}

class SocketFrameReader {
  constructor(socket, maxPayload) {
    this.socket = socket;
    this.decoder = new FrameDecoder(maxPayload);
    this.queue = [];
    this.waiters = [];
    this.failure = null;
    socket.on('data', (chunk) => this.#data(chunk));
    socket.on('error', (error) => this.#fail(error));
    socket.on('close', () => this.#fail(localError('TRANSPORT_CONNECTION_CLOSED', 'connection closed before frame completed')));
  }

  #data(chunk) {
    if (this.failure) return;
    let frames;
    try { frames = this.decoder.push(chunk); }
    catch (error) { this.#fail(error); this.socket.destroy(); return; }
    for (const frame of frames) {
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(frame);
      else this.queue.push(frame);
    }
  }

  #fail(error) {
    if (this.failure) return;
    this.failure = error;
    while (this.waiters.length) this.waiters.shift().reject(error);
  }

  next(timeoutMs = DEFAULT_IO_TIMEOUT_MS) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter = { resolve: null, reject: null, timer: null };
      const remove = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        if (waiter.timer !== null) clearTimeout(waiter.timer);
      };
      waiter.resolve = (value) => { remove(); resolve(value); };
      waiter.reject = (error) => { remove(); reject(error); };
      waiter.timer = setTimeout(() => waiter.reject(localError('TRANSPORT_TIMEOUT', 'timed out waiting for protocol frame')), timeoutMs);
      this.waiters.push(waiter);
    });
  }
}

function parseBase64Url32(value, code) {
  if (typeof value !== 'string' || !BASE64URL_32_RE.test(value)) throw localError(code, 'invalid 32-byte base64url field');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.byteLength !== 32) throw localError(code, 'invalid 32-byte field length');
  return bytes;
}

function challengeMac(credential, instanceId, nonce) {
  return transcriptMac(credential.secret, `${LOCAL_IPC_AUTH_PROTOCOL}/server`, [instanceId, credential.key_id, nonce]);
}

export function createServerChallenge(credentialInput, instanceId, nonce = randomBytes(32)) {
  const credential = validateLocalCredential(credentialInput);
  if (typeof instanceId !== 'string' || instanceId.length === 0) throw new TypeError('instanceId required');
  if (!(nonce instanceof Uint8Array) || nonce.byteLength !== 32) throw new TypeError('nonce must be 32 bytes');
  const nonceBytes = Buffer.from(nonce);
  const frame = {
    protocol: LOCAL_IPC_AUTH_PROTOCOL,
    type: 'challenge',
    instance_id: instanceId,
    key_id: credential.key_id,
    nonce: nonceBytes.toString('base64url'),
    server_mac: challengeMac(credential, instanceId, nonceBytes).toString('base64url')
  };
  return Object.freeze({ frame: Object.freeze(frame), nonce: nonceBytes });
}

export function verifyServerChallenge(bytes, credentialInput, expectedInstanceId) {
  const credential = validateLocalCredential(credentialInput);
  const value = parseStrictJsonBytes(bytes, { maxBytes: MAX_AUTH_FRAME_BYTES, maxDepth: 8 });
  exactKeys(value, ['protocol', 'type', 'instance_id', 'key_id', 'nonce', 'server_mac'], undefined, 'TRANSPORT_SERVER_AUTH_FAILED');
  if (value.protocol !== LOCAL_IPC_AUTH_PROTOCOL || value.type !== 'challenge') throw localError('TRANSPORT_SERVER_AUTH_FAILED', 'unexpected server authentication protocol');
  if (value.instance_id !== expectedInstanceId || value.key_id !== credential.key_id) throw localError('TRANSPORT_SERVER_AUTH_FAILED', 'server challenge identity mismatch');
  const nonce = parseBase64Url32(value.nonce, 'TRANSPORT_SERVER_AUTH_FAILED');
  const received = parseBase64Url32(value.server_mac, 'TRANSPORT_SERVER_AUTH_FAILED');
  const expected = challengeMac(credential, expectedInstanceId, nonce);
  if (!safeEqual(received, expected)) throw localError('TRANSPORT_SERVER_AUTH_FAILED', 'server challenge authentication failed');
  return Object.freeze({ nonce, instance_id: expectedInstanceId, key_id: credential.key_id });
}

function requestMac(credential, instanceId, nonce, requestDigest) {
  return transcriptMac(credential.secret, `${LOCAL_IPC_AUTH_PROTOCOL}/request`, [instanceId, credential.key_id, nonce, requestDigest]);
}

export function buildAuthenticatedRequestPayload(requestBytes, credentialInput, instanceId, nonce) {
  const credential = validateLocalCredential(credentialInput);
  const body = asBuffer(requestBytes);
  if (body.byteLength === 0 || body.byteLength + 4 + 1 + MAC_BYTES > MAX_COMMAND_FRAME_BYTES) throw localError('TRANSPORT_FRAME_TOO_LARGE', 'command request exceeds configured bound');
  const digest = sha256Bytes(body);
  const mac = requestMac(credential, instanceId, nonce, digest);
  return Buffer.concat([MAGIC, Buffer.from([REQUEST_TYPE]), mac, body]);
}

export function verifyAuthenticatedRequestPayload(payload, credentialInput, instanceId, nonce) {
  const credential = validateLocalCredential(credentialInput);
  const bytes = asBuffer(payload);
  if (bytes.byteLength < 4 + 1 + MAC_BYTES + 2) throw localError('TRANSPORT_FRAME_INVALID', 'authenticated request payload is truncated');
  if (!bytes.subarray(0, 4).equals(MAGIC) || bytes[4] !== REQUEST_TYPE) throw localError('TRANSPORT_FRAME_INVALID', 'authenticated request header invalid');
  const receivedMac = bytes.subarray(5, 5 + MAC_BYTES);
  const requestBytes = bytes.subarray(5 + MAC_BYTES);
  const digest = sha256Bytes(requestBytes);
  const expectedMac = requestMac(credential, instanceId, nonce, digest);
  if (!safeEqual(receivedMac, expectedMac)) throw localError('TRANSPORT_AUTH_FAILED', 'request authentication failed');
  return Object.freeze({ request_bytes: requestBytes, request_digest: digest });
}

function responseMac(credential, instanceId, nonce, requestDigest, responseDigest) {
  return transcriptMac(credential.secret, `${LOCAL_IPC_AUTH_PROTOCOL}/response`, [instanceId, credential.key_id, nonce, requestDigest, responseDigest]);
}

export function buildAuthenticatedResponsePayload(responseBytes, credentialInput, instanceId, nonce, requestDigest) {
  const credential = validateLocalCredential(credentialInput);
  const body = asBuffer(responseBytes);
  if (body.byteLength === 0 || body.byteLength + 4 + 1 + MAC_BYTES > MAX_RESPONSE_FRAME_BYTES) throw localError('TRANSPORT_FRAME_TOO_LARGE', 'response exceeds configured bound');
  const digest = sha256Bytes(body);
  const mac = responseMac(credential, instanceId, nonce, requestDigest, digest);
  return Buffer.concat([MAGIC, Buffer.from([RESPONSE_TYPE]), mac, body]);
}

export function verifyAuthenticatedResponsePayload(payload, credentialInput, instanceId, nonce, requestDigest) {
  const credential = validateLocalCredential(credentialInput);
  const bytes = asBuffer(payload);
  if (bytes.byteLength < 4 + 1 + MAC_BYTES + 2) throw localError('TRANSPORT_FRAME_INVALID', 'authenticated response payload is truncated');
  if (!bytes.subarray(0, 4).equals(MAGIC) || bytes[4] !== RESPONSE_TYPE) throw localError('TRANSPORT_FRAME_INVALID', 'authenticated response header invalid');
  const receivedMac = bytes.subarray(5, 5 + MAC_BYTES);
  const responseBytes = bytes.subarray(5 + MAC_BYTES);
  const expected = responseMac(credential, instanceId, nonce, requestDigest, sha256Bytes(responseBytes));
  if (!safeEqual(receivedMac, expected)) throw localError('TRANSPORT_SERVER_AUTH_FAILED', 'response authentication failed');
  return responseBytes;
}

export function uuidV7CreatedAt(commandId) {
  if (!isUuidV7(commandId)) throw localError('PROTOCOL_INVALID_REQUEST', 'command_id must be UUIDv7');
  const hex = commandId.replaceAll('-', '').slice(0, 12);
  const milliseconds = Number.parseInt(hex, 16);
  const createdAt = new Date(milliseconds).toISOString();
  if (!isRfc3339(createdAt)) throw localError('PROTOCOL_INVALID_REQUEST', 'UUIDv7 timestamp is outside Controller timestamp profile');
  return createdAt;
}

export function validateLocalCommandRequest(value) {
  exactKeys(value, ['protocol_version', 'command_id', 'command_type', 'target', 'preconditions', 'intent', 'constraints', 'required_policy_version']);
  if (value.protocol_version !== LOCAL_COMMAND_PROTOCOL_VERSION) throw localError('PROTOCOL_UNSUPPORTED_VERSION', 'unsupported local command protocol version');
  if (!isUuidV7(value.command_id)) throw localError('PROTOCOL_INVALID_REQUEST', 'command_id must be UUIDv7');
  if (typeof value.command_type !== 'string' || value.command_type.length === 0) throw localError('PROTOCOL_INVALID_REQUEST', 'command_type required');
  if (typeof value.required_policy_version !== 'string' || value.required_policy_version.length === 0) throw localError('PROTOCOL_INVALID_REQUEST', 'required_policy_version required');
  exactKeys(value.target, ['repository', 'expected_subject']);
  if (typeof value.target.repository !== 'string' || value.target.repository.length === 0) throw localError('PROTOCOL_INVALID_REQUEST', 'target repository required');
  assertCanonicalSubjectRef(value.target.expected_subject);
  return value;
}

export function projectLocalCommandRequest(request, credentialInput) {
  const credential = validateLocalCredential(credentialInput);
  validateLocalCommandRequest(request);
  const command = {
    protocol_version: LOCAL_COMMAND_PROTOCOL_VERSION,
    schema: LOCAL_COMMAND_SCHEMA,
    command_id: request.command_id,
    created_at: uuidV7CreatedAt(request.command_id),
    issuer: { principal: credential.principal_label, source: 'local-ipc-hmac-v1' },
    command_type: request.command_type,
    target: {
      repository: request.target.repository,
      expected_subject: {
        algorithm: request.target.expected_subject.algorithm,
        oid: request.target.expected_subject.oid
      }
    },
    preconditions: request.preconditions,
    intent: request.intent,
    constraints: request.constraints,
    required_policy_version: request.required_policy_version
  };
  validateCommand(command);
  return Object.freeze(command);
}

function responseError(code) {
  return { protocol_version: LOCAL_COMMAND_PROTOCOL_VERSION, status: 'ERROR', error_code: code };
}

function stableErrorCode(error) {
  if (error instanceof StrictJsonError) return error.code;
  if (error instanceof ControllerError) {
    if (error.code === 'IDEMPOTENCY_CONFLICT') return 'IDEMPOTENCY_CONFLICT';
    if (error.code === 'CONTROLLER_NOT_READY') return 'CONTROLLER_NOT_READY';
    if (error.code === 'PROTOCOL_UNKNOWN_FIELD' || error.code?.startsWith('PROTOCOL_')) return error.code;
    if (error.code?.startsWith('SUBJECT_') || error.code?.startsWith('SCHEMA_') || ['UNSUPPORTED_PROTOCOL', 'UNSUPPORTED_SCHEMA', 'FINGERPRINT_MISMATCH'].includes(error.code)) return 'COMMAND_SCHEMA_INVALID';
  }
  return 'INTERNAL_ERROR';
}

export function handleLocalCommandRequestBytes(requestBytes, {
  runtime,
  credential,
  controllerVersion,
  policyVersion
}) {
  try {
    if (!runtime || runtime.ready !== true || !runtime.kernel) throw localError('CONTROLLER_NOT_READY', 'Controller runtime is not ready');
    const parsed = parseStrictJsonBytes(requestBytes, { maxBytes: MAX_COMMAND_FRAME_BYTES - 37, maxDepth: 64 });
    const command = projectLocalCommandRequest(parsed, credential);
    if (runtime.ready !== true) throw localError('CONTROLLER_NOT_READY', 'Controller runtime lost readiness before command mutation');
    const result = runtime.kernel.acceptCommand(command, { controllerVersion, policyVersion });
    return Object.freeze({
      protocol_version: LOCAL_COMMAND_PROTOCOL_VERSION,
      status: 'ACCEPTED',
      command_id: command.command_id,
      transaction_id: result.transaction_id,
      duplicate: Boolean(result.duplicate),
      fingerprint: result.fingerprint
    });
  } catch (error) {
    return Object.freeze(responseError(stableErrorCode(error)));
  }
}

function canonicalResponseBytes(value) {
  return Buffer.from(canonicalize(value), 'utf8');
}

function canonicalRequestBytes(value) {
  try { return Buffer.from(canonicalize(value), 'utf8'); }
  catch { throw localError('PROTOCOL_INVALID_REQUEST', 'request is not canonical JSON data'); }
}

function connectPath(path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path });
    let timer = setTimeout(() => {
      timer = null;
      socket.destroy();
      reject(localError('TRANSPORT_TIMEOUT', 'timed out connecting to local Controller endpoint'));
    }, timeoutMs);
    const cleanup = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    socket.once('connect', () => { cleanup(); resolve(socket); });
    socket.once('error', (error) => { cleanup(); reject(error); });
  });
}

export class LocalCommandClient {
  constructor({ endpoint, instanceId, credential, timeoutMs = DEFAULT_IO_TIMEOUT_MS }) {
    if (typeof endpoint !== 'string' || endpoint.length === 0) throw new TypeError('endpoint required');
    if (typeof instanceId !== 'string' || instanceId.length === 0) throw new TypeError('instanceId required');
    this.endpoint = endpoint;
    this.instance_id = instanceId;
    this.credential = validateLocalCredential(credential);
    this.timeout_ms = timeoutMs;
  }

  async request(request) {
    const requestBytes = canonicalRequestBytes(request);
    if (requestBytes.byteLength + 37 > MAX_COMMAND_FRAME_BYTES) throw localError('TRANSPORT_FRAME_TOO_LARGE', 'command request exceeds configured bound');
    const socket = await connectPath(this.endpoint, this.timeout_ms);
    const reader = new SocketFrameReader(socket, MAX_RESPONSE_FRAME_BYTES);
    try {
      const challengeBytes = await reader.next(this.timeout_ms);
      if (challengeBytes.byteLength > MAX_AUTH_FRAME_BYTES) throw localError('TRANSPORT_SERVER_AUTH_FAILED', 'server challenge exceeds configured bound');
      const challenge = verifyServerChallenge(challengeBytes, this.credential, this.instance_id);
      const requestDigest = sha256Bytes(requestBytes);
      const payload = buildAuthenticatedRequestPayload(requestBytes, this.credential, this.instance_id, challenge.nonce);
      socket.write(encodeFrame(payload, { maxPayload: MAX_COMMAND_FRAME_BYTES }));
      const responsePayload = await reader.next(this.timeout_ms);
      const responseBytes = verifyAuthenticatedResponsePayload(responsePayload, this.credential, this.instance_id, challenge.nonce, requestDigest);
      return parseStrictJsonBytes(responseBytes, { maxBytes: MAX_RESPONSE_FRAME_BYTES, maxDepth: 16 });
    } finally {
      socket.destroy();
    }
  }
}

export class LocalCommandServer {
  constructor({
    runtime,
    credential,
    controllerVersion = 'dev',
    policyVersion = 'dev',
    timeoutMs = DEFAULT_IO_TIMEOUT_MS,
    platform = process.platform,
    tempDir = tmpdir()
  }) {
    if (!runtime?.paths?.database_path || typeof runtime.instance_id !== 'string') throw new TypeError('Foundation-004 runtime required');
    this.runtime = runtime;
    this.credential = validateLocalCredential(credential);
    this.controller_version = controllerVersion;
    this.policy_version = policyVersion;
    this.timeout_ms = timeoutMs;
    this.platform = platform;
    this.endpoint = localEndpointForDatabase(runtime.paths.database_path, runtime.instance_id, { platform, tempDir });
    this.server = null;
    this.sockets = new Set();
    this.accepting = false;
  }

  async start() {
    if (this.server) throw localError('LOCAL_ENDPOINT_IN_USE', 'local command service already started');
    if (this.runtime.ready !== true) throw localError('CONTROLLER_NOT_READY', 'Controller must be READY before local intake starts');
    if (this.platform !== 'win32' && existsSync(this.endpoint)) throw localError('LOCAL_ENDPOINT_IN_USE', 'local endpoint already exists');

    const server = createServer((socket) => {
      if (!this.accepting || this.runtime.ready !== true) { socket.destroy(); return; }
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
      this.#serveConnection(socket).catch(() => socket.destroy());
    });
    this.server = server;

    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(this.endpoint);
      });
      if (this.platform !== 'win32') {
        try { chmodSync(this.endpoint, 0o600); }
        catch (error) {
          await this.stop();
          throw localError('LOCAL_ENDPOINT_HARDENING_FAILED', 'failed to harden Unix-domain socket permissions', { cause: error.code });
        }
      }
      this.accepting = true;
      return this.endpoint;
    } catch (error) {
      this.accepting = false;
      this.server = null;
      try { server.close(); } catch {}
      if (error instanceof ControllerError) throw error;
      if (error?.code === 'EADDRINUSE') throw localError('LOCAL_ENDPOINT_IN_USE', 'local endpoint already in use');
      throw error;
    }
  }

  async #serveConnection(socket) {
    const reader = new SocketFrameReader(socket, MAX_COMMAND_FRAME_BYTES);
    socket.setTimeout(this.timeout_ms, () => socket.destroy());
    const { frame: challenge, nonce } = createServerChallenge(this.credential, this.runtime.instance_id);
    socket.write(encodeFrame(Buffer.from(canonicalize(challenge), 'utf8'), { maxPayload: MAX_AUTH_FRAME_BYTES }));
    const requestPayload = await reader.next(this.timeout_ms);
    if (!this.accepting || this.runtime.ready !== true) { socket.destroy(); return; }
    const verified = verifyAuthenticatedRequestPayload(requestPayload, this.credential, this.runtime.instance_id, nonce);
    const response = handleLocalCommandRequestBytes(verified.request_bytes, {
      runtime: this.runtime,
      credential: this.credential,
      controllerVersion: this.controller_version,
      policyVersion: this.policy_version
    });
    const responseBytes = canonicalResponseBytes(response);
    const responsePayload = buildAuthenticatedResponsePayload(responseBytes, this.credential, this.runtime.instance_id, nonce, verified.request_digest);
    socket.end(encodeFrame(responsePayload, { maxPayload: MAX_RESPONSE_FRAME_BYTES }));
  }

  async stop() {
    this.accepting = false;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise((resolve) => {
        try { server.close(() => resolve()); }
        catch { resolve(); }
      });
    }
    if (this.platform !== 'win32') {
      try { unlinkSync(this.endpoint); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
  }
}
