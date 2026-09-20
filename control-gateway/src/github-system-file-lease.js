import { createHash, randomBytes } from 'node:crypto';

export const SYSTEM_FILE_LEASE_STATE_REF = 'control-gateway-state/system-file-leases';
export const SYSTEM_FILE_LEASE_PROTOCOL = 'control-gateway.system-file-lease.v1';
export const SYSTEM_FILE_LEASE_EVENT_PROTOCOL = 'control-gateway.system-file-lease-event.v1';
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class GitHubSystemFileLeaseError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'GitHubSystemFileLeaseError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const fail = (code, message, details) => { throw new GitHubSystemFileLeaseError(code, message, details); };
const canon = (v) => {
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  fail('LEASE_CANONICAL_INVALID', 'unsupported canonical value');
};
const digest = (v) => createHash('sha256').update(typeof v === 'string' ? v : canon(v), 'utf8').digest('hex');
const digestWithout = (v, key) => { const copy = structuredClone(v); delete copy[key]; return digest(copy); };
const iso = (value) => { const d = value instanceof Date ? value : new Date(value); if (!Number.isFinite(d.getTime())) fail('LEASE_TIME_INVALID', 'invalid time'); return d; };
const pathOk = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((x) => x && x !== '.' && x !== '..');
const holderKey = (h) => [h.workstream_id, h.operation_id, h.mutation_id].join('|');
const sameHolder = (a, b) => a && holderKey(a) === holderKey(b);
const normalizePaths = (paths) => {
  if (!Array.isArray(paths) || paths.length === 0) fail('LEASE_SCHEMA_INVALID', 'paths required');
  const out = [...paths].sort();
  for (let i = 0; i < out.length; i += 1) {
    if (!pathOk(out[i])) fail('LEASE_PATH_INVALID', 'invalid path ' + out[i]);
    if (i && out[i] === out[i - 1]) fail('LEASE_SCHEMA_INVALID', 'duplicate path ' + out[i]);
  }
  return out;
};
const validateHolder = (h) => {
  if (!h || typeof h !== 'object') fail('LEASE_SCHEMA_INVALID', 'holder required');
  for (const k of ['workstream_id', 'operation_id', 'mutation_id']) if (typeof h[k] !== 'string' || !h[k]) fail('LEASE_SCHEMA_INVALID', 'holder.' + k + ' required');
  return h;
};

export const systemFileLeaseRecordPath = (path) => {
  if (!pathOk(path)) fail('LEASE_PATH_INVALID', 'invalid path');
  return 'system-file-leases/records/' + digest(path) + '.json';
};
export const systemFileLeaseEventPath = (mutationId, path) => {
  if (typeof mutationId !== 'string' || !mutationId || !pathOk(path)) fail('LEASE_PATH_INVALID', 'invalid event identity');
  return 'system-file-leases/events/' + digest(mutationId) + '/' + digest(path) + '.json';
};

function parseRecord(raw, expectedPath) {
  if (raw === null) return null;
  let r;
  try { r = JSON.parse(raw); } catch { fail('LEASE_RECORD_INVALID', 'record JSON invalid'); }
  if (r.protocol_version !== SYSTEM_FILE_LEASE_PROTOCOL || r.path !== expectedPath || !SHA256.test(r.record_digest || '') || r.record_digest !== digestWithout(r, 'record_digest')) fail('LEASE_RECORD_INVALID', 'record invalid');
  if (!Number.isSafeInteger(r.path_revision) || r.path_revision < 0 || !Number.isSafeInteger(r.lease_epoch) || r.lease_epoch < 1) fail('LEASE_RECORD_INVALID', 'record counters invalid');
  if (!['HELD', 'RELEASED'].includes(r.state) || !SHA256.test(r.fence_token || '') || !SHA1.test(r.expected_predecessor_sha || '')) fail('LEASE_RECORD_INVALID', 'record authority invalid');
  return r;
}

function heldRecord(previous, path, holder, targetRef, predecessor, now, expires, fence) {
  const r = {
    protocol_version: SYSTEM_FILE_LEASE_PROTOCOL,
    path,
    path_revision: previous ? previous.path_revision : 0,
    lease_epoch: previous ? previous.lease_epoch + 1 : 1,
    state: 'HELD', holder: structuredClone(holder), target_ref: targetRef,
    expected_predecessor_sha: predecessor, fence_token: fence,
    acquired_at: now.toISOString(), expires_at: expires.toISOString(), result_commit_sha: null,
    prior_record_digest: previous ? previous.record_digest : null, record_digest: ''
  };
  r.record_digest = digestWithout(r, 'record_digest');
  return r;
}

function releasedRecord(held, result) {
  const r = { ...structuredClone(held), path_revision: held.path_revision + 1, state: 'RELEASED', result_commit_sha: result, prior_record_digest: held.record_digest, record_digest: '' };
  r.record_digest = digestWithout(r, 'record_digest');
  return r;
}

function eventRecord(held, released, acquisitionCommit, releasedAt) {
  const e = {
    protocol_version: SYSTEM_FILE_LEASE_EVENT_PROTOCOL,
    mutation_id: held.holder.mutation_id, path: held.path, holder: structuredClone(held.holder),
    target_ref: held.target_ref, expected_predecessor_sha: held.expected_predecessor_sha,
    result_commit_sha: released.result_commit_sha, path_revision: released.path_revision,
    lease_epoch: held.lease_epoch, fence_token: held.fence_token, acquired_at: held.acquired_at,
    expires_at: held.expires_at, released_at: releasedAt.toISOString(),
    acquisition_commit_sha: acquisitionCommit, acquisition_record_digest: held.record_digest,
    release_record_digest: released.record_digest, event_digest: ''
  };
  e.event_digest = digestWithout(e, 'event_digest');
  return e;
}

export class GitHubSystemFileLeaseCoordinator {
  constructor({ transport, stateRef = SYSTEM_FILE_LEASE_STATE_REF, ttlMs = 600000, maxCasAttempts = 3, randomBytesFn = randomBytes }) {
    for (const m of ['getRef', 'getCommit', 'readFile', 'createCommitFromFiles', 'updateRefFastForward']) if (typeof transport?.[m] !== 'function') throw new TypeError('transport.' + m + ' required');
    this.transport = transport; this.stateRef = stateRef; this.ttlMs = ttlMs; this.maxCasAttempts = maxCasAttempts; this.randomBytesFn = randomBytesFn;
  }

  async records(commit, paths) {
    const out = [];
    for (const p of paths) out.push(parseRecord(await this.transport.readFile(commit, systemFileLeaseRecordPath(p)), p));
    return out;
  }

  async acquire({ paths, holder, targetRef, expectedPredecessorSha, now = new Date() }) {
    paths = normalizePaths(paths); validateHolder(holder);
    if (!SHA1.test(expectedPredecessorSha || '')) fail('LEASE_SCHEMA_INVALID', 'expected predecessor invalid');
    const moment = iso(now);
    const target = await this.transport.getRef(targetRef);
    if (!target || target.sha !== expectedPredecessorSha) fail('LEASE_TARGET_PREDECESSOR_MISMATCH', 'target moved before lease');
    for (let attempt = 1; attempt <= this.maxCasAttempts; attempt += 1) {
      const head = await this.transport.getRef(this.stateRef); if (!head || !SHA1.test(head.sha || '')) fail('LEASE_STATE_REF_INVALID', 'state ref invalid');
      const prior = await this.records(head.sha, paths);
      const replay = prior.every((r) => r && r.state === 'HELD' && sameHolder(r.holder, holder) && r.target_ref === targetRef && r.expected_predecessor_sha === expectedPredecessorSha && moment.getTime() < Date.parse(r.expires_at));
      if (replay) return this.acquisitionReceipt(head.sha, targetRef, expectedPredecessorSha, holder, prior, true);
      if (prior.some((r) => r && r.state === 'HELD' && sameHolder(r.holder, holder))) fail('LEASE_SET_INCONSISTENT', 'partial replay set');
      for (const r of prior) if (r && r.state === 'HELD' && moment.getTime() < Date.parse(r.expires_at)) fail('SYSTEM_FILE_LOCKED', 'path held by ' + r.holder.mutation_id, { path: r.path, holder: r.holder });
      const expires = new Date(moment.getTime() + this.ttlMs);
      const next = paths.map((p, i) => heldRecord(prior[i], p, holder, targetRef, expectedPredecessorSha, moment, expires, this.randomBytesFn(32).toString('hex')));
      const files = Object.fromEntries(next.map((r) => [systemFileLeaseRecordPath(r.path), canon(r) + '\n']));
      const created = await this.transport.createCommitFromFiles({ parentSha: head.sha, files, message: 'system-file-lease acquire ' + holder.mutation_id });
      const meta = created && await this.transport.getCommit(created.sha);
      if (!created || !SHA1.test(created.sha || '') || !meta || meta.parents?.[0] !== head.sha) fail('LEASE_STATE_COMMIT_INVALID', 'acquisition commit invalid');
      try { await this.transport.updateRefFastForward(this.stateRef, created.sha); }
      catch (error) { const observed = await this.transport.getRef(this.stateRef).catch(() => null); if (observed?.sha !== created.sha) { if (attempt === this.maxCasAttempts) fail('LEASE_STATE_CAS_LOST', 'acquisition CAS lost'); continue; } }
      return this.acquisitionReceipt(created.sha, targetRef, expectedPredecessorSha, holder, next, false);
    }
    fail('LEASE_STATE_CAS_LOST', 'acquisition retries exhausted');
  }

  acquisitionReceipt(stateCommit, targetRef, predecessor, holder, records, replay) {
    const r = { protocol_version: 'control-gateway.system-file-lease-acquisition.v1', state_ref: this.stateRef, state_commit_sha: stateCommit, target_ref: targetRef, expected_predecessor_sha: predecessor, holder: structuredClone(holder), leases: records.map((x) => ({ path:x.path, path_revision:x.path_revision, lease_epoch:x.lease_epoch, fence_token:x.fence_token, record_digest:x.record_digest, expires_at:x.expires_at })), idempotent_replay: replay, receipt_digest: '' };
    r.receipt_digest = digestWithout(r, 'receipt_digest'); return Object.freeze(r);
  }

  async requireAuthority(receipt, { now = new Date() } = {}) {
    const moment = iso(now); const target = await this.transport.getRef(receipt.target_ref);
    if (!target || target.sha !== receipt.expected_predecessor_sha) fail('LEASE_TARGET_MOVED', 'target moved after acquisition');
    const head = await this.transport.getRef(receipt.state_ref); const current = await this.records(head.sha, receipt.leases.map((x) => x.path));
    for (let i = 0; i < current.length; i += 1) {
      const r = current[i], l = receipt.leases[i];
      if (!r || r.state !== 'HELD' || !sameHolder(r.holder, receipt.holder) || r.lease_epoch !== l.lease_epoch || r.fence_token !== l.fence_token || r.record_digest !== l.record_digest) fail('FENCED_STALE_EXECUTOR', 'lease fence stale for ' + l.path);
      if (moment.getTime() >= Date.parse(r.expires_at)) fail('LEASE_EXPIRED', 'lease expired for ' + l.path);
    }
    return true;
  }

  async release(receipt, { resultCommitSha, now = new Date() }) {
    if (!SHA1.test(resultCommitSha || '')) fail('LEASE_SCHEMA_INVALID', 'result commit invalid'); const moment = iso(now);
    const target = await this.transport.getRef(receipt.target_ref); if (!target || target.sha !== resultCommitSha) fail('LEASE_RESULT_NOT_CURRENT', 'result commit not current');
    for (let attempt = 1; attempt <= this.maxCasAttempts; attempt += 1) {
      const head = await this.transport.getRef(receipt.state_ref); const paths = receipt.leases.map((x) => x.path); const current = await this.records(head.sha, paths);
      const replay = current.every((r, i) => r && r.state === 'RELEASED' && sameHolder(r.holder, receipt.holder) && r.lease_epoch === receipt.leases[i].lease_epoch && r.fence_token === receipt.leases[i].fence_token && r.result_commit_sha === resultCommitSha);
      if (replay) return Object.freeze({ protocol_version:'control-gateway.system-file-lease-release.v1', state_ref:receipt.state_ref, state_commit_sha:head.sha, result_commit_sha:resultCommitSha, idempotent_replay:true });
      const released = [], events = [];
      for (let i = 0; i < current.length; i += 1) {
        const r = current[i], l = receipt.leases[i];
        if (!r || r.state !== 'HELD' || !sameHolder(r.holder, receipt.holder) || r.lease_epoch !== l.lease_epoch || r.fence_token !== l.fence_token || r.record_digest !== l.record_digest) fail('FENCED_STALE_EXECUTOR', 'lease fence stale for ' + l.path);
        if (moment.getTime() >= Date.parse(r.expires_at)) fail('LEASE_EXPIRED', 'lease expired before release for ' + l.path);
        const rr = releasedRecord(r, resultCommitSha); released.push(rr); events.push(eventRecord(r, rr, receipt.state_commit_sha, moment));
      }
      const files = {};
      for (const r of released) files[systemFileLeaseRecordPath(r.path)] = canon(r) + '\n';
      for (const e of events) {
        const p = systemFileLeaseEventPath(e.mutation_id, e.path); const existing = await this.transport.readFile(head.sha, p);
        if (existing !== null && canon(JSON.parse(existing)) !== canon(e)) fail('LEASE_EVENT_CONFLICT', 'immutable event conflict for ' + e.path);
        files[p] = canon(e) + '\n';
      }
      const created = await this.transport.createCommitFromFiles({ parentSha:head.sha, files, message:'system-file-lease release ' + receipt.holder.mutation_id + ' ' + resultCommitSha });
      const meta = created && await this.transport.getCommit(created.sha); if (!created || !SHA1.test(created.sha || '') || !meta || meta.parents?.[0] !== head.sha) fail('LEASE_STATE_COMMIT_INVALID', 'release commit invalid');
      try { await this.transport.updateRefFastForward(receipt.state_ref, created.sha); }
      catch (error) { const observed = await this.transport.getRef(receipt.state_ref).catch(() => null); if (observed?.sha !== created.sha) { if (attempt === this.maxCasAttempts) fail('LEASE_STATE_CAS_LOST', 'release CAS lost'); continue; } }
      return Object.freeze({ protocol_version:'control-gateway.system-file-lease-release.v1', state_ref:receipt.state_ref, state_commit_sha:created.sha, result_commit_sha:resultCommitSha, idempotent_replay:false });
    }
    fail('LEASE_STATE_CAS_LOST', 'release retries exhausted');
  }
}
