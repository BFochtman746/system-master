import { TextDecoder } from 'node:util';
import { canonicalize, isUuidV7 } from './canonical.js';
import { ControllerError } from './errors.js';
import { validateCommand, commandFingerprint } from './kernel.js';
import {
  CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT,
  CONTROL_STATE_ACTIVATION_PROTOCOL
} from './control-state-activation-closure.js';

export const INGRESS_PROTOCOL = 'controller-command-ingress.v1';
export const INGRESS_REF_PREFIX = 'refs/tags/controller-inbox/v1/';
export const DEFAULT_MAX_COMMAND_BYTES = 64 * 1024;

const OID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RETRYABLE_CODES = new Set(['TRANSPORT_TIMEOUT', 'RATE_LIMITED', 'TRANSPORT_SERVER_ERROR']);
const REJECTION_CODES = new Set([
  'REF_NAMESPACE_INVALID',
  'COMMAND_ID_INVALID',
  'TAG_OBJECT_INVALID',
  'TAG_TARGET_NOT_BLOB',
  'COMMAND_TOO_LARGE',
  'COMMAND_UTF8_INVALID',
  'COMMAND_JSON_INVALID',
  'COMMAND_SCHEMA_INVALID',
  'COMMAND_ID_MISMATCH',
  'COMMAND_FINGERPRINT_MISMATCH',
  'INGRESS_AUTHORITY_INVALID',
  'IDEMPOTENCY_CONFLICT'
]);

function ingressError(code, message, details = undefined) {
  const error = new ControllerError(code, message);
  if (details !== undefined) error.details = details;
  return error;
}

function requireObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw ingressError(code, message);
  return value;
}

function requireOid(value, label) {
  if (typeof value !== 'string' || !OID_RE.test(value)) throw ingressError('TAG_OBJECT_INVALID', `${label} must be an immutable Git object id`);
  return value;
}

function normalizePrincipal(value, label) {
  requireObject(value, 'INGRESS_AUTHORITY_INVALID', `${label} required`);
  if (!['github-app', 'user'].includes(value.kind) || !/^[1-9][0-9]*$/.test(String(value.id ?? ''))) {
    throw ingressError('INGRESS_AUTHORITY_INVALID', `${label} must identify an observed GitHub principal`);
  }
  return { kind: value.kind, id: String(value.id) };
}

function samePrincipal(a, b) {
  return a.kind === b.kind && a.id === b.id;
}

function decodeUtf8(bytes) {
  try {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('blob_bytes must be Uint8Array');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw ingressError('COMMAND_UTF8_INVALID', 'command blob must be valid UTF-8 bytes', { cause: error.message });
  }
}

function classifyKernelError(error) {
  if (!(error instanceof ControllerError)) throw error;
  if (error.code === 'IDEMPOTENCY_CONFLICT') return ingressError('IDEMPOTENCY_CONFLICT', error.message);
  if (error.code === 'FINGERPRINT_MISMATCH') return ingressError('COMMAND_FINGERPRINT_MISMATCH', error.message);
  if (error.code?.startsWith('SCHEMA_') || ['UNSUPPORTED_PROTOCOL', 'UNSUPPORTED_SCHEMA'].includes(error.code)) {
    return ingressError('COMMAND_SCHEMA_INVALID', error.message, { kernel_code: error.code });
  }
  return error;
}

export function commandIdFromRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith(INGRESS_REF_PREFIX)) throw ingressError('REF_NAMESPACE_INVALID', 'command ref is outside the controller inbox v1 namespace');
  const commandId = ref.slice(INGRESS_REF_PREFIX.length);
  if (!commandId || commandId.includes('/') || !isUuidV7(commandId)) throw ingressError('COMMAND_ID_INVALID', 'command ref suffix must be exactly one UUIDv7');
  return commandId;
}

export function validateIngressAuthority(candidate) {
  const repository = requireObject(candidate.repository_identity, 'INGRESS_AUTHORITY_INVALID', 'repository identity required');
  if (typeof repository.full_name !== 'string' || repository.full_name.length === 0 || !/^[1-9][0-9]*$/.test(String(repository.id ?? ''))) {
    throw ingressError('INGRESS_AUTHORITY_INVALID', 'repository full name and stable numeric id required');
  }

  const observation = requireObject(candidate.authority_observation, 'INGRESS_AUTHORITY_INVALID', 'authority observation required');
  const receipt = requireObject(observation.activation_receipt, 'INGRESS_AUTHORITY_INVALID', 'C1 activation receipt required');
  if (receipt.protocol_version !== CONTROL_STATE_ACTIVATION_PROTOCOL || receipt.qualified_002c_subject !== CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT) {
    throw ingressError('INGRESS_AUTHORITY_INVALID', 'authority receipt must bind the frozen 002C subject through C1');
  }
  const activationAuthority = requireObject(receipt.authority, 'INGRESS_AUTHORITY_INVALID', 'activation authority required');
  if (repository.full_name !== activationAuthority.control_state_repository || String(repository.id) !== String(activationAuthority.control_state_repository_id)) {
    throw ingressError('INGRESS_AUTHORITY_INVALID', 'ingress repository must equal the C1 activated control-state repository identity');
  }

  const rules = requireObject(observation.rules, 'INGRESS_AUTHORITY_INVALID', 'effective ingress rules observation required');
  if (rules.namespace !== `${INGRESS_REF_PREFIX}*`) throw ingressError('INGRESS_AUTHORITY_INVALID', 'rules must bind the exact controller inbox v1 namespace');
  if (rules.creation_restricted !== true || rules.update_restricted !== true || rules.deletion_restricted !== true) {
    throw ingressError('INGRESS_AUTHORITY_INVALID', 'creation/update/deletion protections must all be effective');
  }
  if (rules.historical_rewrite_bypass !== false) throw ingressError('INGRESS_AUTHORITY_INVALID', 'historical command refs must have no rewrite bypass');

  const observedPrincipal = normalizePrincipal(observation.ingress_principal, 'ingress principal');
  const permittedPrincipal = normalizePrincipal(rules.creation_principal, 'creation principal');
  if (!samePrincipal(observedPrincipal, permittedPrincipal)) throw ingressError('INGRESS_AUTHORITY_INVALID', 'observed ingress principal must equal the effective creation principal');

  if (typeof receipt.activation_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.activation_fingerprint)) {
    throw ingressError('INGRESS_AUTHORITY_INVALID', 'C1 activation fingerprint required');
  }

  return Object.freeze({
    repository: { full_name: repository.full_name, id: String(repository.id) },
    ingress_principal: observedPrincipal,
    activation_fingerprint: receipt.activation_fingerprint,
    qualified_002c_subject: receipt.qualified_002c_subject
  });
}

export function validateIngressCandidate(candidate, { maxBytes = DEFAULT_MAX_COMMAND_BYTES, requireAuthority = false } = {}) {
  requireObject(candidate, 'TAG_OBJECT_INVALID', 'ingress candidate required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError('maxBytes must be a positive safe integer');

  const commandId = commandIdFromRef(candidate.ref);
  const tag = requireObject(candidate.tag_object, 'TAG_OBJECT_INVALID', 'annotated tag object required');
  requireOid(tag.oid, 'tag_object.oid');
  if (tag.type !== 'tag') throw ingressError('TAG_OBJECT_INVALID', 'ref must resolve to an annotated tag object');
  if (tag.tag !== candidate.ref.slice('refs/tags/'.length)) throw ingressError('TAG_OBJECT_INVALID', 'annotated tag name must match ref identity');
  const target = requireObject(tag.target, 'TAG_OBJECT_INVALID', 'annotated tag target required');
  requireOid(target.oid, 'tag_object.target.oid');
  if (target.type !== 'blob') throw ingressError('TAG_TARGET_NOT_BLOB', 'annotated tag must target a blob');

  if (!(candidate.blob_bytes instanceof Uint8Array)) throw ingressError('COMMAND_UTF8_INVALID', 'blob_bytes must be exact bytes');
  if (candidate.blob_bytes.byteLength > maxBytes) throw ingressError('COMMAND_TOO_LARGE', `command blob exceeds ${maxBytes} bytes`);
  const text = decodeUtf8(candidate.blob_bytes);

  let command;
  try { command = JSON.parse(text); }
  catch (error) { throw ingressError('COMMAND_JSON_INVALID', 'command blob must contain valid JSON', { cause: error.message }); }

  try { validateCommand(command); }
  catch (error) { throw classifyKernelError(error); }
  if (command.command_id !== commandId) throw ingressError('COMMAND_ID_MISMATCH', 'command_id in blob must equal command ref identity');

  const fingerprint = commandFingerprint(command);
  if (command.fingerprint !== undefined && command.fingerprint !== fingerprint) throw ingressError('COMMAND_FINGERPRINT_MISMATCH', 'supplied command fingerprint does not match semantic contents');

  const authority = requireAuthority ? validateIngressAuthority(candidate) : null;
  return Object.freeze({
    protocol_version: INGRESS_PROTOCOL,
    ref: candidate.ref,
    command_id: commandId,
    tag_oid: tag.oid,
    blob_oid: target.oid,
    command: Object.freeze({ ...command, fingerprint }),
    fingerprint,
    authority
  });
}

export function acceptValidatedCandidate(validated, kernel, options = {}) {
  if (!kernel || typeof kernel.acceptCommand !== 'function') throw new TypeError('kernel.acceptCommand required');
  try {
    const result = kernel.acceptCommand(validated.command, options);
    return Object.freeze({
      status: result.duplicate ? 'DUPLICATE' : 'ACCEPTED',
      transaction_id: result.transaction_id,
      command_id: validated.command_id,
      fingerprint: result.fingerprint,
      provenance: {
        ref: validated.ref,
        tag_oid: validated.tag_oid,
        blob_oid: validated.blob_oid,
        authority: validated.authority
      }
    });
  } catch (error) {
    throw classifyKernelError(error);
  }
}

export function isRetryableIngressError(error) {
  return Boolean(error && (error.retryable === true || RETRYABLE_CODES.has(error.code)));
}

export function computeRetryDelayMs(attempt, { baseMs = 250, capMs = 10_000, jitter = 0.2, random = Math.random } = {}) {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new RangeError('attempt must be >= 1');
  if (!(baseMs > 0) || !(capMs >= baseMs) || !(jitter >= 0 && jitter <= 1) || typeof random !== 'function') throw new RangeError('invalid retry policy');
  const raw = Math.min(capMs, baseMs * (2 ** (attempt - 1)));
  const unit = Math.min(1, Math.max(0, Number(random())));
  return Math.round(raw * ((1 - jitter) + (2 * jitter * unit)));
}

export async function reconcileIngressRef({
  ref,
  loadCandidate,
  kernel,
  requireAuthority = false,
  maxBytes = DEFAULT_MAX_COMMAND_BYTES,
  maxAttempts = 3,
  retry = {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  kernelOptions = {}
}) {
  if (typeof loadCandidate !== 'function') throw new TypeError('loadCandidate required');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new RangeError('maxAttempts must be >= 1');

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const candidate = await loadCandidate(ref);
      if (!candidate || candidate.ref !== ref) throw ingressError('TAG_OBJECT_INVALID', 'loaded candidate must preserve requested ref identity');
      const validated = validateIngressCandidate(candidate, { maxBytes, requireAuthority });
      return Object.freeze({ ...acceptValidatedCandidate(validated, kernel, kernelOptions), attempts: attempt });
    } catch (error) {
      lastError = error;
      if (error instanceof ControllerError && REJECTION_CODES.has(error.code)) {
        return Object.freeze({ status: 'REJECTED', reason: error.code, attempts: attempt });
      }
      if (!isRetryableIngressError(error)) throw error;
      if (attempt === maxAttempts) {
        return Object.freeze({ status: 'DEFERRED_TRANSIENT', reason: error.code ?? 'TRANSIENT_TRANSPORT_FAILURE', attempts: attempt });
      }
      await sleep(computeRetryDelayMs(attempt, retry));
    }
  }
  throw lastError;
}

export function canonicalIngressEvidence(result) {
  return canonicalize(result);
}
