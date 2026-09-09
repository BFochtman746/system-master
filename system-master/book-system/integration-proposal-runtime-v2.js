'use strict';

const crypto = require('crypto');

class RuntimeV2Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'RuntimeV2Error';
    this.code = code;
    this.detail = detail;
  }
}

const RESULT_CLASSES = new Set(['SUCCESS', 'PARTIAL', 'ABSTAIN', 'REJECTED', 'ERROR']);
const ADMISSION_STATES = new Set(['PROPOSED', 'EVIDENCE_REVIEWED', 'PARENT_PREQUALIFIED', 'ADMITTED', 'DEFERRED', 'REJECTED']);
const ADMISSION_TRANSITIONS = {
  PROPOSED: new Set(['EVIDENCE_REVIEWED', 'DEFERRED', 'REJECTED']),
  EVIDENCE_REVIEWED: new Set(['PARENT_PREQUALIFIED', 'DEFERRED', 'REJECTED']),
  PARENT_PREQUALIFIED: new Set(['ADMITTED', 'DEFERRED', 'REJECTED']),
  ADMITTED: new Set(),
  DEFERRED: new Set(['EVIDENCE_REVIEWED', 'REJECTED']),
  REJECTED: new Set(),
};
const CURRENT_ARTIFACT_STATES = new Set(['CURRENT_FOR_BOUND_SOURCE']);
const CURRENT_PROVENANCE_STATES = new Set(['NONE', 'CURRENT_FOR_BOUND_SOURCE_AND_ARTIFACT']);
const PROVIDER_TECHNICAL_STATES = new Set(['NONE', 'EXPORT_GENERATED', 'FORMAT_VALIDATED', 'POST_LAYOUT_PROOF_COMPLETE']);
const FORBIDDEN_PROVIDER_TECHNICAL_STATES = new Set(['EXPORT_FROZEN', 'PUBLICATION_AUTHORIZED']);
const EDITORIAL_STAGES = new Set(['STRUCTURAL_EDIT_REVIEW', 'STYLISTIC_OR_LINE_EDIT_REVIEW', 'COPY_EDIT_REVIEW', 'POST_LAYOUT_PROOFREAD_REVIEW']);

function fail(code, detail = '') { throw new RuntimeV2Error(code, detail); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function nonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableNormalize(value[key]);
    return out;
  }
  return value;
}
function stableStringify(value) { return JSON.stringify(stableNormalize(value)); }
function digestObject(value) { return sha256(Buffer.from(stableStringify(value), 'utf8')); }
function idFrom(prefix, value, length = 24) { return `${prefix}-${digestObject(value).slice(0, length).toUpperCase()}`; }

function requireFields(obj, fields, context) {
  if (!isObject(obj)) fail('OBJECT_REQUIRED', context);
  for (const field of fields) if (!hasOwn(obj, field)) fail('REQUIRED_FIELD_MISSING', `${context}.${field}`);
}

function computeParentStateDigest(parentState) {
  const copy = clone(parentState);
  delete copy.state_digest;
  return digestObject(copy);
}

function sealParentState(parentState) {
  const out = clone(parentState);
  out.state_digest = computeParentStateDigest(out);
  return out;
}

function validateParentState(parentState) {
  if (!isObject(parentState)) fail('PARENT_STATE_REQUIRED');
  if (!Number.isInteger(parentState.state_version) || parentState.state_version < 1) fail('INVALID_PARENT_STATE_VERSION');
  if (!isSha256(parentState.state_digest)) fail('INVALID_PARENT_STATE_DIGEST');
  if (computeParentStateDigest(parentState) !== parentState.state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  if (!Array.isArray(parentState.integration_proposals)) fail('PARENT_INTEGRATION_PROPOSALS_ARRAY_REQUIRED');
  return true;
}

function parentIdentity(parentState) {
  validateParentState(parentState);
  return { parent_state_version: parentState.state_version, parent_state_digest: parentState.state_digest };
}

function protectedParentFingerprint(parentState) {
  const protectedProjection = {
    book_project: parentState.book_project || null,
    active: parentState.active || null,
    manuscripts: parentState.manuscripts || null,
    export_releases: parentState.export_releases || null,
    author_decisions: parentState.author_decisions || null,
  };
  return digestObject(protectedProjection);
}

function createLedger(parentState, options = {}) {
  const identity = parentIdentity(parentState);
  const sourceIndex = {};
  for (const ref of options.source_identity_refs || []) {
    validateSourceIdentityRef(ref, 'initial.source_identity_refs');
    sourceIndex[ref.object_id] = {
      object_version: ref.object_version,
      object_digest: ref.object_digest,
      current: true,
    };
  }
  return {
    ledger_schema_version: 2,
    ledger_version: 0,
    bound_parent_state_version: identity.parent_state_version,
    bound_parent_state_digest: identity.parent_state_digest,
    intake_records: [],
    response_dedup_index: {},
    request_attempt_index: {},
    proposal_families: {},
    proposal_snapshots: [],
    author_queue_handoffs: [],
    source_identity_index: sourceIndex,
    artifact_identity_index: {},
    provenance_projection_index: {},
    admission_receipts: [],
    outbox_entries: [],
  };
}

function validateLedger(ledger, parentState) {
  if (!isObject(ledger)) fail('LEDGER_REQUIRED');
  if (ledger.ledger_schema_version !== 2) fail('UNKNOWN_LEDGER_SCHEMA_VERSION');
  if (!Number.isInteger(ledger.ledger_version) || ledger.ledger_version < 0) fail('INVALID_LEDGER_VERSION');
  const requiredArrays = ['intake_records', 'proposal_snapshots', 'author_queue_handoffs', 'admission_receipts', 'outbox_entries'];
  const requiredObjects = ['response_dedup_index', 'request_attempt_index', 'proposal_families', 'source_identity_index', 'artifact_identity_index', 'provenance_projection_index'];
  for (const field of requiredArrays) if (!Array.isArray(ledger[field])) fail('LEDGER_ARRAY_REQUIRED', field);
  for (const field of requiredObjects) if (!isObject(ledger[field])) fail('LEDGER_OBJECT_REQUIRED', field);
  if (parentState) {
    const identity = parentIdentity(parentState);
    if (ledger.bound_parent_state_version !== identity.parent_state_version || ledger.bound_parent_state_digest !== identity.parent_state_digest) {
      fail('LEDGER_PARENT_BINDING_MISMATCH');
    }
  }
  return true;
}

function validateRegistry(registry) {
  if (!isObject(registry) || registry.registry_id !== 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002' || registry.registry_version !== 2) {
    fail('REGISTRY_V2_REQUIRED');
  }
  if (!isObject(registry.services)) fail('REGISTRY_SERVICES_REQUIRED');
  return true;
}

function validateSourceIdentityRef(ref, context = 'source_identity_ref') {
  requireFields(ref, ['object_id', 'object_version', 'object_digest'], context);
  if (!nonEmptyString(ref.object_id)) fail('SOURCE_OBJECT_ID_REQUIRED', context);
  if (!(Number.isInteger(ref.object_version) || nonEmptyString(String(ref.object_version)))) fail('SOURCE_OBJECT_VERSION_REQUIRED', context);
  if (!isSha256(ref.object_digest)) fail('INVALID_SOURCE_OBJECT_DIGEST', context);
}

function validateSourceIdentityRefs(refs, context) {
  if (!Array.isArray(refs) || refs.length === 0) fail('SOURCE_IDENTITY_REFS_REQUIRED', context);
  refs.forEach((ref, index) => validateSourceIdentityRef(ref, `${context}.${index}`));
}

function validateEditorialContext(context, label = 'editorial_stage_context') {
  if (!isObject(context)) fail('EDITORIAL_STAGE_CONTEXT_REQUIRED', label);
  if (!EDITORIAL_STAGES.has(context.stage_token)) fail('UNKNOWN_EDITORIAL_STAGE', String(context.stage_token));
  if (!['APPLICABLE', 'NOT_APPLICABLE'].includes(context.applicability)) fail('INVALID_EDITORIAL_APPLICABILITY', String(context.applicability));
  if (context.applicability === 'NOT_APPLICABLE' && !nonEmptyString(context.not_applicable_rationale)) fail('NOT_APPLICABLE_RATIONALE_REQUIRED');
}

function resolveOperation(registry, request) {
  validateRegistry(registry);
  const service = registry.services[request.service_id];
  if (!service) fail('UNKNOWN_SERVICE_ID', String(request.service_id));
  const operation = service.operations && service.operations[request.operation_id];
  if (!operation) fail('UNKNOWN_OPERATION_ID', `${request.service_id}:${String(request.operation_id)}`);
  return { service, operation };
}

function validateRequest(registry, request) {
  validateRegistry(registry);
  requireFields(request, registry.common_request_envelope.required, 'request');
  if (request.schema_version !== 2) fail('UNKNOWN_REQUEST_SCHEMA_VERSION', String(request.schema_version));
  if (!Number.isInteger(request.parent_state_version) || request.parent_state_version < 1) fail('INVALID_REQUEST_PARENT_STATE_VERSION');
  if (!isSha256(request.parent_state_digest)) fail('INVALID_REQUEST_PARENT_STATE_DIGEST');
  if (!Array.isArray(request.target_refs)) fail('TARGET_REFS_ARRAY_REQUIRED');
  validateSourceIdentityRefs(request.source_identity_refs, 'request.source_identity_refs');
  requireFields(request.authority_context, registry.common_request_envelope.authority_context_required, 'request.authority_context');
  if (request.authority_context.canonical_write_allowed !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (request.authority_context.lifecycle_transition_allowed !== false) fail('SERVICE_LIFECYCLE_TRANSITION_FORBIDDEN');
  if (request.authority_context.export_freeze_allowed !== false) fail('SERVICE_EXPORT_FREEZE_FORBIDDEN');
  if (request.authority_context.publication_authorized !== false) fail('SERVICE_PUBLICATION_AUTHORITY_FORBIDDEN');
  const { service, operation } = resolveOperation(registry, request);
  if (service.canonical_write_authority !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (!isObject(request.projection)) fail('REQUEST_PROJECTION_REQUIRED');
  for (const field of operation.required_projection || []) if (!hasOwn(request.projection, field)) fail('REQUIRED_PROJECTION_FIELD_MISSING', field);
  if (hasOwn(request.projection, 'publication_authorized') && request.projection.publication_authorized !== false) fail('SERVICE_PUBLICATION_AUTHORITY_FORBIDDEN');
  if (operation.stage_scoped) validateEditorialContext(request.projection.editorial_stage_context, 'request.projection.editorial_stage_context');
  return { service, operation };
}

function validateArtifactEvidence(registry, evidence, context) {
  requireFields(evidence, registry.artifact_evidence_contract.required_when_artifact_returned, context);
  if (!isSha256(evidence.artifact_digest)) fail('INVALID_ARTIFACT_DIGEST', context);
  if (!registry.artifact_evidence_contract.artifact_currentness_states.includes(evidence.artifact_currentness)) fail('UNKNOWN_ARTIFACT_CURRENTNESS', String(evidence.artifact_currentness));
}

function validateTargetMediumEvidence(registry, evidence, context) {
  requireFields(evidence, registry.target_medium_evidence_contract.required_when_target_medium_operation, context);
  if (FORBIDDEN_PROVIDER_TECHNICAL_STATES.has(evidence.technical_state)) fail('PROVIDER_TECHNICAL_STATE_FORBIDDEN', evidence.technical_state);
  if (!PROVIDER_TECHNICAL_STATES.has(evidence.technical_state)) fail('UNKNOWN_PROVIDER_TECHNICAL_STATE', String(evidence.technical_state));
  if (!isSha256(evidence.rendered_candidate_digest)) fail('INVALID_RENDERED_CANDIDATE_DIGEST', context);
}

function validateProvenanceEvidence(registry, evidence, artifacts, context) {
  requireFields(evidence, registry.provenance_evidence_contract.required_when_present, context);
  if (!isSha256(evidence.bound_artifact_digest)) fail('INVALID_PROVENANCE_BOUND_ARTIFACT_DIGEST');
  if (!isSha256(evidence.projection_digest)) fail('INVALID_PROVENANCE_PROJECTION_DIGEST');
  if (!registry.provenance_evidence_contract.currentness_states.includes(evidence.currentness_state)) fail('UNKNOWN_PROVENANCE_CURRENTNESS', String(evidence.currentness_state));
  if (evidence.credential_attachment_changed_bytes === true) {
    if (!isSha256(evidence.pre_credential_artifact_digest)) fail('PRE_CREDENTIAL_DIGEST_REQUIRED');
    if (evidence.pre_credential_artifact_digest === evidence.bound_artifact_digest) fail('CREDENTIAL_CHANGED_BYTES_REQUIRES_NEW_DIGEST');
  }
  if (artifacts.length > 0 && !artifacts.some(item => item.artifact_digest === evidence.bound_artifact_digest)) fail('PROVENANCE_ARTIFACT_BINDING_MISMATCH');
}

function validateResponse(registry, request, response) {
  const { service, operation } = validateRequest(registry, request);
  requireFields(response, registry.common_response_envelope.required, 'response');
  if (response.schema_version !== 2) fail('UNKNOWN_RESPONSE_SCHEMA_VERSION', String(response.schema_version));
  for (const field of ['request_id', 'correlation_id', 'idempotency_key', 'service_id', 'operation_id']) {
    if (response[field] !== request[field]) fail('RESPONSE_REQUEST_BINDING_MISMATCH', field);
  }
  if (response.provider_class !== service.provider_class) fail('PROVIDER_CLASS_MISMATCH');
  requireFields(response.provider_subject, registry.common_response_envelope.provider_subject_required, 'response.provider_subject');
  if (!nonEmptyString(response.provider_subject.subject_sha) || !/^[a-f0-9]{40,64}$/.test(response.provider_subject.subject_sha)) fail('INVALID_PROVIDER_SUBJECT_SHA');
  requireFields(response.parent_projection_identity, registry.common_response_envelope.parent_projection_identity_required, 'response.parent_projection_identity');
  if (response.parent_projection_identity.parent_state_version !== request.parent_state_version || response.parent_projection_identity.parent_state_digest !== request.parent_state_digest) fail('RESPONSE_PARENT_PROJECTION_MISMATCH');
  validateSourceIdentityRefs(response.source_identity_refs, 'response.source_identity_refs');
  if (stableStringify(response.source_identity_refs) !== stableStringify(request.source_identity_refs)) fail('SOURCE_IDENTITY_BINDING_MISMATCH');
  if (!RESULT_CLASSES.has(response.result_class)) fail('UNKNOWN_RESULT_CLASS', String(response.result_class));
  if (!(operation.requested_parent_action_allowed || []).includes(response.requested_parent_action)) fail('PARENT_ACTION_NOT_ALLOWED_FOR_OPERATION', response.requested_parent_action);
  for (const field of ['evidence_refs', 'proposal_refs', 'artifact_evidence', 'editorial_stage_evidence', 'target_medium_evidence', 'provenance_evidence', 'abstentions', 'warnings']) {
    if (!Array.isArray(response[field])) fail('RESPONSE_ARRAY_REQUIRED', field);
  }
  if (response.result_class === 'ABSTAIN' && response.abstentions.length === 0) fail('ABSTENTION_REASON_REQUIRED');
  if (response.result_class === 'ERROR' && response.warnings.length === 0 && response.evidence_refs.length === 0) fail('ERROR_DETAIL_REQUIRED');
  for (const forbiddenField of ['canonical_write', 'lifecycle_transition_allowed', 'export_freeze_allowed', 'publication_authorized', 'author_approved']) {
    if (response[forbiddenField] === true) fail('PROVIDER_AUTHORITY_CLAIM_FORBIDDEN', forbiddenField);
  }
  for (const evidence of response.artifact_evidence) validateArtifactEvidence(registry, evidence, 'response.artifact_evidence');
  for (const evidence of response.editorial_stage_evidence) {
    validateEditorialContext(evidence, 'response.editorial_stage_evidence');
    for (const field of registry.editorial_stage_context.stage_evidence_fields) if (!hasOwn(evidence, field)) fail('EDITORIAL_STAGE_EVIDENCE_FIELD_MISSING', field);
    if (evidence.stage_complete === true || evidence.lifecycle_advance_requested === true) fail('PROVIDER_STAGE_AUTHORITY_FORBIDDEN');
  }
  for (const evidence of response.target_medium_evidence) validateTargetMediumEvidence(registry, evidence, 'response.target_medium_evidence');
  for (const evidence of response.provenance_evidence) validateProvenanceEvidence(registry, evidence, response.artifact_evidence, 'response.provenance_evidence');
  return { service, operation };
}

function requestFingerprint(request) {
  const normalized = clone(request);
  return digestObject(normalized);
}

function responseIdentity(response) {
  return [response.service_id, response.operation_id, response.request_id, response.response_id, response.provider_subject.subject_sha].join('|');
}

function registerRequestAttempt(registry, ledger, request, outcomeState = 'KNOWN') {
  validateLedger(ledger);
  const { operation } = validateRequest(registry, request);
  if (!['KNOWN', 'UNKNOWN'].includes(outcomeState)) fail('UNKNOWN_REQUEST_OUTCOME_STATE');
  const nextLedger = clone(ledger);
  const fingerprint = requestFingerprint(request);
  const key = request.idempotency_key;
  const prior = nextLedger.request_attempt_index[key];
  if (prior) {
    if (prior.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (operation.idempotent === false && prior.outcome_state === 'UNKNOWN') fail('NONIDEMPOTENT_RETRY_REQUIRES_RECONCILIATION');
    return { ledger: ledger, disposition: 'REPLAY', request_fingerprint: fingerprint, committed: false };
  }
  nextLedger.request_attempt_index[key] = {
    request_id: request.request_id,
    service_id: request.service_id,
    operation_id: request.operation_id,
    request_fingerprint: fingerprint,
    idempotent: operation.idempotent,
    outcome_state: outcomeState,
  };
  nextLedger.ledger_version += 1;
  return { ledger: nextLedger, disposition: 'NEW', request_fingerprint: fingerprint, committed: true };
}

function reconcileRequestOutcome(ledger, idempotencyKey) {
  validateLedger(ledger);
  const prior = ledger.request_attempt_index[idempotencyKey];
  if (!prior) fail('REQUEST_ATTEMPT_NOT_FOUND');
  const nextLedger = clone(ledger);
  nextLedger.request_attempt_index[idempotencyKey].outcome_state = 'RECONCILED';
  nextLedger.ledger_version += 1;
  return nextLedger;
}

function sourceRefsCurrent(ledger, refs) {
  for (const ref of refs) {
    const current = ledger.source_identity_index[ref.object_id];
    if (!current || current.current !== true || String(current.object_version) !== String(ref.object_version) || current.object_digest !== ref.object_digest) return false;
  }
  return true;
}

function artifactsCurrent(ledger, artifactEvidence) {
  for (const artifact of artifactEvidence) {
    if (!CURRENT_ARTIFACT_STATES.has(artifact.artifact_currentness)) return false;
    const indexed = ledger.artifact_identity_index[artifact.artifact_ref];
    if (indexed && (indexed.current !== true || indexed.artifact_digest !== artifact.artifact_digest || indexed.target_medium_profile_id !== artifact.target_medium_profile_id || indexed.target_medium_profile_version !== artifact.target_medium_profile_version)) return false;
  }
  return true;
}

function provenanceCurrent(ledger, provenanceEvidence) {
  for (const provenance of provenanceEvidence) {
    if (!CURRENT_PROVENANCE_STATES.has(provenance.currentness_state)) return false;
    const indexed = ledger.provenance_projection_index[provenance.projection_ref];
    if (indexed && (indexed.current !== true || indexed.projection_digest !== provenance.projection_digest || indexed.bound_artifact_digest !== provenance.bound_artifact_digest)) return false;
  }
  return true;
}

function indexCurrentEvidence(ledger, response) {
  for (const ref of response.source_identity_refs) {
    if (!ledger.source_identity_index[ref.object_id]) {
      ledger.source_identity_index[ref.object_id] = { object_version: ref.object_version, object_digest: ref.object_digest, current: true };
    }
  }
  for (const artifact of response.artifact_evidence) {
    ledger.artifact_identity_index[artifact.artifact_ref] = {
      artifact_digest: artifact.artifact_digest,
      target_medium_profile_id: artifact.target_medium_profile_id,
      target_medium_profile_version: artifact.target_medium_profile_version,
      artifact_currentness: artifact.artifact_currentness,
      current: CURRENT_ARTIFACT_STATES.has(artifact.artifact_currentness),
    };
  }
  for (const provenance of response.provenance_evidence) {
    ledger.provenance_projection_index[provenance.projection_ref] = {
      projection_digest: provenance.projection_digest,
      bound_artifact_digest: provenance.bound_artifact_digest,
      currentness_state: provenance.currentness_state,
      current: CURRENT_PROVENANCE_STATES.has(provenance.currentness_state),
    };
  }
}

function highestTechnicalState(targetMediumEvidence) {
  const order = ['NONE', 'EXPORT_GENERATED', 'FORMAT_VALIDATED', 'POST_LAYOUT_PROOF_COMPLETE'];
  let best = 'NONE';
  for (const evidence of targetMediumEvidence || []) {
    if (order.indexOf(evidence.technical_state) > order.indexOf(best)) best = evidence.technical_state;
  }
  return best;
}

function editorialGateState(editorialEvidence) {
  if (!editorialEvidence || editorialEvidence.length === 0) return 'NOT_SCOPED';
  for (const evidence of editorialEvidence) {
    if (evidence.applicability === 'APPLICABLE' && (!Array.isArray(evidence.exit_evidence_refs) || evidence.exit_evidence_refs.length === 0)) return 'EVIDENCE_INCOMPLETE';
  }
  return 'EVIDENCE_PRESENT';
}

function createProposalSnapshot(parentState, ledger, request, response, authorDecisionRequired) {
  const familySeed = { service_id: response.service_id, operation_id: response.operation_id, request_id: response.request_id, source_subject_sha: response.provider_subject.subject_sha };
  const familyId = idFrom('PF', familySeed, 20);
  const existingFamily = ledger.proposal_families[familyId];
  const version = existingFamily ? existingFamily.latest_version + 1 : 1;
  const predecessor = existingFamily ? existingFamily.latest_snapshot_id : null;
  const proposalId = `${familyId}-V${version}`;
  return {
    proposal_id: proposalId,
    proposal_family_id: familyId,
    proposal_version: version,
    predecessor_proposal_id: predecessor,
    source_project_or_lane: response.provider_class === 'PROSE_SYSTEM' || response.provider_class === 'BOOK_EVALUATOR' ? 'SYSTEM_MASTER/BOOK/PROSE' : response.provider_class,
    source_subject_sha: response.provider_subject.subject_sha,
    service_id: response.service_id,
    operation_id: response.operation_id,
    capability_id: `${response.service_id}.${response.operation_id}`,
    admission_state: 'PROPOSED',
    source_request_id: response.request_id,
    source_response_id: response.response_id,
    source_result_class: response.result_class,
    source_parent_projection_identity: clone(response.parent_projection_identity),
    source_object_refs_and_digests: clone(response.source_identity_refs),
    evidence_refs: clone(response.evidence_refs),
    artifact_refs_and_digests: clone(response.artifact_evidence),
    artifact_currentness: artifactsCurrent(ledger, response.artifact_evidence) ? 'CURRENT' : 'STALE',
    provenance_projection_refs_and_currentness: clone(response.provenance_evidence),
    editorial_stage_context: clone(request.projection.editorial_stage_context || null),
    editorial_gate_evidence_refs: clone(response.editorial_stage_evidence),
    editorial_gate_state: editorialGateState(response.editorial_stage_evidence),
    target_medium_context: clone(request.projection.target_medium_profile || null),
    technical_export_state: highestTechnicalState(response.target_medium_evidence),
    abstentions: clone(response.abstentions),
    warnings: clone(response.warnings),
    disagreement_state: clone(response.disagreement_state || null),
    rights_boundary: request.authority_context.rights_boundary,
    privacy_boundary: request.authority_context.privacy_boundary,
    author_decision_required: authorDecisionRequired,
    author_decision_refs: [],
    publication_authorized: false,
    last_revalidated_parent_state_version: parentState.state_version,
    last_revalidated_parent_state_digest: parentState.state_digest,
    created_by: 'BOOK_SYSTEM_PARENT_RUNTIME_V2',
  };
}

function updateFamilyIndex(ledger, snapshot) {
  ledger.proposal_families[snapshot.proposal_family_id] = {
    proposal_family_id: snapshot.proposal_family_id,
    latest_version: snapshot.proposal_version,
    latest_snapshot_id: snapshot.proposal_id,
    admission_state: snapshot.admission_state,
  };
}

function registerProposalInParent(parentState, snapshot) {
  const nextParent = clone(parentState);
  const protectedBefore = protectedParentFingerprint(parentState);
  nextParent.integration_proposals.push({
    proposal_id: snapshot.proposal_id,
    source_project_or_lane: snapshot.source_project_or_lane,
    source_subject_sha: snapshot.source_subject_sha,
    capability_id: snapshot.capability_id,
    admission_state: snapshot.admission_state,
  });
  nextParent.state_version += 1;
  const sealed = sealParentState(nextParent);
  if (protectedParentFingerprint(sealed) !== protectedBefore) fail('FORBIDDEN_PARENT_STATE_MUTATION');
  return sealed;
}

function appendOutbox(ledger, eventType, aggregateId, payloadRef) {
  const event = {
    event_id: idFrom('EVT', { ledger_version: ledger.ledger_version + 1, event_type: eventType, aggregate_id: aggregateId, payload_ref: payloadRef }, 24),
    event_type: eventType,
    aggregate_id: aggregateId,
    payload_ref: payloadRef,
    sequence: ledger.outbox_entries.length + 1,
    delivery_state: 'PENDING',
  };
  ledger.outbox_entries.push(event);
  return event;
}

function makeReceipt(action, preParent, postParent, preLedger, postLedger, intakeId, proposalId) {
  return {
    receipt_id: idFrom('RCPT', { action, pre_parent: preParent.state_digest, post_parent: postParent.state_digest, pre_ledger_version: preLedger.ledger_version, post_ledger_version: postLedger.ledger_version, intake_id: intakeId, proposal_id: proposalId }, 24),
    action,
    pre_parent_state_version: preParent.state_version,
    pre_parent_state_digest: preParent.state_digest,
    pre_integration_ledger_version: preLedger.ledger_version,
    pre_integration_ledger_digest: digestObject(preLedger),
    post_parent_state_version: postParent.state_version,
    post_parent_state_digest: postParent.state_digest,
    post_integration_ledger_version: postLedger.ledger_version,
    post_integration_ledger_digest: null,
    intake_id: intakeId || null,
    proposal_snapshot_id: proposalId || null,
    source_object_refs_and_digests: [],
    artifact_refs_and_digests_if_material: [],
    provenance_projection_refs_and_currentness_if_material: [],
    rollback_parent_state_version: preParent.state_version,
    rollback_parent_state_digest: preParent.state_digest,
    rollback_integration_ledger_version: preLedger.ledger_version,
    rollback_integration_ledger_digest: digestObject(preLedger),
  };
}

function finalizeLedgerCommit(ledger, parentState) {
  ledger.bound_parent_state_version = parentState.state_version;
  ledger.bound_parent_state_digest = parentState.state_digest;
  ledger.ledger_version += 1;
  return ledger;
}

function determineIntakeDisposition(parentState, ledger, request, response) {
  if (request.parent_state_version !== parentState.state_version || request.parent_state_digest !== parentState.state_digest) return 'STALE_REJECTED_PRESERVED';
  if (!sourceRefsCurrent(ledger, response.source_identity_refs)) return 'SUPERSEDED_SOURCE_PRESERVED';
  if (!artifactsCurrent(ledger, response.artifact_evidence)) return 'STALE_ARTIFACT_PRESERVED';
  if (!provenanceCurrent(ledger, response.provenance_evidence)) return 'STALE_PROVENANCE_PRESERVED';
  if (response.result_class === 'ERROR') return 'ERROR_PRESERVED';
  if (response.result_class === 'ABSTAIN') return 'ABSTENTION_PRESERVED';
  if (response.result_class === 'REJECTED') return 'RECORDED_NO_PROPOSAL';
  if (response.result_class === 'PARTIAL') return 'PARTIAL_PRESERVED';
  if (response.requested_parent_action === 'QUEUE_AUTHOR_DECISION') return 'AUTHOR_QUEUE_HANDOFF_CREATED';
  if (response.requested_parent_action === 'REGISTER_INTEGRATION_PROPOSAL') return 'PROPOSAL_CREATED';
  return 'RECORDED_NO_PROPOSAL';
}

function intakeServiceResponse({ registry, parentState, ledger, request, response }) {
  validateParentState(parentState);
  validateLedger(ledger, parentState);
  const { operation } = validateResponse(registry, request, response);
  const responseKey = responseIdentity(response);
  const payloadDigest = digestObject(response);
  const prior = ledger.response_dedup_index[responseKey];
  if (prior) {
    if (prior.response_payload_digest !== payloadDigest) fail('RESPONSE_IDENTITY_CONFLICT');
    return {
      parentState,
      ledger,
      intake_record: clone(ledger.intake_records.find(item => item.intake_id === prior.intake_id) || null),
      proposal_snapshot: prior.proposal_snapshot_id ? clone(ledger.proposal_snapshots.find(item => item.proposal_id === prior.proposal_snapshot_id) || null) : null,
      disposition: 'REPLAY',
      committed: false,
    };
  }

  const preParent = clone(parentState);
  const preLedger = clone(ledger);
  const nextParentBase = clone(parentState);
  const nextLedger = clone(ledger);
  indexCurrentEvidence(nextLedger, response);
  const disposition = determineIntakeDisposition(nextParentBase, nextLedger, request, response);
  const intakeId = idFrom('INTAKE', { response_identity: responseKey, payload_digest: payloadDigest }, 24);
  const intakeRecord = {
    intake_id: intakeId,
    request_id: request.request_id,
    response_id: response.response_id,
    correlation_id: response.correlation_id,
    idempotency_key: response.idempotency_key,
    service_id: response.service_id,
    operation_id: response.operation_id,
    provider_class: response.provider_class,
    provider_subject: clone(response.provider_subject),
    parent_projection_identity: clone(response.parent_projection_identity),
    result_class: response.result_class,
    source_object_refs_and_digests: clone(response.source_identity_refs),
    evidence_refs: clone(response.evidence_refs),
    proposal_refs: clone(response.proposal_refs),
    artifact_refs_and_digests: clone(response.artifact_evidence),
    provenance_projection_refs_and_currentness: clone(response.provenance_evidence),
    editorial_stage_context: clone(request.projection.editorial_stage_context || null),
    target_medium_context: clone(request.projection.target_medium_profile || null),
    abstentions: clone(response.abstentions),
    warnings: clone(response.warnings),
    requested_parent_action: response.requested_parent_action,
    rights_boundary: request.authority_context.rights_boundary,
    privacy_boundary: request.authority_context.privacy_boundary,
    disagreement_state: clone(response.disagreement_state || null),
    freshness_state: disposition.startsWith('STALE') || disposition.startsWith('SUPERSEDED') ? 'STALE' : 'CURRENT',
    intake_disposition: disposition,
  };
  nextLedger.intake_records.push(intakeRecord);

  let proposalSnapshot = null;
  let nextParent = nextParentBase;
  const proposalEligibleDisposition = ['PROPOSAL_CREATED', 'AUTHOR_QUEUE_HANDOFF_CREATED', 'PARTIAL_PRESERVED'].includes(disposition);
  const proposalRequested = ['REGISTER_INTEGRATION_PROPOSAL', 'QUEUE_AUTHOR_DECISION'].includes(response.requested_parent_action);
  if (proposalEligibleDisposition && proposalRequested && !['ERROR', 'ABSTAIN', 'REJECTED'].includes(response.result_class)) {
    const authorRequired = response.requested_parent_action === 'QUEUE_AUTHOR_DECISION';
    proposalSnapshot = createProposalSnapshot(parentState, nextLedger, request, response, authorRequired);
    nextLedger.proposal_snapshots.push(proposalSnapshot);
    updateFamilyIndex(nextLedger, proposalSnapshot);
    nextParent = registerProposalInParent(nextParentBase, proposalSnapshot);
    if (authorRequired) {
      const handoff = {
        handoff_id: idFrom('HANDOFF', { proposal_id: proposalSnapshot.proposal_id, response_id: response.response_id }, 24),
        proposal_family_id: proposalSnapshot.proposal_family_id,
        proposal_snapshot_id: proposalSnapshot.proposal_id,
        decision_type: 'BOUNDED_AUTHOR_DECISION',
        subject_ref: proposalSnapshot.proposal_id,
        options: ['APPROVE', 'REJECT', 'DEFER'],
        source_request_id: response.request_id,
        source_response_id: response.response_id,
        status: 'PENDING',
      };
      nextLedger.author_queue_handoffs.push(handoff);
    }
    appendOutbox(nextLedger, 'BOOK_INTEGRATION_PROPOSAL_REGISTERED', proposalSnapshot.proposal_family_id, proposalSnapshot.proposal_id);
  }

  nextLedger.response_dedup_index[responseKey] = {
    response_payload_digest: payloadDigest,
    intake_id: intakeId,
    proposal_snapshot_id: proposalSnapshot ? proposalSnapshot.proposal_id : null,
  };
  finalizeLedgerCommit(nextLedger, nextParent);
  const receipt = makeReceipt('INTAKE_SERVICE_RESPONSE', preParent, nextParent, preLedger, nextLedger, intakeId, proposalSnapshot ? proposalSnapshot.proposal_id : null);
  receipt.source_object_refs_and_digests = clone(response.source_identity_refs);
  receipt.artifact_refs_and_digests_if_material = clone(response.artifact_evidence);
  receipt.provenance_projection_refs_and_currentness_if_material = clone(response.provenance_evidence);
  nextLedger.admission_receipts.push(receipt);
  receipt.post_integration_ledger_version = nextLedger.ledger_version;
  receipt.post_integration_ledger_digest = digestObject(nextLedger);

  return { parentState: nextParent, ledger: nextLedger, intake_record: intakeRecord, proposal_snapshot: proposalSnapshot, disposition, receipt: clone(receipt), committed: true, operation_idempotent: operation.idempotent };
}

function proposalSnapshotById(ledger, proposalId) {
  const snapshot = ledger.proposal_snapshots.find(item => item.proposal_id === proposalId);
  if (!snapshot) fail('PROPOSAL_SNAPSHOT_NOT_FOUND', proposalId);
  return snapshot;
}

function snapshotCurrentness(ledger, snapshot) {
  const sourceCurrent = sourceRefsCurrent(ledger, snapshot.source_object_refs_and_digests || []);
  const artifactCurrent = artifactsCurrent(ledger, snapshot.artifact_refs_and_digests || []);
  const provenanceCurrentState = provenanceCurrent(ledger, snapshot.provenance_projection_refs_and_currentness || []);
  return { source_current: sourceCurrent, artifact_current: artifactCurrent, provenance_current: provenanceCurrentState, all_current: sourceCurrent && artifactCurrent && provenanceCurrentState };
}

function assertEvidenceReviewedGate(snapshot) {
  if (['ABSTAIN', 'ERROR', 'REJECTED'].includes(snapshot.source_result_class)) fail('NON_SUCCESS_RESULT_CANNOT_ADVANCE', snapshot.source_result_class);
  if (!nonEmptyString(snapshot.rights_boundary) || !nonEmptyString(snapshot.privacy_boundary)) fail('RIGHTS_PRIVACY_BOUNDARY_REQUIRED');
}

function assertPrequalifiedGate(parentState, ledger, snapshot) {
  const currentness = snapshotCurrentness(ledger, snapshot);
  if (!currentness.source_current) fail('STALE_SOURCE_IDENTITY');
  if (!currentness.artifact_current) fail('STALE_ARTIFACT_IDENTITY');
  if (!currentness.provenance_current) fail('STALE_PROVENANCE_IDENTITY');
  if (snapshot.last_revalidated_parent_state_version !== parentState.state_version || snapshot.last_revalidated_parent_state_digest !== parentState.state_digest) fail('PROPOSAL_PARENT_REVALIDATION_REQUIRED');
  if ((snapshot.warnings || []).some(item => String(item).startsWith('CRITICAL_'))) fail('CRITICAL_HARD_FAILURE_REMAINS');
  if (snapshot.editorial_stage_context && snapshot.editorial_stage_context.applicability === 'APPLICABLE' && snapshot.editorial_gate_state === 'EVIDENCE_INCOMPLETE') fail('EDITORIAL_GATE_EVIDENCE_INCOMPLETE');
}

function authorDecisionApproved(snapshot, authorDecisions) {
  if (!snapshot.author_decision_required) return true;
  return (authorDecisions || []).some(decision => decision && decision.subject_ref === snapshot.proposal_id && decision.status === 'APPROVED' && nonEmptyString(decision.author_choice));
}

function registerTransitionSnapshot(parentState, ledger, priorSnapshot, nextSnapshot, action) {
  const preParent = clone(parentState);
  const preLedger = clone(ledger);
  const nextLedger = clone(ledger);
  nextLedger.proposal_snapshots.push(nextSnapshot);
  updateFamilyIndex(nextLedger, nextSnapshot);
  const nextParent = registerProposalInParent(parentState, nextSnapshot);
  appendOutbox(nextLedger, 'BOOK_INTEGRATION_PROPOSAL_STATE_CHANGED', nextSnapshot.proposal_family_id, nextSnapshot.proposal_id);
  finalizeLedgerCommit(nextLedger, nextParent);
  const receipt = makeReceipt(action, preParent, nextParent, preLedger, nextLedger, null, nextSnapshot.proposal_id);
  receipt.source_object_refs_and_digests = clone(nextSnapshot.source_object_refs_and_digests || []);
  receipt.artifact_refs_and_digests_if_material = clone(nextSnapshot.artifact_refs_and_digests || []);
  receipt.provenance_projection_refs_and_currentness_if_material = clone(nextSnapshot.provenance_projection_refs_and_currentness || []);
  nextLedger.admission_receipts.push(receipt);
  receipt.post_integration_ledger_version = nextLedger.ledger_version;
  receipt.post_integration_ledger_digest = digestObject(nextLedger);
  return { parentState: nextParent, ledger: nextLedger, proposal_snapshot: nextSnapshot, receipt: clone(receipt) };
}

function transitionProposal({ parentState, ledger, proposalId, targetState, authorDecisions = [] }) {
  validateParentState(parentState);
  validateLedger(ledger, parentState);
  if (!ADMISSION_STATES.has(targetState)) fail('UNKNOWN_ADMISSION_STATE', String(targetState));
  const prior = clone(proposalSnapshotById(ledger, proposalId));
  if (!ADMISSION_TRANSITIONS[prior.admission_state].has(targetState)) fail('ILLEGAL_ADMISSION_TRANSITION', `${prior.admission_state}->${targetState}`);
  if (targetState === 'EVIDENCE_REVIEWED') assertEvidenceReviewedGate(prior);
  if (targetState === 'PARENT_PREQUALIFIED') assertPrequalifiedGate(parentState, ledger, prior);
  if (targetState === 'ADMITTED') {
    assertPrequalifiedGate(parentState, ledger, prior);
    if (!authorDecisionApproved(prior, authorDecisions)) fail('AUTHOR_DECISION_REQUIRED');
  }
  const family = ledger.proposal_families[prior.proposal_family_id];
  const nextVersion = family.latest_version + 1;
  const next = clone(prior);
  next.predecessor_proposal_id = prior.proposal_id;
  next.proposal_version = nextVersion;
  next.proposal_id = `${prior.proposal_family_id}-V${nextVersion}`;
  next.admission_state = targetState;
  next.author_decision_refs = targetState === 'ADMITTED' ? clone(authorDecisions.filter(decision => decision && decision.subject_ref === prior.proposal_id)) : clone(prior.author_decision_refs || []);
  next.publication_authorized = false;
  next.created_by = 'BOOK_SYSTEM_PARENT_RUNTIME_V2';
  return registerTransitionSnapshot(parentState, ledger, prior, next, `PROPOSAL_${targetState}`);
}

function revalidateProposalToCurrentParent({ parentState, ledger, proposalId }) {
  validateParentState(parentState);
  validateLedger(ledger);
  const prior = clone(proposalSnapshotById(ledger, proposalId));
  const currentness = snapshotCurrentness(ledger, prior);
  if (!currentness.source_current) fail('STALE_SOURCE_IDENTITY');
  if (!currentness.artifact_current) fail('STALE_ARTIFACT_IDENTITY');
  if (!currentness.provenance_current) fail('STALE_PROVENANCE_IDENTITY');
  const family = ledger.proposal_families[prior.proposal_family_id];
  const next = clone(prior);
  next.predecessor_proposal_id = prior.proposal_id;
  next.proposal_version = family.latest_version + 1;
  next.proposal_id = `${prior.proposal_family_id}-V${next.proposal_version}`;
  next.last_revalidated_parent_state_version = parentState.state_version;
  next.last_revalidated_parent_state_digest = parentState.state_digest;
  next.created_by = 'BOOK_SYSTEM_PARENT_RUNTIME_V2_REVALIDATION';
  return registerTransitionSnapshot(parentState, ledger, prior, next, 'PROPOSAL_REVALIDATED');
}

function updateSourceIdentity(ledger, ref) {
  validateLedger(ledger);
  validateSourceIdentityRef(ref, 'source_identity_update');
  const next = clone(ledger);
  for (const value of Object.values(next.source_identity_index)) value.current = false;
  next.source_identity_index[ref.object_id] = { object_version: ref.object_version, object_digest: ref.object_digest, current: true };
  next.ledger_version += 1;
  return next;
}

function updateArtifactIdentity(ledger, artifact) {
  validateLedger(ledger);
  if (!isObject(artifact) || !nonEmptyString(artifact.artifact_ref) || !isSha256(artifact.artifact_digest)) fail('INVALID_ARTIFACT_IDENTITY_UPDATE');
  const next = clone(ledger);
  const prior = next.artifact_identity_index[artifact.artifact_ref] || {};
  next.artifact_identity_index[artifact.artifact_ref] = {
    ...prior,
    ...clone(artifact),
    current: artifact.current !== false,
  };
  next.ledger_version += 1;
  return next;
}

function updateProvenanceIdentity(ledger, provenance) {
  validateLedger(ledger);
  if (!isObject(provenance) || !nonEmptyString(provenance.projection_ref) || !isSha256(provenance.projection_digest) || !isSha256(provenance.bound_artifact_digest)) fail('INVALID_PROVENANCE_IDENTITY_UPDATE');
  const next = clone(ledger);
  const prior = next.provenance_projection_index[provenance.projection_ref] || {};
  next.provenance_projection_index[provenance.projection_ref] = {
    ...prior,
    ...clone(provenance),
    current: provenance.current !== false,
  };
  next.ledger_version += 1;
  return next;
}

function applyRightsPrivacyReclassification({ parentState, ledger, proposalId, rightsBoundary, privacyBoundary, action = 'STALE' }) {
  validateParentState(parentState);
  validateLedger(ledger, parentState);
  if (!['STALE', 'REJECT'].includes(action)) fail('UNKNOWN_RIGHTS_PRIVACY_ACTION');
  if (!nonEmptyString(rightsBoundary) || !nonEmptyString(privacyBoundary)) fail('RIGHTS_PRIVACY_BOUNDARY_REQUIRED');
  const prior = clone(proposalSnapshotById(ledger, proposalId));
  const family = ledger.proposal_families[prior.proposal_family_id];
  const next = clone(prior);
  next.predecessor_proposal_id = prior.proposal_id;
  next.proposal_version = family.latest_version + 1;
  next.proposal_id = `${prior.proposal_family_id}-V${next.proposal_version}`;
  next.rights_boundary = rightsBoundary;
  next.privacy_boundary = privacyBoundary;
  if (action === 'REJECT') next.admission_state = 'REJECTED';
  else next.warnings = [...(next.warnings || []), 'CRITICAL_RIGHTS_PRIVACY_REVALIDATION_REQUIRED'];
  next.created_by = 'BOOK_SYSTEM_PARENT_RUNTIME_V2_RIGHTS_PRIVACY_RECLASSIFICATION';
  return registerTransitionSnapshot(parentState, ledger, prior, next, 'PROPOSAL_RIGHTS_PRIVACY_RECLASSIFIED');
}

function markOutboxDelivered(ledger, eventId) {
  validateLedger(ledger);
  const index = ledger.outbox_entries.findIndex(item => item.event_id === eventId);
  if (index < 0) fail('OUTBOX_EVENT_NOT_FOUND');
  if (ledger.outbox_entries[index].delivery_state === 'DELIVERED') return { ledger, disposition: 'REPLAY', committed: false };
  const next = clone(ledger);
  next.outbox_entries[index].delivery_state = 'DELIVERED';
  next.ledger_version += 1;
  return { ledger: next, disposition: 'DELIVERED', committed: true };
}

module.exports = {
  RuntimeV2Error,
  computeParentStateDigest,
  sealParentState,
  validateParentState,
  protectedParentFingerprint,
  createLedger,
  validateLedger,
  validateRegistry,
  validateRequest,
  validateResponse,
  requestFingerprint,
  responseIdentity,
  registerRequestAttempt,
  reconcileRequestOutcome,
  intakeServiceResponse,
  transitionProposal,
  revalidateProposalToCurrentParent,
  updateSourceIdentity,
  updateArtifactIdentity,
  updateProvenanceIdentity,
  applyRightsPrivacyReclassification,
  markOutboxDelivered,
  snapshotCurrentness,
  digestObject,
  stableStringify,
};
