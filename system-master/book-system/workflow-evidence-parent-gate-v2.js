'use strict';

const core = require('./canonical-parent-v2-f6-core.js');
const workflowEvidence = require('./book-workflow-evidence-provenance.js');

const GATE_SCHEMA_VERSION = 'BOOK_WORKFLOW_EVIDENCE_PARENT_GATE_V2';
const BINDING_SCHEMA_VERSION = 'BOOK_WORKFLOW_EVIDENCE_PARENT_BINDING_V1';
const ALLOWED_EVIDENCE_CLASSES = new Set([
  'WORKFLOW_RECEIPT',
  'WORKFLOW_REPLAY_VERIFICATION',
  'EXTERNAL_PROVIDER_RESULT',
  'NATIVE_FIDELITY_VERIFIED'
]);
const FORBIDDEN_EFFECT_KEYS = new Set([
  'canonical_effect_allowed','canonical_write_allowed','apply_revision_to_canonical',
  'admit_canonical_manuscript','publication_authorized','publication_authority',
  'publication_authority_state','next_canonical_manuscript_ref','canonical_manuscript_state'
]);

class BookWorkflowEvidenceParentGateV2Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookWorkflowEvidenceParentGateV2Error';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookWorkflowEvidenceParentGateV2Error(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function isSubjectSha(v) { return typeof v === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v); }
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(v,k)) fail('REQUIRED_FIELD_MISSING', `${label}.${k}`);
}
function rejectAuthorityAssertions(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((x,i)=>rejectAuthorityAssertions(x,`${path}[${i}]`));
  if (!obj(value)) return;
  for (const [k,v] of Object.entries(value)) {
    if (FORBIDDEN_EFFECT_KEYS.has(k)) {
      if (k === 'canonical_effect_allowed' && v === false) {
        // recovered workflow receipts are required to carry this denial.
      } else {
        fail('EVIDENCE_AUTHORITY_ASSERTION_FORBIDDEN', `${path}.${k}`);
      }
    }
    if (/raw.*manuscript|manuscript.*text|raw.*research|private.*payload|source.*bytes|credential|access.*token|secret/i.test(k)) {
      fail('RAW_OR_PRIVATE_EVIDENCE_FIELD_FORBIDDEN', `${path}.${k}`);
    }
    rejectAuthorityAssertions(v,`${path}.${k}`);
  }
}

function validateProviderBinding(evidence) {
  required(evidence.provider_identity,['service_id','operation_id','provider_subject_sha','implementation_or_artifact_id'],'provider_identity');
  if (!nonEmpty(evidence.provider_identity.service_id)||!nonEmpty(evidence.provider_identity.operation_id)||!isSubjectSha(evidence.provider_identity.provider_subject_sha)||!nonEmpty(evidence.provider_identity.implementation_or_artifact_id)) fail('INVALID_PROVIDER_IDENTITY');
  required(evidence.source_identity,['object_id','object_version','object_digest'],'source_identity');
  if (!nonEmpty(evidence.source_identity.object_id)||!nonEmpty(String(evidence.source_identity.object_version))||!isSha(evidence.source_identity.object_digest)) fail('INVALID_SOURCE_IDENTITY');
  if (!isSha(evidence.result_digest)) fail('INVALID_RESULT_DIGEST');
  if (!nonEmpty(evidence.evidence_ref)) fail('EVIDENCE_REF_REQUIRED');
}

function validateWorkflowReceiptShape(evidence) {
  required(evidence,['receipt_id','receipt_digest','canonical_effect_allowed'],'workflow_receipt');
  if (!nonEmpty(evidence.receipt_id)||!isSha(evidence.receipt_digest)) fail('INVALID_WORKFLOW_RECEIPT_IDENTITY');
  if (evidence.canonical_effect_allowed !== false) fail('WORKFLOW_EVIDENCE_CANONICAL_EFFECT_FORBIDDEN');
}

function bindEvidenceToFreshParent(input) {
  required(input,['canonical_parent','expected_parent_state_version','expected_parent_state_digest','evidence_class','evidence'],'gate_input');
  const parent=clone(input.canonical_parent),evidence=clone(input.evidence);
  core.validateParent(parent);
  if (input.expected_parent_state_version!==parent.state_version||input.expected_parent_state_digest!==parent.state_digest) fail('FRESH_PARENT_REREAD_REQUIRED');
  if (!ALLOWED_EVIDENCE_CLASSES.has(input.evidence_class)) fail('UNSUPPORTED_EVIDENCE_CLASS');
  rejectAuthorityAssertions(evidence,'evidence');

  let sourceIdentity=null,providerIdentity=null,nativeFidelityVerified=false,evidenceIdentity=null;
  if (input.evidence_class === 'WORKFLOW_RECEIPT') {
    validateWorkflowReceiptShape(evidence);
    evidenceIdentity={receipt_id:evidence.receipt_id,receipt_digest:evidence.receipt_digest};
  } else if (input.evidence_class === 'WORKFLOW_REPLAY_VERIFICATION') {
    required(evidence,['replay_verified','receipt_count','terminal_receipt_digest','provider_execution_performed','canonical_effect_performed'],'workflow_replay');
    if (evidence.replay_verified!==true||evidence.provider_execution_performed!==false||evidence.canonical_effect_performed!==false) fail('WORKFLOW_REPLAY_AUTHORITY_VIOLATION');
    if (evidence.receipt_count>0&&!isSha(evidence.terminal_receipt_digest)) fail('WORKFLOW_REPLAY_TERMINAL_DIGEST_INVALID');
    evidenceIdentity={terminal_receipt_digest:evidence.terminal_receipt_digest,receipt_count:evidence.receipt_count};
  } else {
    validateProviderBinding(evidence);
    sourceIdentity=clone(evidence.source_identity); providerIdentity=clone(evidence.provider_identity);
    if (input.expected_source_identity) {
      if (core.sha256(input.expected_source_identity)!==core.sha256(sourceIdentity)) fail('EXTERNAL_EVIDENCE_SOURCE_IDENTITY_MISMATCH');
    }
    if (input.expected_provider_identity) {
      if (core.sha256(input.expected_provider_identity)!==core.sha256(providerIdentity)) fail('EXTERNAL_EVIDENCE_PROVIDER_IDENTITY_MISMATCH');
    }
    if (input.evidence_class==='NATIVE_FIDELITY_VERIFIED') {
      if (!nonEmpty(evidence.native_validation_evidence_ref)||!isSha(evidence.native_validation_result_digest)||evidence.native_fidelity_verified!==true) fail('NATIVE_FIDELITY_EVIDENCE_REQUIRED');
      nativeFidelityVerified=true;
    } else {
      if (evidence.native_fidelity_verified===true||evidence.native_validation_evidence_ref||evidence.native_validation_result_digest) fail('NATIVE_FIDELITY_CANNOT_BE_INFERRED');
    }
    evidenceIdentity={evidence_ref:evidence.evidence_ref,result_digest:evidence.result_digest};
  }

  const binding={
    binding_schema_version:BINDING_SCHEMA_VERSION,
    gate_schema_version:GATE_SCHEMA_VERSION,
    book_project_id:parent.book_project.book_project_id,
    bound_parent_state_version:parent.state_version,
    bound_parent_state_digest:parent.state_digest,
    evidence_class:input.evidence_class,
    evidence_identity:evidenceIdentity,
    source_identity:sourceIdentity,
    provider_identity:providerIdentity,
    native_fidelity_verified:nativeFidelityVerified,
    canonical_effect_allowed:false,
    publication_authorized:false,
    requires_fresh_parent_reread_before_typed_effect:true,
  };
  binding.binding_digest=core.sha256(binding);
  return binding;
}

function validateBindingAgainstFreshParent(bindingInput,parentInput) {
  const binding=clone(bindingInput),parent=clone(parentInput); core.validateParent(parent);
  required(binding,['binding_schema_version','gate_schema_version','book_project_id','bound_parent_state_version','bound_parent_state_digest','evidence_class','binding_digest','canonical_effect_allowed','publication_authorized','requires_fresh_parent_reread_before_typed_effect'],'binding');
  const copy=clone(binding),claimed=copy.binding_digest; delete copy.binding_digest;
  if (core.sha256(copy)!==claimed) fail('EVIDENCE_BINDING_DIGEST_MISMATCH');
  if (binding.binding_schema_version!==BINDING_SCHEMA_VERSION||binding.gate_schema_version!==GATE_SCHEMA_VERSION) fail('EVIDENCE_BINDING_SCHEMA_MISMATCH');
  if (binding.book_project_id!==parent.book_project.book_project_id) fail('EVIDENCE_BINDING_BOOK_MISMATCH');
  if (binding.bound_parent_state_version!==parent.state_version||binding.bound_parent_state_digest!==parent.state_digest) fail('FRESH_PARENT_REREAD_REQUIRED');
  if (binding.canonical_effect_allowed!==false||binding.publication_authorized!==false||binding.requires_fresh_parent_reread_before_typed_effect!==true) fail('EVIDENCE_AUTHORITY_ESCALATION_FORBIDDEN');
  return true;
}

function verifyRecoveredWorkflowReceipt(receipt,workflowState,plan,routingRegistry,serviceRegistry) {
  workflowEvidence.validateReceipt(receipt,workflowState,plan,routingRegistry,serviceRegistry);
  if (receipt.canonical_effect_allowed!==false) fail('WORKFLOW_EVIDENCE_CANONICAL_EFFECT_FORBIDDEN');
  return {receipt_id:receipt.receipt_id,receipt_digest:receipt.receipt_digest,canonical_effect_allowed:false};
}

module.exports={GATE_SCHEMA_VERSION,BINDING_SCHEMA_VERSION,BookWorkflowEvidenceParentGateV2Error,bindEvidenceToFreshParent,validateBindingAgainstFreshParent,verifyRecoveredWorkflowReceipt};
