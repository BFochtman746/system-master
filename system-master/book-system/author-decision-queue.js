'use strict';

const crypto = require('crypto');

class QueueError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'QueueError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new QueueError(code, detail); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function plain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (plain(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = stableNormalize(v[k]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(typeof v === 'string' ? v : stableStringify(v), 'utf8').digest('hex'); }
function digestState(state) { return sha256(state); }
function digestLedger(ledger) {
  const normalized = clone(ledger);
  if (plain(normalized.resolution_receipts)) {
    for (const receipt of Object.values(normalized.resolution_receipts)) {
      if (plain(receipt) && hasOwn(receipt, 'post_queue_ledger_digest')) receipt.post_queue_ledger_digest = '__SELF__';
    }
  }
  return sha256(normalized);
}
function digestRequest(snapshot) { return sha256(snapshot); }

function requireFields(obj, fields, ctx) {
  if (!plain(obj)) fail('OBJECT_REQUIRED', ctx);
  for (const f of fields) if (!hasOwn(obj, f)) fail('REQUIRED_FIELD_MISSING', `${ctx}.${f}`);
}
function nonemptyString(v, ctx) { if (typeof v !== 'string' || !v.trim()) fail('NONEMPTY_STRING_REQUIRED', ctx); return v; }
function integer(v, ctx, min = 0) { if (!Number.isInteger(v) || v < min) fail('INTEGER_REQUIRED', ctx); return v; }
function digest(v, ctx) { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail('INVALID_SHA256_DIGEST', ctx); return v; }
function uniqueStrings(values, ctx) {
  if (!Array.isArray(values)) fail('ARRAY_REQUIRED', ctx);
  const out = [];
  const seen = new Set();
  for (const v of values) {
    nonemptyString(v, ctx);
    if (seen.has(v)) continue;
    seen.add(v); out.push(v);
  }
  return out;
}

const SOURCE_TYPES = new Set([
  'INTEGRATION_RUNTIME_HANDOFF', 'LIFECYCLE_GATE_REQUIREMENT', 'EDITORIAL_STAGE_REQUIREMENT',
  'EXPORT_PUBLICATION_REQUIREMENT', 'PARENT_DIRECT_AUTHOR_QUERY'
]);
const TERMINAL_STATES = new Set(['SUPERSEDED', 'RESOLVED', 'WITHDRAWN']);
const CONSEQUENCE_CLASSES = new Set(['ROUTINE_REVERSIBLE', 'MATERIAL_REVISION', 'CANON_OR_INTENT', 'PROTECTED_LANGUAGE', 'FINALIZATION', 'PUBLICATION_OR_RELEASE']);
const CONFIRMATION_POLICIES = new Set(['NONE', 'REVIEW_SELECTED_CHOICE', 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE']);
const CANONICAL_DECISION_STATUSES = new Set(['APPROVED', 'REJECTED']);
const MIN_CONFIRMATION = {
  ROUTINE_REVERSIBLE: 'NONE',
  MATERIAL_REVISION: 'REVIEW_SELECTED_CHOICE',
  CANON_OR_INTENT: 'REVIEW_SELECTED_CHOICE',
  PROTECTED_LANGUAGE: 'REVIEW_SELECTED_CHOICE',
  FINALIZATION: 'REVIEW_SELECTED_CHOICE',
  PUBLICATION_OR_RELEASE: 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE',
};
const CONFIRMATION_RANK = { NONE: 0, REVIEW_SELECTED_CHOICE: 1, REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE: 2 };
const KNOWN_PARENT_COLLECTIONS = [
  'governing_briefs','canon_manifests','story_bibles','book_plans','manuscripts',
  'research_evidence_links','author_decisions','integration_proposals','export_releases'
];

function validateParentStateShape(state) {
  requireFields(state, ['schema_version','state_version','book_project','author_decisions'], 'parent_state');
  integer(state.state_version, 'parent_state.state_version', 1);
  if (!plain(state.author_decisions)) fail('COLLECTION_REQUIRED', 'parent_state.author_decisions');
  requireFields(state.book_project, ['book_project_id','book_id'], 'parent_state.book_project');
  return true;
}

function createQueueLedger(parentState) {
  validateParentStateShape(parentState);
  return {
    queue_schema_version: 1,
    queue_ledger_version: 1,
    bound_parent_state_version: parentState.state_version,
    bound_parent_state_digest: digestState(parentState),
    decision_families: {},
    decision_request_snapshots: {},
    current_request_index: {},
    source_handoff_index: {},
    processed_requests: {},
    resolution_receipts: {},
    outbox_entries: {},
  };
}

function validateLedger(ledger) {
  requireFields(ledger, ['queue_schema_version','queue_ledger_version','bound_parent_state_version','bound_parent_state_digest','decision_families','decision_request_snapshots','current_request_index','source_handoff_index','processed_requests','resolution_receipts','outbox_entries'], 'queue_ledger');
  if (ledger.queue_schema_version !== 1) fail('QUEUE_SCHEMA_VERSION_MISMATCH');
  integer(ledger.queue_ledger_version, 'queue_ledger.queue_ledger_version', 1);
  integer(ledger.bound_parent_state_version, 'queue_ledger.bound_parent_state_version', 1);
  digest(ledger.bound_parent_state_digest, 'queue_ledger.bound_parent_state_digest');
  for (const k of ['decision_families','decision_request_snapshots','current_request_index','source_handoff_index','processed_requests','resolution_receipts','outbox_entries']) if (!plain(ledger[k])) fail('COLLECTION_REQUIRED', `queue_ledger.${k}`);
  return true;
}

function validateExpectedBindings(parentState, ledger, expected) {
  validateParentStateShape(parentState); validateLedger(ledger);
  if (parentState.state_version !== expected.expected_parent_state_version) fail('PARENT_STATE_VERSION_MISMATCH');
  if (digestState(parentState) !== expected.expected_parent_state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  if (ledger.queue_ledger_version !== expected.expected_queue_ledger_version) fail('QUEUE_LEDGER_VERSION_MISMATCH');
  if (digestLedger(ledger) !== expected.expected_queue_ledger_digest) fail('QUEUE_LEDGER_DIGEST_MISMATCH');
  if (ledger.bound_parent_state_version !== parentState.state_version || ledger.bound_parent_state_digest !== digestState(parentState)) fail('QUEUE_PARENT_BINDING_STALE');
}

function validateSubjectIdentityRef(ref, parentState) {
  requireFields(ref, ['object_id','object_version','object_digest'], 'subject_identity_ref');
  nonemptyString(ref.object_id, 'subject_identity_ref.object_id');
  if (!(typeof ref.object_version === 'string' || Number.isInteger(ref.object_version))) fail('INVALID_OBJECT_VERSION');
  digest(ref.object_digest, 'subject_identity_ref.object_digest');
  let found = null;
  if (ref.object_id === parentState.book_project.book_project_id || ref.object_id === parentState.book_project.book_id) {
    found = parentState.book_project;
    if (String(ref.object_version) !== String(parentState.state_version)) fail('SUBJECT_VERSION_MISMATCH', ref.object_id);
  } else {
    for (const collection of KNOWN_PARENT_COLLECTIONS) {
      if (plain(parentState[collection]) && hasOwn(parentState[collection], ref.object_id)) { found = parentState[collection][ref.object_id]; break; }
    }
    if (!found) fail('SUBJECT_IDENTITY_UNRESOLVED', ref.object_id);
    const versionFields = ['version','version_id','effective_version'];
    const vf = versionFields.find((f) => hasOwn(found, f));
    if (vf && String(found[vf]) !== String(ref.object_version)) fail('SUBJECT_VERSION_MISMATCH', ref.object_id);
  }
  if (sha256(found) !== ref.object_digest) fail('SUBJECT_DIGEST_MISMATCH', ref.object_id);
  return true;
}

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length < 1) fail('OPTIONS_REQUIRED');
  const ids = new Set();
  return options.map((raw, i) => {
    requireFields(raw, ['option_id','label','effect','consequence_class','canonical_decision_status'], `options[${i}]`);
    nonemptyString(raw.option_id, `options[${i}].option_id`); nonemptyString(raw.label, `options[${i}].label`); nonemptyString(raw.effect, `options[${i}].effect`);
    if (ids.has(raw.option_id)) fail('DUPLICATE_OPTION_ID', raw.option_id); ids.add(raw.option_id);
    if (!CONSEQUENCE_CLASSES.has(raw.consequence_class)) fail('INVALID_CONSEQUENCE_CLASS', raw.consequence_class);
    if (!CANONICAL_DECISION_STATUSES.has(raw.canonical_decision_status)) fail('INVALID_CANONICAL_DECISION_STATUS', raw.option_id);
    for (const forbidden of ['selected','is_selected','default','preselected','recommended_as_default']) if (raw[forbidden] === true) fail('PRESELECTED_OPTION_FORBIDDEN', raw.option_id);
    const out = { option_id: raw.option_id, label: raw.label, effect: raw.effect, consequence_class: raw.consequence_class, canonical_decision_status: raw.canonical_decision_status };
    for (const optional of ['evidence_refs','tradeoff_summary','preservation_or_risk_refs']) if (hasOwn(raw, optional)) out[optional] = clone(raw[optional]);
    return out;
  });
}

function strongestConsequence(options) {
  const order = ['ROUTINE_REVERSIBLE','MATERIAL_REVISION','CANON_OR_INTENT','PROTECTED_LANGUAGE','FINALIZATION','PUBLICATION_OR_RELEASE'];
  return options.reduce((best, o) => order.indexOf(o.consequence_class) > order.indexOf(best) ? o.consequence_class : best, 'ROUTINE_REVERSIBLE');
}
function validateConfirmationPolicy(policy, options) {
  if (!CONFIRMATION_POLICIES.has(policy)) fail('INVALID_CONFIRMATION_POLICY');
  const min = MIN_CONFIRMATION[strongestConsequence(options)];
  if (CONFIRMATION_RANK[policy] < CONFIRMATION_RANK[min]) fail('CONFIRMATION_POLICY_TOO_WEAK', `${policy}<${min}`);
}
function familyKey(decisionType, subjectRef, subjectIdentityRefs, options) { return sha256({ decisionType, subjectRef, subjectIdentityRefs, option_set_digest: sha256(options), authority_class: 'AUTHOR_ONLY' }); }
function makeId(prefix, payload) { return `${prefix}:${sha256(payload).slice(0, 24).toUpperCase()}`; }

function processedReplay(ledger, idempotencyKey, normalized) {
  if (!hasOwn(ledger.processed_requests, idempotencyKey)) return null;
  const p = ledger.processed_requests[idempotencyKey];
  if (p.normalized_digest !== sha256(normalized)) fail('IDEMPOTENCY_KEY_CONFLICT', idempotencyKey);
  return clone(p.result);
}
function registerProcessed(ledger, idempotencyKey, requestId, normalized, result) {
  if (Object.values(ledger.processed_requests).some((p) => p.request_id === requestId && p.idempotency_key !== idempotencyKey)) fail('REQUEST_ID_CONFLICT', requestId);
  ledger.processed_requests[idempotencyKey] = { idempotency_key: idempotencyKey, request_id: requestId, normalized_digest: sha256(normalized), result: clone(result) };
}
function createSnapshot(base) {
  const snapshot = clone(base);
  snapshot.decision_request_digest = null;
  snapshot.decision_request_digest = sha256({ ...snapshot, decision_request_digest: undefined });
  return snapshot;
}

function enqueue(parentState, ledger, request) {
  requireFields(request, ['enqueue_request_id','idempotency_key','actor_class','expected_parent_state_version','expected_parent_state_digest','expected_queue_ledger_version','expected_queue_ledger_digest','source_authority_kind','source_handoff_refs','decision_type','subject_ref','subject_identity_refs','options','custom_option_allowed','evidence_refs','disagreement_refs','consequence_summary','confirmation_policy'], 'enqueue_request');
  nonemptyString(request.enqueue_request_id, 'enqueue_request_id'); nonemptyString(request.idempotency_key, 'idempotency_key');
  if (request.actor_class !== 'PARENT_SYSTEM') fail('ENQUEUE_ACTOR_DENIED');
  if (!SOURCE_TYPES.has(request.source_authority_kind)) fail('UNKNOWN_SOURCE_AUTHORITY_KIND');
  const options = normalizeOptions(request.options);
  validateConfirmationPolicy(request.confirmation_policy, options);
  if (!Array.isArray(request.subject_identity_refs) || request.subject_identity_refs.length < 1) fail('SUBJECT_IDENTITIES_REQUIRED');
  for (const ref of request.subject_identity_refs) validateSubjectIdentityRef(ref, parentState);
  const sourceRefs = uniqueStrings(request.source_handoff_refs, 'source_handoff_refs');
  let effectiveSourceRefs = sourceRefs;
  if (sourceRefs.length < 1) fail('SOURCE_HANDOFF_REQUIRED');
  nonemptyString(request.decision_type, 'decision_type'); nonemptyString(request.subject_ref, 'subject_ref'); nonemptyString(request.consequence_summary, 'consequence_summary');
  if (typeof request.custom_option_allowed !== 'boolean') fail('BOOLEAN_REQUIRED', 'custom_option_allowed');
  const normalized = { ...clone(request), options, source_handoff_refs: sourceRefs };
  const replay = processedReplay(ledger, request.idempotency_key, normalized);
  if (replay) return { ...replay, replay: true, parent_state: clone(parentState), queue_ledger: clone(ledger) };
  validateExpectedBindings(parentState, ledger, request);

  const out = clone(ledger);
  const key = familyKey(request.decision_type, request.subject_ref, request.subject_identity_refs, options);
  const familyId = out.decision_families[key] ? out.decision_families[key].decision_family_id : makeId('DECISIONFAMILY', key);
  let predecessor = null, version = 1;
  const currentId = out.current_request_index[familyId];
  if (currentId) {
    const current = out.decision_request_snapshots[currentId];
    if (!current || TERMINAL_STATES.has(current.queue_state) || current.queue_state === 'STALE') {
      predecessor = currentId; version = current ? current.decision_request_version + 1 : 1;
    } else {
      const sameMeaning = current.decision_type === request.decision_type && current.subject_ref === request.subject_ref && current.option_set_digest === sha256(options) && sha256(current.subject_identity_refs) === sha256(request.subject_identity_refs);
      if (!sameMeaning) fail('DECISION_FAMILY_COLLISION');
      const combinedRefs = [...new Set([...current.source_handoff_refs, ...sourceRefs])].sort();
      effectiveSourceRefs = combinedRefs;
      if (sha256(combinedRefs) === sha256(current.source_handoff_refs)) {
        const result = { operation: 'ENQUEUE', decision_family_id: familyId, decision_request_id: currentId, queue_state: current.queue_state };
        registerProcessed(out, request.idempotency_key, request.enqueue_request_id, normalized, result);
        out.queue_ledger_version += 1;
        return { ...result, replay: false, parent_state: clone(parentState), queue_ledger: out };
      }
      predecessor = currentId; version = current.decision_request_version + 1;
    }
  }

  const requestId = makeId('DECISIONREQUEST', { familyId, version, request: normalized });
  const snapshot = createSnapshot({
    decision_request_id: requestId, decision_family_id: familyId, decision_request_version: version, predecessor_decision_request_id: predecessor,
    book_project_id: parentState.book_project.book_project_id, book_id: parentState.book_project.book_id,
    decision_type: request.decision_type, authority_class: 'AUTHOR_ONLY', subject_ref: request.subject_ref,
    subject_identity_refs: clone(request.subject_identity_refs), bound_parent_state_version: parentState.state_version,
    bound_parent_state_digest: digestState(parentState), source_authority_kind: request.source_authority_kind,
    source_handoff_refs: effectiveSourceRefs, options, option_set_digest: sha256(options), custom_option_allowed: request.custom_option_allowed,
    evidence_refs: clone(request.evidence_refs), disagreement_refs: clone(request.disagreement_refs), consequence_summary: request.consequence_summary,
    confirmation_policy: request.confirmation_policy, queue_state: 'PENDING', presentation_state: 'NOT_PRESENTED', staleness_reason: null,
    supersedes_request_id: predecessor && out.decision_request_snapshots[predecessor] && out.decision_request_snapshots[predecessor].queue_state === 'SUPERSEDED' ? predecessor : null,
    created_at: request.created_at || null, created_by: 'PARENT_SYSTEM',
  });
  out.decision_request_snapshots[requestId] = snapshot;
  out.current_request_index[familyId] = requestId;
  out.decision_families[key] = { decision_family_id: familyId, family_key: key };
  for (const ref of effectiveSourceRefs) {
    if (out.source_handoff_index[ref] && out.source_handoff_index[ref] !== familyId) fail('SOURCE_HANDOFF_CONFLICT', ref);
    out.source_handoff_index[ref] = familyId;
  }
  const result = { operation: 'ENQUEUE', decision_family_id: familyId, decision_request_id: requestId, queue_state: 'PENDING' };
  registerProcessed(out, request.idempotency_key, request.enqueue_request_id, normalized, result);
  out.queue_ledger_version += 1;
  return { ...result, replay: false, parent_state: clone(parentState), queue_ledger: out };
}

function queueTransition(parentState, ledger, request, targetState, options = {}) {
  requireFields(request, ['request_id','idempotency_key','actor_class','expected_parent_state_version','expected_parent_state_digest','expected_queue_ledger_version','expected_queue_ledger_digest','decision_request_id','expected_decision_request_version','expected_decision_request_digest'], 'queue_transition');
  if (request.actor_class !== 'PARENT_SYSTEM') fail('QUEUE_TRANSITION_ACTOR_DENIED');
  const normalized = { ...clone(request), target_state: targetState, reason: options.reason || null };
  const replay = processedReplay(ledger, request.idempotency_key, normalized);
  if (replay) return { ...replay, replay: true, parent_state: clone(parentState), queue_ledger: clone(ledger) };
  validateExpectedBindings(parentState, ledger, request);
  const current = ledger.decision_request_snapshots[request.decision_request_id];
  if (!current) fail('DECISION_REQUEST_NOT_FOUND');
  if (current.decision_request_version !== request.expected_decision_request_version) fail('DECISION_REQUEST_VERSION_MISMATCH');
  if (current.decision_request_digest !== request.expected_decision_request_digest) fail('DECISION_REQUEST_DIGEST_MISMATCH');
  if (ledger.current_request_index[current.decision_family_id] !== current.decision_request_id) fail('DECISION_REQUEST_NOT_CURRENT');
  const allowed = {
    PRESENTED: new Set(['PENDING','PRESENTED']), DEFERRED: new Set(['PENDING','PRESENTED']), PENDING: new Set(['DEFERRED']),
    WITHDRAWN: new Set(['PENDING','PRESENTED','DEFERRED','STALE']), STALE: new Set(['PENDING','PRESENTED','DEFERRED']),
    SUPERSEDED: new Set(['PENDING','PRESENTED','DEFERRED','STALE']),
  };
  if (!allowed[targetState] || !allowed[targetState].has(current.queue_state)) fail('ILLEGAL_QUEUE_TRANSITION', `${current.queue_state}->${targetState}`);
  const out = clone(ledger);
  const version = current.decision_request_version + 1;
  const nextId = makeId('DECISIONREQUEST', { predecessor: current.decision_request_id, version, targetState, request: normalized });
  const next = createSnapshot({ ...clone(current), decision_request_id: nextId, decision_request_version: version, predecessor_decision_request_id: current.decision_request_id,
    queue_state: targetState,
    presentation_state: targetState === 'PRESENTED' ? 'PRESENTED_CURRENT' : (targetState === 'STALE' ? 'PRESENTED_STALE' : current.presentation_state),
    staleness_reason: targetState === 'STALE' ? nonemptyString(options.reason || request.reason, 'staleness_reason') : current.staleness_reason,
    supersedes_request_id: targetState === 'SUPERSEDED' ? current.decision_request_id : current.supersedes_request_id,
  });
  out.decision_request_snapshots[nextId] = next; out.current_request_index[current.decision_family_id] = nextId;
  const result = { operation: targetState === 'PENDING' ? 'REOPEN' : targetState, decision_family_id: current.decision_family_id, decision_request_id: nextId, queue_state: targetState };
  registerProcessed(out, request.idempotency_key, request.request_id, normalized, result); out.queue_ledger_version += 1;
  return { ...result, replay: false, parent_state: clone(parentState), queue_ledger: out };
}

function present(p,l,r) { return queueTransition(p,l,r,'PRESENTED'); }
function defer(p,l,r) { return queueTransition(p,l,r,'DEFERRED'); }
function reopen(p,l,r) { return queueTransition(p,l,r,'PENDING'); }
function withdraw(p,l,r) { return queueTransition(p,l,r,'WITHDRAWN'); }
function markStale(p,l,r,reason) { return queueTransition(p,l,r,'STALE',{reason}); }
function supersede(p,l,r) { return queueTransition(p,l,r,'SUPERSEDED'); }

function presentationProjection(ledger, decisionRequestId, question) {
  validateLedger(ledger);
  const s = ledger.decision_request_snapshots[decisionRequestId];
  if (!s) fail('DECISION_REQUEST_NOT_FOUND');
  return {
    decision_request_id: s.decision_request_id, decision_type: s.decision_type, question: nonemptyString(question, 'question'),
    options: clone(s.options), custom_option_allowed: s.custom_option_allowed, evidence_summary_refs: clone(s.evidence_refs),
    disagreement_summary_refs: clone(s.disagreement_refs), consequence_summary: s.consequence_summary,
    can_defer: !TERMINAL_STATES.has(s.queue_state) && s.queue_state !== 'STALE', confirmation_required: s.confirmation_policy !== 'NONE',
    subject_currentness: s.queue_state === 'STALE' ? 'STALE' : 'CURRENT_FOR_BOUND_PARENT',
  };
}

function validateResolutionChoice(snapshot, request) {
  const selected = request.selected_option_id, custom = request.custom_author_choice;
  const hasSelected = typeof selected === 'string' && selected.length > 0, hasCustom = typeof custom === 'string' && custom.trim().length > 0;
  if (hasSelected === hasCustom) fail('EXACTLY_ONE_AUTHOR_CHOICE_REQUIRED');
  if (hasSelected) {
    const option = snapshot.options.find((o) => o.option_id === selected);
    if (!option) fail('SELECTED_OPTION_NOT_IN_BOUND_SET');
    if (!CANONICAL_DECISION_STATUSES.has(option.canonical_decision_status)) fail('INVALID_CANONICAL_DECISION_STATUS');
    return { kind: 'PREDEFINED', value: selected, option, status: option.canonical_decision_status, identity: { option_id: selected, option_set_digest: snapshot.option_set_digest } };
  }
  if (!snapshot.custom_option_allowed) fail('CUSTOM_OPTION_NOT_ALLOWED');
  return { kind: 'CUSTOM', value: custom, option: null, status: 'APPROVED', identity: { custom_choice_digest: sha256(custom), option_set_digest: snapshot.option_set_digest } };
}
function validateConfirmation(snapshot, choice, confirmationEvidence) {
  if (snapshot.confirmation_policy === 'NONE') return null;
  if (!plain(confirmationEvidence)) fail('CONFIRMATION_EVIDENCE_REQUIRED');
  requireFields(confirmationEvidence, ['decision_request_digest','choice_identity_digest'], 'confirmation_evidence');
  if (confirmationEvidence.decision_request_digest !== snapshot.decision_request_digest) fail('CONFIRMATION_REQUEST_BINDING_MISMATCH');
  if (confirmationEvidence.choice_identity_digest !== sha256(choice.identity)) fail('CONFIRMATION_CHOICE_BINDING_MISMATCH');
  if (snapshot.confirmation_policy === 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE') {
    requireFields(confirmationEvidence, ['consequence_summary_digest'], 'confirmation_evidence');
    if (confirmationEvidence.consequence_summary_digest !== sha256(snapshot.consequence_summary)) fail('CONFIRMATION_CONSEQUENCE_BINDING_MISMATCH');
  }
  return sha256(confirmationEvidence);
}
function validateAuthorActorRef(ref) {
  nonemptyString(ref, 'author_actor_ref');
  if (/^(MODEL|AI|PROVIDER|PROSE|BOOK_EVALUATOR|PARENT_SYSTEM):/i.test(ref)) fail('AUTHOR_ACTOR_CLASS_DENIED', ref);
  if (!/^AUTHOR:/i.test(ref)) fail('AUTHOR_ACTOR_REF_UNVERIFIED', ref);
  return true;
}

function resolve(parentState, ledger, request) {
  requireFields(request, ['resolution_request_id','idempotency_key','author_actor_ref','author_authority_proof_ref','expected_parent_state_version','expected_parent_state_digest','expected_queue_ledger_version','expected_queue_ledger_digest','decision_request_id','expected_decision_request_version','expected_decision_request_digest','selected_option_id','custom_author_choice','confirmation_evidence','rationale_optional'], 'resolution_request');
  nonemptyString(request.resolution_request_id, 'resolution_request_id'); nonemptyString(request.idempotency_key, 'idempotency_key');
  validateAuthorActorRef(request.author_actor_ref); nonemptyString(request.author_authority_proof_ref, 'author_authority_proof_ref');
  const normalized = clone(request);
  const replay = processedReplay(ledger, request.idempotency_key, normalized);
  if (replay) {
    const receipt = ledger.resolution_receipts[replay.receipt_id];
    return { ...replay, replay: true, parent_state: clone(parentState), queue_ledger: clone(ledger), resolution_receipt: clone(receipt) };
  }
  const requestedSnapshot = ledger.decision_request_snapshots[request.decision_request_id];
  if (requestedSnapshot) {
    const currentId = ledger.current_request_index[requestedSnapshot.decision_family_id];
    if (currentId && currentId !== request.decision_request_id) fail('STALE_OR_CONFLICTING_RESOLUTION', currentId);
  }
  validateExpectedBindings(parentState, ledger, request);
  const s = ledger.decision_request_snapshots[request.decision_request_id];
  if (!s) fail('DECISION_REQUEST_NOT_FOUND');
  if (ledger.current_request_index[s.decision_family_id] !== s.decision_request_id) fail('DECISION_REQUEST_NOT_CURRENT');
  if (s.decision_request_version !== request.expected_decision_request_version) fail('DECISION_REQUEST_VERSION_MISMATCH');
  if (s.decision_request_digest !== request.expected_decision_request_digest) fail('DECISION_REQUEST_DIGEST_MISMATCH');
  if (!['PENDING','PRESENTED'].includes(s.queue_state)) fail('DECISION_REQUEST_NOT_RESOLVABLE', s.queue_state);
  if (s.bound_parent_state_version !== parentState.state_version || s.bound_parent_state_digest !== digestState(parentState)) fail('DECISION_SUBJECT_STALE');
  for (const ref of s.subject_identity_refs) validateSubjectIdentityRef(ref, parentState);
  const choice = validateResolutionChoice(s, request);
  const confirmationRef = validateConfirmation(s, choice, request.confirmation_evidence);

  const parentOut = clone(parentState);
  const decisionId = makeId('AUTHORDECISION', { request: s.decision_request_id, resolution: request.resolution_request_id, choice: choice.identity });
  if (hasOwn(parentOut.author_decisions, decisionId)) fail('AUTHOR_DECISION_ID_CONFLICT');
  const decision = { decision_id: decisionId, subject_ref: s.subject_ref, decision_type: s.decision_type, options: clone(s.options), status: choice.status, author_choice: choice.value, effective_version: parentState.state_version + 1 };
  if (request.rationale_optional !== null && request.rationale_optional !== undefined && request.rationale_optional !== '') decision.rationale_optional = request.rationale_optional;
  parentOut.author_decisions[decisionId] = decision;
  parentOut.state_version += 1;
  const postParentDigest = digestState(parentOut);

  const out = clone(ledger);
  const resolvedVersion = s.decision_request_version + 1;
  const resolvedId = makeId('DECISIONREQUEST', { predecessor: s.decision_request_id, resolvedVersion, decisionId });
  const resolved = createSnapshot({ ...clone(s), decision_request_id: resolvedId, decision_request_version: resolvedVersion, predecessor_decision_request_id: s.decision_request_id,
    bound_parent_state_version: parentOut.state_version, bound_parent_state_digest: postParentDigest, queue_state: 'RESOLVED', presentation_state: 'CONFIRMED' });
  out.decision_request_snapshots[resolvedId] = resolved; out.current_request_index[s.decision_family_id] = resolvedId;
  out.queue_ledger_version += 1; out.bound_parent_state_version = parentOut.state_version; out.bound_parent_state_digest = postParentDigest;

  const receiptId = makeId('AUTHORDECISIONRECEIPT', { resolution: request.resolution_request_id, decisionId });
  const handoffId = makeId('VERSIONHANDOFF', { receiptId, decisionId, postParentDigest });
  const receipt = {
    receipt_id: receiptId, resolution_request_id: request.resolution_request_id, idempotency_key: request.idempotency_key,
    decision_request_id: s.decision_request_id, decision_request_version: s.decision_request_version, decision_request_digest: s.decision_request_digest,
    decision_id: decisionId, decision_type: s.decision_type, author_actor_ref: request.author_actor_ref, author_authority_proof_ref: request.author_authority_proof_ref,
    selected_option_identity: clone(choice.identity), pre_parent_state_version: parentState.state_version, pre_parent_state_digest: digestState(parentState),
    pre_queue_ledger_version: ledger.queue_ledger_version, pre_queue_ledger_digest: digestLedger(ledger), post_parent_state_version: parentOut.state_version,
    post_parent_state_digest: postParentDigest, post_queue_ledger_version: out.queue_ledger_version, post_queue_ledger_digest: null,
    subject_identity_refs: clone(s.subject_identity_refs), option_set_digest: s.option_set_digest, confirmation_evidence_ref: confirmationRef,
    version_rollback_authority_handoff_ref: handoffId,
  };
  out.resolution_receipts[receiptId] = receipt;
  out.outbox_entries[handoffId] = {
    handoff_id: handoffId, authority_kind: 'AUTHOR_DECISION', operation: 'RECORD_AUTHORIZED_PARENT_SUCCESSOR',
    pre_parent_state_version: parentState.state_version, pre_parent_state_digest: digestState(parentState),
    post_parent_state_version: parentOut.state_version, post_parent_state_digest: postParentDigest, authority_receipt_ref: receiptId, decision_id: decisionId,
  };
  const result = { operation: 'RESOLVE', receipt_id: receiptId, decision_id: decisionId, decision_request_id: resolvedId, decision_status: choice.status, version_rollback_authority_handoff_ref: handoffId };
  registerProcessed(out, request.idempotency_key, request.resolution_request_id, normalized, result);
  receipt.post_queue_ledger_digest = digestLedger(out);
  out.resolution_receipts[receiptId] = receipt;
  return { ...result, replay: false, parent_state: parentOut, queue_ledger: out, resolution_receipt: clone(receipt), version_rollback_authority_handoff: clone(out.outbox_entries[handoffId]) };
}

module.exports = {
  QueueError, stableStringify, sha256, digestState, digestLedger, digestRequest,
  createQueueLedger, validateLedger, normalizeOptions, enqueue, present, defer, reopen, withdraw, markStale, supersede,
  presentationProjection, resolve,
};
