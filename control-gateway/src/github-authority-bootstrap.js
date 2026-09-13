export const CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_OPERATION = 'CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001';
export const CONTROL_GATEWAY_ACTIVE_WORK_NAMESPACE = 'control-gateway-state/active-work/';
export const CONTROL_GATEWAY_WRITER_INTEGRATION_ID = 4923612;

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export class GitHubAuthorityBootstrapError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubAuthorityBootstrapError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new GitHubAuthorityBootstrapError(code, message, details);
}

function requireString(value, name, pattern = null) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) fail('BOOTSTRAP_REQUEST_INVALID', `${name} must be a non-empty trimmed string`);
  if (pattern && !pattern.test(value)) fail('BOOTSTRAP_REQUEST_INVALID', `${name} has invalid format`);
  return value;
}

function exactArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

export function assertBootstrapStateRef(stateRef) {
  requireString(stateRef, 'state_ref', SAFE_REF);
  if (!stateRef.startsWith(CONTROL_GATEWAY_ACTIVE_WORK_NAMESPACE)) fail('BOOTSTRAP_NAMESPACE_FORBIDDEN', `state_ref must be under ${CONTROL_GATEWAY_ACTIVE_WORK_NAMESPACE}`);
  const suffix = stateRef.slice(CONTROL_GATEWAY_ACTIVE_WORK_NAMESPACE.length);
  if (!suffix || suffix.startsWith('/') || suffix.endsWith('/') || suffix.includes('//') || suffix.split('/').some((part) => part === '.' || part === '..')) fail('BOOTSTRAP_NAMESPACE_FORBIDDEN', 'state_ref has an invalid active-work suffix');
  return stateRef;
}

export function validateBootstrapRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('BOOTSTRAP_REQUEST_INVALID', 'request object required');
  if (request.operation !== CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_OPERATION) fail('BOOTSTRAP_OPERATION_FORBIDDEN', 'unexpected bootstrap operation');
  assertBootstrapStateRef(request.state_ref);
  requireString(request.repository, 'repository', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  requireString(request.workstream_id, 'workstream_id');
  requireString(request.mission_version, 'mission_version');
  requireString(request.publication_commit_sha, 'publication_commit_sha', SHA40);
  requireString(request.expected_predecessor_sha, 'expected_predecessor_sha', SHA40);
  requireString(request.expected_packet_digest, 'expected_packet_digest', SHA256);
  requireString(request.expected_publication_digest, 'expected_publication_digest', SHA256);
  requireString(request.expected_subject_sha, 'expected_subject_sha', SHA40);
  requireString(request.expected_target_ref, 'expected_target_ref', SAFE_REF);
  requireString(request.expected_current_operation_id, 'expected_current_operation_id');
  if (!Number.isSafeInteger(request.expected_authority_epoch) || request.expected_authority_epoch < 1) fail('BOOTSTRAP_REQUEST_INVALID', 'expected_authority_epoch must be a positive safe integer');
  if (!Array.isArray(request.expected_allowed_paths) || request.expected_allowed_paths.length === 0 || request.expected_allowed_paths.some((p) => typeof p !== 'string' || !p)) fail('BOOTSTRAP_REQUEST_INVALID', 'expected_allowed_paths must be a non-empty string array');
  return request;
}

function assertEnvelopeMatchesRequest(envelope, request) {
  if (!envelope || typeof envelope !== 'object') fail('BOOTSTRAP_PUBLICATION_INVALID', 'publication envelope missing');
  if (envelope.publication_revision !== 1) fail('BOOTSTRAP_REVISION_INVALID', 'genesis publication revision must be 1');
  if (envelope.predecessor_commit_sha !== request.expected_predecessor_sha) fail('BOOTSTRAP_PREDECESSOR_MISMATCH', 'publication predecessor does not match request');
  if (envelope.predecessor_packet_digest !== null || envelope.predecessor_publication_digest !== null) fail('BOOTSTRAP_REVISION_INVALID', 'genesis predecessor digests must be null');
  if (envelope.packet_digest !== request.expected_packet_digest) fail('BOOTSTRAP_PACKET_DIGEST_MISMATCH', 'recomputed packet digest does not match request');
  if (envelope.publication_digest !== request.expected_publication_digest) fail('BOOTSTRAP_PUBLICATION_DIGEST_MISMATCH', 'recomputed publication digest does not match request');
  if (envelope.workstream_id !== request.workstream_id) fail('BOOTSTRAP_WORKSTREAM_MISMATCH', 'publication workstream does not match request');
  if (envelope.mission_version !== request.mission_version) fail('BOOTSTRAP_MISSION_MISMATCH', 'publication mission does not match request');

  const packet = envelope.packet;
  if (!packet || typeof packet !== 'object') fail('BOOTSTRAP_PACKET_INVALID', 'publication packet missing');
  if (packet.workstream_id !== request.workstream_id || packet.mission_version !== request.mission_version) fail('BOOTSTRAP_PACKET_INVALID', 'packet workstream/mission mismatch');
  if (packet.authoritative_subject?.oid !== request.expected_subject_sha) fail('BOOTSTRAP_SUBJECT_MISMATCH', 'authoritative subject mismatch');
  if (packet.branch_or_ref !== request.expected_target_ref) fail('BOOTSTRAP_TARGET_REF_MISMATCH', 'target ref mismatch');
  if (packet.authority_epoch !== request.expected_authority_epoch) fail('BOOTSTRAP_AUTHORITY_EPOCH_MISMATCH', 'authority epoch mismatch');
  if (packet.current_operation?.operation_id !== request.expected_current_operation_id) fail('BOOTSTRAP_OPERATION_MISMATCH', 'current operation mismatch');
  if (packet.qualification_state !== 'PASSED') fail('BOOTSTRAP_QUALIFICATION_INVALID', 'qualification_state must be PASSED');
  if (packet.github_admission_state !== 'ADMITTED') fail('BOOTSTRAP_ADMISSION_INVALID', 'github_admission_state must be ADMITTED');
  const observedPaths = packet.allowed_paths_or_effects?.paths;
  if (!exactArray(observedPaths, request.expected_allowed_paths)) fail('BOOTSTRAP_ALLOWED_PATHS_MISMATCH', 'allowed paths do not exactly match bootstrap request');
}

export class GitHubAuthorityBootstrapTransport {
  constructor({ baseTransport }) {
    if (!baseTransport || typeof baseTransport.request !== 'function') throw new TypeError('baseTransport.request function required');
    this.base = baseTransport;
  }

  getRef(ref) { return this.base.getRef(ref); }
  getCommit(sha) { return this.base.getCommit(sha); }
  readFile(sha, path) { return this.base.readFile(sha, path); }
  createCommitFromFiles(args) { return this.base.createCommitFromFiles(args); }
  updateRefFastForward(ref, sha) { return this.base.updateRefFastForward(ref, sha); }

  async getRefOrNull(ref) {
    assertBootstrapStateRef(ref);
    try {
      return await this.base.getRef(ref);
    } catch (error) {
      if (error?.details?.status === 404) return null;
      throw error;
    }
  }

  async createGenesisRef(ref, sha) {
    assertBootstrapStateRef(ref);
    requireString(sha, 'publication_commit_sha', SHA40);
    try {
      const result = await this.base.request('POST', `/repos/${encodeURIComponent(this.base.owner)}/${encodeURIComponent(this.base.repo)}/git/refs`, {
        ref: `refs/heads/${ref}`,
        sha
      });
      if (result?.object?.sha !== sha || result?.ref !== `refs/heads/${ref}`) fail('BOOTSTRAP_CREATE_RESPONSE_INVALID', 'GitHub returned an unexpected ref creation result');
      return { ref, sha };
    } catch (error) {
      if (error?.details?.status === 409 || error?.details?.status === 422) fail('BOOTSTRAP_REF_RACE', 'authority ref appeared or GitHub rejected create-only genesis publication', { cause: error });
      throw error;
    }
  }
}

export class GitHubAuthorityBootstrapExecutor {
  constructor({ transport, publisher, writerIntegrationId }) {
    if (!transport || typeof transport.getRefOrNull !== 'function' || typeof transport.createGenesisRef !== 'function') throw new TypeError('bootstrap transport required');
    if (!publisher || typeof publisher.readEnvelopeAtCommit !== 'function' || typeof publisher.verifyHistory !== 'function' || typeof publisher.reconstruct !== 'function') throw new TypeError('publication verifier required');
    if (writerIntegrationId !== CONTROL_GATEWAY_WRITER_INTEGRATION_ID) fail('BOOTSTRAP_WRITER_UNAUTHORIZED', `bootstrap requires Integration ${CONTROL_GATEWAY_WRITER_INTEGRATION_ID}`);
    this.transport = transport;
    this.publisher = publisher;
    this.writerIntegrationId = writerIntegrationId;
  }

  async execute(input) {
    const request = validateBootstrapRequest(input);
    const before = await this.transport.getRefOrNull(request.state_ref);
    if (before !== null) fail('BOOTSTRAP_REF_EXISTS', 'bootstrap is create-only; authority ref already exists', { observed_sha: before.sha });

    const commit = await this.transport.getCommit(request.publication_commit_sha);
    if (!commit || commit.sha !== request.publication_commit_sha) fail('BOOTSTRAP_COMMIT_MISMATCH', 'publication commit did not resolve exactly');
    if (!Array.isArray(commit.parents) || commit.parents.length !== 1 || commit.parents[0] !== request.expected_predecessor_sha) fail('BOOTSTRAP_PREDECESSOR_MISMATCH', 'publication commit parent is not the exact expected predecessor');

    // readEnvelopeAtCommit independently parses the repository bytes, recomputes packet/publication digests,
    // and verifies the immutable revision mirror before this executor authorizes ref creation.
    const verified = await this.publisher.readEnvelopeAtCommit(request.publication_commit_sha);
    if (!verified) fail('BOOTSTRAP_PUBLICATION_INVALID', 'publication head.json missing from publication commit');
    assertEnvelopeMatchesRequest(verified.envelope, request);
    await this.publisher.verifyHistory(request.publication_commit_sha);

    await this.transport.createGenesisRef(request.state_ref, request.publication_commit_sha);

    const reconstructed = await this.publisher.reconstruct();
    if (reconstructed.head_commit_sha !== request.publication_commit_sha) fail('BOOTSTRAP_POSTWRITE_MISMATCH', 'post-write ref does not resolve to exact publication commit');
    assertEnvelopeMatchesRequest(reconstructed.envelope, request);
    if (reconstructed.publication_revision !== 1 || reconstructed.packet_digest !== request.expected_packet_digest || reconstructed.publication_digest !== request.expected_publication_digest) fail('BOOTSTRAP_POSTWRITE_MISMATCH', 'post-write reconstructed authority differs from expected genesis publication');

    return Object.freeze({
      operation: CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_OPERATION,
      state: 'PUBLISHED_VERIFIED',
      state_ref: request.state_ref,
      publication_commit_sha: request.publication_commit_sha,
      publication_revision: 1,
      packet_digest: request.expected_packet_digest,
      publication_digest: request.expected_publication_digest,
      writer_integration_id: this.writerIntegrationId,
      authoritative_subject_sha: request.expected_subject_sha,
      target_ref: request.expected_target_ref,
      authority_epoch: request.expected_authority_epoch
    });
  }
}
