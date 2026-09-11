import { canonicalize, sha256 } from './canonical.js';
import { ControllerError } from './errors.js';
import { createAuthoritativeGitHubControlState } from './authoritative-github-control-state.js';

export const CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT = '8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa';
export const CONTROL_STATE_ACTIVATION_PROTOCOL = 'controller-control-state-activation.v1';
const OID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;

function requireObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ControllerError(code, message);
  return value;
}

function requireOid(value, label) {
  if (typeof value !== 'string' || !OID_RE.test(value)) throw new ControllerError('ACTIVATION_EVIDENCE_INVALID', `${label} must be a lowercase Git object id`);
  return value;
}

function requireDigest(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) throw new ControllerError('ACTIVATION_EVIDENCE_INVALID', `${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ControllerError('ACTIVATION_EVIDENCE_INVALID', `${label} must be a nonnegative safe integer`);
  return value;
}

function normalizedCheckpoint(value, label) {
  requireObject(value, 'ACTIVATION_EVIDENCE_INVALID', `${label} required`);
  const size = requireCount(value.size, `${label}.size`);
  const head_digest = size === 0 ? value.head_digest : requireDigest(value.head_digest, `${label}.head_digest`);
  if (size === 0 && head_digest !== null) throw new ControllerError('ACTIVATION_EVIDENCE_INVALID', `${label}.head_digest must be null when size is zero`);
  return { size, head_digest };
}

function sameCheckpoint(a, b) {
  return a.size === b.size && a.head_digest === b.head_digest;
}

function principal(value, label) {
  requireObject(value, 'ACTIVATION_EVIDENCE_INVALID', `${label} required`);
  if (value.kind !== 'github-app' || !/^[1-9][0-9]*$/.test(String(value.id ?? ''))) throw new ControllerError('ACTIVATION_EVIDENCE_INVALID', `${label} must identify a GitHub App`);
  return { kind: 'github-app', id: String(value.id) };
}

export function summarizeQualifiedControlStateActivation(runtime, { genesisSha, qualifiedSubject = CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT } = {}) {
  requireObject(runtime, 'ACTIVATION_RUNTIME_INVALID', 'activated runtime required');
  if (qualifiedSubject !== CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT) throw new ControllerError('ACTIVATION_SUBJECT_MISMATCH', 'activation must bind the frozen CONTROLLER-FOUNDATION-002C qualified subject');
  requireOid(genesisSha, 'genesisSha');

  const authority = requireObject(runtime.authority, 'ACTIVATION_RUNTIME_INVALID', 'runtime authority required');
  if (authority.authoritative !== true) throw new ControllerError('ACTIVATION_NOT_AUTHORITATIVE', 'runtime authority has not passed authoritative preflight');
  if (typeof authority.subjectRepository !== 'string' || typeof authority.controlStateRepository !== 'string' || authority.subjectRepository === authority.controlStateRepository) throw new ControllerError('ACTIVATION_AUTHORITY_INVALID', 'subject/control repository separation is required');
  if (!/^[1-9][0-9]*$/.test(String(authority.controlStateRepositoryId ?? ''))) throw new ControllerError('ACTIVATION_AUTHORITY_INVALID', 'control-state numeric repository ID required');
  if (typeof authority.journalBranch !== 'string' || typeof authority.anchorBranch !== 'string' || authority.journalBranch === authority.anchorBranch) throw new ControllerError('ACTIVATION_AUTHORITY_INVALID', 'distinct journal and anchor branches required');
  const journalPrincipal = principal(authority.journalPrincipal, 'journalPrincipal');
  const anchorPrincipal = principal(authority.anchorPrincipal, 'anchorPrincipal');
  if (`${journalPrincipal.kind}:${journalPrincipal.id}` === `${anchorPrincipal.kind}:${anchorPrincipal.id}`) throw new ControllerError('ACTIVATION_AUTHORITY_INVALID', 'journal and anchor principals must be distinct');

  const verification = requireObject(runtime.journalVerification, 'ACTIVATION_RUNTIME_INVALID', 'journal verification required');
  const verifiedCheckpoint = normalizedCheckpoint(verification.checkpoint, 'journalVerification.checkpoint');
  const checkpointDocument = normalizedCheckpoint(verification.checkpoint_document, 'journalVerification.checkpoint_document');
  if (!sameCheckpoint(verifiedCheckpoint, checkpointDocument)) throw new ControllerError('ACTIVATION_JOURNAL_MISMATCH', 'verified journal checkpoint does not match durable checkpoint document');
  const transportRevision = requireOid(verification.transport_revision, 'journalVerification.transport_revision');

  const anchorCount = requireCount(runtime.anchorCount, 'anchorCount');
  const anchorStanding = requireObject(runtime.anchoredExtension, 'ACTIVATION_RUNTIME_INVALID', 'anchor extension verification required');
  if (typeof anchorStanding.anchored !== 'boolean') throw new ControllerError('ACTIVATION_EVIDENCE_INVALID', 'anchoredExtension.anchored must be boolean');
  if ((anchorCount === 0) !== (anchorStanding.anchored === false)) throw new ControllerError('ACTIVATION_ANCHOR_MISMATCH', 'anchor count and anchor extension standing disagree');

  let latestAnchorDigest = null;
  if (anchorCount > 0) {
    const record = requireObject(anchorStanding.record, 'ACTIVATION_EVIDENCE_INVALID', 'latest anchor record required when anchorCount > 0');
    latestAnchorDigest = requireDigest(record.anchor_digest, 'anchoredExtension.record.anchor_digest');
    const anchoredCheckpoint = normalizedCheckpoint(record.checkpoint, 'anchoredExtension.record.checkpoint');
    if (anchoredCheckpoint.size > verifiedCheckpoint.size) throw new ControllerError('ACTIVATION_ANCHOR_MISMATCH', 'latest anchor cannot be ahead of verified journal');
  }

  const state = {
    protocol_version: CONTROL_STATE_ACTIVATION_PROTOCOL,
    qualified_002c_subject: qualifiedSubject,
    genesis_sha: genesisSha,
    authority: {
      subject_repository: authority.subjectRepository,
      control_state_repository: authority.controlStateRepository,
      control_state_repository_id: String(authority.controlStateRepositoryId),
      journal_branch: authority.journalBranch,
      anchor_branch: authority.anchorBranch,
      journal_principal: journalPrincipal,
      anchor_principal: anchorPrincipal
    },
    journal: {
      transport_revision: transportRevision,
      size: verifiedCheckpoint.size,
      head_digest: verifiedCheckpoint.head_digest
    },
    anchor: {
      count: anchorCount,
      anchored: anchorStanding.anchored,
      latest_anchor_digest: latestAnchorDigest
    }
  };

  return Object.freeze({ ...state, activation_fingerprint: sha256(canonicalize(state)) });
}

export async function closeQualifiedControlStateActivation({
  config,
  observation,
  journalTransport,
  anchorTransport,
  genesisSha,
  maxBatchEvents = 50,
  qualifiedSubject = CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT,
  activate = createAuthoritativeGitHubControlState
}) {
  if (typeof activate !== 'function') throw new ControllerError('ACTIVATION_IMPLEMENTATION_INVALID', 'activate must be a function');
  if (qualifiedSubject !== CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT) throw new ControllerError('ACTIVATION_SUBJECT_MISMATCH', 'activation must bind the frozen CONTROLLER-FOUNDATION-002C qualified subject');

  const runtime = await activate({ config, observation, journalTransport, anchorTransport, genesisSha, maxBatchEvents });
  const receipt = summarizeQualifiedControlStateActivation(runtime, { genesisSha, qualifiedSubject });
  return Object.freeze({ runtime, receipt });
}
