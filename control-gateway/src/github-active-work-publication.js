import { canonicalize, sha256, validateActiveWorkPacket, CG001_MISSION_VERSION } from './active-work-state.js';

export const GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL = 'control-gateway.github-active-work-publication.v1';
export const DEFAULT_ACTIVE_WORK_HEAD_PATH = 'control-gateway-state/active-work/head.json';

const SHA_RE = /^[0-9a-f]{40,64}$/;
const WORKSTREAM_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export class GitHubPublicationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubPublicationError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new GitHubPublicationError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictKeys(value, keys, label) {
  if (!isPlainObject(value)) fail('PUBLICATION_SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('PUBLICATION_SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of keys) if (!(key in value)) fail('PUBLICATION_SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('PUBLICATION_SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('PUBLICATION_SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}

function nullableDigest(value, label) {
  if (value === null) return null;
  return requiredString(value, label, /^[0-9a-f]{64}$/);
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
  if (typeof raw !== 'string') fail('PUBLICATION_CONTENT_INVALID', `${label} must be UTF-8 JSON text`);
  try { return JSON.parse(raw); } catch { fail('PUBLICATION_CONTENT_INVALID', `${label} is not valid JSON`); }
}

function withoutPublicationDigest(envelope) {
  const value = clone(envelope);
  delete value.publication_digest;
  return value;
}

export function computePublicationDigest(envelope) {
  return sha256(withoutPublicationDigest(envelope));
}

export function publicationRevisionPath(revision, packetDigest) {
  if (!Number.isSafeInteger(revision) || revision < 1) fail('PUBLICATION_REVISION_INVALID', 'revision must be a positive safe integer');
  requiredString(packetDigest, 'packet_digest', /^[0-9a-f]{64}$/);
  return `control-gateway-state/active-work/revisions/${String(revision).padStart(12, '0')}-${packetDigest}.json`;
}

export function validatePublicationEnvelope(envelope, { expectedWorkstreamId, expectedMissionVersion = CG001_MISSION_VERSION } = {}) {
  strictKeys(envelope, [
    'protocol_version', 'mission_version', 'workstream_id', 'publication_revision',
    'predecessor_commit_sha', 'predecessor_packet_digest', 'predecessor_publication_digest',
    'packet_digest', 'packet', 'publication_digest'
  ], 'publication_envelope');
  if (envelope.protocol_version !== GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL) fail('PUBLICATION_PROTOCOL_INVALID', 'publication protocol mismatch');
  requiredString(envelope.mission_version, 'publication_envelope.mission_version');
  requiredString(envelope.workstream_id, 'publication_envelope.workstream_id', WORKSTREAM_RE);
  if (expectedWorkstreamId && envelope.workstream_id !== expectedWorkstreamId) fail('PUBLICATION_WORKSTREAM_MISMATCH', 'publication workstream does not match configured workstream');
  if (expectedMissionVersion && envelope.mission_version !== expectedMissionVersion) fail('PUBLICATION_MISSION_MISMATCH', 'publication mission version does not match frozen mission');
  if (!Number.isSafeInteger(envelope.publication_revision) || envelope.publication_revision < 1) fail('PUBLICATION_REVISION_INVALID', 'publication_revision must be positive');
  requiredString(envelope.predecessor_commit_sha, 'publication_envelope.predecessor_commit_sha', SHA_RE);
  nullableDigest(envelope.predecessor_packet_digest, 'publication_envelope.predecessor_packet_digest');
  nullableDigest(envelope.predecessor_publication_digest, 'publication_envelope.predecessor_publication_digest');
  requiredString(envelope.packet_digest, 'publication_envelope.packet_digest', /^[0-9a-f]{64}$/);
  requiredString(envelope.publication_digest, 'publication_envelope.publication_digest', /^[0-9a-f]{64}$/);
  validateActiveWorkPacket(envelope.packet);
  if (envelope.packet.workstream_id !== envelope.workstream_id) fail('PUBLICATION_WORKSTREAM_MISMATCH', 'packet workstream differs from publication envelope');
  if (envelope.packet.mission_version !== envelope.mission_version) fail('PUBLICATION_MISSION_MISMATCH', 'packet mission differs from publication envelope');
  if (sha256(envelope.packet) !== envelope.packet_digest) fail('PUBLICATION_PACKET_DIGEST_MISMATCH', 'packet digest does not match canonical packet bytes');
  if (computePublicationDigest(envelope) !== envelope.publication_digest) fail('PUBLICATION_DIGEST_MISMATCH', 'publication digest does not match envelope bytes');
  if (envelope.publication_revision === 1) {
    if (envelope.predecessor_packet_digest !== null || envelope.predecessor_publication_digest !== null) fail('PUBLICATION_CHAIN_INVALID', 'revision 1 must not claim predecessor packet/publication digests');
  } else if (envelope.predecessor_packet_digest === null || envelope.predecessor_publication_digest === null) {
    fail('PUBLICATION_CHAIN_INVALID', 'revision >1 requires predecessor packet and publication digests');
  }
  return true;
}

function makeEnvelope({ packet, revision, predecessorCommitSha, predecessorPacketDigest, predecessorPublicationDigest }) {
  validateActiveWorkPacket(packet);
  const envelope = {
    protocol_version: GITHUB_ACTIVE_WORK_PUBLICATION_PROTOCOL,
    mission_version: packet.mission_version,
    workstream_id: packet.workstream_id,
    publication_revision: revision,
    predecessor_commit_sha: predecessorCommitSha,
    predecessor_packet_digest: predecessorPacketDigest,
    predecessor_publication_digest: predecessorPublicationDigest,
    packet_digest: sha256(packet),
    packet: clone(packet),
    publication_digest: ''
  };
  envelope.publication_digest = computePublicationDigest(envelope);
  validatePublicationEnvelope(envelope, { expectedWorkstreamId: packet.workstream_id, expectedMissionVersion: packet.mission_version });
  return deepFreeze(envelope);
}

function requireTransport(transport) {
  const methods = ['getRef', 'getCommit', 'readFile', 'createCommitFromFiles', 'updateRefFastForward'];
  for (const method of methods) if (typeof transport?.[method] !== 'function') throw new TypeError(`transport.${method} function required`);
}

export class GitHubActiveWorkPublisher {
  constructor({ transport, ref, workstreamId, missionVersion = CG001_MISSION_VERSION, headPath = DEFAULT_ACTIVE_WORK_HEAD_PATH, maxHistoryDepth = 1000 }) {
    requireTransport(transport);
    requiredString(ref, 'ref', REF_RE);
    requiredString(workstreamId, 'workstreamId', WORKSTREAM_RE);
    requiredString(missionVersion, 'missionVersion');
    if (!Number.isSafeInteger(maxHistoryDepth) || maxHistoryDepth < 1) throw new TypeError('maxHistoryDepth must be positive');
    this.transport = transport;
    this.ref = ref;
    this.workstreamId = workstreamId;
    this.missionVersion = missionVersion;
    this.headPath = headPath;
    this.maxHistoryDepth = maxHistoryDepth;
  }

  async readEnvelopeAtCommit(commitSha) {
    requiredString(commitSha, 'commitSha', SHA_RE);
    const commit = await this.transport.getCommit(commitSha);
    if (!commit || commit.sha !== commitSha || !Array.isArray(commit.parents)) fail('PUBLICATION_COMMIT_INVALID', `invalid commit metadata for ${commitSha}`);
    const raw = await this.transport.readFile(commitSha, this.headPath);
    if (raw === null) return null;
    const envelope = parseJson(raw, `${this.headPath}@${commitSha}`);
    validatePublicationEnvelope(envelope, { expectedWorkstreamId: this.workstreamId, expectedMissionVersion: this.missionVersion });
    if (commit.parents.length !== 1 || commit.parents[0] !== envelope.predecessor_commit_sha) fail('PUBLICATION_PARENT_MISMATCH', 'Git commit parent does not match publication predecessor');
    const mirrorPath = publicationRevisionPath(envelope.publication_revision, envelope.packet_digest);
    const mirrorRaw = await this.transport.readFile(commitSha, mirrorPath);
    if (mirrorRaw === null) fail('PUBLICATION_REVISION_MIRROR_MISSING', `immutable revision mirror ${mirrorPath} is missing`);
    const mirror = parseJson(mirrorRaw, `${mirrorPath}@${commitSha}`);
    if (canonicalize(mirror) !== canonicalize(envelope)) fail('PUBLICATION_REVISION_MIRROR_MISMATCH', 'head and immutable revision mirror differ');
    return deepFreeze({ commit, envelope, mirrorPath });
  }

  async verifyHistory(headCommitSha) {
    let currentSha = headCommitSha;
    let depth = 0;
    let current = await this.readEnvelopeAtCommit(currentSha);
    if (!current) fail('PUBLICATION_HEAD_MISSING', 'publication head file is missing at configured ref');
    while (true) {
      depth += 1;
      if (depth > this.maxHistoryDepth) fail('PUBLICATION_HISTORY_LIMIT', 'publication history exceeds configured verification depth');
      const envelope = current.envelope;
      if (envelope.publication_revision === 1) {
        const unexpected = await this.transport.readFile(envelope.predecessor_commit_sha, this.headPath);
        if (unexpected !== null) fail('PUBLICATION_GENESIS_INVALID', 'revision 1 predecessor already contains an active-work head');
        return deepFreeze({ revisions_verified: depth, genesis_commit_sha: envelope.predecessor_commit_sha });
      }
      const previous = await this.readEnvelopeAtCommit(envelope.predecessor_commit_sha);
      if (!previous) fail('PUBLICATION_HISTORY_MISSING', `predecessor publication ${envelope.predecessor_commit_sha} is missing`);
      if (previous.envelope.publication_revision !== envelope.publication_revision - 1) fail('PUBLICATION_HISTORY_GAP', 'publication revision sequence contains a gap');
      if (previous.envelope.packet_digest !== envelope.predecessor_packet_digest) fail('PUBLICATION_HISTORY_PACKET_FORK', 'predecessor packet digest does not match history');
      if (previous.envelope.publication_digest !== envelope.predecessor_publication_digest) fail('PUBLICATION_HISTORY_DIGEST_FORK', 'predecessor publication digest does not match history');
      currentSha = envelope.predecessor_commit_sha;
      current = previous;
    }
  }

  async reconstruct() {
    const before = await this.transport.getRef(this.ref);
    if (!before || !SHA_RE.test(before.sha ?? '')) fail('PUBLICATION_REF_INVALID', 'configured publication ref did not resolve to a Git commit');
    const current = await this.readEnvelopeAtCommit(before.sha);
    if (!current) fail('PUBLICATION_HEAD_MISSING', 'configured publication ref contains no active-work head');
    const history = await this.verifyHistory(before.sha);
    const after = await this.transport.getRef(this.ref);
    if (!after || after.sha !== before.sha) fail('PUBLICATION_HEAD_MOVED', 'publication ref changed during reconstruction; retry from new head');
    return deepFreeze({
      ref: this.ref,
      head_commit_sha: before.sha,
      publication_revision: current.envelope.publication_revision,
      packet_digest: current.envelope.packet_digest,
      publication_digest: current.envelope.publication_digest,
      envelope: current.envelope,
      history
    });
  }

  async publish(packet, { expectedHeadCommitSha, expectedPublicationRevision, expectedPacketDigest } = {}) {
    validateActiveWorkPacket(packet);
    if (packet.workstream_id !== this.workstreamId) fail('PUBLICATION_WORKSTREAM_MISMATCH', 'packet does not belong to configured workstream');
    if (packet.mission_version !== this.missionVersion) fail('PUBLICATION_MISSION_MISMATCH', 'packet does not use configured frozen mission');
    requiredString(expectedHeadCommitSha, 'expectedHeadCommitSha', SHA_RE);
    if (!Number.isSafeInteger(expectedPublicationRevision) || expectedPublicationRevision < 0) fail('PUBLICATION_EXPECTATION_INVALID', 'expectedPublicationRevision must be a nonnegative safe integer');
    if (expectedPacketDigest !== null) requiredString(expectedPacketDigest, 'expectedPacketDigest', /^[0-9a-f]{64}$/);

    const ref = await this.transport.getRef(this.ref);
    if (!ref || ref.sha !== expectedHeadCommitSha) fail('PUBLICATION_HEAD_CONFLICT', 'configured ref does not match expected head commit');
    const existing = await this.readEnvelopeAtCommit(ref.sha);
    if (existing === null) {
      if (expectedPublicationRevision !== 0 || expectedPacketDigest !== null) fail('PUBLICATION_HEAD_CONFLICT', 'expected publication state does not match empty genesis ref');
    } else {
      if (existing.envelope.publication_revision !== expectedPublicationRevision || existing.envelope.packet_digest !== expectedPacketDigest) fail('PUBLICATION_HEAD_CONFLICT', 'expected publication revision/digest does not match GitHub head');
      if (canonicalize(existing.envelope.packet) === canonicalize(packet)) {
        return deepFreeze({ idempotent: true, head_commit_sha: ref.sha, publication_revision: existing.envelope.publication_revision, packet_digest: existing.envelope.packet_digest, publication_digest: existing.envelope.publication_digest, envelope: existing.envelope });
      }
    }

    const revision = expectedPublicationRevision + 1;
    const envelope = makeEnvelope({
      packet,
      revision,
      predecessorCommitSha: ref.sha,
      predecessorPacketDigest: existing?.envelope.packet_digest ?? null,
      predecessorPublicationDigest: existing?.envelope.publication_digest ?? null
    });
    const body = `${canonicalize(envelope)}\n`;
    const revisionPath = publicationRevisionPath(revision, envelope.packet_digest);
    const created = await this.transport.createCommitFromFiles({
      parentSha: ref.sha,
      files: { [this.headPath]: body, [revisionPath]: body },
      message: `control-gateway active-work ${this.workstreamId} r${revision} ${envelope.packet_digest.slice(0, 12)}`
    });
    if (!created || !SHA_RE.test(created.sha ?? '')) fail('PUBLICATION_COMMIT_INVALID', 'transport did not return a valid publication commit SHA');

    try {
      await this.transport.updateRefFastForward(this.ref, created.sha);
    } catch (error) {
      if (error?.code !== 'GITHUB_NETWORK_AMBIGUOUS') throw error;
      const observed = await this.transport.getRef(this.ref);
      if (!observed || observed.sha !== created.sha) throw error;
    }

    const reconstructed = await this.reconstruct();
    if (reconstructed.head_commit_sha !== created.sha || reconstructed.packet_digest !== envelope.packet_digest || canonicalize(reconstructed.envelope.packet) !== canonicalize(packet)) fail('PUBLICATION_POSTWRITE_VERIFY_FAILED', 'GitHub publication did not reconstruct to the exact written packet');
    return deepFreeze({ idempotent: false, ...reconstructed });
  }
}

export class GitHubChatReconstructionAdapter {
  constructor({ publisher }) {
    if (!(publisher instanceof GitHubActiveWorkPublisher)) throw new TypeError('publisher must be GitHubActiveWorkPublisher');
    this.publisher = publisher;
  }

  async reconstructContinuation() {
    const publication = await this.publisher.reconstruct();
    const packet = publication.envelope.packet;
    return deepFreeze({
      source: 'GITHUB_DURABLE_ACTIVE_WORK',
      publication_ref: publication.ref,
      publication_commit_sha: publication.head_commit_sha,
      publication_revision: publication.publication_revision,
      packet_digest: publication.packet_digest,
      mission_version: packet.mission_version,
      workstream_id: packet.workstream_id,
      authoritative_subject: clone(packet.authoritative_subject),
      repository: packet.repository,
      branch_or_ref: packet.branch_or_ref,
      current_operation: clone(packet.current_operation),
      qualification_state: packet.qualification_state,
      github_admission_state: packet.github_admission_state,
      a01_state: packet.a01_state,
      next_legal_operation: clone(packet.next_legal_operation)
    });
  }
}

function encodeRefPath(ref) {
  return ref.split('/').map(encodeURIComponent).join('/');
}
function encodeContentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
function classifyStatus(status) {
  if (status === 401) return 'GITHUB_AUTH_FAILED';
  if (status === 403) return 'GITHUB_FORBIDDEN';
  if (status === 404) return 'GITHUB_NOT_FOUND';
  if (status === 409 || status === 422) return 'PUBLICATION_HEAD_CONFLICT';
  if (status === 429) return 'GITHUB_RATE_LIMITED';
  if (status >= 500) return 'GITHUB_UNAVAILABLE';
  return 'GITHUB_API_ERROR';
}

export class GitHubActiveWorkRestTransport {
  constructor({ owner, repo, tokenProvider = null, fetchImpl = globalThis.fetch, apiBase = 'https://api.github.com' }) {
    if (!owner || !repo) throw new TypeError('owner and repo are required');
    if (tokenProvider !== null && typeof tokenProvider !== 'function') throw new TypeError('tokenProvider must be a function or null');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl function required');
    this.owner = owner;
    this.repo = repo;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(method, path, body = undefined) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' };
    if (this.tokenProvider) {
      const token = await this.tokenProvider();
      if (!token) fail('GITHUB_AUTH_FAILED', 'tokenProvider returned no token');
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (cause) {
      throw new GitHubPublicationError('GITHUB_NETWORK_AMBIGUOUS', 'GitHub request failed before a definitive response', { cause });
    }
    const text = await response.text();
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    if (!response.ok) throw new GitHubPublicationError(classifyStatus(response.status), typeof parsed === 'object' && parsed?.message ? parsed.message : `GitHub API ${response.status}`, { status: response.status, body: parsed });
    return parsed;
  }

  async getRef(ref) {
    const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/ref/heads/${encodeRefPath(ref)}`);
    return { sha: result.object.sha };
  }

  async getCommit(sha) {
    const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/commits/${encodeURIComponent(sha)}`);
    return { sha: result.sha, tree_sha: result.tree.sha, parents: (result.parents || []).map((parent) => parent.sha) };
  }

  async readFile(commitSha, path) {
    try {
      const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodeContentPath(path)}?ref=${encodeURIComponent(commitSha)}`);
      if (!result || result.type !== 'file' || result.encoding !== 'base64') fail('GITHUB_CONTENT_INVALID', `unexpected content response for ${path}`);
      return Buffer.from(String(result.content).replace(/\n/g, ''), 'base64').toString('utf8');
    } catch (error) {
      if (error instanceof GitHubPublicationError && error.details?.status === 404) return null;
      throw error;
    }
  }

  async createBlob(content) {
    const result = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/blobs`, { content, encoding: 'utf-8' });
    return result.sha;
  }

  async createCommitFromFiles({ parentSha, files, message }) {
    const parent = await this.getCommit(parentSha);
    const tree = [];
    for (const [path, content] of Object.entries(files)) tree.push({ path, mode: '100644', type: 'blob', sha: await this.createBlob(content) });
    const createdTree = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/trees`, { base_tree: parent.tree_sha, tree });
    const commit = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/commits`, { message, tree: createdTree.sha, parents: [parentSha] });
    return { sha: commit.sha, tree_sha: createdTree.sha };
  }

  async updateRefFastForward(ref, sha) {
    const result = await this.request('PATCH', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/refs/heads/${encodeRefPath(ref)}`, { sha, force: false });
    return { sha: result.object.sha };
  }
}
