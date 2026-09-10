'use strict';

const crypto = require('crypto');
const vr = require('./version-and-rollback-core.js');

class ExportFreezeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ExportFreezeError';
    this.code = code;
    this.detail = detail;
  }
}

const AFFIRMATIVE = new Set(['APPROVE', 'APPROVED', 'ACCEPT', 'ACCEPTED', 'PROMOTE', 'PROMOTED', 'YES', true]);
const FORMAT_IDENTITIES = new Set(['DOCX', 'PDF', 'EPUB', 'PRINT_PDF', 'OTHER_DECLARED']);

function fail(code, detail = '') { throw new ExportFreezeError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const f of fields) if (!own(v, f)) fail('REQUIRED_FIELD_MISSING', `${label}.${f}`);
}
function stable(v) { return vr.stable(v); }
function digest(v) { return vr.digest(v); }
function makeId(prefix, seed, n = 28) { return `${prefix}-${digest(seed).slice(0, n).toUpperCase()}`; }

function freezeLedgerProjection(ledger) {
  const copy = clone(ledger);
  if (obj(copy.freeze_receipts)) {
    for (const receipt of Object.values(copy.freeze_receipts)) {
      if (!obj(receipt)) continue;
      receipt.post_freeze_ledger_digest = '__SELF_EXCLUDED__';
    }
  }
  return copy;
}
function digestFreezeLedger(ledger) { return digest(freezeLedgerProjection(ledger)); }

function createFreezeLedger(parentState) {
  vr.validateParentState(parentState);
  return {
    ledger_schema_version: 1,
    ledger_version: 1,
    bound_parent_state_version: parentState.state_version,
    bound_parent_state_digest: parentState.state_digest,
    processed_requests: {},
    freeze_receipts: {},
  };
}

function validateFreezeLedger(parentState, ledger) {
  vr.validateParentState(parentState);
  req(ledger, ['ledger_schema_version', 'ledger_version', 'bound_parent_state_version', 'bound_parent_state_digest', 'processed_requests', 'freeze_receipts'], 'freeze_ledger');
  if (ledger.ledger_schema_version !== 1 || !Number.isInteger(ledger.ledger_version) || ledger.ledger_version < 1) fail('INVALID_FREEZE_LEDGER');
  if (!obj(ledger.processed_requests) || !obj(ledger.freeze_receipts)) fail('INVALID_FREEZE_LEDGER_INDEX');
  if (ledger.bound_parent_state_version !== parentState.state_version || ledger.bound_parent_state_digest !== parentState.state_digest) fail('FREEZE_LEDGER_PARENT_BINDING_MISMATCH');
  return true;
}

function requestFingerprint(request) { return digest(request); }
function checkReplay(ledger, request) {
  if (!nonEmpty(request.freeze_request_id) || !nonEmpty(request.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  const fingerprint = requestFingerprint(request);
  const prior = ledger.processed_requests[request.idempotency_key];
  if (prior) {
    if (prior.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.freeze_request_id !== request.freeze_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    const receipt = ledger.freeze_receipts[prior.release_receipt_id];
    if (!receipt) fail('PROCESSED_REQUEST_RECEIPT_MISSING');
    return { replay: true, fingerprint, receipt: clone(receipt) };
  }
  for (const p of Object.values(ledger.processed_requests)) {
    if (p.freeze_request_id === request.freeze_request_id) fail('REQUEST_ID_CONFLICT');
  }
  return { replay: false, fingerprint };
}

function validateRequestShape(request) {
  req(request, [
    'freeze_request_id', 'idempotency_key', 'actor_class', 'expected_parent_state_version', 'expected_parent_state_digest',
    'expected_freeze_ledger_version', 'expected_freeze_ledger_digest', 'release_id', 'release_group_ref',
    'canonical_manuscript_identity', 'artifact_evidence', 'target_medium_evidence', 'rights_privacy_evidence',
    'provenance_evidence', 'parent_admission_refs', 'author_decision_refs', 'created_at'
  ], 'freeze_request');
  req(request.canonical_manuscript_identity, ['manuscript_id', 'version_id', 'artifact_digest'], 'canonical_manuscript_identity');
  req(request.artifact_evidence, [
    'artifact_ref', 'artifact_digest', 'artifact_currentness', 'format_identity', 'source_manuscript_id', 'source_version_id',
    'source_digest', 'generator_or_toolchain_identity'
  ], 'artifact_evidence');
  req(request.target_medium_evidence, [
    'target_medium_profile_id', 'target_medium_profile_version', 'technical_state', 'format_validation_result',
    'source_to_render_integrity_result', 'accessibility_result', 'accessibility_rationale', 'proof_result',
    'correction_ledger_ref', 'correction_ledger_state', 'rendered_candidate_digest'
  ], 'target_medium_evidence');
  req(request.rights_privacy_evidence, ['rights_state', 'privacy_state', 'evidence_ref'], 'rights_privacy_evidence');
  req(request.provenance_evidence, ['currentness_state', 'validation_result', 'projection_ref', 'bound_artifact_digest'], 'provenance_evidence');
  if (!Array.isArray(request.parent_admission_refs) || !Array.isArray(request.author_decision_refs)) fail('REFERENCE_ARRAY_REQUIRED');
  if (!nonEmpty(request.release_id)) fail('RELEASE_ID_REQUIRED');
  if (request.release_group_ref !== null && !nonEmpty(request.release_group_ref)) fail('INVALID_RELEASE_GROUP_REF');
  if (!nonEmpty(request.created_at)) fail('CREATED_AT_REQUIRED');
}

function resolveCanonicalManuscript(parentState, identity) {
  const records = vr.objectRecords(parentState).filter(r => r.type === 'MANUSCRIPT_MANIFEST');
  const activeRef = parentState.active.canonical_manuscript_ref;
  const candidates = records.filter(r => activeRef === r.object_id || activeRef === `${r.object_id}:${r.object_version}`);
  if (candidates.length !== 1) fail('ACTIVE_CANONICAL_MANUSCRIPT_AMBIGUOUS_OR_MISSING');
  const record = candidates[0];
  if (record.payload.authority_state !== 'CANONICAL') fail('ACTIVE_MANUSCRIPT_NOT_CANONICAL');
  if (String(identity.manuscript_id) !== record.object_id || String(identity.version_id) !== record.object_version) fail('CANONICAL_MANUSCRIPT_IDENTITY_MISMATCH');
  if (!isSha(identity.artifact_digest) || identity.artifact_digest !== record.payload.artifact_digest) fail('CANONICAL_MANUSCRIPT_DIGEST_MISMATCH');
  return record;
}

function validateAdmissions(parentState, refs) {
  const seen = new Set();
  for (const ref of refs) {
    if (!nonEmpty(ref) || seen.has(ref)) fail('INVALID_OR_DUPLICATE_PARENT_ADMISSION_REF', String(ref));
    seen.add(ref);
    const proposal = parentState.integration_proposals.find(p => p && p.proposal_id === ref);
    if (!proposal) fail('PARENT_ADMISSION_REF_NOT_FOUND', ref);
    const state = proposal.admission_state || proposal.state;
    if (state !== 'ADMITTED') fail('PARENT_ADMISSION_NOT_ADMITTED', `${ref}:${String(state)}`);
  }
}

function validateAuthorDecisions(parentState, refs) {
  const seen = new Set();
  for (const ref of refs) {
    if (!nonEmpty(ref) || seen.has(ref)) fail('INVALID_OR_DUPLICATE_AUTHOR_DECISION_REF', String(ref));
    seen.add(ref);
    const decision = parentState.author_decisions.find(d => d && d.decision_id === ref);
    if (!decision) fail('AUTHOR_DECISION_REF_NOT_FOUND', ref);
    if (decision.status !== 'APPROVED' || !AFFIRMATIVE.has(decision.author_choice)) fail('AUTHOR_DECISION_NOT_AFFIRMATIVE_CURRENT', ref);
  }
}

function validateEvidence(request, manuscriptRecord) {
  const a = request.artifact_evidence;
  const t = request.target_medium_evidence;
  const rp = request.rights_privacy_evidence;
  const p = request.provenance_evidence;

  if (!nonEmpty(a.artifact_ref) || !isSha(a.artifact_digest)) fail('INVALID_EXPORT_ARTIFACT_IDENTITY');
  if (a.artifact_currentness !== 'CURRENT_FOR_BOUND_SOURCE') fail('EXPORT_ARTIFACT_NOT_CURRENT');
  if (!FORMAT_IDENTITIES.has(a.format_identity)) fail('UNSUPPORTED_OR_UNDECLARED_FORMAT_IDENTITY', String(a.format_identity));
  if (String(a.source_manuscript_id) !== manuscriptRecord.object_id || String(a.source_version_id) !== manuscriptRecord.object_version || a.source_digest !== manuscriptRecord.payload.artifact_digest) fail('EXPORT_SOURCE_MANUSCRIPT_MISMATCH');
  if (!isSha(a.source_digest) || !nonEmpty(a.generator_or_toolchain_identity)) fail('INVALID_EXPORT_SOURCE_OR_TOOLCHAIN_IDENTITY');

  if (!nonEmpty(t.target_medium_profile_id) || !nonEmpty(String(t.target_medium_profile_version))) fail('TARGET_MEDIUM_PROFILE_REQUIRED');
  if (t.technical_state !== 'POST_LAYOUT_PROOF_COMPLETE') fail('POST_LAYOUT_PROOF_NOT_COMPLETE');
  if (t.format_validation_result !== 'PASS') fail('FORMAT_VALIDATION_NOT_PASS');
  if (t.source_to_render_integrity_result !== 'PASS') fail('SOURCE_TO_RENDER_INTEGRITY_NOT_PASS');
  if (t.proof_result !== 'PASS') fail('POST_LAYOUT_PROOF_NOT_PASS');
  if (t.accessibility_result === 'PASS') {
    // no additional rationale required
  } else if (t.accessibility_result === 'NOT_APPLICABLE_WITH_RATIONALE') {
    if (!nonEmpty(t.accessibility_rationale)) fail('ACCESSIBILITY_NA_RATIONALE_REQUIRED');
  } else {
    fail('ACCESSIBILITY_NOT_ACCEPTABLE', String(t.accessibility_result));
  }
  if (!nonEmpty(t.correction_ledger_ref) || t.correction_ledger_state !== 'CLOSED_CURRENT') fail('CORRECTION_LEDGER_NOT_CLOSED_CURRENT');
  if (!isSha(t.rendered_candidate_digest) || t.rendered_candidate_digest !== a.artifact_digest) fail('RENDERED_CANDIDATE_DIGEST_MISMATCH');

  if (rp.rights_state !== 'CURRENT_AUTHORIZED') fail('RIGHTS_NOT_CURRENT_AUTHORIZED');
  if (rp.privacy_state !== 'CURRENT_ALLOWED') fail('PRIVACY_NOT_CURRENT_ALLOWED');
  if (!nonEmpty(rp.evidence_ref)) fail('RIGHTS_PRIVACY_EVIDENCE_REF_REQUIRED');

  if (!isSha(p.bound_artifact_digest) || p.bound_artifact_digest !== a.artifact_digest) fail('PROVENANCE_ARTIFACT_BINDING_MISMATCH');
  if (p.currentness_state === 'NONE') {
    if (p.validation_result !== 'NOT_APPLICABLE') fail('PROVENANCE_NONE_VALIDATION_MUST_BE_NA');
    if (p.projection_ref !== null && p.projection_ref !== '') fail('PROVENANCE_NONE_PROJECTION_REF_FORBIDDEN');
  } else if (p.currentness_state === 'CURRENT_FOR_BOUND_SOURCE_AND_ARTIFACT') {
    if (p.validation_result !== 'PASS') fail('PROVENANCE_VALIDATION_NOT_PASS');
    if (!nonEmpty(p.projection_ref)) fail('PROVENANCE_PROJECTION_REF_REQUIRED');
  } else {
    fail('PROVENANCE_NOT_CURRENT', String(p.currentness_state));
  }
}

function releaseRecord(request, manuscriptRecord, fingerprint) {
  const a = request.artifact_evidence;
  const t = request.target_medium_evidence;
  const rp = request.rights_privacy_evidence;
  const p = request.provenance_evidence;
  return {
    release_id: request.release_id,
    release_group_ref: request.release_group_ref,
    frozen_version_id: manuscriptRecord.object_version,
    format: a.format_identity,
    digest: a.artifact_digest,
    approval_state: 'FROZEN',
    publication_authority_state: 'NOT_AUTHORIZED',
    evidence_type: 'EXPORT_FREEZE_READY',
    canonical_manuscript_id: manuscriptRecord.object_id,
    canonical_manuscript_version_id: manuscriptRecord.object_version,
    canonical_manuscript_digest: manuscriptRecord.payload.artifact_digest,
    artifact_ref: a.artifact_ref,
    artifact_currentness: a.artifact_currentness,
    target_medium_profile_id: t.target_medium_profile_id,
    target_medium_profile_version: String(t.target_medium_profile_version),
    technical_state: t.technical_state,
    format_validation_result: t.format_validation_result,
    source_to_render_integrity_result: t.source_to_render_integrity_result,
    accessibility_result: t.accessibility_result,
    accessibility_rationale: t.accessibility_rationale,
    proof_result: t.proof_result,
    correction_ledger_ref: t.correction_ledger_ref,
    rights_evidence_ref: rp.evidence_ref,
    privacy_evidence_ref: rp.evidence_ref,
    provenance_projection_ref: p.projection_ref,
    provenance_currentness_state: p.currentness_state,
    parent_admission_refs: clone(request.parent_admission_refs),
    author_decision_refs: clone(request.author_decision_refs),
    freeze_request_id: request.freeze_request_id,
    freeze_request_fingerprint: fingerprint,
    pre_parent_state_version: request.expected_parent_state_version,
    pre_parent_state_digest: request.expected_parent_state_digest,
    frozen_at: request.created_at,
  };
}

function evidenceBundleDigest(request) {
  return digest({
    canonical_manuscript_identity: request.canonical_manuscript_identity,
    artifact_evidence: request.artifact_evidence,
    target_medium_evidence: request.target_medium_evidence,
    rights_privacy_evidence: request.rights_privacy_evidence,
    provenance_evidence: request.provenance_evidence,
    parent_admission_refs: request.parent_admission_refs,
    author_decision_refs: request.author_decision_refs,
  });
}

function freezeExport({ parentState: parentInput, freezeLedger: ledgerInput, request: requestInput }) {
  const parentState = clone(parentInput);
  const freezeLedger = clone(ledgerInput);
  const request = clone(requestInput);
  vr.validateParentState(parentState);
  validateFreezeLedger(parentState, freezeLedger);
  validateRequestShape(request);

  const replay = checkReplay(freezeLedger, request);
  if (replay.replay) {
    return {
      disposition: 'REPLAY',
      parent_state: parentState,
      freeze_ledger: freezeLedger,
      release: clone(parentState.export_releases.find(r => r && r.release_id === replay.receipt.release_id) || null),
      release_receipt: replay.receipt,
    };
  }

  if (request.actor_class !== 'PARENT_SYSTEM') fail('EXPORT_FREEZE_AUTHORITY_DENIED', String(request.actor_class));
  if (request.expected_parent_state_version !== parentState.state_version || request.expected_parent_state_digest !== parentState.state_digest) fail('STALE_PARENT_WRITE');
  if (request.expected_freeze_ledger_version !== freezeLedger.ledger_version || request.expected_freeze_ledger_digest !== digestFreezeLedger(freezeLedger)) fail('STALE_FREEZE_LEDGER_WRITE');
  if (!parentState.book_project || parentState.book_project.status !== 'FINALIZATION') fail('EXPORT_FREEZE_REQUIRES_FINALIZATION');
  if (parentState.export_releases.some(r => r && r.release_id === request.release_id)) fail('RELEASE_ID_CONFLICT', request.release_id);

  const manuscriptRecord = resolveCanonicalManuscript(parentState, request.canonical_manuscript_identity);
  validateEvidence(request, manuscriptRecord);
  validateAdmissions(parentState, request.parent_admission_refs);
  validateAuthorDecisions(parentState, request.author_decision_refs);

  const release = releaseRecord(request, manuscriptRecord, replay.fingerprint);
  const successor = clone(parentState);
  delete successor.state_digest;
  successor.state_version = parentState.state_version + 1;
  successor.export_releases.push(release);
  const postState = vr.sealState(successor);
  vr.validateParentState(postState);
  vr.validateAppendOnlyPreservation(parentState, postState);
  if (postState.book_project.status !== parentState.book_project.status) fail('EXPORT_FREEZE_LIFECYCLE_MUTATION_FORBIDDEN');
  if (stable(postState.active) !== stable(parentState.active)) fail('EXPORT_FREEZE_ACTIVE_POINTER_MUTATION_FORBIDDEN');

  const nextLedger = clone(freezeLedger);
  nextLedger.ledger_version += 1;
  nextLedger.bound_parent_state_version = postState.state_version;
  nextLedger.bound_parent_state_digest = postState.state_digest;
  const receiptId = makeId('ERCP', {
    freeze_request_id: request.freeze_request_id,
    release_id: request.release_id,
    pre: parentState.state_digest,
    post: postState.state_digest,
    evidence: evidenceBundleDigest(request),
  });
  const receipt = {
    release_receipt_id: receiptId,
    freeze_request_id: request.freeze_request_id,
    idempotency_key: request.idempotency_key,
    release_id: request.release_id,
    pre_parent_state_version: parentState.state_version,
    pre_parent_state_digest: parentState.state_digest,
    post_parent_state_version: postState.state_version,
    post_parent_state_digest: postState.state_digest,
    pre_freeze_ledger_version: freezeLedger.ledger_version,
    pre_freeze_ledger_digest: digestFreezeLedger(freezeLedger),
    post_freeze_ledger_version: nextLedger.ledger_version,
    post_freeze_ledger_digest: '__PENDING__',
    canonical_manuscript_identity: clone(request.canonical_manuscript_identity),
    artifact_ref: request.artifact_evidence.artifact_ref,
    artifact_digest: request.artifact_evidence.artifact_digest,
    target_medium_profile_id: request.target_medium_evidence.target_medium_profile_id,
    target_medium_profile_version: String(request.target_medium_evidence.target_medium_profile_version),
    evidence_bundle_digest: evidenceBundleDigest(request),
    publication_authority_state: 'NOT_AUTHORIZED',
    lifecycle_status_before: parentState.book_project.status,
    lifecycle_status_after: postState.book_project.status,
    lifecycle_handoff_evidence_ref: request.release_id,
  };
  nextLedger.freeze_receipts[receiptId] = receipt;
  nextLedger.processed_requests[request.idempotency_key] = {
    freeze_request_id: request.freeze_request_id,
    request_fingerprint: replay.fingerprint,
    release_receipt_id: receiptId,
  };
  receipt.post_freeze_ledger_digest = digestFreezeLedger(nextLedger);
  nextLedger.freeze_receipts[receiptId] = receipt;
  validateFreezeLedger(postState, nextLedger);

  return {
    disposition: 'COMMITTED',
    parent_state: postState,
    freeze_ledger: nextLedger,
    release: clone(release),
    release_receipt: clone(receipt),
  };
}

module.exports = {
  ExportFreezeError,
  FORMAT_IDENTITIES,
  stable,
  digest,
  digestFreezeLedger,
  createFreezeLedger,
  validateFreezeLedger,
  requestFingerprint,
  resolveCanonicalManuscript,
  freezeExport,
};
