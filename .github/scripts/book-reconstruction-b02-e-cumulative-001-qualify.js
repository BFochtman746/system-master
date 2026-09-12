'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const intake = require(path.join(root, 'system-master/book-system/book-source-recovery-acceptance-v1.js'));
const recovery = require(path.join(root, 'system-master/book-system/book-existing-book-recovery-adapter-v1.js'));
const admission = require(path.join(root, 'system-master/book-system/book-recovered-baseline-admission-v1.js'));
const vr = require(path.join(root, 'system-master/book-system/version-and-rollback.js'));
const queue = require(path.join(root, 'system-master/book-system/author-decision-current-subject-guard.js'));
const lifecycleCompatibility = require(path.join(root, 'system-master/book-system/lifecycle-current-parent-compatibility-adapter.js'));
const lifecycleRebind = require(path.join(root, 'system-master/book-system/lifecycle-current-parent-rebind-adapter.js'));

const lifecycleContract = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json'), 'utf8'));
const vrFixtures = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json'), 'utf8'));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function assert(ok, code, detail = '') {
  if (!ok) throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code });
}
function activeManuscript(parent) {
  const active = parent.active.canonical_manuscript_ref;
  const record = vr.objectRecords(parent).find(r => r.type === 'MANUSCRIPT_MANIFEST' && (active === r.object_id || active === `${r.object_id}:${r.object_version}`));
  assert(record, 'ACTIVE_MANUSCRIPT_NOT_FOUND');
  return record;
}
function subjectRef(record) {
  return { object_id: String(record.object_id), object_version: String(record.object_version), object_digest: record.object_digest };
}
function projectRef(parent) {
  return { object_id: String(parent.book_project.book_project_id), object_version: `STATE-${parent.state_version}`, object_digest: vr.digest(parent.book_project) };
}
function decisionOptions() {
  return [
    { option_id: 'APPROVE', label: 'Approve recovered baseline', effect: 'Permit bounded recovered-baseline admission', consequence_class: 'ROUTINE_REVERSIBLE', canonical_decision_status: 'APPROVED' },
    { option_id: 'REJECT', label: 'Reject recovered baseline', effect: 'Do not admit recovered baseline', consequence_class: 'ROUTINE_REVERSIBLE', canonical_decision_status: 'REJECTED' }
  ];
}
function digest(label) { return intake.sha256(label); }

const initial = vr.createVersionLedger(clone(vrFixtures.parent_state_template));
let parent = initial.parent_state;
let versionLedger = initial.version_ledger;
let lifecycleLedger = lifecycleCompatibility.createCompatibleLedger(lifecycleContract, parent, { unit_states: {}, dependency_edges: [] });

// 1) Real B02-D1 acceptance over deterministic provider evidence.
const sourceDigest = digest('B02-E-EXACT-SOURCE-BYTES');
const providerContractDigest = digest('B02-E-PROVIDER-CONTRACT');
const sourceInput = {
  book_project_id: parent.book_project.book_project_id,
  source_id: 'B02-E-SOURCE-001',
  source_kind: 'DOCX',
  source_locator_ref: 'provider://b02-e/source-001',
  provider_identity: {
    provider_class: 'QUALIFICATION_DOCUMENT_PROVIDER',
    provider_subject_ref: 'provider-subject://b02-e/deterministic-fixture',
    provider_contract_ref: 'provider-contract://b02-e/v1',
    provider_contract_digest: providerContractDigest,
    object_id: 'b02-e-object-001',
    object_version_or_generation: 'generation-1',
    content_address_or_etag: `sha256:${sourceDigest}`
  },
  source_digest_sha256: sourceDigest,
  source_byte_length: 8192,
  media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  provider_observation: { source_digest_sha256: sourceDigest, source_byte_length: 8192 },
  rights_evidence: {
    evidence_id: 'B02-E-RIGHTS-001',
    evidence_issuer_ref: 'authority://qualification-owner',
    evidence_ref: 'evidence://b02-e/rights/001',
    source_ref: 'provider://b02-e/source-001',
    source_digest: sourceDigest,
    intended_use_scopes: ['BOOK_RECOVERY_PRIVATE_USE'],
    currentness: 'CURRENT',
    effective_at: '2026-09-01T00:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    conflict_refs: [],
    policy_expression: { type: 'SPDX', license_expression: 'LicenseRef-B02EQualification' }
  },
  intended_use_scope: 'BOOK_RECOVERY_PRIVATE_USE',
  private_source_evidence_required: true,
  private_source_evidence: {
    evidence_ref: 'private-authority://b02-e/permission/001',
    evidence_digest: digest('B02-E-PRIVATE-PERMISSION'),
    currentness: 'CURRENT'
  }
};
const sourceAcceptance = intake.acceptOriginalBookSourceV1(sourceInput, { rights_options: { now: '2026-09-12T16:05:00.000Z' }, accepted_at: '2026-09-12T16:05:00.000Z' }).acceptance;
assert(intake.validateSourceCustodyAcceptanceV1(sourceAcceptance), 'SOURCE_ACCEPTANCE_INVALID');

const projectionArtifactRef = 'artifact://b02-e/normalized/source-001/v1';
const projectionArtifactDigest = digest('B02-E-NORMALIZED-ARTIFACT');
const recoveredContentDigest = digest('B02-E-RECOVERED-CONTENT');
const projectionAcceptance = intake.acceptNormalizedBookSourceProjectionV1({
  source_acceptance_id: sourceAcceptance.source_acceptance_id,
  source_acceptance_digest: sourceAcceptance.source_acceptance_digest,
  source_digest_sha256: sourceAcceptance.source_digest_sha256,
  extractor_identity: {
    provider_class: 'QUALIFICATION_DOCUMENT_PROVIDER',
    provider_subject_ref: 'provider-subject://b02-e/deterministic-fixture',
    provider_service_id: 'DOCX_EXTRACTOR',
    provider_operation_id: 'NORMALIZE_BOOK_SOURCE',
    provider_contract_ref: 'provider-contract://b02-e/v1',
    provider_contract_digest: providerContractDigest,
    extractor_version: 'qualification-1.0.0'
  },
  projection_artifact_ref: projectionArtifactRef,
  projection_artifact_digest: projectionArtifactDigest,
  recovered_content_digest_sha256: recoveredContentDigest,
  structure: [{ structure_id: 'chapter-1', kind: 'CHAPTER', title: 'Chapter 1', ordinal: 1, anchor: 'docx:p:1-24', confidence: 0.99, ambiguous: false }],
  metadata_ref_or_inline: { title: 'B02-E Deterministic Qualification Book' },
  citations_ref_or_inline: [],
  comments_ref_or_inline: [],
  todos_ref_or_inline: [],
  tracked_changes_ref_or_inline: [],
  story_bible_candidate_ref_or_inline: null,
  nonfiction_knowledge_candidate_ref_or_inline: null,
  voice_candidate_ref_or_inline: null,
  unit_evidence: []
}, sourceAcceptance);
assert(intake.validateNormalizedSourceProjectionV1(projectionAcceptance, sourceAcceptance), 'PROJECTION_ACCEPTANCE_INVALID');

// 2) Real B02-D2 adapter + existing semantic recovery engine.
const binding = recovery.buildBookRecoveryRuntimeBindingV1();
const manuscript = activeManuscript(parent);
const normalizedProjection = {
  structure: [{ structure_id: 'chapter-1', kind: 'CHAPTER', title: 'Chapter 1', ordinal: 1, anchor: 'docx:p:1-24', confidence: 0.99, ambiguous: false }],
  metadata: { title: 'B02-E Deterministic Qualification Book' },
  citations: [], comments: [], todos: [], tracked_changes: [],
  story_bible_candidates: [], nonfiction_knowledge_candidates: [], voice_candidates: []
};
const projectionArtifact = {
  artifact_ref: projectionArtifactRef,
  artifact_digest: projectionArtifactDigest,
  payload: {
    source_acceptance_id: sourceAcceptance.source_acceptance_id,
    source_acceptance_digest: sourceAcceptance.source_acceptance_digest,
    projection_id: projectionAcceptance.projection_id,
    projection_digest: projectionAcceptance.projection_digest,
    source_digest_sha256: sourceAcceptance.source_digest_sha256,
    recovered_content_digest_sha256: recoveredContentDigest,
    normalized_projection: normalizedProjection,
    version_candidate: {
      candidate_id: 'B02-E-CANDIDATE-001',
      manuscript_id: manuscript.object_id,
      version_id: 'B02-E-RECOVERED-CANDIDATE-V1',
      content_digest: recoveredContentDigest,
      parent_candidate_ids: [],
      authority_signal: 'UNRATIFIED'
    }
  }
};
const recoveryCommand = {
  capability_id: recovery.CURRENT_CAPABILITY_ID,
  owner_path: recovery.CURRENT_OWNER_PATH,
  binding_id: binding.binding_id,
  binding_digest: binding.binding_digest,
  book_project_id: parent.book_project.book_project_id,
  reentry_mode: 'RECOVER_EXISTING',
  source_acceptance_refs: [{ source_acceptance_id: sourceAcceptance.source_acceptance_id, source_acceptance_digest: sourceAcceptance.source_acceptance_digest }],
  projection_acceptance_refs: [{ projection_id: projectionAcceptance.projection_id, projection_digest: projectionAcceptance.projection_digest }]
};
const recoveryExecution = recovery.recoverExistingBookV1(recoveryCommand, {
  binding,
  source_acceptances: { [sourceAcceptance.source_acceptance_id]: sourceAcceptance },
  projection_acceptances: { [projectionAcceptance.projection_id]: projectionAcceptance },
  projection_artifacts: { [projectionArtifactRef]: projectionArtifact }
});
assert(recoveryExecution.engine_invoked === true, 'RECOVERY_ENGINE_NOT_INVOKED');
assert(recoveryExecution.canonical_effect === false, 'RECOVERY_CANONICAL_EFFECT_FORBIDDEN');
const baseline = recoveryExecution.recovery_result.recovered_book_baseline;
assert(baseline.standing === admission.RECOVERY_STANDING, 'RECOVERY_STANDING_INVALID');
assert((baseline.unresolved_findings || []).filter(x => x && x.severity === 'BLOCKING').length === 0, 'RECOVERY_BLOCKER_PRESENT');
const selectedCandidateId = baseline.candidate_revision_graph.proposed_selected_candidate_id;
const selectedCandidate = baseline.candidate_revision_graph.nodes.find(x => x.candidate_id === selectedCandidateId);
assert(selectedCandidate, 'RECOVERY_SELECTED_CANDIDATE_MISSING');

// 3) Real author-decision queue ratification on exact current subjects.
let queueLedger = queue.createQueueLedger(parent);
const manuscriptSubject = subjectRef(activeManuscript(parent));
const bookProjectSubject = projectRef(parent);
const enqueueRequest = {
  enqueue_request_id: 'B02-E-RATIFY-ENQ-001',
  idempotency_key: 'B02-E-RATIFY-ENQ-IDEM-001',
  actor_class: 'PARENT_SYSTEM',
  expected_parent_state_version: parent.state_version,
  expected_parent_state_digest: parent.state_digest,
  expected_queue_ledger_version: queueLedger.queue_ledger_version,
  expected_queue_ledger_digest: queue.digestQueueLedger(queueLedger),
  source_authority_kind: 'PARENT_DIRECT_AUTHOR_QUERY',
  source_handoff_refs: [recoveryExecution.recovery_evidence_receipt.evidence_id],
  decision_type: admission.RATIFICATION_DECISION_TYPE,
  subject_ref: parent.active.canonical_manuscript_ref,
  subject_identity_refs: [manuscriptSubject, bookProjectSubject],
  options: decisionOptions(),
  custom_option_allowed: false,
  evidence_refs: [recoveryExecution.recovery_evidence_receipt.evidence_id],
  disagreement_refs: [],
  consequence_summary: 'Deterministic B02-E fixture: ratify the exact recovered baseline for bounded admission.',
  confirmation_policy: 'NONE',
  created_at: '2026-09-12T16:06:00.000Z'
};
const enqueued = queue.enqueueDecision({ parentState: parent, queueLedger, request: enqueueRequest });
queueLedger = enqueued.queue_ledger;
const snapshot = enqueued.decision_request;
const resolutionRequest = {
  resolution_request_id: 'B02-E-RATIFY-RES-001',
  idempotency_key: 'B02-E-RATIFY-RES-IDEM-001',
  author_actor_ref: 'SYNTHETIC-B02-E-AUTHOR-FIXTURE',
  author_authority_proof_ref: 'SYNTHETIC-B02-E-AUTHOR-PROOF',
  expected_parent_state_version: parent.state_version,
  expected_parent_state_digest: parent.state_digest,
  expected_queue_ledger_version: queueLedger.queue_ledger_version,
  expected_queue_ledger_digest: queue.digestQueueLedger(queueLedger),
  decision_request_id: snapshot.decision_request_id,
  expected_decision_request_version: snapshot.decision_request_version,
  expected_decision_request_digest: queue.digestDecisionRequest(snapshot),
  selected_option_id: 'APPROVE',
  custom_author_choice: null,
  confirmation_evidence: null,
  rationale_optional: 'SYNTHETIC_DETERMINISTIC_QUALIFICATION_ONLY__NOT_REAL_AUTHOR_EVIDENCE',
  resolved_at: '2026-09-12T16:07:00.000Z'
};
const preAuthorParent = parent;
const resolved = queue.resolveDecision({ parentState: parent, versionLedger, queueLedger, request: resolutionRequest });
parent = resolved.parent_state;
versionLedger = resolved.version_ledger;
queueLedger = resolved.queue_ledger;
assert(resolved.author_decision.decision_type === admission.RATIFICATION_DECISION_TYPE, 'RATIFICATION_DECISION_TYPE_MISMATCH');

// Rebind lifecycle current-parent identity after the author-decision successor.
const authorRebindRequest = {
  rebind_request_id: 'B02-E-AUTHOR-LIFECYCLE-REBIND-001',
  idempotency_key: 'B02-E-AUTHOR-LIFECYCLE-REBIND-IDEM-001',
  actor_class: 'PARENT_SYSTEM',
  authority_kind: 'AUTHOR_DECISION',
  expected_pre_parent_state_version: preAuthorParent.state_version,
  expected_pre_parent_state_digest: preAuthorParent.state_digest,
  expected_post_parent_state_version: parent.state_version,
  expected_post_parent_state_digest: parent.state_digest,
  expected_lifecycle_ledger_version: lifecycleLedger.ledger_version,
  expected_lifecycle_ledger_digest: lifecycleCompatibility.digestCompatibleLedger(lifecycleLedger),
  authority_receipt: resolved.resolution_receipt
};
const authorRebind = lifecycleRebind.rebindAfterAuthorizedParentSuccessor({
  contract: lifecycleContract,
  preParentState: preAuthorParent,
  postParentState: parent,
  lifecycleLedger,
  request: authorRebindRequest
});
lifecycleLedger = authorRebind.lifecycle_ledger;
assert(authorRebind.receipt.lifecycle_transition_performed === false, 'AUTHOR_REBIND_LIFECYCLE_TRANSITION_FORBIDDEN');

// 4) Real B02-D3 governed admission + canonical successor + lifecycle current-parent rebind.
const currentManuscript = activeManuscript(parent);
const admissionInput = {
  book_project_id: parent.book_project.book_project_id,
  current_book_state_version: parent.state_version,
  current_book_state_digest: parent.state_digest,
  current_manuscript_id: currentManuscript.object_id,
  current_manuscript_version: String(currentManuscript.object_version),
  current_manuscript_digest: currentManuscript.object_digest,
  recovery_execution: recoveryExecution,
  selected_candidate_id: selectedCandidateId,
  selected_candidate_content_digest: selectedCandidate.content_digest,
  source_acceptance_ids_and_digests: [{ source_acceptance_id: sourceAcceptance.source_acceptance_id, source_acceptance_digest: sourceAcceptance.source_acceptance_digest }],
  projection_ids_and_digests: [{ projection_id: projectionAcceptance.projection_id, projection_digest: projectionAcceptance.projection_digest }],
  source_acceptances: [sourceAcceptance],
  projection_acceptances: [projectionAcceptance],
  author_decision_id: resolved.author_decision.decision_id,
  author_resolution_receipt_id: resolved.resolution_receipt.receipt_id,
  author_resolution_receipt_digest: queue.digest(resolved.resolution_receipt)
};
const d3Options = {
  parent_state: parent,
  version_ledger: versionLedger,
  queue_ledger: queueLedger,
  lifecycle_ledger: lifecycleLedger,
  lifecycle_contract: lifecycleContract
};
const prepared = admission.prepareRecoveredBaselineAdmissionV1(admissionInput, d3Options);
assert(prepared.canonical_effect === false, 'PREPARE_CANONICAL_EFFECT_FORBIDDEN');
const committed = admission.commitRecoveredBaselineAdmissionV1(prepared, admissionInput, d3Options);
assert(committed.standing === admission.COMMITTED_STANDING, 'RECOVERY_ADMISSION_NOT_COMMITTED');
assert(committed.parent_state.state_version === parent.state_version + 1, 'CANONICAL_SUCCESSOR_NOT_CREATED');
assert(committed.parent_state.active.canonical_manuscript_ref === prepared.expected_successor_manuscript_ref, 'CANONICAL_MANUSCRIPT_NOT_REBOUND');
assert(committed.parent_state.book_project.status === parent.book_project.status, 'LIFECYCLE_STATUS_SIDE_EFFECT');
assert(committed.lifecycle_rebind_receipt.lifecycle_transition_performed === false, 'LIFECYCLE_TRANSITION_SIDE_EFFECT');
assert(committed.recovery_admission_receipt.publication_authority === false, 'PUBLICATION_AUTHORITY_WIDENED');
assert(committed.recovery_admission_receipt.export_freeze_authority === false, 'EXPORT_FREEZE_AUTHORITY_WIDENED');
admission.validateAdmissionReceiptV1(committed.recovery_admission_receipt, prepared);

const result = {
  result: 'PASS',
  qualifier: 'BOOK-RECONSTRUCTION-B02-E-CUMULATIVE-001',
  deterministic_fixture_only: true,
  source_acceptance_id: sourceAcceptance.source_acceptance_id,
  projection_id: projectionAcceptance.projection_id,
  recovery_operation_id: recoveryExecution.operation_identity.operation_id,
  recovery_baseline_id: baseline.recovered_book_baseline_id,
  author_decision_id: resolved.author_decision.decision_id,
  admission_operation_id: prepared.admission_operation_id,
  admitted_manuscript_ref: committed.parent_state.active.canonical_manuscript_ref,
  lifecycle_status_preserved: true,
  canonical_mutation_boundary: 'EXISTING_BOOK_CONTENT_ADMISSION_ONLY',
  native_provider_fidelity_claimed: false,
  real_book_fidelity_claimed: false,
  human_author_evidence_claimed: false,
  private_source_standing_claimed: false,
  production_or_a01_claimed: false
};
console.log(JSON.stringify(result));
