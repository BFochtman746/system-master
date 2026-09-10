'use strict';

const base = require('./author-decision-queue.js');
const vr = require('./version-and-rollback.js');

const GUARD_ID = 'BOOK-SYSTEM-AUTHOR-DECISION-CURRENT-SUBJECT-GUARD-001';
const TERMINAL_STATES = new Set(['SUPERSEDED','RESOLVED','WITHDRAWN']);
const APPEND_ONLY = [
  ['research_evidence_links','link_id'],
  ['author_decisions','decision_id'],
  ['integration_proposals','proposal_id'],
  ['export_releases','release_id'],
];

class AuthorDecisionCurrentSubjectGuardError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'AuthorDecisionCurrentSubjectGuardError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new AuthorDecisionCurrentSubjectGuardError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function key(ref) { return `${String(ref.object_id)}|${String(ref.object_version)}|${String(ref.object_digest)}`; }
function recordKey(record) { return `${record.object_id}|${record.object_version}|${record.object_digest}`; }
function pointerMatches(record, ref) {
  return typeof ref === 'string' && (ref === record.object_id || ref === `${record.object_id}:${record.object_version}`);
}
function validDigest(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }

function assertIdentityExists(parentState, refs, records) {
  if (!Array.isArray(refs) || refs.length === 0) fail('SUBJECT_IDENTITY_REFS_REQUIRED');
  const governed = new Set(records.map(recordKey));
  const appendOnly = new Set();
  for (const [collection,idField] of APPEND_ONLY) {
    for (const item of parentState[collection] || []) {
      const id = String(item && item[idField] || '');
      if (id) appendOnly.add(`${id}|UNVERSIONED|${vr.digest(item)}`);
    }
  }
  appendOnly.add(`${parentState.book_project.book_project_id}|STATE-${parentState.state_version}|${vr.digest(parentState.book_project)}`);
  const seen = new Set();
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) fail('INVALID_SUBJECT_IDENTITY_REF');
    if (!String(ref.object_id || '').trim() || !String(ref.object_version || '').trim() || !validDigest(ref.object_digest)) fail('INVALID_SUBJECT_IDENTITY_REF');
    const k = key(ref);
    if (seen.has(k)) fail('DUPLICATE_SUBJECT_IDENTITY_REF', k);
    seen.add(k);
    if (!governed.has(k) && !appendOnly.has(k)) fail('SUBJECT_IDENTITY_NOT_CURRENT', `${ref.object_id}:${ref.object_version}`);
  }
}

function strictSubjectCurrent(parentState, refs) {
  vr.validateParentState(parentState);
  const records = vr.objectRecords(parentState);
  assertIdentityExists(parentState, refs, records);
  for (const ref of refs) {
    const exact = records.find(r => recordKey(r) === key(ref));
    if (!exact) continue;
    const pointer = exact.meta.pointer;
    const activeRef = parentState.active[pointer];
    const active = records.filter(r => r.meta.pointer === pointer && pointerMatches(r, activeRef));
    if (active.length !== 1 || active[0].node_id !== exact.node_id) return false;
  }
  return true;
}

function strictSubjectCurrentOrFalse(parentState, refs) {
  try { return strictSubjectCurrent(parentState, refs); }
  catch (e) {
    if (e && e.code === 'SUBJECT_IDENTITY_NOT_CURRENT') return false;
    throw e;
  }
}

function assertStrictSubjectCurrent(parentState, refs) {
  if (!strictSubjectCurrentOrFalse(parentState, refs)) fail('AUTHOR_DECISION_SUBJECT_NOT_CURRENT');
  return true;
}

function overlayFor(ledger) {
  if (!ledger.strict_currentness_overrides || typeof ledger.strict_currentness_overrides !== 'object' || Array.isArray(ledger.strict_currentness_overrides)) {
    ledger.strict_currentness_overrides = {};
  }
  return ledger.strict_currentness_overrides;
}

function currentSnapshot(queueLedger, decisionRequestId) {
  const snap = queueLedger && queueLedger.decision_request_snapshots && queueLedger.decision_request_snapshots[decisionRequestId];
  if (!snap) fail('DECISION_REQUEST_NOT_FOUND', String(decisionRequestId));
  return snap;
}

function effectiveDecisionState(queueLedger, decisionRequestId) {
  const snap = currentSnapshot(queueLedger, decisionRequestId);
  const overlay = queueLedger.strict_currentness_overrides && queueLedger.strict_currentness_overrides[decisionRequestId];
  return overlay && overlay.effective_state === 'STALE' ? 'STALE' : snap.queue_state;
}

function enqueueDecision(args) {
  assertStrictSubjectCurrent(args.parentState, args.request && args.request.subject_identity_refs);
  return base.enqueueDecision(args);
}

function presentDecision(args) {
  const snap = currentSnapshot(args.queueLedger, args.request && args.request.decision_request_id);
  assertStrictSubjectCurrent(args.parentState, snap.subject_identity_refs);
  return base.presentDecision(args);
}

function reopenDecision(args) {
  const snap = currentSnapshot(args.queueLedger, args.request && args.request.decision_request_id);
  assertStrictSubjectCurrent(args.parentState, snap.subject_identity_refs);
  return base.reopenDecision(args);
}

function resolveDecision(args) {
  const snap = currentSnapshot(args.queueLedger, args.request && args.request.decision_request_id);
  const overlay = args.queueLedger.strict_currentness_overrides && args.queueLedger.strict_currentness_overrides[snap.decision_request_id];
  if (overlay && overlay.effective_state === 'STALE') fail('AUTHOR_DECISION_SUBJECT_NOT_CURRENT', snap.decision_request_id);
  assertStrictSubjectCurrent(args.parentState, snap.subject_identity_refs);
  return base.resolveDecision(args);
}

function revalidateAgainstParent(args) {
  const strictStaleFamilies = [];
  for (const [familyId, requestId] of Object.entries((args.queueLedger && args.queueLedger.current_request_index) || {})) {
    const snap = args.queueLedger.decision_request_snapshots && args.queueLedger.decision_request_snapshots[requestId];
    if (!snap || TERMINAL_STATES.has(snap.queue_state) || snap.queue_state === 'STALE') continue;
    if (!strictSubjectCurrentOrFalse(args.currentParentState, snap.subject_identity_refs)) {
      strictStaleFamilies.push({ familyId, originalRequestId: requestId });
    }
  }

  const out = base.revalidateAgainstParent(args);
  const next = clone(out.queue_ledger);
  const overlays = overlayFor(next);
  const staleIds = [];
  for (const item of strictStaleFamilies) {
    const currentRequestId = next.current_request_index && next.current_request_index[item.familyId];
    const idsToOverlay = [...new Set([item.originalRequestId, currentRequestId].filter(Boolean))];
    for (const requestId of idsToOverlay) {
      const snap = next.decision_request_snapshots && next.decision_request_snapshots[requestId];
      if (!snap || TERMINAL_STATES.has(snap.queue_state)) continue;
      overlays[requestId] = {
        effective_state: 'STALE',
        staleness_reason: 'ACTIVE_GOVERNED_SUBJECT_CHANGED_OR_REMOVED',
        observed_parent_state_version: args.currentParentState.state_version,
        observed_parent_state_digest: args.currentParentState.state_digest,
        guard_id: GUARD_ID,
      };
    }
    if (next.decision_request_snapshots && next.decision_request_snapshots[item.originalRequestId]) staleIds.push(item.originalRequestId);
  }
  base.validateQueueLedger(next, args.currentParentState);
  return {
    ...out,
    queue_ledger: next,
    strict_stale_request_ids: [...new Set(staleIds)].sort(),
    disposition: staleIds.length ? 'REVALIDATED_WITH_STRICT_STALENESS' : out.disposition,
  };
}

module.exports = {
  ...base,
  GUARD_ID,
  AuthorDecisionCurrentSubjectGuardError,
  strictSubjectCurrent,
  assertStrictSubjectCurrent,
  effectiveDecisionState,
  enqueueDecision,
  presentDecision,
  reopenDecision,
  resolveDecision,
  revalidateAgainstParent,
};
