import { canonicalize, sha256 } from './active-work-state.js';
import { mutationRequestDigest, validateAdmissionReceipt } from './github-mutation-admission.js';

export const GITHUB_PRODUCTION_MUTATION_PLAN_PROTOCOL = 'control-gateway.github-production-mutation-plan.v1';
export const GITHUB_PRODUCTION_MUTATION_GRANT_PROTOCOL = 'control-gateway.github-production-mutation-grant.v1';
export const GITHUB_PRODUCTION_MUTATION_RECEIPT_PROTOCOL = 'control-gateway.github-production-mutation-receipt.v1';

const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const TARGET_KINDS = new Set(['WORK_REF', 'AUTHORITY_STATE_REF']);

export class GitHubProductionMutationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubProductionMutationError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new GitHubProductionMutationError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictKeys(value, allowed, label) {
  if (!isPlainObject(value)) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('PRODUCTION_MUTATION_SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of allowed) if (!(key in value)) fail('PRODUCTION_MUTATION_SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}

function nullableId(value, label) {
  if (value === null) return null;
  return requiredString(value, label, ID_RE);
}

function validateExactPath(path, label = 'path') {
  requiredString(path, label);
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) fail('PRODUCTION_MUTATION_PATH_INVALID', `${label} is unsafe`);
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('*'))) fail('PRODUCTION_MUTATION_PATH_INVALID', `${label} must be an exact normalized repository path`);
}

function sortedUnique(values, label) {
  const sorted = [...values].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]) fail('PRODUCTION_MUTATION_DUPLICATE_PATH', `${label} contains duplicate path ${sorted[index]}`);
  }
  return sorted;
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

function normalizePlan(plan) {
  const copy = clone(plan);
  copy.writes.sort((left, right) => left.path.localeCompare(right.path));
  copy.deletes.sort();
  return copy;
}

export function validateProductionMutationPlan(plan) {
  strictKeys(plan, [
    'protocol_version', 'mutation_id', 'repository', 'target_kind', 'target_ref',
    'expected_predecessor_sha', 'commit_message', 'writes', 'deletes'
  ], 'production_mutation_plan');
  if (plan.protocol_version !== GITHUB_PRODUCTION_MUTATION_PLAN_PROTOCOL) fail('PRODUCTION_MUTATION_PROTOCOL_INVALID', 'production mutation plan protocol mismatch');
  requiredString(plan.mutation_id, 'mutation_id', ID_RE);
  requiredString(plan.repository, 'repository', REPO_RE);
  if (!TARGET_KINDS.has(plan.target_kind)) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', 'target_kind is unsupported');
  requiredString(plan.target_ref, 'target_ref', REF_RE);
  requiredString(plan.expected_predecessor_sha, 'expected_predecessor_sha', SHA1_RE);
  requiredString(plan.commit_message, 'commit_message');
  if (plan.commit_message.length > 4096) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', 'commit_message is too long');
  if (!Array.isArray(plan.writes) || !Array.isArray(plan.deletes)) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', 'writes and deletes must be arrays');
  const writePaths = [];
  for (const [index, write] of plan.writes.entries()) {
    strictKeys(write, ['path', 'content_utf8', 'content_sha256'], `writes[${index}]`);
    validateExactPath(write.path, `writes[${index}].path`);
    if (typeof write.content_utf8 !== 'string') fail('PRODUCTION_MUTATION_SCHEMA_INVALID', `writes[${index}].content_utf8 must be a string`);
    requiredString(write.content_sha256, `writes[${index}].content_sha256`, SHA256_RE);
    if (sha256(write.content_utf8) !== write.content_sha256) fail('PRODUCTION_MUTATION_CONTENT_DIGEST_MISMATCH', `writes[${index}] content digest mismatch`);
    writePaths.push(write.path);
  }
  const deletePaths = [];
  for (const [index, path] of plan.deletes.entries()) {
    validateExactPath(path, `deletes[${index}]`);
    deletePaths.push(path);
  }
  const allPaths = sortedUnique([...writePaths, ...deletePaths], 'mutation plan');
  if (allPaths.length === 0) fail('PRODUCTION_MUTATION_EMPTY', 'production mutation plan must write or delete at least one exact path');
  return true;
}

export function productionMutationPlanDigest(plan) {
  validateProductionMutationPlan(plan);
  return sha256(normalizePlan(plan));
}

function exactPathSetFromPlan(plan) {
  return [...plan.writes.map((entry) => entry.path), ...plan.deletes].sort();
}

function exactStringSet(values, label) {
  if (!Array.isArray(values)) fail('PRODUCTION_MUTATION_SCHEMA_INVALID', `${label} must be an array`);
  for (const value of values) requiredString(value, `${label}[]`);
  return sortedUnique(values, label);
}

function assertPlanMatchesAdmission(receipt, request, plan) {
  validateAdmissionReceipt(receipt);
  validateProductionMutationPlan(plan);
  if (receipt.request_digest !== mutationRequestDigest(request)) fail('PRODUCTION_MUTATION_REQUEST_MISMATCH', 'admission receipt does not bind the supplied request');
  if (plan.mutation_id !== receipt.mutation_id) fail('PRODUCTION_MUTATION_BINDING_MISMATCH', 'plan mutation_id differs from admission receipt');
  if (plan.repository !== receipt.repository || plan.target_kind !== receipt.target_kind || plan.target_ref !== receipt.target_ref) fail('PRODUCTION_MUTATION_BINDING_MISMATCH', 'plan repository/target differs from admission receipt');
  if (plan.expected_predecessor_sha !== receipt.observed_predecessor_sha) fail('PRODUCTION_MUTATION_BINDING_MISMATCH', 'plan predecessor differs from admission receipt');
  const receiptPaths = exactStringSet(receipt.paths, 'admission paths');
  const planPaths = exactPathSetFromPlan(plan);
  if (canonicalize(receiptPaths) !== canonicalize(planPaths)) fail('PRODUCTION_MUTATION_PATH_SET_MISMATCH', 'mutation plan paths must exactly equal admitted paths');
}

function withoutGrantDigest(grant) {
  const copy = clone(grant);
  delete copy.grant_digest;
  return copy;
}

export function productionMutationGrantDigest(grant) {
  return sha256(withoutGrantDigest(grant));
}

export function validateProductionMutationGrant(grant) {
  strictKeys(grant, [
    'protocol_version', 'decision', 'mutation_id', 'request_digest', 'admission_digest', 'plan_digest',
    'repository', 'target_kind', 'target_ref', 'observed_predecessor_sha', 'operation_id',
    'predecessor_receipt_id', 'paths', 'effects', 'executor_requirement', 'grant_digest'
  ], 'production_mutation_grant');
  if (grant.protocol_version !== GITHUB_PRODUCTION_MUTATION_GRANT_PROTOCOL || grant.decision !== 'GRANTED') fail('PRODUCTION_MUTATION_GRANT_INVALID', 'production grant protocol/decision invalid');
  requiredString(grant.mutation_id, 'grant.mutation_id', ID_RE);
  requiredString(grant.request_digest, 'grant.request_digest', SHA256_RE);
  requiredString(grant.admission_digest, 'grant.admission_digest', SHA256_RE);
  requiredString(grant.plan_digest, 'grant.plan_digest', SHA256_RE);
  requiredString(grant.repository, 'grant.repository', REPO_RE);
  if (!TARGET_KINDS.has(grant.target_kind)) fail('PRODUCTION_MUTATION_GRANT_INVALID', 'grant target kind invalid');
  requiredString(grant.target_ref, 'grant.target_ref', REF_RE);
  requiredString(grant.observed_predecessor_sha, 'grant.observed_predecessor_sha', SHA1_RE);
  requiredString(grant.operation_id, 'grant.operation_id', ID_RE);
  nullableId(grant.predecessor_receipt_id, 'grant.predecessor_receipt_id');
  exactStringSet(grant.paths, 'grant.paths');
  exactStringSet(grant.effects, 'grant.effects');
  if (grant.executor_requirement !== 'RECEIPT_CONSUMING_EXACT_PREDECESSOR_CAS_REQUIRED') fail('PRODUCTION_MUTATION_GRANT_INVALID', 'grant executor requirement invalid');
  requiredString(grant.grant_digest, 'grant.grant_digest', SHA256_RE);
  if (productionMutationGrantDigest(grant) !== grant.grant_digest) fail('PRODUCTION_MUTATION_GRANT_DIGEST_MISMATCH', 'production grant digest mismatch');
  return true;
}

export class GitHubProductionMutationGate {
  constructor({ admissionGate }) {
    if (!admissionGate || typeof admissionGate.verifyGrantFresh !== 'function') throw new TypeError('admissionGate.verifyGrantFresh function required');
    this.admissionGate = admissionGate;
  }

  async authorize({ receipt, request, plan }) {
    assertPlanMatchesAdmission(receipt, request, plan);
    await this.admissionGate.verifyGrantFresh(receipt, request);
    const grant = {
      protocol_version: GITHUB_PRODUCTION_MUTATION_GRANT_PROTOCOL,
      decision: 'GRANTED',
      mutation_id: receipt.mutation_id,
      request_digest: receipt.request_digest,
      admission_digest: receipt.admission_digest,
      plan_digest: productionMutationPlanDigest(plan),
      repository: receipt.repository,
      target_kind: receipt.target_kind,
      target_ref: receipt.target_ref,
      observed_predecessor_sha: receipt.observed_predecessor_sha,
      operation_id: receipt.operation_id,
      predecessor_receipt_id: receipt.predecessor_receipt_id,
      paths: [...receipt.paths].sort(),
      effects: [...receipt.effects].sort(),
      executor_requirement: 'RECEIPT_CONSUMING_EXACT_PREDECESSOR_CAS_REQUIRED',
      grant_digest: ''
    };
    grant.grant_digest = productionMutationGrantDigest(grant);
    validateProductionMutationGrant(grant);
    return deepFreeze(grant);
  }
}

function repositoryFromTransport(transport) {
  if (typeof transport?.owner !== 'string' || typeof transport?.repo !== 'string') throw new TypeError('transport owner/repo binding required');
  for (const method of ['getRef', 'getCommit', 'createTreeFromPlan', 'createCommit', 'updateRefFastForward']) {
    if (typeof transport[method] !== 'function') throw new TypeError(`transport.${method} function required`);
  }
  return `${transport.owner}/${transport.repo}`;
}

function withoutLeaseReceiptDigest(receipt) {
  const copy = clone(receipt);
  delete copy.receipt_digest;
  return copy;
}

function validateLeaseReceiptForGrant(receipt, grant) {
  strictKeys(receipt, [
    'protocol_version', 'state_ref', 'state_commit_sha', 'target_ref', 'expected_predecessor_sha',
    'holder', 'leases', 'idempotent_replay', 'receipt_digest'
  ], 'system_file_lease_receipt');
  if (receipt.protocol_version !== 'control-gateway.system-file-lease-acquisition.v1') fail('PRODUCTION_MUTATION_LEASE_RECEIPT_INVALID', 'lease receipt protocol invalid');
  if (receipt.state_ref !== 'control-gateway-state/system-file-leases') fail('PRODUCTION_MUTATION_LEASE_STATE_REF_INVALID', 'lease receipt must use canonical system-file lease state ref');
  requiredString(receipt.state_commit_sha, 'lease.state_commit_sha', SHA1_RE);
  requiredString(receipt.target_ref, 'lease.target_ref', REF_RE);
  requiredString(receipt.expected_predecessor_sha, 'lease.expected_predecessor_sha', SHA1_RE);
  requiredString(receipt.receipt_digest, 'lease.receipt_digest', SHA256_RE);
  if (receipt.target_ref !== grant.target_ref || receipt.expected_predecessor_sha !== grant.observed_predecessor_sha) fail('PRODUCTION_MUTATION_LEASE_BINDING_MISMATCH', 'lease target/predecessor differs from production grant');
  strictKeys(receipt.holder, ['workstream_id', 'operation_id', 'mutation_id'], 'lease.holder');
  requiredString(receipt.holder.workstream_id, 'lease.holder.workstream_id', ID_RE);
  requiredString(receipt.holder.operation_id, 'lease.holder.operation_id', ID_RE);
  requiredString(receipt.holder.mutation_id, 'lease.holder.mutation_id', ID_RE);
  if (receipt.holder.operation_id !== grant.operation_id || receipt.holder.mutation_id !== grant.mutation_id) fail('PRODUCTION_MUTATION_LEASE_BINDING_MISMATCH', 'lease holder differs from production grant');
  if (!Array.isArray(receipt.leases) || receipt.leases.length === 0) fail('PRODUCTION_MUTATION_LEASE_RECEIPT_INVALID', 'lease entries required');
  const paths = [];
  for (const [index, lease] of receipt.leases.entries()) {
    strictKeys(lease, ['path', 'path_revision', 'lease_epoch', 'fence_token', 'record_digest', 'expires_at'], `lease.leases[${index}]`);
    validateExactPath(lease.path, `lease.leases[${index}].path`);
    if (!Number.isSafeInteger(lease.path_revision) || lease.path_revision < 0 || !Number.isSafeInteger(lease.lease_epoch) || lease.lease_epoch < 1) fail('PRODUCTION_MUTATION_LEASE_RECEIPT_INVALID', `lease counters invalid for ${lease.path}`);
    requiredString(lease.fence_token, `lease.leases[${index}].fence_token`, SHA256_RE);
    requiredString(lease.record_digest, `lease.leases[${index}].record_digest`, SHA256_RE);
    if (typeof lease.expires_at !== 'string' || !Number.isFinite(Date.parse(lease.expires_at))) fail('PRODUCTION_MUTATION_LEASE_RECEIPT_INVALID', `lease expiry invalid for ${lease.path}`);
    paths.push(lease.path);
  }
  if (typeof receipt.idempotent_replay !== 'boolean') fail('PRODUCTION_MUTATION_LEASE_RECEIPT_INVALID', 'lease idempotent_replay must be boolean');
  if (canonicalize(sortedUnique(paths, 'lease paths')) !== canonicalize([...grant.paths].sort())) fail('PRODUCTION_MUTATION_LEASE_PATH_SET_MISMATCH', 'lease paths differ from production grant');
  if (sha256(withoutLeaseReceiptDigest(receipt)) !== receipt.receipt_digest) fail('PRODUCTION_MUTATION_LEASE_RECEIPT_DIGEST_MISMATCH', 'lease receipt digest mismatch');
  return true;
}

function exactCommitMessage(plan, grant, leaseReceipt = null) {
  if (leaseReceipt && /^System-File-Lease\s*:/im.test(plan.commit_message)) fail('PRODUCTION_MUTATION_CALLER_LEASE_TRAILER_FORBIDDEN', 'caller-supplied System-File-Lease trailers are forbidden');
  const base = `${plan.commit_message.trimEnd()}\n\nControl-Gateway-Mutation: ${grant.mutation_id}\nControl-Gateway-Admission-Digest: ${grant.admission_digest}\nControl-Gateway-Plan-Digest: ${grant.plan_digest}\nControl-Gateway-Grant-Digest: ${grant.grant_digest}`;
  if (!leaseReceipt) return base;
  validateLeaseReceiptForGrant(leaseReceipt, grant);
  const trailers = [...leaseReceipt.leases]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((lease) => `System-File-Lease: ${lease.path}@${lease.lease_epoch}/${lease.fence_token}`);
  return `${base}\n${trailers.join('\n')}`;
}

function assertGrantMatchesPlan(grant, plan) {
  validateProductionMutationGrant(grant);
  validateProductionMutationPlan(plan);
  if (grant.plan_digest !== productionMutationPlanDigest(plan)) fail('PRODUCTION_MUTATION_PLAN_CHANGED', 'plan digest differs from production grant');
  if (grant.mutation_id !== plan.mutation_id || grant.repository !== plan.repository || grant.target_kind !== plan.target_kind || grant.target_ref !== plan.target_ref || grant.observed_predecessor_sha !== plan.expected_predecessor_sha) fail('PRODUCTION_MUTATION_BINDING_MISMATCH', 'grant does not bind supplied mutation plan');
  if (canonicalize([...grant.paths].sort()) !== canonicalize(exactPathSetFromPlan(plan))) fail('PRODUCTION_MUTATION_PATH_SET_MISMATCH', 'grant paths differ from mutation plan');
}

function withoutExecutionDigest(receipt) {
  const copy = clone(receipt);
  delete copy.execution_digest;
  return copy;
}

export function productionMutationExecutionDigest(receipt) {
  return sha256(withoutExecutionDigest(receipt));
}

export function validateProductionMutationExecutionReceipt(receipt) {
  strictKeys(receipt, [
    'protocol_version', 'result', 'mutation_id', 'admission_digest', 'plan_digest', 'grant_digest',
    'repository', 'target_ref', 'predecessor_sha', 'result_commit_sha', 'result_tree_sha',
    'idempotent_replay', 'execution_digest'
  ], 'production_mutation_execution_receipt');
  if (receipt.protocol_version !== GITHUB_PRODUCTION_MUTATION_RECEIPT_PROTOCOL || receipt.result !== 'APPLIED') fail('PRODUCTION_MUTATION_RECEIPT_INVALID', 'execution receipt protocol/result invalid');
  for (const field of ['admission_digest', 'plan_digest', 'grant_digest', 'execution_digest']) requiredString(receipt[field], `execution_receipt.${field}`, SHA256_RE);
  for (const field of ['predecessor_sha', 'result_commit_sha', 'result_tree_sha']) requiredString(receipt[field], `execution_receipt.${field}`, SHA1_RE);
  requiredString(receipt.mutation_id, 'execution_receipt.mutation_id', ID_RE);
  requiredString(receipt.repository, 'execution_receipt.repository', REPO_RE);
  requiredString(receipt.target_ref, 'execution_receipt.target_ref', REF_RE);
  if (typeof receipt.idempotent_replay !== 'boolean') fail('PRODUCTION_MUTATION_RECEIPT_INVALID', 'execution receipt idempotent_replay must be boolean');
  if (productionMutationExecutionDigest(receipt) !== receipt.execution_digest) fail('PRODUCTION_MUTATION_RECEIPT_DIGEST_MISMATCH', 'execution receipt digest mismatch');
  return true;
}

function makeExecutionReceipt({ grant, resultCommitSha, resultTreeSha, replayed }) {
  const receipt = {
    protocol_version: GITHUB_PRODUCTION_MUTATION_RECEIPT_PROTOCOL,
    result: 'APPLIED',
    mutation_id: grant.mutation_id,
    admission_digest: grant.admission_digest,
    plan_digest: grant.plan_digest,
    grant_digest: grant.grant_digest,
    repository: grant.repository,
    target_ref: grant.target_ref,
    predecessor_sha: grant.observed_predecessor_sha,
    result_commit_sha: resultCommitSha,
    result_tree_sha: resultTreeSha,
    idempotent_replay: Boolean(replayed),
    execution_digest: ''
  };
  receipt.execution_digest = productionMutationExecutionDigest(receipt);
  validateProductionMutationExecutionReceipt(receipt);
  return deepFreeze(receipt);
}

export class GitHubReceiptConsumingCasWriter {
  constructor({ transport }) {
    repositoryFromTransport(transport);
    this.transport = transport;
  }

  async execute({ grant, plan, leaseReceipt = null }) {
    assertGrantMatchesPlan(grant, plan);
    if (leaseReceipt) validateLeaseReceiptForGrant(leaseReceipt, grant);
    if (repositoryFromTransport(this.transport) !== grant.repository) fail('PRODUCTION_MUTATION_TRANSPORT_REPOSITORY_MISMATCH', 'writer transport targets a different repository');
    const predecessor = grant.observed_predecessor_sha;
    const expectedMessage = exactCommitMessage(plan, grant, leaseReceipt);
    const desiredTree = await this.transport.createTreeFromPlan({ baseCommitSha: predecessor, plan: normalizePlan(plan) });
    if (!desiredTree || !SHA1_RE.test(desiredTree.sha ?? '')) fail('PRODUCTION_MUTATION_TREE_INVALID', 'writer transport did not return a valid Git tree SHA');

    const current = await this.transport.getRef(grant.target_ref);
    if (!current || !SHA1_RE.test(current.sha ?? '')) fail('PRODUCTION_MUTATION_REF_INVALID', 'target ref did not resolve to a Git commit');
    if (current.sha !== predecessor) {
      const existing = await this.transport.getCommit(current.sha);
      const replayMatches = existing
        && existing.sha === current.sha
        && existing.tree_sha === desiredTree.sha
        && Array.isArray(existing.parents)
        && existing.parents.length === 1
        && existing.parents[0] === predecessor
        && existing.message === expectedMessage;
      if (!replayMatches) fail('PRODUCTION_MUTATION_PREDECESSOR_MISMATCH', 'target ref moved away from exact admitted predecessor');
      return makeExecutionReceipt({ grant, resultCommitSha: current.sha, resultTreeSha: desiredTree.sha, replayed: true });
    }

    const parent = await this.transport.getCommit(predecessor);
    if (!parent || parent.sha !== predecessor || !SHA1_RE.test(parent.tree_sha ?? '')) fail('PRODUCTION_MUTATION_PREDECESSOR_INVALID', 'admitted predecessor commit metadata is invalid');
    if (parent.tree_sha === desiredTree.sha) fail('PRODUCTION_MUTATION_NOOP', 'mutation plan produces no tree change');

    const created = await this.transport.createCommit({
      parentSha: predecessor,
      treeSha: desiredTree.sha,
      message: expectedMessage
    });
    if (!created || !SHA1_RE.test(created.sha ?? '')) fail('PRODUCTION_MUTATION_COMMIT_INVALID', 'writer transport did not return a valid commit SHA');
    const createdCommit = await this.transport.getCommit(created.sha);
    if (!createdCommit || createdCommit.tree_sha !== desiredTree.sha || createdCommit.message !== expectedMessage || !Array.isArray(createdCommit.parents) || createdCommit.parents.length !== 1 || createdCommit.parents[0] !== predecessor) fail('PRODUCTION_MUTATION_COMMIT_VERIFY_FAILED', 'created commit does not match exact admitted predecessor/tree/message');

    const beforeUpdate = await this.transport.getRef(grant.target_ref);
    if (!beforeUpdate || beforeUpdate.sha !== predecessor) fail('PRODUCTION_MUTATION_CAS_LOST', 'target ref moved before exact-CAS update');
    try {
      await this.transport.updateRefFastForward(grant.target_ref, created.sha);
    } catch (error) {
      if (error?.code !== 'GITHUB_NETWORK_AMBIGUOUS') throw error;
      const observed = await this.transport.getRef(grant.target_ref);
      if (!observed || observed.sha !== created.sha) throw error;
    }
    const after = await this.transport.getRef(grant.target_ref);
    if (!after || after.sha !== created.sha) fail('PRODUCTION_MUTATION_POSTWRITE_VERIFY_FAILED', 'target ref does not equal exact created commit after CAS write');
    return makeExecutionReceipt({ grant, resultCommitSha: created.sha, resultTreeSha: desiredTree.sha, replayed: false });
  }
}

function encodeRefPath(ref) {
  return ref.split('/').map(encodeURIComponent).join('/');
}

function classifyStatus(status) {
  if (status === 401 || status === 403) return 'GITHUB_AUTH_FAILED';
  if (status === 404) return 'GITHUB_NOT_FOUND';
  if (status === 409 || status === 422) return 'GITHUB_REF_CONFLICT';
  if (status >= 500) return 'GITHUB_REMOTE_FAILURE';
  return 'GITHUB_HTTP_ERROR';
}

export class GitHubReceiptCasRestTransport {
  constructor({ owner, repo, tokenProvider, fetchImpl = globalThis.fetch, apiBase = 'https://api.github.com' }) {
    if (!owner || !repo) throw new TypeError('owner and repo are required');
    if (typeof tokenProvider !== 'function') throw new TypeError('production writer requires a dedicated tokenProvider function');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl function required');
    this.owner = owner;
    this.repo = repo;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(method, path, body = undefined) {
    const token = await this.tokenProvider();
    if (!token) fail('GITHUB_AUTH_FAILED', 'production writer tokenProvider returned no token');
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: ['Bearer', token].join(' '),
      'X-GitHub-Api-Version': '2026-03-10'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (cause) {
      throw new GitHubProductionMutationError('GITHUB_NETWORK_AMBIGUOUS', 'GitHub request failed before a definitive response', { cause });
    }
    const text = await response.text();
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    if (!response.ok) throw new GitHubProductionMutationError(classifyStatus(response.status), typeof parsed === 'object' && parsed?.message ? parsed.message : `GitHub API ${response.status}`, { status: response.status, body: parsed });
    return parsed;
  }

  async getRef(ref) {
    const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/ref/heads/${encodeRefPath(ref)}`);
    return { sha: result.object.sha };
  }

  async getCommit(sha) {
    const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/commits/${encodeURIComponent(sha)}`);
    return {
      sha: result.sha,
      tree_sha: result.tree.sha,
      parents: (result.parents || []).map((parent) => parent.sha),
      message: result.message
    };
  }

  async createBlob(content) {
    const result = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/blobs`, { content, encoding: 'utf-8' });
    return result.sha;
  }

  async createTreeFromPlan({ baseCommitSha, plan }) {
    validateProductionMutationPlan(plan);
    const parent = await this.getCommit(baseCommitSha);
    const entries = [];
    for (const write of plan.writes) {
      const blobSha = await this.createBlob(write.content_utf8);
      entries.push({ path: write.path, mode: '100644', type: 'blob', sha: blobSha });
    }
    for (const path of plan.deletes) entries.push({ path, mode: '100644', type: 'blob', sha: null });
    const tree = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/trees`, { base_tree: parent.tree_sha, tree: entries });
    return { sha: tree.sha };
  }

  async createCommit({ parentSha, treeSha, message }) {
    const commit = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/commits`, { message, tree: treeSha, parents: [parentSha] });
    return { sha: commit.sha };
  }

  async updateRefFastForward(ref, sha) {
    const result = await this.request('PATCH', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/refs/heads/${encodeRefPath(ref)}`, { sha, force: false });
    return { sha: result.object.sha };
  }
}
