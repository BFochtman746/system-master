#!/usr/bin/env node
'use strict';

/**
 * system-file-lease-enforce.js — fail-closed single-writer enforcement.
 *
 * Three distinct proofs are required:
 *  1. immutable per-commit System-File-Lease trailers for governed mutations;
 *  2. immutable durable lease-event provenance for every trailer; and
 *  3. PR-level single-writer admission so two open PRs cannot concurrently claim the
 *     same control-plane operation or the same protected path.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');

const LEASE_STATE_REF = 'control-gateway-state/system-file-leases';
const LEASE_EVENT_PROTOCOL = 'control-gateway.system-file-lease-event.v1';
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const GOVERNED = [
  /^governance\/CURRENT-AUTHORITY\.json$/,
  /^governance\/SYSTEM-TOPOLOGY-.*\.json$/,
  /^governance\/SYSTEM-PROGRAM-JOB-LOCK-.*\.json$/,
  /^governance\/SYSTEM-COMPLETION-STATUS-.*\.json$/,
  /^governance\/COMPLETION-LEDGER-.*\.json$/,
  /^governance\/WORK-OBLIGATION-REGISTRY-.*\.json$/,
  /^governance\/second-shift\//,
  /^governance\/control-gateway\//,
];

const OPERATION_ID_REQUIRED = [
  /^control-gateway\//,
  /^system-master\/control-gateway-lock\//,
  /^\.github\/scripts\/system-file-lease-enforce\.js$/,
  /^\.github\/workflows\/system-file-lease-enforcement\.yml$/,
  /^\.github\/scripts\/a01-second-shift-supervisor-v2-qualify\.js$/,
  /^tools\/second_shift_supervisor_v2\.py$/,
  /^tests\/test_control_gateway_a01_execution_worker\.py$/,
];

const TRAILER = /^System-File-Lease:\s*(\S+)@(\d+)\/(\S+)\s*$/;
const MUTATION_TRAILER = /^Control-Gateway-Mutation:\s*([A-Za-z0-9][A-Za-z0-9._:/-]{0,191})\s*$/;
const OPERATION_MARKER = /^System-Operation:\s*([A-Z0-9][A-Z0-9._-]{2,})\s*$/im;
const TITLE_OPERATION = /^([A-Z0-9]+(?:-[A-Z0-9]+){2,}):(?:\s|$)/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  throw new Error('LEASE_CANONICAL_INVALID');
}

function canonicalDigest(value, omittedField = null) {
  const copy = structuredClone(value);
  if (omittedField !== null) delete copy[omittedField];
  return createHash('sha256').update(canonical(copy), 'utf8').digest('hex');
}

function isGoverned(p) {
  return GOVERNED.some((rx) => rx.test(p));
}

function requiresOperationIdentity(p) {
  return OPERATION_ID_REQUIRED.some((rx) => rx.test(p));
}

function isSingleWriterPath(p) {
  return isGoverned(p) || requiresOperationIdentity(p);
}

function extractOperationId(pr) {
  const body = String(pr && pr.body || '');
  const marker = OPERATION_MARKER.exec(body);
  if (marker) return marker[1].toUpperCase();
  const title = String(pr && pr.title || '').trim();
  const inferred = TITLE_OPERATION.exec(title);
  return inferred ? inferred[1].toUpperCase() : null;
}

function resolveRange() {
  const base = process.env.GITHUB_BASE_REF;
  if (base) {
    try {
      const mb = git(['merge-base', `origin/${base}`, 'HEAD']).trim();
      if (mb) return `${mb}..HEAD`;
    } catch (_) { /* fall through */ }
  }
  if (process.env.LEASE_AUDIT_RANGE) return process.env.LEASE_AUDIT_RANGE;
  try {
    const parents = git(['show', '-s', '--format=%P', 'HEAD']).trim().split(/\s+/).filter(Boolean);
    if (parents.length === 2) return `${parents[0]}..${parents[1]}`;
  } catch (_) { /* fall through */ }
  return 'HEAD~1..HEAD';
}

function changedFiles(range) {
  return git(['diff', '--name-only', range])
    .split('\n').map((s) => s.trim()).filter(Boolean);
}

function buildPrViolations(currentPr, currentFiles, otherPrs, otherFilesByNumber = new Map()) {
  const violations = [];
  const operation = extractOperationId(currentPr);
  const operationRequired = currentFiles.some(requiresOperationIdentity);

  if (operationRequired && !operation) {
    violations.push({
      reason: 'SYSTEM_OPERATION_ID_REQUIRED',
      detail: 'Add `System-Operation: <stable-operation-id>` to the PR body or use a canonical operation-id title prefix.',
    });
  }

  const protectedCurrent = new Set(currentFiles.filter(isSingleWriterPath));
  for (const other of otherPrs) {
    if (!other || Number(other.number) === Number(currentPr.number)) continue;
    const otherOperation = extractOperationId(other);
    if (operation && otherOperation === operation) {
      violations.push({
        reason: 'DUPLICATE_OPEN_OPERATION_WRITER',
        detail: `operation=${operation} already claimed by PR #${other.number}`,
      });
    }

    if (protectedCurrent.size === 0) continue;
    const otherFiles = otherFilesByNumber.get(Number(other.number)) || [];
    const overlap = [...new Set(otherFiles.filter(isSingleWriterPath))]
      .filter((p) => protectedCurrent.has(p));
    for (const path of overlap) {
      violations.push({
        reason: 'DUPLICATE_OPEN_PATH_WRITER',
        detail: `${path} already changed by open PR #${other.number}`,
      });
    }
  }
  return violations;
}

function readPullRequestEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  if (!event.pull_request) return null;
  return {
    number: event.pull_request.number,
    title: event.pull_request.title,
    body: event.pull_request.body || '',
    base: event.pull_request.base && event.pull_request.base.ref,
  };
}

async function githubJson(path) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN_MISSING_FOR_LEASE_AUDIT');
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: ['Bearer', token].join(' '),
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'system-master-single-writer-gate',
    },
  });
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
  if (!response.ok) {
    const error = new Error(`GITHUB_API_${response.status}:${path}`);
    error.status = response.status;
    error.body = parsed;
    throw error;
  }
  return parsed;
}

function encodeRefPath(ref) {
  return ref.split('/').map(encodeURIComponent).join('/');
}

function encodeContentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function listOpenPrs(repo, base) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await githubJson(`/repos/${repo}/pulls?state=open&base=${encodeURIComponent(base || 'main')}&per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function listPrFiles(repo, number) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await githubJson(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    out.push(...batch.map((f) => f.filename));
    if (batch.length < 100) break;
  }
  return out;
}

function leaseEventPath(mutationId, path) {
  return `system-file-leases/events/${sha256(mutationId)}/${sha256(path)}.json`;
}

function parseCommitLeaseProof(message) {
  const receipts = new Map();
  const violations = [];
  let mutationId = null;
  for (const raw of String(message).split('\n')) {
    const line = raw.trim();
    const mutation = MUTATION_TRAILER.exec(line);
    if (mutation) {
      if (mutationId !== null) violations.push({ reason: 'DUPLICATE_CONTROL_GATEWAY_MUTATION_TRAILER' });
      mutationId = mutation[1];
      continue;
    }
    const lease = TRAILER.exec(line);
    if (lease) {
      if (receipts.has(lease[1])) violations.push({ path: lease[1], reason: 'DUPLICATE_LEASE_RECEIPT' });
      receipts.set(lease[1], { epoch: Number(lease[2]), fence: lease[3] });
    }
  }
  return { mutationId, receipts, violations };
}

function validateLeaseEventProof({ event, path, mutationId, receipt, parentSha, commitSha, commitTime }) {
  const violations = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) return [{ path, reason: 'LEASE_EVENT_INVALID' }];
  if (event.protocol_version !== LEASE_EVENT_PROTOCOL || event.path !== path || event.mutation_id !== mutationId) violations.push({ path, reason: 'LEASE_EVENT_INVALID' });
  if (!event.holder || typeof event.holder !== 'object' || typeof event.holder.workstream_id !== 'string' || !event.holder.workstream_id || typeof event.holder.operation_id !== 'string' || !event.holder.operation_id || event.holder.mutation_id !== mutationId) violations.push({ path, reason: 'LEASE_MUTATION_BINDING_MISMATCH' });
  if (typeof event.target_ref !== 'string' || !event.target_ref) violations.push({ path, reason: 'LEASE_TARGET_REF_INVALID' });
  if (event.expected_predecessor_sha !== parentSha) violations.push({ path, reason: 'LEASE_PREDECESSOR_BINDING_MISMATCH' });
  if (event.result_commit_sha !== commitSha) violations.push({ path, reason: 'LEASE_RESULT_COMMIT_BINDING_MISMATCH' });
  if (!Number.isSafeInteger(event.path_revision) || event.path_revision < 1 || !Number.isSafeInteger(event.lease_epoch) || event.lease_epoch < 1) violations.push({ path, reason: 'LEASE_EVENT_COUNTER_INVALID' });
  if (event.lease_epoch !== receipt.epoch || event.fence_token !== receipt.fence) violations.push({ path, reason: 'LEASE_TRAILER_BINDING_MISMATCH' });
  if (!SHA256.test(event.fence_token || '') || !SHA256.test(event.acquisition_record_digest || '') || !SHA256.test(event.release_record_digest || '') || !SHA256.test(event.event_digest || '') || event.event_digest !== canonicalDigest(event, 'event_digest')) violations.push({ path, reason: 'LEASE_EVENT_DIGEST_INVALID' });
  if (!SHA1.test(event.acquisition_commit_sha || '')) violations.push({ path, reason: 'LEASE_ACQUISITION_COMMIT_INVALID' });
  const acquired = Date.parse(event.acquired_at);
  const expires = Date.parse(event.expires_at);
  const released = Date.parse(event.released_at);
  const committed = Date.parse(commitTime);
  if (!Number.isFinite(acquired) || !Number.isFinite(expires) || !Number.isFinite(released) || !Number.isFinite(committed) || committed < acquired || committed >= expires || released < committed) violations.push({ path, reason: 'LEASE_NOT_LIVE_AT_COMMIT' });
  return violations;
}

async function githubFileAtRef(repo, path, ref) {
  try {
    const result = await githubJson(`/repos/${repo}/contents/${encodeContentPath(path)}?ref=${encodeURIComponent(ref)}`);
    if (!result || result.type !== 'file' || result.encoding !== 'base64') throw new Error(`LEASE_CONTENT_INVALID:${path}@${ref}`);
    return Buffer.from(String(result.content).replace(/\n/g, ''), 'base64').toString('utf8');
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function canonicalLeaseStateHead(repo) {
  const result = await githubJson(`/repos/${repo}/git/ref/heads/${encodeRefPath(LEASE_STATE_REF)}`);
  const sha = result && result.object && result.object.sha;
  if (!SHA1.test(sha || '')) throw new Error('LEASE_STATE_HEAD_INVALID');
  return sha;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function readLeaseEventWithRetry(repo, mutationId, path, headCache, delays = [0, 250, 500, 1000, 2000, 4000, 8000]) {
  for (const delay of delays) {
    if (delay) await sleep(delay);
    const head = await canonicalLeaseStateHead(repo);
    headCache.value = head;
    const raw = await githubFileAtRef(repo, leaseEventPath(mutationId, path), head);
    if (raw !== null) return JSON.parse(raw);
  }
  return null;
}

async function auditCommitReceipts(range) {
  let shas;
  try {
    shas = git(['rev-list', range]).trim().split('\n').filter(Boolean);
  } catch (_) {
    throw new Error(`LEASE_AUDIT_RANGE_UNRESOLVABLE:${range}`);
  }

  const violations = [];
  let auditedCommits = 0;
  let governedMutations = 0;
  const repo = process.env.GITHUB_REPOSITORY;
  const leaseStateHeadCache = { value: null };
  for (const sha of shas) {
    const files = git(['show', '--name-only', '--format=', sha])
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const governed = files.filter(isGoverned);
    if (governed.length === 0) continue;

    auditedCommits++;
    governedMutations += governed.length;
    const parents = git(['show', '-s', '--format=%P', sha]).trim().split(/\s+/).filter(Boolean);
    if (parents.length !== 1) {
      for (const path of governed) violations.push({ sha: sha.slice(0, 8), path, reason: 'LEASE_PROVENANCE_REQUIRES_SINGLE_PARENT_COMMIT' });
      continue;
    }
    const message = git(['show', '-s', '--format=%B', sha]);
    const proof = parseCommitLeaseProof(message);
    for (const v of proof.violations) violations.push({ sha: sha.slice(0, 8), ...v });
    if (!proof.mutationId) violations.push({ sha: sha.slice(0, 8), reason: 'CONTROL_GATEWAY_MUTATION_TRAILER_REQUIRED' });
    if (!repo) violations.push({ sha: sha.slice(0, 8), reason: 'GITHUB_REPOSITORY_MISSING_FOR_LEASE_PROVENANCE' });

    const commitTime = git(['show', '-s', '--format=%cI', sha]).trim();
    for (const path of governed) {
      const receipt = proof.receipts.get(path);
      if (!receipt) { violations.push({ sha: sha.slice(0, 8), path, reason: 'NO_LEASE_RECEIPT' }); continue; }
      if (!(receipt.epoch >= 1)) { violations.push({ sha: sha.slice(0, 8), path, reason: `INVALID_EPOCH:${receipt.epoch}` }); continue; }
      if (!SHA256.test(receipt.fence)) { violations.push({ sha: sha.slice(0, 8), path, reason: 'FENCE_TOKEN_INVALID' }); continue; }
      if (!proof.mutationId || !repo) continue;
      try {
        const event = await readLeaseEventWithRetry(repo, proof.mutationId, path, leaseStateHeadCache);
        if (!event) { violations.push({ sha: sha.slice(0, 8), path, reason: 'LEASE_EVENT_NOT_FOUND' }); continue; }
        for (const v of validateLeaseEventProof({ event, path, mutationId: proof.mutationId, receipt, parentSha: parents[0], commitSha: sha, commitTime })) violations.push({ sha: sha.slice(0, 8), ...v });
      } catch (error) {
        violations.push({ sha: sha.slice(0, 8), path, reason: 'LEASE_EVENT_PROVENANCE_UNAVAILABLE', detail: error.message });
      }
    }
  }

  console.log(`system-file-lease-enforce range=${range} commits_touching_governed=${auditedCommits} governed_mutations=${governedMutations}`);
  return violations;
}

async function auditPrSingleWriter(range) {
  const currentPr = readPullRequestEvent();
  if (!currentPr) {
    console.log('SKIP pr-single-writer: not a pull_request event');
    return [];
  }

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY_MISSING_FOR_PR_SINGLE_WRITER_AUDIT');
  const files = changedFiles(range);
  const openPrs = await listOpenPrs(repo, currentPr.base || 'main');
  const others = openPrs.filter((pr) => Number(pr.number) !== Number(currentPr.number));
  const protectedCurrent = files.filter(isSingleWriterPath);
  const otherFilesByNumber = new Map();
  if (protectedCurrent.length > 0) {
    for (const other of others) {
      otherFilesByNumber.set(Number(other.number), await listPrFiles(repo, other.number));
    }
  }

  const violations = buildPrViolations(currentPr, files, others, otherFilesByNumber);
  console.log(`pr-single-writer pr=${currentPr.number} operation=${extractOperationId(currentPr) || 'NONE'} protected_paths=${protectedCurrent.length} competing_open_prs=${others.length}`);
  return violations;
}

async function main() {
  const range = resolveRange();
  const violations = [...await auditCommitReceipts(range)];
  try {
    violations.push(...await auditPrSingleWriter(range));
  } catch (error) {
    violations.push({ reason: 'PR_SINGLE_WRITER_AUDIT_UNAVAILABLE', detail: error.message });
  }

  if (violations.length > 0) {
    console.log(`FAIL system-file-lease-enforce violations=${violations.length}`);
    for (const v of violations) {
      const prefix = v.sha && v.path ? `${v.sha} ${v.path}` : (v.sha || 'PR');
      console.log(`  ${prefix} -> ${v.reason}${v.detail ? `: ${v.detail}` : ''}`);
    }
    process.exit(1);
  }

  console.log('PASS system-file-lease-enforce');
}

module.exports = {
  buildPrViolations,
  canonicalDigest,
  extractOperationId,
  isGoverned,
  isSingleWriterPath,
  leaseEventPath,
  parseCommitLeaseProof,
  requiresOperationIdentity,
  validateLeaseEventProof,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAIL system-file-lease-enforce fatal=${error.stack || error}`);
    process.exit(1);
  });
}
