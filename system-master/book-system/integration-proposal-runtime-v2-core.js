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
const EDITORIAL_STAGES = new Set(['STRUCTURAL_EDIT_REVIEW', 'STYLISTIC_OR_LINE_EDIT_REVIEW', 'COPY_EDIT_REVIEW', 'POST_LAYOUT_PROOFREAD_REVIEW']);
const TECHNICAL_ALLOWED = new Set(['NONE', 'EXPORT_GENERATED', 'FORMAT_VALIDATED', 'POST_LAYOUT_PROOF_COMPLETE']);
const TECHNICAL_FORBIDDEN = new Set(['EXPORT_FROZEN', 'PUBLICATION_AUTHORIZED']);
const ADMISSION_TRANSITIONS = {
  PROPOSED: new Set(['EVIDENCE_REVIEWED', 'DEFERRED', 'REJECTED']),
  EVIDENCE_REVIEWED: new Set(['PARENT_PREQUALIFIED', 'DEFERRED', 'REJECTED']),
  PARENT_PREQUALIFIED: new Set(['ADMITTED', 'DEFERRED', 'REJECTED']),
  ADMITTED: new Set(),
  DEFERRED: new Set(['EVIDENCE_REVIEWED', 'REJECTED']),
  REJECTED: new Set(),
};

function fail(code, detail = '') { throw new RuntimeV2Error(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function sha(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (obj(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}
function stable(v) { return JSON.stringify(normalize(v)); }
function digest(v) { return sha(Buffer.from(stable(v), 'utf8')); }
function makeId(prefix, seed, n = 24) { return `${prefix}-${digest(seed).slice(0, n).toUpperCase()}`; }
function reqFields(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const f of fields) if (!own(v, f)) fail('REQUIRED_FIELD_MISSING', `${label}.${f}`);
}

function computeParentStateDigest(state) {
  const c = clone(state);
  delete c.state_digest;
  return digest(c);
}
function sealParentState(state) {
  const c = clone(state);
  c.state_digest = computeParentStateDigest(c);
  return c;
}
function validateParentState(state) {
  if (!obj(state)) fail('PARENT_STATE_REQUIRED');
  if (!Number.isInteger(state.state_version) || state.state_version < 1) fail('INVALID_PARENT_STATE_VERSION');
  if (!isSha(state.state_digest)) fail('INVALID_PARENT_STATE_DIGEST');
  if (computeParentStateDigest(state) !== state.state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  if (!Array.isArray(state.integration_proposals)) fail('PARENT_INTEGRATION_PROPOSALS_ARRAY_REQUIRED');
}
function parentIdentity(state) {
  validateParentState(state);
  return { parent_state_version: state.state_version, parent_state_digest: state.state_digest };
}
function protectedParentFingerprint(state) {
  return digest({
    book_project: state.book_project || null,
    active: state.active || null,
    manuscripts: state.manuscripts || null,
    export_releases: state.export_releases || null,
    author_decisions: state.author_decisions || null,
  });
}

function validateSourceRef(ref, label) {
  reqFields(ref, ['object_id', 'object_version', 'object_digest'], label);
  if (!nonEmpty(ref.object_id) || !isSha(ref.object_digest)) fail('INVALID_SOURCE_IDENTITY', label);
}
function validateSourceRefs(refs, label) {
  if (!Array.isArray(refs) || refs.length === 0) fail('SOURCE_IDENTITY_REFS_REQUIRED', label);
  refs.forEach((r, i) => validateSourceRef(r, `${label}.${i}`));
}
function validateEditorialContext(v, label) {
  if (!obj(v)) fail('EDITORIAL_STAGE_CONTEXT_REQUIRED', label);
  if (!EDITORIAL_STAGES.has(v.stage_token)) fail('UNKNOWN_EDITORIAL_STAGE', String(v.stage_token));
  if (!['APPLICABLE', 'NOT_APPLICABLE'].includes(v.applicability)) fail('INVALID_EDITORIAL_APPLICABILITY');
  if (v.applicability === 'NOT_APPLICABLE' && !nonEmpty(v.not_applicable_rationale)) fail('NOT_APPLICABLE_RATIONALE_REQUIRED');
}

function validateRegistry(registry) {
  if (!obj(registry) || registry.registry_id !== 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002' || registry.registry_version !== 2) fail('REGISTRY_V2_REQUIRED');
  if (!obj(registry.services)) fail('REGISTRY_SERVICES_REQUIRED');
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
  reqFields(request, registry.common_request_envelope.required, 'request');
  if (request.schema_version !== 2) fail('UNKNOWN_REQUEST_SCHEMA_VERSION');
  if (!Number.isInteger(request.parent_state_version) || !isSha(request.parent_state_digest)) fail('INVALID_REQUEST_PARENT_IDENTITY');
  if (!Array.isArray(request.target_refs)) fail('TARGET_REFS_ARRAY_REQUIRED');
  validateSourceRefs(request.source_identity_refs, 'request.source_identity_refs');
  reqFields(request.authority_context, registry.common_request_envelope.authority_context_required, 'request.authority_context');
  const a = request.authority_context;
  if (a.canonical_write_allowed !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (a.lifecycle_transition_allowed !== false) fail('SERVICE_LIFECYCLE_TRANSITION_FORBIDDEN');
  if (a.export_freeze_allowed !== false) fail('SERVICE_EXPORT_FREEZE_FORBIDDEN');
  if (a.publication_authorized !== false) fail('SERVICE_PUBLICATION_AUTHORITY_FORBIDDEN');
  const { service, operation } = resolveOperation(registry, request);
  if (service.canonical_write_authority !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (!obj(request.projection)) fail('REQUEST_PROJECTION_REQUIRED');
  for (const f of operation.required_projection || []) if (!own(request.projection, f)) fail('REQUIRED_PROJECTION_FIELD_MISSING', f);
  if (own(request.projection, 'publication_authorized') && request.projection.publication_authorized !== false) fail('SERVICE_PUBLICATION_AUTHORITY_FORBIDDEN');
  if (operation.stage_scoped) validateEditorialContext(request.projection.editorial_stage_context, 'request.projection.editorial_stage_context');
  return { service, operation };
}
function validateArtifact(registry, e) {
  reqFields(e, registry.artifact_evidence_contract.required_when_artifact_returned, 'artifact_evidence');
  if (!isSha(e.artifact_digest)) fail('INVALID_ARTIFACT_DIGEST');
  if (!registry.artifact_evidence_contract.artifact_currentness_states.includes(e.artifact_currentness)) fail('UNKNOWN_ARTIFACT_CURRENTNESS');
}
function validateTarget(registry, e) {
  reqFields(e, registry.target_medium_evidence_contract.required_when_target_medium_operation, 'target_medium_evidence');
  if (TECHNICAL_FORBIDDEN.has(e.technical_state)) fail('PROVIDER_TECHNICAL_STATE_FORBIDDEN', e.technical_state);
  if (!TECHNICAL_ALLOWED.has(e.technical_state)) fail('UNKNOWN_PROVIDER_TECHNICAL_STATE');
  if (!isSha(e.rendered_candidate_digest)) fail('INVALID_RENDERED_CANDIDATE_DIGEST');
}
function validateProvenance(registry, e, artifacts) {
  reqFields(e, registry.provenance_evidence_contract.required_when_present, 'provenance_evidence');
  if (!isSha(e.bound_artifact_digest) || !isSha(e.projection_digest)) fail('INVALID_PROVENANCE_DIGEST');
  if (!registry.provenance_evidence_contract.currentness_states.includes(e.currentness_state)) fail('UNKNOWN_PROVENANCE_CURRENTNESS');
  if (e.credential_attachment_changed_bytes === true) {
    if (!isSha(e.pre_credential_artifact_digest)) fail('PRE_CREDENTIAL_DIGEST_REQUIRED');
    if (e.pre_credential_artifact_digest === e.bound_artifact_digest) fail('CREDENTIAL_CHANGED_BYTES_REQUIRES_NEW_DIGEST');
  }
  if (artifacts.length && !artifacts.some(a => a.artifact_digest === e.bound_artifact_digest)) fail('PROVENANCE_ARTIFACT_BINDING_MISMATCH');
}
function enforceOutputClasses(operation, response) {
  const map = {
    artifact_evidence: response.artifact_evidence,
    editorial_stage_evidence: response.editorial_stage_evidence,
    target_medium_evidence: response.target_medium_evidence,
    provenance_evidence: response.provenance_evidence,
  };
  for (const [name, values] of Object.entries(map)) {
    if (values.length > 0 && !(operation.allowed_outputs || []).includes(name)) fail('OUTPUT_CLASS_NOT_REGISTERED_FOR_OPERATION', name);
  }
}
function validateResponse(registry, request, response) {
  const { service, operation } = validateRequest(registry, request);
  reqFields(response, registry.common_response_envelope.required, 'response');
  if (response.schema_version !== 2) fail('UNKNOWN_RESPONSE_SCHEMA_VERSION');
  for (const f of ['request_id', 'correlation_id', 'idempotency_key', 'service_id', 'operation_id']) if (response[f] !== request[f]) fail('RESPONSE_REQUEST_BINDING_MISMATCH', f);
  if (response.provider_class !== service.provider_class) fail('PROVIDER_CLASS_MISMATCH');
  reqFields(response.provider_subject, registry.common_response_envelope.provider_subject_required, 'response.provider_subject');
  if (!/^[a-f0-9]{40,64}$/.test(String(response.provider_subject.subject_sha || ''))) fail('INVALID_PROVIDER_SUBJECT_SHA');
  reqFields(response.parent_projection_identity, registry.common_response_envelope.parent_projection_identity_required, 'response.parent_projection_identity');
  if (response.parent_projection_identity.parent_state_version !== request.parent_state_version || response.parent_projection_identity.parent_state_digest !== request.parent_state_digest) fail('RESPONSE_PARENT_PROJECTION_MISMATCH');
  validateSourceRefs(response.source_identity_refs, 'response.source_identity_refs');
  if (stable(response.source_identity_refs) !== stable(request.source_identity_refs)) fail('SOURCE_IDENTITY_BINDING_MISMATCH');
  if (!RESULT_CLASSES.has(response.result_class)) fail('UNKNOWN_RESULT_CLASS');
  if (!(operation.requested_parent_action_allowed || []).includes(response.requested_parent_action)) fail('PARENT_ACTION_NOT_ALLOWED_FOR_OPERATION');
  for (const f of ['evidence_refs', 'proposal_refs', 'artifact_evidence', 'editorial_stage_evidence', 'target_medium_evidence', 'provenance_evidence', 'abstentions', 'warnings']) if (!Array.isArray(response[f])) fail('RESPONSE_ARRAY_REQUIRED', f);
  if (response.result_class === 'ABSTAIN' && response.abstentions.length === 0) fail('ABSTENTION_REASON_REQUIRED');
  if (response.result_class === 'ERROR' && response.warnings.length === 0 && response.evidence_refs.length === 0) fail('ERROR_DETAIL_REQUIRED');
  for (const f of ['canonical_write', 'lifecycle_transition_allowed', 'export_freeze_allowed', 'publication_authorized', 'author_approved']) if (response[f] === true) fail('PROVIDER_AUTHORITY_CLAIM_FORBIDDEN', f);
  enforceOutputClasses(operation, response);
  response.artifact_evidence.forEach(e => validateArtifact(registry, e));
  response.editorial_stage_evidence.forEach(e => {
    validateEditorialContext(e, 'response.editorial_stage_evidence');
    for (const f of registry.editorial_stage_context.stage_evidence_fields) if (!own(e, f)) fail('EDITORIAL_STAGE_EVIDENCE_FIELD_MISSING', f);
    if (e.stage_complete === true || e.lifecycle_advance_requested === true) fail('PROVIDER_STAGE_AUTHORITY_FORBIDDEN');
  });
  response.target_medium_evidence.forEach(e => validateTarget(registry, e));
  response.provenance_evidence.forEach(e => validateProvenance(registry, e, response.artifact_evidence));
  return { service, operation };
}

function createLedger(parentState, options = {}) {
  const p = parentIdentity(parentState);
  const sources = {};
  for (const r of options.source_identity_refs || []) {
    validateSourceRef(r, 'initial_source');
    sources[r.object_id] = { object_version: r.object_version, object_digest: r.object_digest, current: true };
  }
  return {
    ledger_schema_version: 2,
    ledger_version: 0,
    bound_parent_state_version: p.parent_state_version,
    bound_parent_state_digest: p.parent_state_digest,
    intake_records: [],
    response_dedup_index: {},
    request_attempt_index: {},
    request_response_index: {},
    proposal_families: {},
    proposal_snapshots: [],
    author_queue_handoffs: [],
    source_identity_index: sources,
    artifact_identity_index: {},
    provenance_projection_index: {},
    admission_receipts: [],
    outbox_entries: [],
  };
}
function validateLedger(ledger, parentState = null) {
  if (!obj(ledger) || ledger.ledger_schema_version !== 2 || !Number.isInteger(ledger.ledger_version)) fail('INVALID_LEDGER');
  for (const f of ['intake_records', 'proposal_snapshots', 'author_queue_handoffs', 'admission_receipts', 'outbox_entries']) if (!Array.isArray(ledger[f])) fail('LEDGER_ARRAY_REQUIRED', f);
  for (const f of ['response_dedup_index', 'request_attempt_index', 'request_response_index', 'proposal_families', 'source_identity_index', 'artifact_identity_index', 'provenance_projection_index']) if (!obj(ledger[f])) fail('LEDGER_OBJECT_REQUIRED', f);
  if (parentState) {
    const p = parentIdentity(parentState);
    if (ledger.bound_parent_state_version !== p.parent_state_version || ledger.bound_parent_state_digest !== p.parent_state_digest) fail('LEDGER_PARENT_BINDING_MISMATCH');
  }
}

function requestFingerprint(r) { return digest(r); }
function responseIdentity(r) { return [r.service_id, r.operation_id, r.request_id, r.response_id, r.provider_subject.subject_sha].join('|'); }
function registerRequestAttempt(registry, ledger, request, outcomeState = 'KNOWN') {
  validateLedger(ledger);
  const { operation } = validateRequest(registry, request);
  if (!['KNOWN', 'UNKNOWN', 'RECONCILED'].includes(outcomeState)) fail('UNKNOWN_REQUEST_OUTCOME_STATE');
  const fp = requestFingerprint(request);
  const old = ledger.request_attempt_index[request.idempotency_key];
  if (old) {
    if (old.request_fingerprint !== fp) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (operation.idempotent === false && old.outcome_state === 'UNKNOWN') fail('NONIDEMPOTENT_RETRY_REQUIRES_RECONCILIATION');
    return { ledger, disposition: 'REPLAY', committed: false };
  }
  const next = clone(ledger);
  next.request_attempt_index[request.idempotency_key] = { request_id: request.request_id, service_id: request.service_id, operation_id: request.operation_id, request_fingerprint: fp, idempotent: operation.idempotent, outcome_state: outcomeState };
  next.ledger_version += 1;
  return { ledger: next, disposition: 'NEW', committed: true };
}
function reconcileRequestOutcome(ledger, key) {
  validateLedger(ledger);
  if (!ledger.request_attempt_index[key]) fail('REQUEST_ATTEMPT_NOT_FOUND');
  const next = clone(ledger);
  next.request_attempt_index[key].outcome_state = 'RECONCILED';
  next.ledger_version += 1;
  return next;
}

function sourcesCurrent(ledger, refs) {
  return refs.every(r => {
    const x = ledger.source_identity_index[r.object_id];
    return x && x.current === true && String(x.object_version) === String(r.object_version) && x.object_digest === r.object_digest;
  });
}
function artifactsCurrent(ledger, refs) {
  return refs.every(r => {
    if (r.artifact_currentness !== 'CURRENT_FOR_BOUND_SOURCE') return false;
    const x = ledger.artifact_identity_index[r.artifact_ref];
    return !x || (x.current === true && x.artifact_digest === r.artifact_digest && x.target_medium_profile_id === r.target_medium_profile_id && x.target_medium_profile_version === r.target_medium_profile_version);
  });
}
function provenanceCurrent(ledger, refs) {
  return refs.every(r => {
    if (!['NONE', 'CURRENT_FOR_BOUND_SOURCE_AND_ARTIFACT'].includes(r.currentness_state)) return false;
    const x = ledger.provenance_projection_index[r.projection_ref];
    return !x || (x.current === true && x.projection_digest === r.projection_digest && x.bound_artifact_digest === r.bound_artifact_digest);
  });
}
function assertEvidenceIdentityCanIndex(ledger, response) {
  for (const a of response.artifact_evidence) {
    const old = ledger.artifact_identity_index[a.artifact_ref];
    if (old && old.artifact_digest !== a.artifact_digest) fail('ARTIFACT_IDENTITY_CONFLICT', a.artifact_ref);
  }
  for (const p of response.provenance_evidence) {
    const old = ledger.provenance_projection_index[p.projection_ref];
    if (old && old.projection_digest !== p.projection_digest) fail('PROVENANCE_IDENTITY_CONFLICT', p.projection_ref);
  }
}
function indexEvidence(ledger, response) {
  for (const r of response.source_identity_refs) if (!ledger.source_identity_index[r.object_id]) ledger.source_identity_index[r.object_id] = { object_version: r.object_version, object_digest: r.object_digest, current: true };
  for (const a of response.artifact_evidence) ledger.artifact_identity_index[a.artifact_ref] = { artifact_digest: a.artifact_digest, target_medium_profile_id: a.target_medium_profile_id, target_medium_profile_version: a.target_medium_profile_version, current: a.artifact_currentness === 'CURRENT_FOR_BOUND_SOURCE' };
  for (const p of response.provenance_evidence) ledger.provenance_projection_index[p.projection_ref] = { projection_digest: p.projection_digest, bound_artifact_digest: p.bound_artifact_digest, current: ['NONE', 'CURRENT_FOR_BOUND_SOURCE_AND_ARTIFACT'].includes(p.currentness_state) };
}
function technicalState(evidence) {
  const order = ['NONE', 'EXPORT_GENERATED', 'FORMAT_VALIDATED', 'POST_LAYOUT_PROOF_COMPLETE'];
  return (evidence || []).reduce((best, e) => order.indexOf(e.technical_state) > order.indexOf(best) ? e.technical_state : best, 'NONE');
}
function editorialGateState(evidence) {
  if (!evidence || !evidence.length) return 'NOT_SCOPED';
  if (evidence.some(e => e.applicability === 'APPLICABLE' && (!Array.isArray(e.exit_evidence_refs) || e.exit_evidence_refs.length === 0))) return 'EVIDENCE_INCOMPLETE';
  return 'EVIDENCE_PRESENT';
}

function proposalSeed(response) { return { service_id: response.service_id, operation_id: response.operation_id, request_id: response.request_id, source_subject_sha: response.provider_subject.subject_sha }; }
function buildProposal(parentState, ledger, request, response, authorRequired) {
  const family = makeId('PF', proposalSeed(response), 20);
  const old = ledger.proposal_families[family];
  const version = old ? old.latest_version + 1 : 1;
  return {
    proposal_id: `${family}-V${version}`,
    proposal_family_id: family,
    proposal_version: version,
    predecessor_proposal_id: old ? old.latest_snapshot_id : null,
    source_project_or_lane: ['PROSE_SYSTEM', 'BOOK_EVALUATOR'].includes(response.provider_class) ? 'SYSTEM_MASTER/BOOK/PROSE' : response.provider_class,
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
    technical_export_state: technicalState(response.target_medium_evidence),
    abstentions: clone(response.abstentions),
    warnings: clone(response.warnings),
    disagreement_state: clone(response.disagreement_state || null),
    rights_boundary: request.authority_context.rights_boundary,
    privacy_boundary: request.authority_context.privacy_boundary,
    author_decision_required: authorRequired,
    author_decision_refs: [],
    publication_authorized: false,
    last_revalidated_parent_state_version: null,
    last_revalidated_parent_state_digest: null,
    created_by: 'BOOK_SYSTEM_PARENT_RUNTIME_V2',
  };
}
function familyIndex(ledger, snap) {
  ledger.proposal_families[snap.proposal_family_id] = { proposal_family_id: snap.proposal_family_id, latest_version: snap.proposal_version, latest_snapshot_id: snap.proposal_id, admission_state: snap.admission_state };
}
function registerInParent(parent, snap) {
  const before = protectedParentFingerprint(parent);
  const next = clone(parent);
  next.integration_proposals.push({ proposal_id: snap.proposal_id, source_project_or_lane: snap.source_project_or_lane, source_subject_sha: snap.source_subject_sha, capability_id: snap.capability_id, admission_state: snap.admission_state });
  next.state_version += 1;
  const sealed = sealParentState(next);
  if (protectedParentFingerprint(sealed) !== before) fail('FORBIDDEN_PARENT_STATE_MUTATION');
  return sealed;
}
function appendOutbox(ledger, type, aggregate, ref) {
  const event = { event_id: makeId('EVT', { type, aggregate, ref, sequence: ledger.outbox_entries.length + 1 }, 24), event_type: type, aggregate_id: aggregate, payload_ref: ref, sequence: ledger.outbox_entries.length + 1, delivery_state: 'PENDING' };
  ledger.outbox_entries.push(event);
  return event;
}
function makeReceipt(action, preParent, postParent, preLedger, postLedger, intakeId, proposalId) {
  return {
    receipt_id: makeId('RCPT', { action, pp: preParent.state_digest, np: postParent.state_digest, pl: preLedger.ledger_version, nl: postLedger.ledger_version, intakeId, proposalId }, 24),
    action,
    pre_parent_state_version: preParent.state_version,
    pre_parent_state_digest: preParent.state_digest,
    pre_integration_ledger_version: preLedger.ledger_version,
    pre_integration_ledger_digest: digest(preLedger),
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
    rollback_integration_ledger_digest: digest(preLedger),
  };
}
function finalize(ledger, parent) {
  ledger.bound_parent_state_version = parent.state_version;
  ledger.bound_parent_state_digest = parent.state_digest;
  ledger.ledger_version += 1;
}
function bindSnapshotToPostParent(snap, postParent) {
  snap.last_revalidated_parent_state_version = postParent.state_version;
  snap.last_revalidated_parent_state_digest = postParent.state_digest;
}
function disposition(parent, ledger, request, response) {
  if (request.parent_state_version !== parent.state_version || request.parent_state_digest !== parent.state_digest) return 'STALE_REJECTED_PRESERVED';
  if (!sourcesCurrent(ledger, response.source_identity_refs)) return 'SUPERSEDED_SOURCE_PRESERVED';
  if (!artifactsCurrent(ledger, response.artifact_evidence)) return 'STALE_ARTIFACT_PRESERVED';
  if (!provenanceCurrent(ledger, response.provenance_evidence)) return 'STALE_PROVENANCE_PRESERVED';
  if (response.result_class === 'ERROR') return 'ERROR_PRESERVED';
  if (response.result_class === 'ABSTAIN') return 'ABSTENTION_PRESERVED';
  if (response.result_class === 'PARTIAL') return 'PARTIAL_PRESERVED';
  if (response.result_class === 'REJECTED') return 'RECORDED_NO_PROPOSAL';
  if (response.requested_parent_action === 'QUEUE_AUTHOR_DECISION') return 'AUTHOR_QUEUE_HANDOFF_CREATED';
  if (response.requested_parent_action === 'REGISTER_INTEGRATION_PROPOSAL') return 'PROPOSAL_CREATED';
  return 'RECORDED_NO_PROPOSAL';
}

function intakeServiceResponse({ registry, parentState, ledger, request, response }) {
  validateParentState(parentState);
  validateLedger(ledger, parentState);
  const { operation } = validateResponse(registry, request, response);
  const responseKey = responseIdentity(response);
  const responseDigest = digest(response);
  const oldResponse = ledger.response_dedup_index[responseKey];
  if (oldResponse) {
    if (oldResponse.response_payload_digest !== responseDigest) fail('RESPONSE_IDENTITY_CONFLICT');
    return { parentState, ledger, disposition: 'REPLAY', committed: false, intake_record: clone(ledger.intake_records.find(x => x.intake_id === oldResponse.intake_id) || null), proposal_snapshot: oldResponse.proposal_snapshot_id ? clone(ledger.proposal_snapshots.find(x => x.proposal_id === oldResponse.proposal_snapshot_id) || null) : null };
  }
  const reqFp = requestFingerprint(request);
  const idempotencyOld = ledger.request_attempt_index[request.idempotency_key];
  if (idempotencyOld && idempotencyOld.request_fingerprint !== reqFp) fail('IDEMPOTENCY_KEY_CONFLICT');
  const requestResponseOld = ledger.request_response_index[request.request_id];
  if (requestResponseOld && requestResponseOld.response_id !== response.response_id) fail('SUPERSEDING_RESPONSE_REQUIRES_PARENT_RECONCILIATION');
  assertEvidenceIdentityCanIndex(ledger, response);

  const preParent = clone(parentState);
  const preLedger = clone(ledger);
  let nextParent = clone(parentState);
  const nextLedger = clone(ledger);
  if (!nextLedger.request_attempt_index[request.idempotency_key]) nextLedger.request_attempt_index[request.idempotency_key] = { request_id: request.request_id, service_id: request.service_id, operation_id: request.operation_id, request_fingerprint: reqFp, idempotent: operation.idempotent, outcome_state: 'KNOWN' };
  nextLedger.request_response_index[request.request_id] = { response_id: response.response_id, response_identity: responseKey };
  const d = disposition(nextParent, nextLedger, request, response);
  indexEvidence(nextLedger, response);
  const intakeId = makeId('INTAKE', { responseKey, responseDigest }, 24);
  const intake = {
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
    freshness_state: d.startsWith('STALE') || d.startsWith('SUPERSEDED') ? 'STALE' : 'CURRENT',
    intake_disposition: d,
  };
  nextLedger.intake_records.push(intake);

  let snap = null;
  const requestedProposal = ['REGISTER_INTEGRATION_PROPOSAL', 'QUEUE_AUTHOR_DECISION'].includes(response.requested_parent_action);
  const canPropose = !['STALE_REJECTED_PRESERVED', 'SUPERSEDED_SOURCE_PRESERVED', 'STALE_ARTIFACT_PRESERVED', 'STALE_PROVENANCE_PRESERVED', 'ERROR_PRESERVED', 'ABSTENTION_PRESERVED'].includes(d) && !['ERROR', 'ABSTAIN', 'REJECTED'].includes(response.result_class);
  if (requestedProposal && canPropose) {
    snap = buildProposal(parentState, nextLedger, request, response, response.requested_parent_action === 'QUEUE_AUTHOR_DECISION');
    nextParent = registerInParent(parentState, snap);
    bindSnapshotToPostParent(snap, nextParent);
    nextLedger.proposal_snapshots.push(snap);
    familyIndex(nextLedger, snap);
    if (snap.author_decision_required) nextLedger.author_queue_handoffs.push({ handoff_id: makeId('HANDOFF', { proposal: snap.proposal_id, response: response.response_id }, 24), proposal_family_id: snap.proposal_family_id, proposal_snapshot_id: snap.proposal_id, decision_type: 'BOUNDED_AUTHOR_DECISION', subject_ref: snap.proposal_id, options: ['APPROVE', 'REJECT', 'DEFER'], source_request_id: response.request_id, source_response_id: response.response_id, status: 'PENDING' });
    appendOutbox(nextLedger, 'BOOK_INTEGRATION_PROPOSAL_REGISTERED', snap.proposal_family_id, snap.proposal_id);
  }
  nextLedger.response_dedup_index[responseKey] = { response_payload_digest: responseDigest, intake_id: intakeId, proposal_snapshot_id: snap ? snap.proposal_id : null };
  finalize(nextLedger, nextParent);
  const receipt = makeReceipt('INTAKE_SERVICE_RESPONSE', preParent, nextParent, preLedger, nextLedger, intakeId, snap ? snap.proposal_id : null);
  receipt.source_object_refs_and_digests = clone(response.source_identity_refs);
  receipt.artifact_refs_and_digests_if_material = clone(response.artifact_evidence);
  receipt.provenance_projection_refs_and_currentness_if_material = clone(response.provenance_evidence);
  nextLedger.admission_receipts.push(receipt);
  receipt.post_integration_ledger_version = nextLedger.ledger_version;
  receipt.post_integration_ledger_digest = digest(nextLedger);
  return { parentState: nextParent, ledger: nextLedger, disposition: d, committed: true, intake_record: clone(intake), proposal_snapshot: clone(snap), receipt: clone(receipt) };
}

function proposalById(ledger, id) {
  const s = ledger.proposal_snapshots.find(x => x.proposal_id === id);
  if (!s) fail('PROPOSAL_SNAPSHOT_NOT_FOUND', id);
  return s;
}
function currentness(ledger, snap) {
  const s = sourcesCurrent(ledger, snap.source_object_refs_and_digests || []);
  const a = artifactsCurrent(ledger, snap.artifact_refs_and_digests || []);
  const p = provenanceCurrent(ledger, snap.provenance_projection_refs_and_currentness || []);
  return { source_current: s, artifact_current: a, provenance_current: p, all_current: s && a && p };
}
function evidenceReviewedGate(snap) {
  if (['ABSTAIN', 'ERROR', 'REJECTED'].includes(snap.source_result_class)) fail('NON_SUCCESS_RESULT_CANNOT_ADVANCE');
  if (!nonEmpty(snap.rights_boundary) || !nonEmpty(snap.privacy_boundary)) fail('RIGHTS_PRIVACY_BOUNDARY_REQUIRED');
}
function prequalifiedGate(parent, ledger, snap) {
  const c = currentness(ledger, snap);
  if (!c.source_current) fail('STALE_SOURCE_IDENTITY');
  if (!c.artifact_current) fail('STALE_ARTIFACT_IDENTITY');
  if (!c.provenance_current) fail('STALE_PROVENANCE_IDENTITY');
  if (snap.last_revalidated_parent_state_version !== parent.state_version || snap.last_revalidated_parent_state_digest !== parent.state_digest) fail('PROPOSAL_PARENT_REVALIDATION_REQUIRED');
  if ((snap.warnings || []).some(x => String(x).startsWith('CRITICAL_'))) fail('CRITICAL_HARD_FAILURE_REMAINS');
  if (snap.editorial_stage_context && snap.editorial_stage_context.applicability === 'APPLICABLE' && snap.editorial_gate_state === 'EVIDENCE_INCOMPLETE') fail('EDITORIAL_GATE_EVIDENCE_INCOMPLETE');
}
function authorApproved(snap, decisions) {
  if (!snap.author_decision_required) return true;
  return (decisions || []).some(d => d && d.subject_ref === snap.proposal_id && d.status === 'APPROVED' && nonEmpty(d.author_choice));
}
function commitSnapshot(parent, ledger, prior, next, action) {
  const preParent = clone(parent);
  const preLedger = clone(ledger);
  const nextParent = registerInParent(parent, next);
  bindSnapshotToPostParent(next, nextParent);
  const nextLedger = clone(ledger);
  nextLedger.proposal_snapshots.push(next);
  familyIndex(nextLedger, next);
  appendOutbox(nextLedger, 'BOOK_INTEGRATION_PROPOSAL_STATE_CHANGED', next.proposal_family_id, next.proposal_id);
  finalize(nextLedger, nextParent);
  const receipt = makeReceipt(action, preParent, nextParent, preLedger, nextLedger, null, next.proposal_id);
  receipt.source_object_refs_and_digests = clone(next.source_object_refs_and_digests || []);
  receipt.artifact_refs_and_digests_if_material = clone(next.artifact_refs_and_digests || []);
  receipt.provenance_projection_refs_and_currentness_if_material = clone(next.provenance_projection_refs_and_currentness || []);
  nextLedger.admission_receipts.push(receipt);
  receipt.post_integration_ledger_version = nextLedger.ledger_version;
  receipt.post_integration_ledger_digest = digest(nextLedger);
  return { parentState: nextParent, ledger: nextLedger, proposal_snapshot: clone(next), receipt: clone(receipt) };
}
function transitionProposal({ parentState, ledger, proposalId, targetState, authorDecisions = [] }) {
  validateParentState(parentState); validateLedger(ledger, parentState);
  const prior = clone(proposalById(ledger, proposalId));
  if (!ADMISSION_TRANSITIONS[prior.admission_state] || !ADMISSION_TRANSITIONS[prior.admission_state].has(targetState)) fail('ILLEGAL_ADMISSION_TRANSITION', `${prior.admission_state}->${targetState}`);
  if (targetState === 'EVIDENCE_REVIEWED') evidenceReviewedGate(prior);
  if (targetState === 'PARENT_PREQUALIFIED') prequalifiedGate(parentState, ledger, prior);
  if (targetState === 'ADMITTED') {
    prequalifiedGate(parentState, ledger, prior);
    if (!authorApproved(prior, authorDecisions)) fail('AUTHOR_DECISION_REQUIRED');
  }
  const family = ledger.proposal_families[prior.proposal_family_id];
  const next = clone(prior);
  next.predecessor_proposal_id = prior.proposal_id;
  next.proposal_version = family.latest_version + 1;
  next.proposal_id = `${prior.proposal_family_id}-V${next.proposal_version}`;
  next.admission_state = targetState;
  next.author_decision_refs = targetState === 'ADMITTED' ? clone(authorDecisions) : clone(prior.author_decision_refs || []);
  next.publication_authorized = false;
  next.created_by = 'BOOK_SYSTEM_PARENT_RUNTIME_V2';
  return commitSnapshot(parentState, ledger, prior, next, `PROPOSAL_${targetState}`);
}
function revalidateProposalToCurrentParent({ parentState, ledger, proposalId }) {
  validateParentState(parentState); validateLedger(ledger, parentState);
  const prior = clone(proposalById(ledger, proposalId));
  const c = currentness(ledger, prior);
  if (!c.source_current) fail('STALE_SOURCE_IDENTITY');
  if (!c.artifact_current) fail('STALE_ARTIFACT_IDENTITY');
  if (!c.provenance_current) fail('STALE_PROVENANCE_IDENTITY');
  const family = ledger.proposal_families[prior.proposal_family_id];
  const next = clone(prior);
  next.predecessor_proposal_id = prior.proposal_id;
  next.proposal_version = family.latest_version + 1;
  next.proposal_id = `${prior.proposal_family_id}-V${next.proposal_version}`;
  next.created_by = 'BOOK_SYSTEM_PARENT_RUNTIME_V2_REVALIDATION';
  return commitSnapshot(parentState, ledger, prior, next, 'PROPOSAL_REVALIDATED');
}

function updateSourceIdentity(ledger, ref) {
  validateLedger(ledger); validateSourceRef(ref, 'source_identity_update');
  const next = clone(ledger);
  const old = next.source_identity_index[ref.object_id];
  if (old) old.current = false;
  next.source_identity_index[ref.object_id] = { object_version: ref.object_version, object_digest: ref.object_digest, current: true };
  next.ledger_version += 1;
  return next;
}
function updateArtifactIdentity(ledger, a) {
  validateLedger(ledger);
  if (!obj(a) || !nonEmpty(a.artifact_ref) || !isSha(a.artifact_digest)) fail('INVALID_ARTIFACT_IDENTITY_UPDATE');
  const next = clone(ledger);
  next.artifact_identity_index[a.artifact_ref] = { ...(next.artifact_identity_index[a.artifact_ref] || {}), ...clone(a), current: a.current !== false };
  next.ledger_version += 1;
  return next;
}
function updateProvenanceIdentity(ledger, p) {
  validateLedger(ledger);
  if (!obj(p) || !nonEmpty(p.projection_ref) || !isSha(p.projection_digest) || !isSha(p.bound_artifact_digest)) fail('INVALID_PROVENANCE_IDENTITY_UPDATE');
  const next = clone(ledger);
  next.provenance_projection_index[p.projection_ref] = { ...(next.provenance_projection_index[p.projection_ref] || {}), ...clone(p), current: p.current !== false };
  next.ledger_version += 1;
  return next;
}
function applyRightsPrivacyReclassification({ parentState, ledger, proposalId, rightsBoundary, privacyBoundary, action = 'STALE' }) {
  validateParentState(parentState); validateLedger(ledger, parentState);
  if (!['STALE', 'REJECT'].includes(action)) fail('UNKNOWN_RIGHTS_PRIVACY_ACTION');
  if (!nonEmpty(rightsBoundary) || !nonEmpty(privacyBoundary)) fail('RIGHTS_PRIVACY_BOUNDARY_REQUIRED');
  const prior = clone(proposalById(ledger, proposalId));
  const family = ledger.proposal_families[prior.proposal_family_id];
  const next = clone(prior);
  next.predecessor_proposal_id = prior.proposal_id;
  next.proposal_version = family.latest_version + 1;
  next.proposal_id = `${prior.proposal_family_id}-V${next.proposal_version}`;
  next.rights_boundary = rightsBoundary;
  next.privacy_boundary = privacyBoundary;
  if (action === 'REJECT') next.admission_state = 'REJECTED'; else next.warnings = [...(next.warnings || []), 'CRITICAL_RIGHTS_PRIVACY_REVALIDATION_REQUIRED'];
  next.created_by = 'BOOK_SYSTEM_PARENT_RUNTIME_V2_RIGHTS_PRIVACY_RECLASSIFICATION';
  return commitSnapshot(parentState, ledger, prior, next, 'PROPOSAL_RIGHTS_PRIVACY_RECLASSIFIED');
}
function markOutboxDelivered(ledger, eventId) {
  validateLedger(ledger);
  const i = ledger.outbox_entries.findIndex(e => e.event_id === eventId);
  if (i < 0) fail('OUTBOX_EVENT_NOT_FOUND');
  if (ledger.outbox_entries[i].delivery_state === 'DELIVERED') return { ledger, disposition: 'REPLAY', committed: false };
  const next = clone(ledger);
  next.outbox_entries[i].delivery_state = 'DELIVERED';
  next.ledger_version += 1;
  return { ledger: next, disposition: 'DELIVERED', committed: true };
}

module.exports = {
  RuntimeV2Error,
  stableStringify: stable,
  digestObject: digest,
  computeParentStateDigest,
  sealParentState,
  validateParentState,
  protectedParentFingerprint,
  validateRegistry,
  validateRequest,
  validateResponse,
  createLedger,
  validateLedger,
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
  snapshotCurrentness: currentness,
};
