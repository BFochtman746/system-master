'use strict';

const crypto = require('crypto');

class TransitionError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new TransitionError(code, detail); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

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
function sha256(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function digestObject(value) { return sha256(stableStringify(value)); }

function ledgerDigestProjection(ledger) {
  const copy = clone(ledger);
  if (isObject(copy.transition_receipts)) {
    for (const receipt of Object.values(copy.transition_receipts)) {
      if (isObject(receipt)) {
        receipt.post_ledger_digest = '__SELF_EXCLUDED__';
        receipt.rollback_ledger_digest = '__SELF_EXCLUDED__';
      }
    }
  }
  return copy;
}

function digestLedger(ledger) { return digestObject(ledgerDigestProjection(ledger)); }
function digestParentState(parentState) { return digestObject(parentState); }

function requireFields(obj, fields, context) {
  if (!isObject(obj)) fail('OBJECT_REQUIRED', context);
  for (const field of fields) if (!hasOwn(obj, field)) fail('REQUIRED_FIELD_MISSING', `${context}.${field}`);
}

function validateLedger(contract, parentState, ledger) {
  requireFields(ledger, contract.transition_ledger.required, 'ledger');
  if (ledger.ledger_schema_version !== contract.engine_version) fail('LEDGER_SCHEMA_VERSION_MISMATCH');
  if (!Number.isInteger(ledger.ledger_version) || ledger.ledger_version < 1) fail('INVALID_LEDGER_VERSION');
  if (!isObject(ledger.unit_states) || !Array.isArray(ledger.dependency_edges) || !isObject(ledger.processed_requests) || !isObject(ledger.transition_receipts)) {
    fail('INVALID_LEDGER_COLLECTIONS');
  }
  if (ledger.bound_parent_state_version !== parentState.state_version) fail('LEDGER_PARENT_VERSION_BINDING_MISMATCH');
  if (ledger.bound_parent_state_digest !== digestParentState(parentState)) fail('LEDGER_PARENT_DIGEST_BINDING_MISMATCH');

  for (const [unitRef, unit] of Object.entries(ledger.unit_states)) {
    requireFields(unit, contract.transition_ledger.unit_state_required, `ledger.unit_states.${unitRef}`);
    if (unit.unit_ref !== unitRef) fail('UNIT_KEY_REF_MISMATCH', unitRef);
    if (!contract.transition_ledger.unit_types.includes(unit.unit_type)) fail('INVALID_UNIT_TYPE', `${unitRef}:${unit.unit_type}`);
    if (!contract.transition_ledger.unit_statuses.includes(unit.status)) fail('INVALID_UNIT_STATUS', `${unitRef}:${unit.status}`);
    if (!Number.isInteger(unit.status_version) || unit.status_version < 1) fail('INVALID_UNIT_STATUS_VERSION', unitRef);
  }

  const edgeIds = new Set();
  for (const edge of ledger.dependency_edges) {
    requireFields(edge, contract.invalidation.dependency_edge_required, 'dependency_edge');
    if (edgeIds.has(edge.edge_id)) fail('DUPLICATE_DEPENDENCY_EDGE_ID', edge.edge_id);
    edgeIds.add(edge.edge_id);
    if (!contract.invalidation.dependency_classes.includes(edge.dependency_class)) fail('INVALID_DEPENDENCY_CLASS', edge.dependency_class);
  }
  return true;
}

function evidenceObject(parentState, ref) {
  if (isObject(parentState.research_evidence_links) && hasOwn(parentState.research_evidence_links, ref)) return parentState.research_evidence_links[ref];
  if (isObject(parentState.integration_proposals) && hasOwn(parentState.integration_proposals, ref)) return parentState.integration_proposals[ref];
  if (isObject(parentState.export_releases) && hasOwn(parentState.export_releases, ref)) return parentState.export_releases[ref];
  return null;
}

function evidenceTypes(obj) {
  if (!isObject(obj)) return [];
  const out = [];
  if (typeof obj.evidence_type === 'string') out.push(obj.evidence_type);
  if (Array.isArray(obj.evidence_types)) for (const value of obj.evidence_types) if (typeof value === 'string') out.push(value);
  if (typeof obj.capability_id === 'string') out.push(obj.capability_id);
  if (obj.publication_authority_state === 'AUTHOR_APPROVED') out.push('AUTHOR_APPROVED_EXPORT_PRESENT');
  return [...new Set(out)];
}

function validateEvidenceRefs(parentState, request) {
  const resolved = [];
  for (const ref of request.evidence_refs) {
    const obj = evidenceObject(parentState, ref);
    if (!obj) fail('EVIDENCE_REF_NOT_REGISTERED', ref);
    if (isObject(obj.parent_projection_identity)) {
      const p = obj.parent_projection_identity;
      if (p.parent_state_version !== parentState.state_version || p.parent_state_digest !== digestParentState(parentState)) {
        fail('STALE_SERVICE_EVIDENCE', ref);
      }
    }
    resolved.push({ ref, obj, types: evidenceTypes(obj) });
  }
  return resolved;
}

function requireEvidenceTypes(parentState, request, requiredTypes) {
  if (!requiredTypes || requiredTypes.length === 0) return;
  const resolved = validateEvidenceRefs(parentState, request);
  const available = new Set(resolved.flatMap((item) => item.types));
  for (const required of requiredTypes) if (!available.has(required)) fail('REQUIRED_TRANSITION_EVIDENCE_MISSING', required);
}

function affirmativeAuthorChoice(value) {
  return ['APPROVE', 'APPROVED', 'ACCEPT', 'ACCEPTED', 'PROMOTE', 'PROMOTED', 'YES', true].includes(value);
}

function requireAuthorDecisionTypes(parentState, request, requiredTypes) {
  if (!requiredTypes || requiredTypes.length === 0) return;
  const available = new Set();
  for (const ref of request.author_decision_refs) {
    const decision = isObject(parentState.author_decisions) ? parentState.author_decisions[ref] : null;
    if (!decision) fail('AUTHOR_DECISION_REF_NOT_REGISTERED', ref);
    if (decision.status !== 'APPROVED' || !affirmativeAuthorChoice(decision.author_choice)) fail('AUTHOR_DECISION_NOT_APPROVED', ref);
    available.add(decision.decision_type);
  }
  for (const required of requiredTypes) if (!available.has(required)) fail('REQUIRED_AUTHOR_DECISION_MISSING', required);
}

function validateIntegrationProposalRefs(parentState, request) {
  for (const ref of request.integration_proposal_refs) {
    const proposal = isObject(parentState.integration_proposals) ? parentState.integration_proposals[ref] : null;
    if (!proposal) fail('INTEGRATION_PROPOSAL_REF_NOT_REGISTERED', ref);
    if (proposal.admission_state === 'REJECTED' || proposal.admission_state === 'DEFERRED') fail('INTEGRATION_PROPOSAL_NOT_ADMISSIBLE', ref);
    if (isObject(proposal.parent_projection_identity)) {
      const p = proposal.parent_projection_identity;
      if (p.parent_state_version !== parentState.state_version || p.parent_state_digest !== digestParentState(parentState)) fail('STALE_INTEGRATION_PROPOSAL', ref);
    }
  }
}

function requestFingerprint(request) {
  return digestObject(request);
}

function checkReplay(ledger, request) {
  const fingerprint = requestFingerprint(request);
  const prior = ledger.processed_requests[request.idempotency_key];
  if (prior) {
    if (prior.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.transition_request_id !== request.transition_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    const receipt = ledger.transition_receipts[prior.transition_receipt_ref];
    if (!receipt) fail('PROCESSED_REQUEST_RECEIPT_MISSING', prior.transition_receipt_ref);
    return { replay: true, receipt: clone(receipt), fingerprint };
  }
  for (const entry of Object.values(ledger.processed_requests)) {
    if (entry.transition_request_id === request.transition_request_id) fail('REQUEST_ID_CONFLICT');
  }
  return { replay: false, fingerprint };
}

function validateRequest(contract, parentState, ledger, request) {
  requireFields(request, contract.transition_request.required, 'transition_request');
  if (request.actor_class !== contract.transition_request.actor_class) fail('TRANSITION_AUTHORITY_DENIED', request.actor_class);
  if (!contract.transition_request.scopes.includes(request.scope)) fail('INVALID_TRANSITION_SCOPE', request.scope);
  for (const field of ['evidence_refs', 'author_decision_refs', 'integration_proposal_refs', 'cause_refs']) {
    if (!Array.isArray(request[field])) fail('TRANSITION_REQUEST_ARRAY_REQUIRED', field);
  }
  if (request.expected_parent_state_version !== parentState.state_version) fail('PARENT_STATE_VERSION_MISMATCH');
  if (request.expected_parent_state_digest !== digestParentState(parentState)) fail('PARENT_STATE_DIGEST_MISMATCH');
  if (request.expected_ledger_version !== ledger.ledger_version) fail('LEDGER_VERSION_MISMATCH');
  if (request.expected_ledger_digest !== digestLedger(ledger)) fail('LEDGER_DIGEST_MISMATCH');
  validateIntegrationProposalRefs(parentState, request);
}

function dependencyClosure(ledger, startingRef) {
  const downstream = new Map();
  for (const edge of ledger.dependency_edges) {
    if (!downstream.has(edge.upstream_ref)) downstream.set(edge.upstream_ref, []);
    downstream.get(edge.upstream_ref).push(edge.downstream_ref);
  }
  const seen = new Set();
  const queue = [startingRef];
  while (queue.length) {
    const current = queue.shift();
    for (const next of downstream.get(current) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

function invalidateUnit(workingLedger, unitRef, causeRefs, receiptRefPlaceholder) {
  const unit = workingLedger.unit_states[unitRef];
  if (!unit || unit.status === 'INVALIDATED_BY_UPSTREAM_CHANGE') return false;
  unit.invalidated_from_status = unit.status;
  unit.status = 'INVALIDATED_BY_UPSTREAM_CHANGE';
  unit.status_version += 1;
  unit.invalidation_causes = [...new Set([...(unit.invalidation_causes || []), ...causeRefs])];
  unit.last_transition_receipt_ref = receiptRefPlaceholder;
  return true;
}

function requiredUnitAuthorTypes(unit, gate) {
  const required = [...(gate.required_author_decision_types || [])];
  if (unit.author_required === true && Array.isArray(gate.required_author_decision_types_if_unit_requires_author)) {
    required.push(...gate.required_author_decision_types_if_unit_requires_author);
  }
  return [...new Set(required)];
}

function applyTransition(contract, parentStateInput, ledgerInput, requestInput) {
  const parentState = clone(parentStateInput);
  const ledger = clone(ledgerInput);
  validateLedger(contract, parentState, ledger);
  const request = clone(requestInput);
  validateRequest(contract, parentState, ledger, request);

  const replay = checkReplay(ledger, request);
  if (replay.replay) {
    return {
      disposition: 'REPLAY',
      parent_state: parentState,
      lifecycle_ledger: ledger,
      receipt: replay.receipt,
      parent_state_digest: digestParentState(parentState),
      lifecycle_ledger_digest: digestLedger(ledger),
    };
  }

  const preParent = clone(parentState);
  const preLedger = clone(ledger);
  const preParentDigest = digestParentState(preParent);
  const preLedgerDigest = digestLedger(preLedger);
  const workingParent = clone(parentState);
  const workingLedger = clone(ledger);
  const receiptId = `TRANSITION-RECEIPT:${replay.fingerprint.slice(0, 32).toUpperCase()}`;
  let fromStatus;
  let toStatus;
  const invalidated = [];

  if (request.scope === 'PROJECT') {
    if (request.target_ref !== workingParent.book_project.book_project_id) fail('PROJECT_TARGET_REF_MISMATCH');
    fromStatus = workingParent.book_project.status;
    toStatus = request.target_status;
    const gateKey = `${fromStatus}->${toStatus}`;
    const gate = contract.project_transition_gates[gateKey];
    if (!gate) fail('ILLEGAL_PROJECT_TRANSITION', gateKey);
    requireEvidenceTypes(workingParent, request, gate.required_evidence_types || []);
    requireAuthorDecisionTypes(workingParent, request, gate.required_author_decision_types || []);
    workingParent.book_project.status = toStatus;
    workingParent.state_version += 1;
  } else {
    const unit = workingLedger.unit_states[request.target_ref];
    if (!unit) fail('UNIT_TARGET_NOT_FOUND', request.target_ref);
    fromStatus = unit.status;
    const target = request.target_status;

    if (target === 'RESUME_PREVIOUS_STATUS') {
      if (fromStatus !== 'DEFERRED' || !unit.deferred_from_status) fail('UNIT_NOT_DEFERRED_WITH_RESUME_TARGET');
      const gate = contract.unit_gate_rules.RESUME_PREVIOUS_STATUS;
      requireEvidenceTypes(workingParent, request, gate.required_evidence_types || []);
      toStatus = unit.deferred_from_status;
      unit.status = toStatus;
      unit.deferred_from_status = null;
      unit.status_version += 1;
      unit.last_transition_receipt_ref = receiptId;
    } else if (target === 'RESTORE_INVALIDATED_STATUS_AFTER_REVALIDATION') {
      if (fromStatus !== 'INVALIDATED_BY_UPSTREAM_CHANGE' || !unit.invalidated_from_status) fail('UNIT_NOT_INVALIDATED_WITH_RESTORE_TARGET');
      const gate = contract.unit_gate_rules.RESTORE_INVALIDATED_STATUS_AFTER_REVALIDATION;
      requireEvidenceTypes(workingParent, request, gate.required_evidence_types || []);
      toStatus = unit.invalidated_from_status;
      unit.status = toStatus;
      unit.invalidated_from_status = null;
      unit.invalidation_causes = [];
      unit.status_version += 1;
      unit.last_transition_receipt_ref = receiptId;
    } else {
      const allowed = contract.unit_transition_rules[fromStatus] || [];
      if (!allowed.includes(target)) fail('ILLEGAL_UNIT_TRANSITION', `${fromStatus}->${target}`);
      const gate = contract.unit_gate_rules[target] || { required_evidence_types: [], required_author_decision_types: [] };
      requireEvidenceTypes(workingParent, request, gate.required_evidence_types || []);
      requireAuthorDecisionTypes(workingParent, request, requiredUnitAuthorTypes(unit, gate));
      toStatus = target;

      if (target === 'DEFERRED') unit.deferred_from_status = fromStatus;
      if (target === 'INVALIDATED_BY_UPSTREAM_CHANGE') {
        if (request.cause_refs.length === 0) fail('INVALIDATION_CAUSE_REQUIRED');
        unit.invalidated_from_status = fromStatus;
        unit.invalidation_causes = [...new Set([...(unit.invalidation_causes || []), ...request.cause_refs])];
      }
      unit.status = target;
      unit.status_version += 1;
      unit.last_transition_receipt_ref = receiptId;

      if (target === 'INVALIDATED_BY_UPSTREAM_CHANGE') {
        for (const downstreamRef of dependencyClosure(workingLedger, request.target_ref)) {
          if (invalidateUnit(workingLedger, downstreamRef, request.cause_refs, receiptId)) invalidated.push(downstreamRef);
        }
      }
    }
  }

  workingLedger.ledger_version += 1;
  workingLedger.bound_parent_state_version = workingParent.state_version;
  workingLedger.bound_parent_state_digest = digestParentState(workingParent);

  const receipt = {
    transition_receipt_id: receiptId,
    transition_request_id: request.transition_request_id,
    idempotency_key: request.idempotency_key,
    scope: request.scope,
    target_ref: request.target_ref,
    pre_parent_state_version: preParent.state_version,
    pre_parent_state_digest: preParentDigest,
    pre_ledger_version: preLedger.ledger_version,
    pre_ledger_digest: preLedgerDigest,
    from_status: fromStatus,
    to_status: toStatus,
    evidence_refs: clone(request.evidence_refs),
    author_decision_refs: clone(request.author_decision_refs),
    integration_proposal_refs: clone(request.integration_proposal_refs),
    cause_refs: clone(request.cause_refs),
    post_parent_state_version: workingParent.state_version,
    post_parent_state_digest: digestParentState(workingParent),
    post_ledger_version: workingLedger.ledger_version,
    post_ledger_digest: '__PENDING__',
    rollback_parent_state_version: preParent.state_version,
    rollback_parent_state_digest: preParentDigest,
    rollback_ledger_version: preLedger.ledger_version,
    rollback_ledger_digest: preLedgerDigest,
    invalidated_unit_refs: invalidated.sort(),
  };

  workingLedger.transition_receipts[receiptId] = receipt;
  workingLedger.processed_requests[request.idempotency_key] = {
    transition_request_id: request.transition_request_id,
    request_fingerprint: replay.fingerprint,
    transition_receipt_ref: receiptId,
  };
  receipt.post_ledger_digest = digestLedger(workingLedger);
  workingLedger.transition_receipts[receiptId] = receipt;

  validateLedger(contract, workingParent, workingLedger);
  return {
    disposition: 'COMMITTED',
    parent_state: workingParent,
    lifecycle_ledger: workingLedger,
    receipt: clone(receipt),
    parent_state_digest: digestParentState(workingParent),
    lifecycle_ledger_digest: digestLedger(workingLedger),
    rollback: {
      parent_state: preParent,
      lifecycle_ledger: preLedger,
      parent_state_digest: preParentDigest,
      lifecycle_ledger_digest: preLedgerDigest,
    },
  };
}

module.exports = {
  TransitionError,
  stableStringify,
  digestParentState,
  digestLedger,
  validateLedger,
  validateRequest,
  applyTransition,
};
