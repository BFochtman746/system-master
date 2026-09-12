import {
  canonicalize,
  sha256,
  validateActiveWorkPacket,
  deriveNextLegalOperation,
  CG001_MISSION_VERSION
} from './active-work-state.js';

export const CHAT_RECOVERY_PROTOCOL = 'control-gateway.chat-recovery-contract.v1';
export const DEFAULT_GOVERNANCE_PACKET_PATH = 'governance/control-gateway/SECOND-SHIFT-CONTROL-GATEWAY-ACTIVE-WORK-PACKET.json';

const SHA1_RE = /^[0-9a-f]{40}$/;

export class ChatRecoveryError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ChatRecoveryError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ChatRecoveryError(code, message, details);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function parseJson(raw, label) {
  if (typeof raw !== 'string') fail('RECOVERY_CONTENT_INVALID', `${label} must be UTF-8 JSON text`);
  try { return JSON.parse(raw); } catch { fail('RECOVERY_CONTENT_INVALID', `${label} is not valid JSON`); }
}

function requireMethod(value, method, label) {
  if (typeof value?.[method] !== 'function') throw new TypeError(`${label}.${method} function required`);
}

function withoutDigest(contract) {
  const copy = clone(contract);
  delete copy.recovery_digest;
  return copy;
}

export function computeRecoveryDigest(contract) {
  return sha256(withoutDigest(contract));
}

function continuationFor(packet) {
  const next = deriveNextLegalOperation(packet);
  if (canonicalize(next) !== canonicalize(packet.next_legal_operation)) {
    fail('RECOVERY_NEXT_OPERATION_MISMATCH', 'stored next legal operation does not match deterministic derivation');
  }
  if (next.kind === 'RECONCILE_CURRENT') fail('RECOVERY_RECONCILIATION_REQUIRED', `current operation requires reconciliation: ${next.reason}`, { next });
  if (next.kind === 'NO_LEGAL_SUCCESSOR') fail('RECOVERY_NO_LEGAL_SUCCESSOR', 'no dependency-valid successor exists', { next });
  if (next.kind === 'AMBIGUOUS_SUCCESSORS') fail('RECOVERY_AMBIGUOUS_SUCCESSORS', 'multiple dependency-valid successors exist', { next });
  if (next.kind === 'CONTINUE_CURRENT') {
    if (packet.current_operation.state !== 'ACTIVE') fail('RECOVERY_CURRENT_NOT_ACTIVE', 'CONTINUE_CURRENT requires ACTIVE current operation');
    return { mode: 'CONTINUE_CURRENT', operation_id: next.operation_id, predecessor_receipt_id: next.predecessor_receipt_id };
  }
  if (next.kind === 'START_SUCCESSOR') {
    const candidates = packet.successor_candidates.filter((candidate) => candidate.operation_id === next.operation_id && candidate.predecessor_receipt_id === next.predecessor_receipt_id);
    if (candidates.length !== 1) fail('RECOVERY_SUCCESSOR_BINDING_INVALID', 'exact successor candidate binding is missing or non-unique');
    return {
      mode: 'START_SUCCESSOR',
      operation_id: next.operation_id,
      predecessor_receipt_id: next.predecessor_receipt_id,
      successor_standing: {
        qualification_state: candidates[0].qualification_state,
        github_admission_state: candidates[0].github_admission_state,
        a01_state: candidates[0].a01_state
      }
    };
  }
  fail('RECOVERY_NEXT_KIND_UNSUPPORTED', `unsupported next operation kind ${String(next.kind)}`);
}

async function proveSingleParentAncestry(transport, headSha, subjectSha, maxDepth) {
  if (headSha === subjectSha) return { distance: 0 };
  let current = headSha;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const commit = await transport.getCommit(current);
    if (!commit || commit.sha !== current || !Array.isArray(commit.parents)) fail('RECOVERY_WORK_REF_COMMIT_INVALID', `invalid commit metadata for ${current}`);
    if (commit.parents.length !== 1) fail('RECOVERY_WORK_REF_NONLINEAR', 'work-ref authority chain must be single-parent between live head and qualified subject');
    current = commit.parents[0];
    if (current === subjectSha) return { distance: depth };
  }
  fail('RECOVERY_AUTHORITY_SUBJECT_NOT_ANCESTOR', 'qualified authoritative subject is not within the verified work-ref ancestry bound');
}

export class GitHubChatRecoveryGate {
  constructor({
    authorityAdapter,
    publisher,
    workRefTransport,
    expectedWorkstreamId,
    expectedMissionVersion = CG001_MISSION_VERSION,
    governancePacketPath = DEFAULT_GOVERNANCE_PACKET_PATH,
    maxAncestryDepth = 64
  }) {
    requireMethod(authorityAdapter, 'reconstructContinuation', 'authorityAdapter');
    requireMethod(publisher, 'reconstruct', 'publisher');
    for (const method of ['getRef', 'getCommit', 'readFile']) requireMethod(workRefTransport, method, 'workRefTransport');
    if (typeof expectedWorkstreamId !== 'string' || expectedWorkstreamId.length === 0) throw new TypeError('expectedWorkstreamId required');
    if (typeof expectedMissionVersion !== 'string' || expectedMissionVersion.length === 0) throw new TypeError('expectedMissionVersion required');
    if (!Number.isSafeInteger(maxAncestryDepth) || maxAncestryDepth < 1) throw new TypeError('maxAncestryDepth must be positive');
    this.authorityAdapter = authorityAdapter;
    this.publisher = publisher;
    this.workRefTransport = workRefTransport;
    this.expectedWorkstreamId = expectedWorkstreamId;
    this.expectedMissionVersion = expectedMissionVersion;
    this.governancePacketPath = governancePacketPath;
    this.maxAncestryDepth = maxAncestryDepth;
  }

  async recoverContinue() {
    const authority = await this.authorityAdapter.reconstructContinuation();
    if (authority.mission_version !== this.expectedMissionVersion) fail('RECOVERY_MISSION_MISMATCH', 'durable mission does not match configured frozen mission');
    if (authority.workstream_id !== this.expectedWorkstreamId) fail('RECOVERY_WORKSTREAM_MISMATCH', 'durable workstream does not match configured recovery workstream');

    const publication = await this.publisher.reconstruct();
    if (authority.publication_ref !== publication.ref || authority.publication_commit_sha !== publication.head_commit_sha || authority.packet_digest !== publication.packet_digest) {
      fail('RECOVERY_AUTHORITY_MOVED', 'authority summary and verified publication do not resolve to the same snapshot');
    }
    const packet = publication.envelope.packet;
    validateActiveWorkPacket(packet);
    if (packet.mission_version !== this.expectedMissionVersion || packet.workstream_id !== this.expectedWorkstreamId) fail('RECOVERY_AUTHORITY_MISMATCH', 'verified packet mission/workstream mismatch');
    if (packet.authoritative_subject.algorithm !== 'sha1' || !SHA1_RE.test(packet.authoritative_subject.oid)) fail('RECOVERY_SUBJECT_INVALID', 'Git work-ref recovery requires a SHA-1 Git authoritative subject');

    const continuation = continuationFor(packet);
    const refBefore = await this.workRefTransport.getRef(packet.branch_or_ref);
    if (!refBefore || !SHA1_RE.test(refBefore.sha ?? '')) fail('RECOVERY_WORK_REF_INVALID', 'durable work ref did not resolve to a Git commit');

    const rawGovernancePacket = await this.workRefTransport.readFile(refBefore.sha, this.governancePacketPath);
    if (rawGovernancePacket === null) fail('RECOVERY_GOVERNANCE_PACKET_MISSING', 'work-ref head is missing the governance active-work packet');
    const governancePacket = parseJson(rawGovernancePacket, `${this.governancePacketPath}@${refBefore.sha}`);
    validateActiveWorkPacket(governancePacket);
    if (canonicalize(governancePacket) !== canonicalize(packet)) fail('RECOVERY_GOVERNANCE_PACKET_MISMATCH', 'work-ref governance packet does not exactly match durable published authority');

    const ancestry = await proveSingleParentAncestry(this.workRefTransport, refBefore.sha, packet.authoritative_subject.oid, this.maxAncestryDepth);
    const refAfter = await this.workRefTransport.getRef(packet.branch_or_ref);
    if (!refAfter || refAfter.sha !== refBefore.sha) fail('RECOVERY_WORK_REF_MOVED', 'work ref changed while reconstructing continuation');

    const finalPublication = await this.publisher.reconstruct();
    if (finalPublication.head_commit_sha !== publication.head_commit_sha || finalPublication.packet_digest !== publication.packet_digest || finalPublication.publication_digest !== publication.publication_digest) {
      fail('RECOVERY_AUTHORITY_MOVED', 'durable authority changed while reconstructing continuation');
    }

    const contract = {
      protocol_version: CHAT_RECOVERY_PROTOCOL,
      source: 'GITHUB_DURABLE_ACTIVE_WORK',
      intent: 'CONTINUE',
      mission_version: packet.mission_version,
      workstream_id: packet.workstream_id,
      authority_epoch: packet.authority_epoch,
      publication_ref: publication.ref,
      publication_commit_sha: publication.head_commit_sha,
      publication_revision: publication.publication_revision,
      packet_digest: publication.packet_digest,
      publication_digest: publication.publication_digest,
      authoritative_subject: clone(packet.authoritative_subject),
      repository: packet.repository,
      authority_branch_or_ref: packet.branch_or_ref,
      authority_branch_head_sha: refBefore.sha,
      authority_subject_to_head_distance: ancestry.distance,
      current_operation: clone(packet.current_operation),
      continuation,
      qualification_state: packet.qualification_state,
      github_admission_state: packet.github_admission_state,
      a01_state: packet.a01_state,
      allowed_paths_or_effects: clone(packet.allowed_paths_or_effects),
      mutation_admission_required: true,
      exact_predecessor_cas_required: true,
      recovery_digest: ''
    };
    contract.recovery_digest = computeRecoveryDigest(contract);
    return deepFreeze(contract);
  }

  async verifyRecoveryContractFresh(contract) {
    if (!contract || typeof contract !== 'object') fail('RECOVERY_CONTRACT_INVALID', 'recovery contract must be an object');
    if (contract.protocol_version !== CHAT_RECOVERY_PROTOCOL) fail('RECOVERY_CONTRACT_INVALID', 'recovery contract protocol mismatch');
    if (!/^[0-9a-f]{64}$/.test(contract.recovery_digest ?? '') || computeRecoveryDigest(contract) !== contract.recovery_digest) fail('RECOVERY_CONTRACT_TAMPERED', 'recovery contract digest mismatch');
    const current = await this.recoverContinue();
    if (canonicalize(current) !== canonicalize(contract)) fail('RECOVERY_CONTRACT_STALE', 'recovery contract no longer matches current durable authority');
    return true;
  }
}
