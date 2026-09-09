'use strict';

const crypto = require('crypto');

class ExportFreezeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExportFreezeError';
    this.code = code;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  const bytes = typeof value === 'string' ? value : stableStringify(value);
  return crypto.createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExportFreezeError('INVALID_REQUEST', name);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new ExportFreezeError('INVALID_REQUEST', name);
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ExportFreezeError('INVALID_DIGEST', name);
  }
  return value;
}

function parentDigest(state) {
  return digest(state);
}

function normalizedRequest(request) {
  const copy = clone(request);
  delete copy.received_at;
  delete copy.trace_id;
  return canonicalize(copy);
}

function assertNoPublicationAuthority(request) {
  if (request.publication_authorized === true) throw new ExportFreezeError('PUBLICATION_AUTHORITY_FORBIDDEN');
  const providers = [request.artifact_evidence, request.target_medium_evidence, request.provenance_evidence];
  for (const evidence of providers) {
    if (evidence && (evidence.publication_authorized === true || evidence.publication_authority_state === 'AUTHOR_APPROVED')) {
      throw new ExportFreezeError('PROVIDER_PUBLICATION_AUTHORITY_FORBIDDEN');
    }
    if (evidence && evidence.technical_state === 'EXPORT_FROZEN') {
      throw new ExportFreezeError('PROVIDER_FREEZE_AUTHORITY_FORBIDDEN');
    }
  }
}

function findCanonicalManuscript(state, request) {
  const activeRef = state.active && state.active.canonical_manuscript_ref;
  if (activeRef !== request.canonical_manuscript_ref) throw new ExportFreezeError('ACTIVE_MANUSCRIPT_REF_MISMATCH');
  const manuscripts = Array.isArray(state.manuscripts) ? state.manuscripts : [];
  const manuscript = manuscripts.find(m =>
    m && (m.manuscript_id === request.canonical_manuscript_ref || m.version_id === request.canonical_manuscript_ref || m.manuscript_ref === request.canonical_manuscript_ref)
  );
  if (!manuscript) throw new ExportFreezeError('CANONICAL_MANUSCRIPT_NOT_FOUND');
  if (manuscript.authority_state !== 'CANONICAL') throw new ExportFreezeError('MANUSCRIPT_NOT_CANONICAL');
  if (manuscript.version_id !== request.canonical_manuscript_version_id) throw new ExportFreezeError('MANUSCRIPT_VERSION_MISMATCH');
  if (manuscript.artifact_digest !== request.canonical_manuscript_digest) throw new ExportFreezeError('MANUSCRIPT_DIGEST_MISMATCH');
  return manuscript;
}

function assertProject(state, request) {
  const project = state.book_project;
  if (!project || project.book_project_id !== request.book_project_id || project.book_id !== request.book_id) {
    throw new ExportFreezeError('BOOK_PROJECT_IDENTITY_MISMATCH');
  }
  if (project.status !== 'FINALIZATION') throw new ExportFreezeError('PROJECT_NOT_FINALIZATION');
}

function assertParentCAS(state, request) {
  if (state.state_version !== request.expected_parent_state_version) throw new ExportFreezeError('STALE_PARENT_VERSION');
  const actual = parentDigest(state);
  if (actual !== request.expected_parent_state_digest) throw new ExportFreezeError('STALE_PARENT_DIGEST');
}

function assertArtifactEvidence(request) {
  const e = requireObject(request.artifact_evidence, 'artifact_evidence');
  const required = ['artifact_ref','artifact_digest','source_version_identity','source_digest_identity','format_identity','target_profile_identity','currentness','format_validation_result','source_to_render_integrity_result'];
  for (const key of required) if (e[key] === undefined || e[key] === null || e[key] === '') throw new ExportFreezeError('MISSING_ARTIFACT_EVIDENCE', key);
  if (e.artifact_ref !== request.artifact_ref || e.artifact_digest !== request.artifact_digest) throw new ExportFreezeError('ARTIFACT_EVIDENCE_IDENTITY_MISMATCH');
  if (e.source_version_identity !== request.canonical_manuscript_version_id || e.source_digest_identity !== request.canonical_manuscript_digest) throw new ExportFreezeError('ARTIFACT_SOURCE_BINDING_MISMATCH');
  if (e.format_identity !== request.format) throw new ExportFreezeError('ARTIFACT_FORMAT_MISMATCH');
  if (e.target_profile_identity !== `${request.target_medium_profile_id}@${request.target_medium_profile_version}`) throw new ExportFreezeError('ARTIFACT_PROFILE_MISMATCH');
  if (e.currentness !== 'CURRENT') throw new ExportFreezeError('ARTIFACT_EVIDENCE_STALE');
  if (e.format_validation_result !== 'PASS') throw new ExportFreezeError('FORMAT_VALIDATION_NOT_PASS');
  if (e.source_to_render_integrity_result !== 'PASS') throw new ExportFreezeError('SOURCE_TO_RENDER_NOT_PASS');
}

function assertTargetMediumEvidence(request) {
  const e = requireObject(request.target_medium_evidence, 'target_medium_evidence');
  const required = ['technical_state','validation_state','source_to_render_integrity_state','accessibility_state','proof_state','correction_ledger_ref','rendered_artifact_digest','currentness'];
  for (const key of required) if (e[key] === undefined || e[key] === null || e[key] === '') throw new ExportFreezeError('MISSING_TARGET_MEDIUM_EVIDENCE', key);
  if (e.technical_state !== 'POST_LAYOUT_PROOF_COMPLETE') throw new ExportFreezeError('TECHNICAL_STATE_NOT_PROOF_COMPLETE');
  if (e.validation_state !== 'PASS') throw new ExportFreezeError('TARGET_VALIDATION_NOT_PASS');
  if (e.source_to_render_integrity_state !== 'PASS') throw new ExportFreezeError('TARGET_INTEGRITY_NOT_PASS');
  if (!['PASS','NOT_APPLICABLE'].includes(e.accessibility_state)) throw new ExportFreezeError('ACCESSIBILITY_NOT_PASS');
  if (e.proof_state !== 'PASS') throw new ExportFreezeError('PROOF_NOT_PASS');
  if (e.currentness !== 'CURRENT') throw new ExportFreezeError('TARGET_EVIDENCE_STALE');
  if (e.rendered_artifact_digest !== request.artifact_digest) throw new ExportFreezeError('PROOF_ARTIFACT_DIGEST_MISMATCH');
}

function assertProvenance(request) {
  const e = requireObject(request.provenance_evidence, 'provenance_evidence');
  requireDigest(e.artifact_digest, 'provenance artifact digest');
  requireDigest(e.source_digest, 'provenance source digest');
  requireDigest(e.profile_digest, 'provenance profile digest');
  if (e.artifact_digest !== request.artifact_digest || e.source_digest !== request.canonical_manuscript_digest || e.profile_digest !== request.target_medium_profile_digest) {
    throw new ExportFreezeError('PROVENANCE_BINDING_MISMATCH');
  }
  if (e.currentness !== 'CURRENT' || e.standing !== 'VALID') throw new ExportFreezeError('PROVENANCE_NOT_CURRENT_VALID');
}

function assertRightsPrivacy(request) {
  const e = requireObject(request.rights_privacy_evidence, 'rights_privacy_evidence');
  if (e.source_digest !== request.canonical_manuscript_digest) throw new ExportFreezeError('RIGHTS_SOURCE_BINDING_MISMATCH');
  if (e.rights_state !== 'ELIGIBLE') throw new ExportFreezeError('RIGHTS_NOT_ELIGIBLE');
  if (e.privacy_state !== 'ELIGIBLE') throw new ExportFreezeError('PRIVACY_NOT_ELIGIBLE');
  if (e.currentness !== 'CURRENT') throw new ExportFreezeError('RIGHTS_PRIVACY_STALE');
}

function assertProofCorrection(request) {
  const e = requireObject(request.proof_correction_state, 'proof_correction_state');
  if (e.currentness !== 'CURRENT') throw new ExportFreezeError('CORRECTION_LEDGER_STALE');
  if (!Number.isInteger(e.open_corrections) || e.open_corrections !== 0) throw new ExportFreezeError('OPEN_PROOF_CORRECTIONS');
  if (e.last_validated_artifact_digest !== request.artifact_digest || e.last_proved_artifact_digest !== request.artifact_digest) {
    throw new ExportFreezeError('CHANGED_BYTES_AFTER_VALIDATION_OR_PROOF');
  }
  if (e.correction_ledger_ref !== request.target_medium_evidence.correction_ledger_ref) throw new ExportFreezeError('CORRECTION_LEDGER_BINDING_MISMATCH');
}

function validateRequestShape(request) {
  requireObject(request, 'request');
  const textFields = ['request_id','idempotency_key','book_id','book_project_id','canonical_manuscript_ref','canonical_manuscript_version_id','artifact_ref','format','target_medium_profile_id','target_medium_profile_version','requested_release_id'];
  for (const key of textFields) requireText(request[key], key);
  requireDigest(request.expected_parent_state_digest, 'expected_parent_state_digest');
  requireDigest(request.canonical_manuscript_digest, 'canonical_manuscript_digest');
  requireDigest(request.artifact_digest, 'artifact_digest');
  requireDigest(request.target_medium_profile_digest, 'target_medium_profile_digest');
  if (!Number.isInteger(request.expected_parent_state_version) || request.expected_parent_state_version < 0) throw new ExportFreezeError('INVALID_PARENT_VERSION');
}

function releaseRecord(request) {
  return {
    release_id: request.requested_release_id,
    frozen_version_id: request.canonical_manuscript_version_id,
    format: request.format,
    digest: request.artifact_digest,
    approval_state: 'FROZEN',
    publication_authority_state: 'NOT_AUTHORIZED',
    evidence_type: 'EXPORT_FREEZE_READY',
    book_id: request.book_id,
    book_project_id: request.book_project_id,
    canonical_manuscript_ref: request.canonical_manuscript_ref,
    canonical_manuscript_digest: request.canonical_manuscript_digest,
    target_medium_profile_id: request.target_medium_profile_id,
    target_medium_profile_version: request.target_medium_profile_version,
    target_medium_profile_digest: request.target_medium_profile_digest,
    artifact_ref: request.artifact_ref,
    artifact_digest: request.artifact_digest,
    proof_bundle_digest: digest({artifact: request.artifact_evidence, target: request.target_medium_evidence, correction: request.proof_correction_state}),
    provenance_digest: digest(request.provenance_evidence),
    rights_privacy_digest: digest(request.rights_privacy_evidence),
    release_group_ref: request.release_group_ref || null,
    supersedes_release_ref: request.supersedes_release_ref || null,
    created_from_parent_state_version: request.expected_parent_state_version,
    created_from_parent_state_digest: request.expected_parent_state_digest
  };
}

function assertReleaseIdentityAvailable(state, request) {
  const releases = Array.isArray(state.export_releases) ? state.export_releases : [];
  const existing = releases.find(r => r && r.release_id === request.requested_release_id);
  if (!existing) return;
  const candidate = releaseRecord(request);
  if (stableStringify(existing) === stableStringify(candidate)) throw new ExportFreezeError('RELEASE_ALREADY_EXISTS_WITHOUT_IDEMPOTENCY_RECEIPT');
  throw new ExportFreezeError('RELEASE_ID_CONFLICT');
}

class ExportFreezeRuntime {
  constructor(snapshot = {}) {
    this.idempotency = clone(snapshot.idempotency || {});
    this.receipts = clone(snapshot.receipts || {});
  }

  snapshot() {
    return clone({idempotency: this.idempotency, receipts: this.receipts});
  }

  freeze(parentStateInput, requestInput) {
    const state = clone(parentStateInput);
    const request = clone(requestInput);
    validateRequestShape(request);
    const requestDigest = digest(normalizedRequest(request));
    const prior = this.idempotency[request.idempotency_key];
    if (prior) {
      if (prior.request_digest !== requestDigest) throw new ExportFreezeError('IDEMPOTENCY_CONFLICT');
      const releaseExists = Array.isArray(state.export_releases) && state.export_releases.some(r => r && r.release_id === prior.release_id && r.digest === prior.artifact_digest);
      if (!releaseExists) throw new ExportFreezeError('IDEMPOTENT_REPLAY_RELEASE_MISSING');
      return {state, receipt: clone(this.receipts[prior.receipt_id]), replayed: true};
    }

    assertNoPublicationAuthority(request);
    assertParentCAS(state, request);
    assertProject(state, request);
    findCanonicalManuscript(state, request);
    assertArtifactEvidence(request);
    assertTargetMediumEvidence(request);
    assertProvenance(request);
    assertRightsPrivacy(request);
    assertProofCorrection(request);
    assertReleaseIdentityAvailable(state, request);

    const beforeDigest = parentDigest(state);
    const release = releaseRecord(request);
    const next = clone(state);
    if (!Array.isArray(next.export_releases)) next.export_releases = [];
    next.export_releases.push(release);
    next.state_version = state.state_version + 1;
    const afterDigest = parentDigest(next);
    const receiptId = `EXPORT-FREEZE-RECEIPT:${digest({request_digest: requestDigest, release_id: release.release_id, before_digest: beforeDigest, after_digest: afterDigest}).slice(0, 32)}`;
    const receipt = {
      receipt_id: receiptId,
      objective: 'BOOK-SYSTEM-EXPORT-FREEZE-001',
      request_id: request.request_id,
      request_digest: requestDigest,
      release_id: release.release_id,
      artifact_digest: release.artifact_digest,
      source_digest: release.canonical_manuscript_digest,
      target_medium_profile_digest: release.target_medium_profile_digest,
      before_state_version: state.state_version,
      before_state_digest: beforeDigest,
      after_state_version: next.state_version,
      after_state_digest: afterDigest,
      lifecycle_status_before: state.book_project.status,
      lifecycle_status_after: next.book_project.status,
      lifecycle_mutated: false,
      lifecycle_handoff_evidence_type: 'EXPORT_FREEZE_READY',
      publication_authorized: false,
      author_choice_created: false,
      document_bytes_generated_or_modified: false
    };
    this.idempotency[request.idempotency_key] = {
      request_digest: requestDigest,
      release_id: release.release_id,
      artifact_digest: release.artifact_digest,
      receipt_id: receiptId
    };
    this.receipts[receiptId] = clone(receipt);
    return {state: next, release: clone(release), receipt: clone(receipt), replayed: false};
  }
}

module.exports = {
  ExportFreezeError,
  ExportFreezeRuntime,
  stableStringify,
  digest,
  parentDigest,
  normalizedRequest,
  releaseRecord
};
