import { canonicalize } from './canonical.js';
import { ControllerError } from './errors.js';
import { GitHubApiError } from './github-git-transport.js';
import { validateCommand, commandFingerprint } from './kernel.js';
import { COMMAND_INBOX_NAMESPACE } from './github-command-inbox-transport.js';

const DEFAULT_MAX_COMMAND_BYTES = 64 * 1024;
const FP_RE = /^[0-9a-f]{64}$/;

function refCommandId(ref) {
  const prefix = `refs/tags/${COMMAND_INBOX_NAMESPACE}/`;
  if (typeof ref !== 'string' || !ref.startsWith(prefix)) throw new ControllerError('INBOX_REF_INVALID', 'command ref is outside the authoritative inbox namespace');
  const id = ref.slice(prefix.length);
  if (!id || id.includes('/')) throw new ControllerError('INBOX_REF_INVALID', 'command ref must contain exactly one command-id segment');
  return id;
}

function canonicalEnvelope(command) {
  validateCommand(command);
  const fingerprint = commandFingerprint(command);
  if (command.fingerprint !== undefined && command.fingerprint !== fingerprint) throw new ControllerError('FINGERPRINT_MISMATCH', 'command fingerprint mismatch');
  const normalized = { ...command, fingerprint };
  return { command: normalized, fingerprint, raw: canonicalize(normalized) };
}

function isCreateConflict(error) {
  return error instanceof GitHubApiError && (error.status === 409 || error.status === 422);
}

export class DurableCommandInbox {
  constructor({ transport, maxCommandBytes = DEFAULT_MAX_COMMAND_BYTES }) {
    if (!transport) throw new TypeError('transport required');
    if (!Number.isSafeInteger(maxCommandBytes) || maxCommandBytes < 1024) throw new RangeError('maxCommandBytes must be >= 1024');
    this.transport = transport;
    this.maxCommandBytes = maxCommandBytes;
  }

  assertSize(raw) {
    const bytes = Buffer.byteLength(raw, 'utf8');
    if (bytes > this.maxCommandBytes) throw new ControllerError('INBOX_COMMAND_TOO_LARGE', `command exceeds ${this.maxCommandBytes} bytes`);
    return bytes;
  }

  async submit(command) {
    const encoded = canonicalEnvelope(command);
    this.assertSize(encoded.raw);
    const blobSha = await this.transport.createCommandBlob(encoded.raw);
    const tag = await this.transport.createAnnotatedCommandTag(command.command_id, blobSha);
    try {
      const ref = await this.transport.createCommandRef(command.command_id, tag.sha);
      return Object.freeze({ created: true, command_id: command.command_id, fingerprint: encoded.fingerprint, ref: ref.ref, tag_sha: tag.sha, blob_sha: blobSha });
    } catch (error) {
      if (!isCreateConflict(error)) throw error;
      const observed = await this.get(command.command_id);
      if (observed && observed.raw === encoded.raw) return Object.freeze({ created: false, duplicate: true, command_id: command.command_id, fingerprint: encoded.fingerprint, ref: observed.ref, tag_sha: observed.tag_sha, blob_sha: observed.blob_sha });
      throw new ControllerError('INBOX_COMMAND_CONFLICT', 'command id already exists with different immutable bytes');
    }
  }

  async get(commandId) {
    const ref = await this.transport.getCommandRef(commandId);
    if (!ref) return null;
    return this.readRef(ref);
  }

  async readRef(ref) {
    const commandId = refCommandId(ref.ref);
    const tag = await this.transport.getAnnotatedTag(ref.sha);
    const expectedTag = `${COMMAND_INBOX_NAMESPACE}/${commandId}`;
    if (tag.tag !== expectedTag) throw new ControllerError('INBOX_TAG_IDENTITY_MISMATCH', 'annotated tag name does not match command ref');
    if (tag.object.type !== 'blob') throw new ControllerError('INBOX_TAG_TARGET_INVALID', 'command tag must point directly to a blob');
    const raw = await this.transport.getBlobText(tag.object.sha);
    this.assertSize(raw);
    let command;
    try { command = JSON.parse(raw); } catch { throw new ControllerError('INBOX_COMMAND_JSON_INVALID', 'command blob is not valid JSON'); }
    if (canonicalize(command) !== raw) throw new ControllerError('INBOX_COMMAND_NONCANONICAL', 'command blob must be canonical JSON');
    validateCommand(command);
    if (command.command_id !== commandId) throw new ControllerError('INBOX_COMMAND_ID_MISMATCH', 'command id in blob does not match immutable ref identity');
    const fp = commandFingerprint(command);
    if (!FP_RE.test(String(command.fingerprint ?? '')) || command.fingerprint !== fp) throw new ControllerError('INBOX_FINGERPRINT_INVALID', 'command fingerprint missing or does not match semantic bytes');
    return Object.freeze({ command, raw, fingerprint: fp, command_id: commandId, ref: ref.ref, tag_sha: tag.sha, blob_sha: tag.object.sha });
  }

  async discover() {
    const refs = await this.transport.listCommandRefs();
    const seen = new Set();
    const result = [];
    for (const ref of refs) {
      const commandId = refCommandId(ref.ref);
      if (seen.has(commandId)) throw new ControllerError('INBOX_DUPLICATE_REF', `multiple authoritative refs resolve to command ${commandId}`);
      seen.add(commandId);
      result.push(await this.readRef(ref));
    }
    result.sort((a, b) => a.command_id.localeCompare(b.command_id));
    return result;
  }

  async ingest(commandId, kernel, options = {}) {
    if (!kernel || typeof kernel.acceptCommand !== 'function') throw new TypeError('ControllerKernel-compatible acceptCommand required');
    const candidate = await this.get(commandId);
    if (!candidate) throw new ControllerError('INBOX_COMMAND_NOT_FOUND', 'durable command ref not found');
    const accepted = kernel.acceptCommand(candidate.command, options);
    return Object.freeze({ candidate, accepted });
  }
}

export function classifyIngressFailure(error) {
  if (error instanceof GitHubApiError && ['GITHUB_NETWORK_AMBIGUOUS','GITHUB_UNAVAILABLE','GITHUB_RATE_LIMITED'].includes(error.code)) return 'DEFERRED';
  if (error instanceof GitHubApiError) return 'TRANSPORT_FAILED';
  if (error instanceof ControllerError) return 'REJECTED';
  return 'FAILED';
}

export const DurableCommandInboxDefaults = Object.freeze({ maxCommandBytes: DEFAULT_MAX_COMMAND_BYTES });
