import {
  ACTIVE_WORK_PROTOCOL,
  CG001_MISSION_VERSION,
  canonicalize,
  finalizeActiveWorkPacket,
  sha256
} from './active-work-state.js';
import {
  GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL,
  computePublicationDigest,
  publicationRevisionPath,
  validatePublicationEnvelope
} from './github-active-work-publication.js';
import {
  CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_OPERATION,
  validateBootstrapRequest
} from './github-authority-bootstrap.js';

export const SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF = 'control-gateway-state/active-work/second-shift-dispatch-durability-003';
export const SECOND_SHIFT_CLAIM_STATE_TARGET_REF = 'second-shift/execution-state';
export const SECOND_SHIFT_CLAIM_STATE_WORKSTREAM = 'SECOND-SHIFT-DISPATCH-DURABILITY';
export const SECOND_SHIFT_CLAIM_STATE_OPERATION = 'SECOND-SHIFT-DISPATCH-DURABILITY-003';
export const SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT = 'SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTHORITY-BOOTSTRAP';
export const SECOND_SHIFT_CLAIM_STATE_PATH = 'execution/claims/state/**';
export const SECOND_SHIFT_CLAIM_STATE_EFFECT = 'SECOND_SHIFT_CLAIM_STATE_WRITE';

const SHA1 = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA1.test(value)) fail('CLAIM_STATE_AUTHORITY_INVALID', `${label} must be a lowercase SHA-1`);
  return value;
}

function requireRepository(value) {
  if (typeof value !== 'string' || !REPOSITORY.test(value)) fail('CLAIM_STATE_AUTHORITY_INVALID', 'repository must be owner/name');
  return value;
}

function exactStrings(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function bootstrapReceipt(subjectSha) {
  return {
    receipt_id: SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT,
    operation_id: 'SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTHORITY',
    outcome: 'SUCCEEDED',
    satisfies_dependency: true,
    subject: { algorithm: 'sha1', oid: subjectSha }
  };
}

export function buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha }) {
  requireRepository(repository);
  requireSha(predecessorCommitSha, 'predecessorCommitSha');
  const receipt = bootstrapReceipt(predecessorCommitSha);
  const packet = finalizeActiveWorkPacket({
    protocol_version: ACTIVE_WORK_PROTOCOL,
    mission_version: CG001_MISSION_VERSION,
    workstream_id: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
    authority_epoch: 1,
    authority_rebind_receipt_id: null,
    authoritative_subject: { algorithm: 'sha1', oid: predecessorCommitSha },
    repository,
    branch_or_ref: SECOND_SHIFT_CLAIM_STATE_TARGET_REF,
    allowed_paths_or_effects: {
      paths: [SECOND_SHIFT_CLAIM_STATE_PATH],
      effects: [SECOND_SHIFT_CLAIM_STATE_EFFECT]
    },
    dependency_graph: { version: 1, edges: [] },
    qualification_state: 'PASSED',
    github_admission_state: 'ADMITTED',
    a01_state: 'NOT_REQUIRED',
    current_operation: {
      operation_id: SECOND_SHIFT_CLAIM_STATE_OPERATION,
      state: 'ACTIVE',
      predecessor_receipt_id: SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT
    },
    last_terminal_receipt: receipt,
    receipt_index: [receipt],
    successor_candidates: [],
    next_legal_operation: {
      kind: 'CONTINUE_CURRENT',
      operation_id: SECOND_SHIFT_CLAIM_STATE_OPERATION,
      predecessor_receipt_id: SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT,
      reason: 'CURRENT_OPERATION_NONTERMINAL'
    }
  });

  const envelope = {
    protocol_version: GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL,
    mission_version: CG001_MISSION_VERSION,
    workstream_id: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
    publication_revision: 1,
    predecessor_commit_sha: predecessorCommitSha,
    predecessor_packet_digest: null,
    predecessor_publication_digest: null,
    packet_digest: sha256(packet),
    packet: structuredClone(packet),
    publication_digest: ''
  };
  envelope.publication_digest = computePublicationDigest(envelope);
  validatePublicationEnvelope(envelope, {
    expectedWorkstreamId: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
    expectedMissionVersion: CG001_MISSION_VERSION
  });
  const body = `${canonicalize(envelope)}\n`;
  return Object.freeze({
    packet,
    envelope: Object.freeze(envelope),
    body,
    revision_path: publicationRevisionPath(1, envelope.packet_digest)
  });
}

export function buildSecondShiftClaimStateBootstrapRequest({ repository, publicationCommitSha, genesis }) {
  requireRepository(repository);
  requireSha(publicationCommitSha, 'publicationCommitSha');
  if (!genesis?.envelope) fail('CLAIM_STATE_AUTHORITY_INVALID', 'genesis envelope required');
  validatePublicationEnvelope(genesis.envelope, {
    expectedWorkstreamId: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
    expectedMissionVersion: CG001_MISSION_VERSION
  });
  const request = {
    operation: CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_OPERATION,
    state_ref: SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
    repository,
    workstream_id: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
    mission_version: CG001_MISSION_VERSION,
    publication_commit_sha: publicationCommitSha,
    expected_predecessor_sha: genesis.envelope.predecessor_commit_sha,
    expected_packet_digest: genesis.envelope.packet_digest,
    expected_publication_digest: genesis.envelope.publication_digest,
    expected_subject_sha: genesis.envelope.packet.authoritative_subject.oid,
    expected_target_ref: SECOND_SHIFT_CLAIM_STATE_TARGET_REF,
    expected_current_operation_id: SECOND_SHIFT_CLAIM_STATE_OPERATION,
    expected_authority_epoch: 1,
    expected_allowed_paths: [SECOND_SHIFT_CLAIM_STATE_PATH]
  };
  validateBootstrapRequest(request);
  return Object.freeze(request);
}

export function assertSecondShiftClaimStateAuthority(packet, { repository } = {}) {
  requireRepository(repository);
  if (!packet || typeof packet !== 'object') fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'authority packet missing');
  if (packet.protocol_version !== ACTIVE_WORK_PROTOCOL) fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'protocol mismatch');
  if (packet.mission_version !== CG001_MISSION_VERSION) fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'mission mismatch');
  if (packet.workstream_id !== SECOND_SHIFT_CLAIM_STATE_WORKSTREAM) fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'workstream mismatch');
  if (packet.repository !== repository) fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'repository mismatch');
  if (packet.branch_or_ref !== SECOND_SHIFT_CLAIM_STATE_TARGET_REF) fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'target ref mismatch');
  if (!Number.isSafeInteger(packet.authority_epoch) || packet.authority_epoch < 1) fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'authority epoch is invalid');
  if (packet.current_operation?.operation_id !== SECOND_SHIFT_CLAIM_STATE_OPERATION || packet.current_operation?.state !== 'ACTIVE') {
    fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'current operation is not exact active durability operation');
  }
  if (packet.current_operation.predecessor_receipt_id !== SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT) {
    fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'predecessor receipt mismatch');
  }
  if (packet.qualification_state !== 'PASSED' || packet.github_admission_state !== 'ADMITTED') {
    fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'authority is not qualified and admitted');
  }
  if (!exactStrings(packet.allowed_paths_or_effects?.paths, [SECOND_SHIFT_CLAIM_STATE_PATH])) {
    fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'claim-state path scope mismatch');
  }
  if (!exactStrings(packet.allowed_paths_or_effects?.effects, [SECOND_SHIFT_CLAIM_STATE_EFFECT])) {
    fail('CLAIM_STATE_AUTHORITY_MISMATCH', 'claim-state effect scope mismatch');
  }
  return true;
}
