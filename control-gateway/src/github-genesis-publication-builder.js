import {
  canonicalize,
  sha256,
  validateActiveWorkPacket,
  CG001_MISSION_VERSION
} from './active-work-state.js';
import {
  GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL,
  DEFAULT_ACTIVE_WORK_HEAD_PATH,
  computePublicationDigest,
  publicationRevisionPath,
  validatePublicationEnvelope
} from './github-active-work-publication.js';

export const GENESIS_PUBLICATION_BUILDER_PROTOCOL = 'control-gateway.genesis-publication-builder.v1';

const SHA40 = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const ACTIVE_WORK_PREFIX = 'control-gateway-state/active-work/';

export class GitHubGenesisPublicationBuilderError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubGenesisPublicationBuilderError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new GitHubGenesisPublicationBuilderError(code, message, details);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail('GENESIS_BUILD_REQUEST_INVALID', `${label} must be non-empty trimmed text`);
  }
  if (pattern && !pattern.test(value)) fail('GENESIS_BUILD_REQUEST_INVALID', `${label} has invalid format`);
  return value;
}

function assertStateRef(value) {
  requiredString(value, 'state_ref', SAFE_REF);
  if (!value.startsWith(ACTIVE_WORK_PREFIX)) fail('GENESIS_BUILD_STATE_REF_FORBIDDEN', `state_ref must be under ${ACTIVE_WORK_PREFIX}`);
  const suffix = value.slice(ACTIVE_WORK_PREFIX.length);
  if (!suffix || suffix.startsWith('/') || suffix.endsWith('/') || suffix.includes('//') || suffix.split('/').some((p) => p === '.' || p === '..')) {
    fail('GENESIS_BUILD_STATE_REF_FORBIDDEN', 'state_ref suffix is invalid');
  }
}

export function validateGenesisPublicationBuildRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('GENESIS_BUILD_REQUEST_INVALID', 'request object required');
  const exact = [
    'protocol_version', 'operation', 'repository', 'state_ref', 'workstream_id', 'mission_version',
    'expected_predecessor_sha', 'initial_packet'
  ].sort();
  if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(exact)) fail('GENESIS_BUILD_REQUEST_INVALID', 'request fields must be exact');
  if (request.protocol_version !== GENESIS_PUBLICATION_BUILDER_PROTOCOL) fail('GENESIS_BUILD_PROTOCOL_INVALID', 'builder protocol mismatch');
  if (request.operation !== 'CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001') fail('GENESIS_BUILD_OPERATION_INVALID', 'bootstrap operation mismatch');
  requiredString(request.repository, 'repository', REPO);
  assertStateRef(request.state_ref);
  requiredString(request.workstream_id, 'workstream_id');
  requiredString(request.mission_version, 'mission_version');
  requiredString(request.expected_predecessor_sha, 'expected_predecessor_sha', SHA40);
  validateActiveWorkPacket(request.initial_packet);
  const packet = request.initial_packet;
  if (packet.repository !== request.repository) fail('GENESIS_BUILD_PACKET_MISMATCH', 'packet repository mismatch');
  if (packet.workstream_id !== request.workstream_id) fail('GENESIS_BUILD_PACKET_MISMATCH', 'packet workstream mismatch');
  if (packet.mission_version !== request.mission_version || request.mission_version !== CG001_MISSION_VERSION) fail('GENESIS_BUILD_PACKET_MISMATCH', 'packet mission mismatch');
  if (packet.qualification_state !== 'PASSED') fail('GENESIS_BUILD_QUALIFICATION_REQUIRED', 'genesis packet qualification_state must be PASSED');
  if (packet.github_admission_state !== 'ADMITTED') fail('GENESIS_BUILD_ADMISSION_REQUIRED', 'genesis packet github_admission_state must be ADMITTED');
  if (packet.current_operation?.state !== 'ACTIVE') fail('GENESIS_BUILD_OPERATION_NOT_ACTIVE', 'genesis packet current operation must be ACTIVE');
  if (!Array.isArray(packet.allowed_paths_or_effects?.paths) || packet.allowed_paths_or_effects.paths.length === 0) fail('GENESIS_BUILD_PATHS_REQUIRED', 'genesis packet must declare at least one allowed path');
  return request;
}

function makeGenesisEnvelope(request) {
  const packet = structuredClone(request.initial_packet);
  const envelope = {
    protocol_version: GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL,
    mission_version: packet.mission_version,
    workstream_id: packet.workstream_id,
    publication_revision: 1,
    predecessor_commit_sha: request.expected_predecessor_sha,
    predecessor_packet_digest: null,
    predecessor_publication_digest: null,
    packet_digest: sha256(packet),
    packet,
    publication_digest: ''
  };
  envelope.publication_digest = computePublicationDigest(envelope);
  validatePublicationEnvelope(envelope, {
    expectedWorkstreamId: request.workstream_id,
    expectedMissionVersion: request.mission_version
  });
  return envelope;
}

function requireTransport(transport) {
  for (const method of ['getRefOrNull', 'getCommit', 'readFile', 'createCommitFromFiles']) {
    if (typeof transport?.[method] !== 'function') throw new TypeError(`transport.${method} function required`);
  }
}

function parseExact(raw, label) {
  if (typeof raw !== 'string') fail('GENESIS_BUILD_POSTWRITE_INVALID', `${label} missing`);
  try { return JSON.parse(raw); } catch { fail('GENESIS_BUILD_POSTWRITE_INVALID', `${label} is not JSON`); }
}

export class GitHubGenesisPublicationBuilder {
  constructor({ transport }) {
    requireTransport(transport);
    this.transport = transport;
  }

  async build(input) {
    const request = validateGenesisPublicationBuildRequest(input);
    const existingRef = await this.transport.getRefOrNull(request.state_ref);
    if (existingRef !== null) fail('GENESIS_BUILD_STATE_REF_EXISTS', 'state_ref already exists; builder is create-only');
    const predecessor = await this.transport.getCommit(request.expected_predecessor_sha);
    if (!predecessor || predecessor.sha !== request.expected_predecessor_sha) {
      fail('GENESIS_BUILD_PREDECESSOR_MISMATCH', 'predecessor did not resolve exactly');
    }
    const existingHead = await this.transport.readFile(request.expected_predecessor_sha, DEFAULT_ACTIVE_WORK_HEAD_PATH);
    if (existingHead !== null) fail('GENESIS_BUILD_PREDECESSOR_NOT_CLEAN', 'predecessor already contains active-work state');

    const envelope = makeGenesisEnvelope(request);
    const body = `${canonicalize(envelope)}\n`;
    const mirrorPath = publicationRevisionPath(1, envelope.packet_digest);
    const created = await this.transport.createCommitFromFiles({
      parentSha: request.expected_predecessor_sha,
      files: {
        [DEFAULT_ACTIVE_WORK_HEAD_PATH]: body,
        [mirrorPath]: body
      },
      message: `control-gateway genesis ${request.workstream_id} ${envelope.packet_digest.slice(0, 12)}`
    });
    if (!created || !SHA40.test(created.sha ?? '')) fail('GENESIS_BUILD_COMMIT_INVALID', 'builder did not return a valid Git commit SHA');

    const commit = await this.transport.getCommit(created.sha);
    if (!commit || commit.sha !== created.sha || !Array.isArray(commit.parents) || commit.parents.length !== 1 || commit.parents[0] !== request.expected_predecessor_sha) {
      fail('GENESIS_BUILD_POSTWRITE_PARENT_MISMATCH', 'created commit parent does not match exact predecessor');
    }
    const head = parseExact(await this.transport.readFile(created.sha, DEFAULT_ACTIVE_WORK_HEAD_PATH), 'head');
    const mirror = parseExact(await this.transport.readFile(created.sha, mirrorPath), 'mirror');
    validatePublicationEnvelope(head, { expectedWorkstreamId: request.workstream_id, expectedMissionVersion: request.mission_version });
    validatePublicationEnvelope(mirror, { expectedWorkstreamId: request.workstream_id, expectedMissionVersion: request.mission_version });
    if (canonicalize(head) !== canonicalize(envelope) || canonicalize(mirror) !== canonicalize(envelope)) {
      fail('GENESIS_BUILD_POSTWRITE_MISMATCH', 'created commit does not contain the exact genesis envelope and mirror');
    }

    return Object.freeze({
      protocol_version: GENESIS_PUBLICATION_BUILDER_PROTOCOL,
      state: 'GENESIS_COMMIT_BUILT_VERIFIED',
      state_ref: request.state_ref,
      repository: request.repository,
      workstream_id: request.workstream_id,
      mission_version: request.mission_version,
      publication_commit_sha: created.sha,
      predecessor_sha: request.expected_predecessor_sha,
      packet_digest: envelope.packet_digest,
      publication_digest: envelope.publication_digest,
      authoritative_subject_sha: envelope.packet.authoritative_subject.oid,
      target_ref: envelope.packet.branch_or_ref,
      current_operation_id: envelope.packet.current_operation.operation_id,
      authority_epoch: envelope.packet.authority_epoch,
      expected_allowed_paths: [...envelope.packet.allowed_paths_or_effects.paths],
      mirror_path: mirrorPath
    });
  }
}

export function deriveAuthorityBootstrapRequest(buildReceipt) {
  if (!buildReceipt || buildReceipt.protocol_version !== GENESIS_PUBLICATION_BUILDER_PROTOCOL || buildReceipt.state !== 'GENESIS_COMMIT_BUILT_VERIFIED') {
    fail('GENESIS_BUILD_RECEIPT_INVALID', 'verified builder receipt required');
  }
  return Object.freeze({
    operation: 'CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001',
    state_ref: buildReceipt.state_ref,
    repository: buildReceipt.repository,
    workstream_id: buildReceipt.workstream_id,
    mission_version: buildReceipt.mission_version,
    publication_commit_sha: buildReceipt.publication_commit_sha,
    expected_predecessor_sha: buildReceipt.predecessor_sha,
    expected_packet_digest: buildReceipt.packet_digest,
    expected_publication_digest: buildReceipt.publication_digest,
    expected_subject_sha: buildReceipt.authoritative_subject_sha,
    expected_target_ref: buildReceipt.target_ref,
    expected_current_operation_id: buildReceipt.current_operation_id,
    expected_authority_epoch: buildReceipt.authority_epoch,
    expected_allowed_paths: [...buildReceipt.expected_allowed_paths]
  });
}
