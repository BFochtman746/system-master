'use strict';

const vr = require('./version-and-rollback.js');

class AuthorDecisionQueueError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'AuthorDecisionQueueError';
    this.code = code;
  }
}

const QUEUE_STATES = new Set(['PENDING','PRESENTED','DEFERRED','STALE','SUPERSEDED','RESOLVED','WITHDRAWN']);
const TERMINAL_STATES = new Set(['SUPERSEDED','RESOLVED','WITHDRAWN']);
const SOURCE_KINDS = new Set(['INTEGRATION_RUNTIME_HANDOFF','LIFECYCLE_GATE_REQUIREMENT','EDITORIAL_STAGE_REQUIREMENT','EXPORT_PUBLICATION_REQUIREMENT','PARENT_DIRECT_AUTHOR_QUERY']);
const CONFIRMATION_POLICIES = new Set(['NONE','REVIEW_SELECTED_CHOICE','REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE']);
const CANONICAL_STATUSES = new Set(['APPROVED','REJECTED']);
const CONSEQUENCE_RANK = {
  ROUTINE_REVERSIBLE: 0,
  MATERIAL_REVISION: 1,
  CANON_OR_INTENT: 1,
  PROTECTED_LANGUAGE: 1,
  FINALIZATION: 1,
  PUBLICATION_OR_RELEASE: 2,
};
const RANK_POLICY = ['NONE','REVIEW_SELECTED_CHOICE','REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE'];

function fail(code, detail = '') { throw new AuthorDecisionQueueError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const f of fields) if (!own(v, f)) fail('REQUIRED_FIELD_MISSING', `${label}.${f}`);
}
function digest(v) { return vr.digest(v); }
function stable(v) { return vr.stableStringify(v); }
function makeId(prefix, seed, n = 28) { return `${prefix}-${digest(seed).slice(0, n).toUpperCase()}`; }
function uniq(values) { return [...new Set((values || []).map(String))].sort(); }
function isSha256(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }

function normalizedLedgerForDigest(ledger) {
  const x = clone(ledger);
  for (const receipt of Object.values(x.resolution_receipts || {})) {
    if (own(receipt, 'post_queue_ledger_digest')) receipt.post_queue_ledger_digest = '__SELF__';
  }
  return x;
}
function digestQueueLedger(ledger) { return digest(normalizedLedgerForDigest(ledger)); }
function digestDecisionRequest(snapshot) { return digest(snapshot); }

function parentIdentityCatalog(parentState) {
  const map = new Map();
  for (const r of vr.objectRecords(parentState)) {
    map.set(`${r.object_id}|${String(r.object_version)}|${r.object_digest}`, true);
  }
  const appendOnly = [
    ['research_evidence_links','link_id'],
    ['author_decisions','decision_id'],
    ['integration_proposals','proposal_id'],
    ['export_releases','release_id'],
  ];
  for (const [collection, idField] of appendOnly) {
    for (const item of parentState[collection] || []) {
      const id = String(item[idField] || '');
      if (id) map.set(`${id}|UNVERSIONED|${digest(item)}`, true);
    }
  }
  map.set(`${parentState.book_project.book_project_id}|STATE-${parentState.state_version}|${digest(parentState.book_project)}`, true);
  return map;
}

function validateSubjectIdentityRefs(parentState, refs) {
  if (!Array.isArray(refs) || refs.length === 0) fail('SUBJECT_IDENTITY_REFS_REQUIRED');
  const catalog = parentIdentityCatalog(parentState);
  const seen = new Set();
  for (const ref of refs) {
    req(ref, ['object_id','object_version','object_digest'], 'subject_identity_ref');
    if (!nonEmpty(String(ref.object_id)) || !nonEmpty(String(ref.object_version)) || !isSha256(ref.object_digest)) fail('INVALID_SUBJECT_IDENTITY_REF');
    const key = `${String(ref.object_id)}|${String(ref.object_version)}|${ref.object_digest}`;
    if (seen.has(key)) fail('DUPLICATE_SUBJECT_IDENTITY_REF', key);
    seen.add(key);
    if (!catalog.has(key)) fail('SUBJECT_IDENTITY_NOT_CURRENT', `${ref.object_id}:${ref.object_version}`);
  }
  return refs.slice().sort((a,b) => stable(a).localeCompare(stable(b)));
}

function validateOptions(options, customAllowed) {
  if (!Array.isArray(options) || options.length === 0) fail('DECISION_OPTIONS_REQUIRED');
  const ids = new Set();
  let requiredRank = 0;
  for (const option of options) {
    req(option, ['option_id','label','effect','consequence_class','canonical_decision_status'], 'option');
    if (!nonEmpty(option.option_id) || !nonEmpty(option.label) || !nonEmpty(option.effect)) fail('INVALID_DECISION_OPTION');
    if (ids.has(option.option_id)) fail('DUPLICATE_OPTION_ID', option.option_id);
    ids.add(option.option_id);
    if (!own(CONSEQUENCE_RANK, option.consequence_class)) fail('UNKNOWN_CONSEQUENCE_CLASS', String(option.consequence_class));
    if (!CANONICAL_STATUSES.has(option.canonical_decision_status)) fail('INVALID_CANONICAL_DECISION_STATUS', String(option.canonical_decision_status));
    if (option.selected === true || option.is_default === true || option.default_selected === true) fail('PRESELECTED_AUTHOR_CHOICE_FORBIDDEN', option.option_id);
    requiredRank = Math.max(requiredRank, CONSEQUENCE_RANK[option.consequence_class]);
  }
  if (customAllowed !== true && customAllowed !== false) fail('CUSTOM_OPTION_FLAG_REQUIRED');
  return { option_set_digest: digest(options), required_confirmation_policy: RANK_POLICY[requiredRank] };
}

function validateConfirmationPolicy(policy, requiredPolicy) {
  if (!CONFIRMATION_POLICIES.has(policy)) fail('UNKNOWN_CONFIRMATION_POLICY', String(policy));
  if (RANK_POLICY.indexOf(policy) < RANK_POLICY.indexOf(requiredPolicy)) fail('CONFIRMATION_POLICY_TOO_WEAK', `${policy}<${requiredPolicy}`);
}

function validateQueueLedger(ledger, parentState = null) {
  req(ledger, ['queue_schema_version','queue_ledger_version','bound_parent_state_version','bound_parent_state_digest','decision_families','decision_request_snapshots','current_request_index','source_handoff_index','processed_requests','resolution_receipts','outbox_entries'], 'queue_ledger');
  if (ledger.queue_schema_version !== 1 || !Number.isInteger(ledger.queue_ledger_version) || ledger.queue_ledger_version < 1) fail('INVALID_QUEUE_LEDGER_VERSION');
  for (const field of ['decision_families','decision_request_snapshots','current_request_index','source_handoff_index','processed_requests','resolution_receipts']) if (!obj(ledger[field])) fail('INVALID_QUEUE_LEDGER_MAP', field);
  if (!Array.isArray(ledger.outbox_entries)) fail('INVALID_QUEUE_OUTBOX');
  for (const [id, snap] of Object.entries(ledger.decision_request_snapshots)) {
    if (id !== snap.decision_request_id) fail('QUEUE_SNAPSHOT_KEY_MISMATCH', id);
    if (!QUEUE_STATES.has(snap.queue_state)) fail('UNKNOWN_QUEUE_STATE', String(snap.queue_state));
    if (snap.authority_class !== 'AUTHOR_ONLY') fail('QUEUE_AUTHORITY_CLASS_INVALID', String(snap.authority_class));
    if (snap.option_set_digest !== digest(snap.options)) fail('OPTION_SET_DIGEST_MISMATCH', id);
  }
  if (parentState) {
    vr.validateParentState(parentState);
    if (ledger.bound_parent_state_version !== parentState.state_version || ledger.bound_parent_state_digest !== parentState.state_digest) fail('QUEUE_PARENT_BINDING_MISMATCH');
  }
  return true;
}

function createQueueLedger(parentState) {
  vr.validateParentState(parentState);
  const ledger = {
    queue_schema_version: 1,
    queue_ledger_version: 1,
    bound_parent_state_version: parentState.state_version,
    bound_parent_state_digest: parentState.state_digest,
    decision_families: {},
    decision_request_snapshots: {},
    current_request_index: {},
    source_handoff_index: {},
    processed_requests: {},
    resolution_receipts: {},
    outbox_entries: [],
  };
  validateQueueLedger(ledger, parentState);
  return ledger;
}

function validateExpected(parentState, queueLedger, request, actorRequired = 'PARENT_SYSTEM') {
  vr.validateParentState(parentState);
  validateQueueLedger(queueLedger, parentState);
  if (actorRequired && request.actor_class !== actorRequired) fail('QUEUE_AUTHORITY_DENIED', String(request.actor_class));
  if (request.expected_parent_state_version !== parentState.state_version || request.expected_parent_state_digest !== parentState.state_digest) fail('STALE_PARENT_WRITE');
  if (request.expected_queue_ledger_version !== queueLedger.queue_ledger_version || request.expected_queue_ledger_digest !== digestQueueLedger(queueLedger)) fail('STALE_QUEUE_WRITE');
}

function replayCheck(ledger, action, requestId, idempotencyKey, request) {
  if (!nonEmpty(requestId) || !nonEmpty(idempotencyKey)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  const fp = digest({ action, request });
  const old = ledger.processed_requests[idempotencyKey];
  if (old) {
    if (old.request_fingerprint !== fp || old.action !== action) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (old.request_id !== requestId) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    return { replay: true, fingerprint: fp, record: clone(old) };
  }
  for (const oldRec of Object.values(ledger.processed_requests)) if (oldRec.request_id === requestId) fail('REQUEST_ID_CONFLICT');
  return { replay: false, fingerprint: fp };
}

function appendOutbox(ledger, type, payloadRef, parentVersion) {
  ledger.outbox_entries.push({
    event_id: makeId('ADQEVT', { type, payloadRef, parentVersion, sequence: ledger.outbox_entries.length + 1 }, 24),
    event_type: type,
    aggregate_id: 'BOOK_SYSTEM_AUTHOR_DECISION_QUEUE',
    payload_ref: payloadRef,
    parent_state_version: parentVersion,
    sequence: ledger.outbox_entries.length + 1,
    delivery_state: 'PENDING',
  });
}

function familyIdFor(request, subjectRefs) {
  return makeId('ADFAM', { decision_type: request.decision_type, subject_ref: request.subject_ref, subject_identity_refs: subjectRefs }, 26);
}

function nextSnapshot(ledger, prior, changes, seed) {
  const version = prior ? prior.decision_request_version + 1 : 1;
  const familyId = prior ? prior.decision_family_id : changes.decision_family_id;
  const snapshot = {
    ...(prior ? clone(prior) : {}),
    ...clone(changes),
    decision_family_id: familyId,
    decision_request_version: version,
    predecessor_decision_request_id: prior ? prior.decision_request_id : null,
  };
  snapshot.decision_request_id = makeId('ADREQ', { familyId, version, seed, snapshot: { ...snapshot, decision_request_id: undefined } }, 28);
  return snapshot;
}

function storeSnapshot(ledger, snapshot) {
  if (ledger.decision_request_snapshots[snapshot.decision_request_id]) fail('DECISION_REQUEST_ID_CONFLICT', snapshot.decision_request_id);
  ledger.decision_request_snapshots[snapshot.decision_request_id] = clone(snapshot);
  ledger.current_request_index[snapshot.decision_family_id] = snapshot.decision_request_id;
  if (!ledger.decision_families[snapshot.decision_family_id]) ledger.decision_families[snapshot.decision_family_id] = { decision_family_id: snapshot.decision_family_id, first_request_id: snapshot.decision_request_id };
  for (const ref of snapshot.source_handoff_refs || []) ledger.source_handoff_index[String(ref)] = snapshot.decision_family_id;
  return snapshot;
}

function currentSnapshot(ledger, familyOrRequestId) {
  if (ledger.decision_request_snapshots[familyOrRequestId]) {
    const s = ledger.decision_request_snapshots[familyOrRequestId];
    const currentId = ledger.current_request_index[s.decision_family_id];
    if (currentId !== s.decision_request_id) fail('DECISION_REQUEST_NOT_CURRENT', s.decision_request_id);
    return s;
  }
  const id = ledger.current_request_index[familyOrRequestId];
  if (!id || !ledger.decision_request_snapshots[id]) fail('DECISION_REQUEST_NOT_FOUND', String(familyOrRequestId));
  return ledger.decision_request_snapshots[id];
}

function enqueueDecision({ parentState, queueLedger, request }) {
  req(request, ['enqueue_request_id','idempotency_key','actor_class','expected_parent_state_version','expected_parent_state_digest','expected_queue_ledger_version','expected_queue_ledger_digest','source_authority_kind','source_handoff_refs','decision_type','subject_ref','subject_identity_refs','options','custom_option_allowed','evidence_refs','disagreement_refs','consequence_summary','confirmation_policy'], 'enqueue_request');
  const replay = replayCheck(queueLedger, 'ENQUEUE', request.enqueue_request_id, request.idempotency_key, request);
  if (replay.replay) {
    const snap = queueLedger.decision_request_snapshots[replay.record.decision_request_id];
    return { parent_state: clone(parentState), queue_ledger: clone(queueLedger), decision_request: clone(snap), disposition: 'REPLAY' };
  }
  validateExpected(parentState, queueLedger, request);
  if (!SOURCE_KINDS.has(request.source_authority_kind)) fail('UNKNOWN_SOURCE_AUTHORITY_KIND', String(request.source_authority_kind));
  if (!nonEmpty(request.decision_type) || !nonEmpty(request.subject_ref)) fail('DECISION_TYPE_SUBJECT_REQUIRED');
  if (!Array.isArray(request.source_handoff_refs) || request.source_handoff_refs.length === 0) fail('SOURCE_HANDOFF_REFS_REQUIRED');
  const subjectRefs = validateSubjectIdentityRefs(parentState, request.subject_identity_refs);
  const optionInfo = validateOptions(request.options, request.custom_option_allowed);
  validateConfirmationPolicy(request.confirmation_policy, optionInfo.required_confirmation_policy);
  const familyId = familyIdFor(request, subjectRefs);
  const oldId = queueLedger.current_request_index[familyId];
  const old = oldId ? queueLedger.decision_request_snapshots[oldId] : null;
  const nextLedger = clone(queueLedger);

  if (old && !TERMINAL_STATES.has(old.queue_state)) {
    const sameMeaning = old.option_set_digest === optionInfo.option_set_digest && old.bound_parent_state_digest === parentState.state_digest && stable(old.subject_identity_refs) === stable(subjectRefs) && old.decision_type === request.decision_type;
    if (sameMeaning) {
      const mergedRefs = uniq([...(old.source_handoff_refs || []), ...request.source_handoff_refs]);
      if (stable(mergedRefs) === stable(old.source_handoff_refs)) return { parent_state: clone(parentState), queue_ledger: clone(queueLedger), decision_request: clone(old), disposition: 'DEDUPLICATED' };
      const merged = nextSnapshot(nextLedger, old, { source_handoff_refs: mergedRefs, evidence_refs: uniq([...(old.evidence_refs || []), ...(request.evidence_refs || [])]), disagreement_refs: uniq([...(old.disagreement_refs || []), ...(request.disagreement_refs || [])]), created_by: 'BOOK_SYSTEM_PARENT', created_at: request.created_at || `STATE_VERSION:${parentState.state_version}` }, request.enqueue_request_id);
      storeSnapshot(nextLedger, merged);
      nextLedger.queue_ledger_version += 1;
      nextLedger.processed_requests[request.idempotency_key] = { action:'ENQUEUE', request_id:request.enqueue_request_id, request_fingerprint:replay.fingerprint, decision_request_id:merged.decision_request_id };
      appendOutbox(nextLedger, 'AUTHOR_DECISION_REQUEST_UPDATED', merged.decision_request_id, parentState.state_version);
      validateQueueLedger(nextLedger, parentState);
      return { parent_state: clone(parentState), queue_ledger: nextLedger, decision_request: clone(merged), disposition: 'UPDATED_SOURCE_LINEAGE' };
    }
    const superseded = nextSnapshot(nextLedger, old, { queue_state:'SUPERSEDED', presentation_state:old.presentation_state === 'PRESENTED_CURRENT' ? 'PRESENTED_STALE' : old.presentation_state, staleness_reason:'REPLACED_BY_MATERIAL_REQUEST_CHANGE', supersedes_request_id:null, created_by:'BOOK_SYSTEM_PARENT', created_at:request.created_at || `STATE_VERSION:${parentState.state_version}` }, `${request.enqueue_request_id}:supersede`);
    storeSnapshot(nextLedger, superseded);
  }

  const snapshot = nextSnapshot(nextLedger, null, {
    decision_family_id: familyId,
    book_project_id: parentState.book_project.book_project_id,
    book_id: parentState.book_project.book_id,
    decision_type: request.decision_type,
    authority_class: 'AUTHOR_ONLY',
    subject_ref: request.subject_ref,
    subject_identity_refs: subjectRefs,
    bound_parent_state_version: parentState.state_version,
    bound_parent_state_digest: parentState.state_digest,
    source_authority_kind: request.source_authority_kind,
    source_handoff_refs: uniq(request.source_handoff_refs),
    options: clone(request.options),
    option_set_digest: optionInfo.option_set_digest,
    custom_option_allowed: request.custom_option_allowed,
    evidence_refs: uniq(request.evidence_refs),
    disagreement_refs: uniq(request.disagreement_refs),
    consequence_summary: String(request.consequence_summary || ''),
    confirmation_policy: request.confirmation_policy,
    queue_state: 'PENDING',
    presentation_state: 'NOT_PRESENTED',
    staleness_reason: null,
    supersedes_request_id: old ? old.decision_request_id : null,
    created_at: request.created_at || `STATE_VERSION:${parentState.state_version}`,
    created_by: 'BOOK_SYSTEM_PARENT',
  }, request.enqueue_request_id);
  storeSnapshot(nextLedger, snapshot);
  nextLedger.queue_ledger_version += 1;
  nextLedger.processed_requests[request.idempotency_key] = { action:'ENQUEUE', request_id:request.enqueue_request_id, request_fingerprint:replay.fingerprint, decision_request_id:snapshot.decision_request_id };
  appendOutbox(nextLedger, 'AUTHOR_DECISION_REQUEST_ENQUEUED', snapshot.decision_request_id, parentState.state_version);
  validateQueueLedger(nextLedger, parentState);
  return { parent_state: clone(parentState), queue_ledger: nextLedger, decision_request: clone(snapshot), disposition: 'ENQUEUED' };
}

function transitionQueueItem({ parentState, queueLedger, request, action, fromStates, toState, presentationState, reason = null }) {
  req(request, ['queue_action_request_id','idempotency_key','actor_class','expected_parent_state_version','expected_parent_state_digest','expected_queue_ledger_version','expected_queue_ledger_digest','decision_request_id'], 'queue_action_request');
  const replay = replayCheck(queueLedger, action, request.queue_action_request_id, request.idempotency_key, request);
  if (replay.replay) {
    const s = queueLedger.decision_request_snapshots[replay.record.decision_request_id];
    return { parent_state:clone(parentState), queue_ledger:clone(queueLedger), decision_request:clone(s), disposition:'REPLAY' };
  }
  validateExpected(parentState, queueLedger, request);
  const old = currentSnapshot(queueLedger, request.decision_request_id);
  if (!fromStates.includes(old.queue_state)) fail('QUEUE_STATE_TRANSITION_FORBIDDEN', `${old.queue_state}->${toState}`);
  if (old.bound_parent_state_digest !== parentState.state_digest) fail('DECISION_REQUEST_STALE_PARENT');
  validateSubjectIdentityRefs(parentState, old.subject_identity_refs);
  const nextLedger = clone(queueLedger);
  const next = nextSnapshot(nextLedger, old, { queue_state:toState, presentation_state:presentationState || old.presentation_state, staleness_reason:reason, created_by:'BOOK_SYSTEM_PARENT', created_at:request.created_at || `STATE_VERSION:${parentState.state_version}` }, request.queue_action_request_id);
  storeSnapshot(nextLedger, next);
  nextLedger.queue_ledger_version += 1;
  nextLedger.processed_requests[request.idempotency_key] = { action, request_id:request.queue_action_request_id, request_fingerprint:replay.fingerprint, decision_request_id:next.decision_request_id };
  appendOutbox(nextLedger, `AUTHOR_DECISION_REQUEST_${toState}`, next.decision_request_id, parentState.state_version);
  validateQueueLedger(nextLedger, parentState);
  return { parent_state:clone(parentState), queue_ledger:nextLedger, decision_request:clone(next), disposition:toState };
}

function presentDecision(args) { return transitionQueueItem({ ...args, action:'PRESENT', fromStates:['PENDING'], toState:'PRESENTED', presentationState:'PRESENTED_CURRENT' }); }
function deferDecision(args) { return transitionQueueItem({ ...args, action:'DEFER', fromStates:['PENDING','PRESENTED'], toState:'DEFERRED' }); }
function reopenDecision(args) { return transitionQueueItem({ ...args, action:'REOPEN', fromStates:['DEFERRED'], toState:'PENDING', presentationState:'NOT_PRESENTED' }); }
function withdrawDecision(args) { return transitionQueueItem({ ...args, action:'WITHDRAW', fromStates:['PENDING','PRESENTED','DEFERRED'], toState:'WITHDRAWN', reason:'SOURCE_AUTHORITY_WITHDRAWN' }); }

function presentationProjection(snapshot) {
  if (!obj(snapshot) || !nonEmpty(snapshot.decision_request_id)) fail('DECISION_REQUEST_REQUIRED');
  if (!['PENDING','PRESENTED','DEFERRED'].includes(snapshot.queue_state)) fail('DECISION_REQUEST_NOT_PRESENTABLE', snapshot.queue_state);
  return {
    decision_request_id: snapshot.decision_request_id,
    decision_type: snapshot.decision_type,
    question: snapshot.consequence_summary || `Author decision required: ${snapshot.decision_type}`,
    options: snapshot.options.map(o => ({ option_id:o.option_id, label:o.label, effect:o.effect, consequence_class:o.consequence_class, tradeoff_summary:o.tradeoff_summary || null })),
    custom_option_allowed: snapshot.custom_option_allowed,
    evidence_summary_refs: clone(snapshot.evidence_refs),
    disagreement_summary_refs: clone(snapshot.disagreement_refs),
    consequence_summary: snapshot.consequence_summary,
    can_defer: true,
    confirmation_required: snapshot.confirmation_policy !== 'NONE',
    subject_currentness: snapshot.queue_state === 'STALE' ? 'STALE' : 'CURRENT_FOR_BOUND_PARENT',
    selected_option_id: null,
  };
}

function activeBindings(versionLedger) {
  const snap = versionLedger.state_snapshots[versionLedger.current_snapshot_id];
  if (!snap) fail('VERSION_ROLLBACK_CURRENT_SNAPSHOT_MISSING');
  return clone(snap.active_version_bindings);
}

function validateResolutionChoice(snapshot, request) {
  const predefined = nonEmpty(request.selected_option_id) ? snapshot.options.find(o => o.option_id === request.selected_option_id) : null;
  const custom = nonEmpty(request.custom_author_choice) ? request.custom_author_choice : null;
  if ((predefined ? 1 : 0) + (custom ? 1 : 0) !== 1) fail('EXACTLY_ONE_AUTHOR_CHOICE_REQUIRED');
  if (custom && !snapshot.custom_option_allowed) fail('CUSTOM_AUTHOR_CHOICE_FORBIDDEN');
  const choiceIdentity = predefined ? `OPTION:${predefined.option_id}` : `CUSTOM:${digest(custom)}`;
  const status = predefined ? predefined.canonical_decision_status : 'APPROVED';
  if (!CANONICAL_STATUSES.has(status)) fail('INVALID_CANONICAL_DECISION_STATUS', String(status));
  return { predefined, custom, choiceIdentity, status, authorChoice: predefined ? predefined.option_id : custom };
}

function validateConfirmation(snapshot, request, choiceIdentity) {
  if (snapshot.confirmation_policy === 'NONE') return null;
  const e = request.confirmation_evidence;
  if (!obj(e) || e.confirmed !== true) fail('AUTHOR_CONFIRMATION_REQUIRED');
  if (e.decision_request_digest !== digestDecisionRequest(snapshot)) fail('AUTHOR_CONFIRMATION_REQUEST_MISMATCH');
  if (e.selected_option_identity !== choiceIdentity) fail('AUTHOR_CONFIRMATION_CHOICE_MISMATCH');
  if (snapshot.confirmation_policy === 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE' && e.consequence_reviewed !== true) fail('AUTHOR_CONSEQUENCE_CONFIRMATION_REQUIRED');
  return e.confirmation_evidence_ref || makeId('ADCONF', e, 24);
}

function resolveDecision({ parentState, versionLedger, queueLedger, request }) {
  req(request, ['resolution_request_id','idempotency_key','author_actor_ref','author_authority_proof_ref','expected_parent_state_version','expected_parent_state_digest','expected_queue_ledger_version','expected_queue_ledger_digest','decision_request_id','expected_decision_request_version','expected_decision_request_digest','selected_option_id','custom_author_choice','confirmation_evidence','rationale_optional'], 'resolution_request');
  const replay = replayCheck(queueLedger, 'RESOLVE', request.resolution_request_id, request.idempotency_key, request);
  if (replay.replay) {
    const qReceipt = queueLedger.resolution_receipts[replay.record.resolution_receipt_id];
    if (!qReceipt) fail('RESOLUTION_RECEIPT_MISSING');
    const vrReceipt = versionLedger.version_receipts[qReceipt.version_rollback_authority_handoff_ref];
    return { parent_state:clone(parentState), version_ledger:clone(versionLedger), queue_ledger:clone(queueLedger), resolution_receipt:clone(qReceipt), version_receipt:clone(vrReceipt), disposition:'REPLAY' };
  }
  vr.validateParentState(parentState);
  vr.validateLedger(versionLedger, parentState);
  validateQueueLedger(queueLedger, parentState);
  if (!nonEmpty(request.author_actor_ref) || !nonEmpty(request.author_authority_proof_ref)) fail('AUTHOR_AUTHORITY_PROOF_REQUIRED');
  if (request.expected_parent_state_version !== parentState.state_version || request.expected_parent_state_digest !== parentState.state_digest) fail('STALE_PARENT_WRITE');
  if (request.expected_queue_ledger_version !== queueLedger.queue_ledger_version || request.expected_queue_ledger_digest !== digestQueueLedger(queueLedger)) fail('STALE_QUEUE_WRITE');
  const snapshot = currentSnapshot(queueLedger, request.decision_request_id);
  if (!['PENDING','PRESENTED'].includes(snapshot.queue_state)) fail('DECISION_REQUEST_NOT_RESOLVABLE', snapshot.queue_state);
  if (snapshot.bound_parent_state_version !== parentState.state_version || snapshot.bound_parent_state_digest !== parentState.state_digest) fail('DECISION_REQUEST_STALE_PARENT');
  if (request.expected_decision_request_version !== snapshot.decision_request_version || request.expected_decision_request_digest !== digestDecisionRequest(snapshot)) fail('STALE_DECISION_REQUEST');
  validateSubjectIdentityRefs(parentState, snapshot.subject_identity_refs);
  const choice = validateResolutionChoice(snapshot, request);
  const confirmationRef = validateConfirmation(snapshot, request, choice.choiceIdentity);

  const decisionId = makeId('AUTHORDECISION', { decision_family_id:snapshot.decision_family_id, decision_request_id:snapshot.decision_request_id, choice:choice.choiceIdentity, author_actor_ref:request.author_actor_ref }, 28);
  if ((parentState.author_decisions || []).some(d => d.decision_id === decisionId)) fail('AUTHOR_DECISION_ID_CONFLICT', decisionId);
  const authorDecision = {
    decision_id: decisionId,
    subject_ref: snapshot.subject_ref,
    decision_type: snapshot.decision_type,
    options: snapshot.options.map(o => ({ option_id:o.option_id, label:o.label, effect:o.effect, canonical_decision_status:o.canonical_decision_status })),
    status: choice.status,
    author_choice: choice.authorChoice,
    rationale_optional: request.rationale_optional || null,
    effective_version: parentState.state_version + 1,
  };

  const post = clone(parentState);
  delete post.state_digest;
  post.state_version = parentState.state_version + 1;
  post.author_decisions = [...(post.author_decisions || []), authorDecision];
  const postState = vr.sealState(post);
  vr.validateParentState(postState);

  const decisionReceiptId = makeId('ADCPT', { resolution_request_id:request.resolution_request_id, pre:parentState.state_digest, post:postState.state_digest, decision_id:decisionId }, 28);
  const authorityReceipt = {
    decision_receipt_id: decisionReceiptId,
    pre_parent_state_version: parentState.state_version,
    pre_parent_state_digest: parentState.state_digest,
    post_parent_state_version: postState.state_version,
    post_parent_state_digest: postState.state_digest,
    decision_id: decisionId,
    decision_request_id: snapshot.decision_request_id,
    author_actor_ref: request.author_actor_ref,
    author_authority_proof_ref: request.author_authority_proof_ref,
  };

  const vrRequest = {
    request_id: `VR-${request.resolution_request_id}`,
    idempotency_key: `VR-${request.idempotency_key}`,
    actor_class: 'PARENT_SYSTEM',
    expected_state_version: parentState.state_version,
    expected_state_digest: parentState.state_digest,
    expected_ledger_version: versionLedger.ledger_version,
    expected_ledger_digest: vr.digestLedger(versionLedger),
    authority_kind: 'AUTHOR_DECISION',
    authority_receipt: authorityReceipt,
    committed_parent_state: postState,
    active_version_bindings: activeBindings(versionLedger),
  };
  const vrOut = vr.recordAuthorizedParentSuccessor({ parentState, versionLedger, request:vrRequest });

  const nextQueue = clone(queueLedger);
  const resolved = nextSnapshot(nextQueue, snapshot, { queue_state:'RESOLVED', presentation_state:snapshot.confirmation_policy === 'NONE' ? snapshot.presentation_state : 'CONFIRMED', staleness_reason:null, created_by:'AUTHOR_VIA_BOOK_PARENT', created_at:request.resolved_at || `STATE_VERSION:${postState.state_version}` }, request.resolution_request_id);
  storeSnapshot(nextQueue, resolved);
  nextQueue.bound_parent_state_version = postState.state_version;
  nextQueue.bound_parent_state_digest = postState.state_digest;
  nextQueue.queue_ledger_version += 1;

  const qReceipt = {
    receipt_id: decisionReceiptId,
    resolution_request_id: request.resolution_request_id,
    idempotency_key: request.idempotency_key,
    decision_request_id: snapshot.decision_request_id,
    decision_request_version: snapshot.decision_request_version,
    decision_request_digest: digestDecisionRequest(snapshot),
    decision_id: decisionId,
    decision_type: snapshot.decision_type,
    author_actor_ref: request.author_actor_ref,
    author_authority_proof_ref: request.author_authority_proof_ref,
    selected_option_identity: choice.choiceIdentity,
    canonical_decision_status: choice.status,
    pre_parent_state_version: parentState.state_version,
    pre_parent_state_digest: parentState.state_digest,
    pre_queue_ledger_version: queueLedger.queue_ledger_version,
    pre_queue_ledger_digest: digestQueueLedger(queueLedger),
    post_parent_state_version: postState.state_version,
    post_parent_state_digest: postState.state_digest,
    post_queue_ledger_version: nextQueue.queue_ledger_version,
    post_queue_ledger_digest: '__SELF__',
    subject_identity_refs: clone(snapshot.subject_identity_refs),
    option_set_digest: snapshot.option_set_digest,
    confirmation_evidence_ref: confirmationRef,
    version_rollback_authority_handoff_ref: vrOut.receipt.receipt_id,
  };
  nextQueue.resolution_receipts[decisionReceiptId] = qReceipt;
  nextQueue.processed_requests[request.idempotency_key] = { action:'RESOLVE', request_id:request.resolution_request_id, request_fingerprint:replay.fingerprint, resolution_receipt_id:decisionReceiptId, decision_request_id:resolved.decision_request_id };
  appendOutbox(nextQueue, 'AUTHOR_DECISION_RESOLVED', decisionReceiptId, postState.state_version);
  qReceipt.post_queue_ledger_digest = digestQueueLedger(nextQueue);
  nextQueue.resolution_receipts[decisionReceiptId] = qReceipt;
  validateQueueLedger(nextQueue, postState);

  return { parent_state:postState, version_ledger:vrOut.version_ledger, queue_ledger:nextQueue, author_decision:clone(authorDecision), resolution_receipt:clone(qReceipt), version_receipt:clone(vrOut.receipt), disposition:'RESOLVED' };
}

function revalidateAgainstParent({ previousParentState, currentParentState, queueLedger, request }) {
  req(request, ['revalidation_request_id','idempotency_key','actor_class','expected_queue_ledger_version','expected_queue_ledger_digest','revalidation_evidence_refs'], 'revalidation_request');
  vr.validateParentState(previousParentState);
  vr.validateParentState(currentParentState);
  validateQueueLedger(queueLedger, previousParentState);
  if (request.actor_class !== 'PARENT_SYSTEM') fail('QUEUE_AUTHORITY_DENIED');
  if (request.expected_queue_ledger_version !== queueLedger.queue_ledger_version || request.expected_queue_ledger_digest !== digestQueueLedger(queueLedger)) fail('STALE_QUEUE_WRITE');
  if (previousParentState.book_project.book_project_id !== currentParentState.book_project.book_project_id || previousParentState.book_project.book_id !== currentParentState.book_project.book_id) fail('BOOK_PROJECT_IDENTITY_IMMUTABLE');
  if (currentParentState.state_version <= previousParentState.state_version) fail('REVALIDATION_PARENT_NOT_SUCCESSOR');
  if (!Array.isArray(request.revalidation_evidence_refs) || request.revalidation_evidence_refs.length === 0) fail('REVALIDATION_EVIDENCE_REQUIRED');
  const replay = replayCheck(queueLedger, 'REVALIDATE', request.revalidation_request_id, request.idempotency_key, request);
  if (replay.replay) return { parent_state:clone(currentParentState), queue_ledger:clone(queueLedger), disposition:'REPLAY' };

  const next = clone(queueLedger);
  const updated = [];
  for (const [familyId, requestId] of Object.entries(queueLedger.current_request_index)) {
    const old = queueLedger.decision_request_snapshots[requestId];
    if (!old || TERMINAL_STATES.has(old.queue_state) || old.queue_state === 'STALE') continue;
    let current = true;
    try { validateSubjectIdentityRefs(currentParentState, old.subject_identity_refs); } catch (e) { if (e && e.code === 'SUBJECT_IDENTITY_NOT_CURRENT') current = false; else throw e; }
    const changes = current ? {
      bound_parent_state_version:currentParentState.state_version,
      bound_parent_state_digest:currentParentState.state_digest,
      evidence_refs:uniq([...(old.evidence_refs || []), ...request.revalidation_evidence_refs]),
      staleness_reason:null,
      presentation_state:old.queue_state === 'PRESENTED' ? 'PRESENTED_CURRENT' : old.presentation_state,
    } : {
      bound_parent_state_version:currentParentState.state_version,
      bound_parent_state_digest:currentParentState.state_digest,
      queue_state:'STALE',
      presentation_state:old.presentation_state === 'PRESENTED_CURRENT' ? 'PRESENTED_STALE' : old.presentation_state,
      staleness_reason:'SUBJECT_IDENTITY_CHANGED_OR_REMOVED',
    };
    const s = nextSnapshot(next, old, { ...changes, created_by:'BOOK_SYSTEM_PARENT', created_at:request.revalidated_at || `STATE_VERSION:${currentParentState.state_version}` }, `${request.revalidation_request_id}:${familyId}`);
    storeSnapshot(next, s);
    updated.push(s.decision_request_id);
  }
  next.bound_parent_state_version = currentParentState.state_version;
  next.bound_parent_state_digest = currentParentState.state_digest;
  next.queue_ledger_version += 1;
  next.processed_requests[request.idempotency_key] = { action:'REVALIDATE', request_id:request.revalidation_request_id, request_fingerprint:replay.fingerprint, updated_request_ids:updated };
  appendOutbox(next, 'AUTHOR_DECISION_QUEUE_REVALIDATED', request.revalidation_request_id, currentParentState.state_version);
  validateQueueLedger(next, currentParentState);
  return { parent_state:clone(currentParentState), queue_ledger:next, updated_request_ids:updated, disposition:'REVALIDATED' };
}

module.exports = {
  AuthorDecisionQueueError,
  QUEUE_STATES,
  TERMINAL_STATES,
  SOURCE_KINDS,
  CONFIRMATION_POLICIES,
  digest,
  stable,
  digestQueueLedger,
  digestDecisionRequest,
  validateQueueLedger,
  validateSubjectIdentityRefs,
  createQueueLedger,
  enqueueDecision,
  presentDecision,
  deferDecision,
  reopenDecision,
  withdrawDecision,
  presentationProjection,
  resolveDecision,
  revalidateAgainstParent,
};
