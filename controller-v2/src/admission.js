import { canonicalize, sha256, isRfc3339, isUuidV7 } from './canonical.js';
import { ControllerError } from './errors.js';

export const AUTHORIZATION_REQUEST_SCHEMA = 'controller://schemas/authorization-request/v1';
export const POLICY_DECISION_CANDIDATE_SCHEMA = 'controller://schemas/policy-decision-candidate/v1';
export const ADMISSION_DECISION_SCHEMA = 'controller://schemas/admission-decision/v1';

const OUTCOMES = new Set(['ALLOW', 'DENY', 'DEFER']);
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN = /^[A-Za-z0-9._:/-]{1,256}$/;
const MAX_LIST_ITEMS = 64;
const MAX_REASON_ITEMS = 32;

function admissionError(code, message, details = {}) {
  return new ControllerError(code, message, details);
}

function strictObject(value, code = 'ADMISSION_REQUEST_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw admissionError(code, 'object required');
  return value;
}

function exactKeys(value, allowed, required = allowed, code = 'POLICY_DECISION_INVALID') {
  strictObject(value, code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw admissionError(code, 'unknown field');
  for (const key of required) if (!(key in value)) throw admissionError(code, 'required field missing');
}

function boundedToken(value, code = 'POLICY_DECISION_INVALID') {
  if (typeof value !== 'string' || !TOKEN.test(value)) throw admissionError(code, 'invalid bounded identifier');
  return value;
}

function sortedUnique(values, { max = MAX_LIST_ITEMS, code = 'POLICY_DECISION_INVALID', allowEmpty = true } = {}) {
  if (!Array.isArray(values) || values.length > max || (!allowEmpty && values.length === 0)) throw admissionError(code, 'invalid bounded list');
  const normalized = values.map((value) => boundedToken(value, code));
  const sorted = [...normalized].sort();
  if (new Set(sorted).size !== sorted.length) throw admissionError(code, 'duplicate bounded list item');
  if (canonicalize(values) !== canonicalize(sorted)) throw admissionError(code, 'bounded list must be sorted');
  return Object.freeze(sorted);
}

function normalizeCompletionContract(input) {
  strictObject(input, 'POLICY_DECISION_INVALID');
  exactKeys(input, ['operations', 'qualification', 'promotion'], ['operations', 'qualification', 'promotion'], 'POLICY_DECISION_INVALID');
  const contract = {
    operations: input.operations,
    qualification: input.qualification,
    promotion: input.promotion
  };
  if (!['none', 'all_succeeded'].includes(contract.operations)) throw admissionError('POLICY_DECISION_INVALID', 'invalid completion operations mode');
  if (!['not_required', 'required'].includes(contract.qualification)) throw admissionError('POLICY_DECISION_INVALID', 'invalid completion qualification mode');
  if (!['not_required', 'required'].includes(contract.promotion)) throw admissionError('POLICY_DECISION_INVALID', 'invalid completion promotion mode');
  if (contract.promotion === 'required' && contract.qualification !== 'required') throw admissionError('POLICY_DECISION_INVALID', 'promotion requires qualification');
  return Object.freeze(contract);
}

function parseCommandRow(row) {
  if (!row) throw admissionError('ADMISSION_REQUEST_INVALID', 'command row missing');
  let payload;
  try { payload = JSON.parse(row.payload_json); }
  catch { throw admissionError('ADMISSION_REQUEST_INVALID', 'durable command payload invalid'); }
  return { row, payload };
}

function rowSubject(tx) {
  return Object.freeze({ algorithm: tx.subject_algorithm, oid: tx.subject_oid });
}

function stableTransportProvenance(command) {
  const source = command?.issuer?.source;
  if (typeof source !== 'string' || source.length === 0 || source.length > 128) return [];
  return Object.freeze([`source:${source}`]);
}

function profileAction(command, profile) {
  const mapping = profile.actionClassByCommandType ?? {};
  const actionClass = mapping[command.command_type];
  const completionClass = profile.requestedCompletionClassByCommandType?.[command.command_type] ?? profile.defaultRequestedCompletionClass;
  if (typeof actionClass !== 'string' || !TOKEN.test(actionClass)) throw admissionError('ADMISSION_REQUEST_INVALID', 'unknown command action class');
  if (typeof completionClass !== 'string' || !TOKEN.test(completionClass)) throw admissionError('ADMISSION_REQUEST_INVALID', 'unknown requested completion class');
  return { actionClass, completionClass };
}

function normalizeOwnerRefs(refs, code = 'ADMISSION_REQUEST_INVALID') {
  if (refs === undefined) return [];
  if (!Array.isArray(refs) || refs.length > MAX_LIST_ITEMS) throw admissionError(code, 'invalid owner evidence refs');
  const sorted = [...refs].map((ref) => boundedToken(ref, code)).sort();
  if (new Set(sorted).size !== sorted.length) throw admissionError(code, 'duplicate owner evidence ref');
  return Object.freeze(sorted);
}

export function buildAuthorizationRequest(kernel, transactionId, ownerFacts = {}, profile = {}) {
  if (!kernel?.db) throw admissionError('ADMISSION_REQUEST_INVALID', 'kernel required');
  const tx = kernel.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(transactionId);
  if (!tx) throw admissionError('ADMISSION_REQUEST_INVALID', 'transaction not found');
  const commandRow = kernel.db.prepare('SELECT * FROM commands WHERE command_id=?').get(tx.command_id);
  const { payload: command } = parseCommandRow(commandRow);
  if (command.command_id !== tx.command_id || command.fingerprint !== commandRow.fingerprint) throw admissionError('ADMISSION_REQUEST_INVALID', 'durable command binding invalid');
  if (command.target?.repository !== tx.subject_repo) throw admissionError('ADMISSION_REQUEST_INVALID', 'repository binding invalid');
  if (command.target?.expected_subject?.algorithm !== tx.subject_algorithm || command.target?.expected_subject?.oid !== tx.subject_oid) throw admissionError('ADMISSION_REQUEST_INVALID', 'subject binding invalid');
  if (typeof command.required_policy_version !== 'string' || command.required_policy_version.length === 0 || command.required_policy_version.length > 128) throw admissionError('ADMISSION_REQUEST_INVALID', 'required policy version missing');
  const { actionClass, completionClass } = profileAction(command, profile);
  const constraints = command.constraints && typeof command.constraints === 'object' && !Array.isArray(command.constraints) ? structuredClone(command.constraints) : {};
  const request = {
    schema: AUTHORIZATION_REQUEST_SCHEMA,
    transaction_id: tx.transaction_id,
    command_id: tx.command_id,
    command_fingerprint: commandRow.fingerprint,
    repository: tx.subject_repo,
    subject: rowSubject(tx),
    required_policy_version: command.required_policy_version,
    principal_refs: normalizeOwnerRefs(ownerFacts.principal_refs),
    delegation_refs: normalizeOwnerRefs(ownerFacts.delegation_refs),
    transport_provenance: stableTransportProvenance(command),
    action: { command_type: command.command_type, action_class: actionClass },
    context: {
      constraints,
      requested_completion_class: completionClass,
      bounded_owner_facts: normalizeOwnerRefs(ownerFacts.bounded_owner_facts)
    }
  };
  return Object.freeze({ request: Object.freeze(request), input_digest: sha256(request), snapshot: Object.freeze({
    transaction_state: tx.state,
    transaction_updated_at: tx.updated_at,
    command_fingerprint: commandRow.fingerprint,
    command_id: tx.command_id,
    repository: tx.subject_repo,
    subject_algorithm: tx.subject_algorithm,
    subject_oid: tx.subject_oid
  }) });
}

function validateDecisionId(value, profile) {
  if (isUuidV7(value)) return value;
  if (typeof profile.validateDecisionId === 'function') {
    let accepted = false;
    try { accepted = profile.validateDecisionId(value) === true; }
    catch { accepted = false; }
    if (accepted) return boundedToken(value);
  }
  throw admissionError('POLICY_DECISION_INVALID', 'decision id must be UUIDv7 or explicitly accepted by adapter profile');
}

export function validatePolicyDecisionCandidate(candidate, request, inputDigest, profile = {}, nowMs = Date.now()) {
  const allowed = [
    'schema', 'decision_id', 'outcome', 'policy_version', 'policy_revision', 'policy_digest', 'input_digest',
    'reason_codes', 'determining_policy_ids', 'diagnostic_error_codes', 'principal_refs', 'delegation_refs',
    'approval_refs', 'approval_required', 'completion_contract', 'valid_until'
  ];
  exactKeys(candidate, allowed, allowed, 'POLICY_DECISION_INVALID');
  if (candidate.schema !== POLICY_DECISION_CANDIDATE_SCHEMA) throw admissionError('POLICY_DECISION_INVALID', 'unsupported decision candidate schema');
  const decisionId = validateDecisionId(candidate.decision_id, profile);
  if (!OUTCOMES.has(candidate.outcome)) throw admissionError('POLICY_DECISION_INVALID', 'unknown decision outcome');
  if (typeof candidate.policy_version !== 'string' || candidate.policy_version.length === 0 || candidate.policy_version.length > 128) throw admissionError('POLICY_DECISION_INVALID', 'invalid policy version');
  if (typeof candidate.policy_revision !== 'string' || candidate.policy_revision.length === 0 || candidate.policy_revision.length > 256 || candidate.policy_revision.toLowerCase() === 'latest') throw admissionError('POLICY_REVISION_UNBOUND', 'immutable policy revision required');
  if (!HEX64.test(candidate.policy_digest)) throw admissionError('POLICY_DECISION_INVALID', 'invalid policy digest');
  if (!HEX64.test(candidate.input_digest)) throw admissionError('POLICY_DECISION_INVALID', 'invalid input digest');
  if (typeof candidate.approval_required !== 'boolean') throw admissionError('POLICY_DECISION_INVALID', 'approval_required must be boolean');
  const reasonCodes = sortedUnique(candidate.reason_codes, { max: MAX_REASON_ITEMS });
  const determiningPolicyIds = sortedUnique(candidate.determining_policy_ids, { max: MAX_REASON_ITEMS });
  const diagnosticErrorCodes = sortedUnique(candidate.diagnostic_error_codes, { max: MAX_REASON_ITEMS });
  const principalRefs = sortedUnique(candidate.principal_refs);
  const delegationRefs = sortedUnique(candidate.delegation_refs);
  const approvalRefs = sortedUnique(candidate.approval_refs);
  let completionContract = null;
  if (candidate.outcome === 'ALLOW') {
    if (candidate.completion_contract === null) throw admissionError('POLICY_DECISION_INVALID', 'ALLOW requires completion contract');
    completionContract = normalizeCompletionContract(candidate.completion_contract);
  } else if (candidate.completion_contract !== null) {
    throw admissionError('POLICY_DECISION_INVALID', 'only ALLOW may carry completion contract');
  }
  if (candidate.valid_until !== null && !isRfc3339(candidate.valid_until)) throw admissionError('POLICY_DECISION_INVALID', 'valid_until must be Controller RFC3339 timestamp or null');

  const deferCodes = [];
  if (candidate.policy_version !== request.required_policy_version) deferCodes.push('POLICY_VERSION_MISMATCH');
  if (candidate.input_digest !== inputDigest) deferCodes.push('POLICY_INPUT_DIGEST_MISMATCH');
  if (diagnosticErrorCodes.length) deferCodes.push('POLICY_EVALUATION_INDETERMINATE');
  if (candidate.approval_required && approvalRefs.length === 0) deferCodes.push('ADMISSION_APPROVAL_REQUIRED');
  if (candidate.valid_until !== null && Date.parse(candidate.valid_until) <= nowMs) deferCodes.push('ADMISSION_DECISION_EXPIRED');
  if (canonicalize(principalRefs) !== canonicalize(request.principal_refs)) deferCodes.push('ADMISSION_EVIDENCE_STALE');
  if (canonicalize(delegationRefs) !== canonicalize(request.delegation_refs)) deferCodes.push('ADMISSION_EVIDENCE_STALE');
  if (candidate.outcome === 'DEFER') deferCodes.push(...reasonCodes.length ? reasonCodes : ['POLICY_EVALUATION_INDETERMINATE']);

  return Object.freeze({
    candidate: Object.freeze({
      schema: candidate.schema,
      decision_id: decisionId,
      outcome: candidate.outcome,
      policy_version: candidate.policy_version,
      policy_revision: candidate.policy_revision,
      policy_digest: candidate.policy_digest,
      input_digest: candidate.input_digest,
      reason_codes: reasonCodes,
      determining_policy_ids: determiningPolicyIds,
      diagnostic_error_codes: diagnosticErrorCodes,
      principal_refs: principalRefs,
      delegation_refs: delegationRefs,
      approval_refs: approvalRefs,
      approval_required: candidate.approval_required,
      completion_contract: completionContract,
      valid_until: candidate.valid_until
    }),
    deferred: deferCodes.length > 0,
    defer_reason_codes: Object.freeze([...new Set(deferCodes)].sort())
  });
}

async function resolveOwnerFacts(profile, durable) {
  if (typeof profile.resolveOwnerFacts !== 'function') return Object.freeze({ principal_refs: [], delegation_refs: [], bounded_owner_facts: [] });
  const facts = await profile.resolveOwnerFacts(Object.freeze(durable));
  strictObject(facts, 'ADMISSION_REQUEST_INVALID');
  return Object.freeze({
    principal_refs: normalizeOwnerRefs(facts.principal_refs),
    delegation_refs: normalizeOwnerRefs(facts.delegation_refs),
    bounded_owner_facts: normalizeOwnerRefs(facts.bounded_owner_facts)
  });
}

async function validateEvidenceStanding(candidate, request, validators) {
  const validate = async (kind, refs) => {
    const fn = validators?.[kind];
    if (refs.length === 0) return { ok: true };
    if (typeof fn !== 'function') return { ok: false, code: 'ADMISSION_EVIDENCE_INVALID' };
    for (const ref of refs) {
      let result;
      try { result = await fn(ref, Object.freeze({ request, candidate })); }
      catch (error) {
        if (error instanceof ControllerError && error.code === 'POLICY_UNAVAILABLE_TRANSIENT') return { ok: false, code: 'POLICY_UNAVAILABLE_TRANSIENT' };
        return { ok: false, code: 'ADMISSION_EVIDENCE_INVALID' };
      }
      if (!result || result.valid !== true) return { ok: false, code: result?.stale === true ? 'ADMISSION_EVIDENCE_STALE' : 'ADMISSION_EVIDENCE_INVALID' };
    }
    return { ok: true };
  };
  for (const [kind, refs] of [['principal', candidate.principal_refs], ['delegation', candidate.delegation_refs], ['approval', candidate.approval_refs]]) {
    const standing = await validate(kind, refs);
    if (!standing.ok) return standing;
  }
  return { ok: true };
}

function decisionSemanticBody(request, candidate) {
  return {
    schema: ADMISSION_DECISION_SCHEMA,
    decision_id: candidate.decision_id,
    transaction_id: request.transaction_id,
    command_id: request.command_id,
    command_fingerprint: request.command_fingerprint,
    repository: request.repository,
    subject: request.subject,
    outcome: candidate.outcome,
    policy_version: candidate.policy_version,
    policy_revision: candidate.policy_revision,
    policy_digest: candidate.policy_digest,
    input_digest: candidate.input_digest,
    reason_codes: candidate.reason_codes,
    determining_policy_ids: candidate.determining_policy_ids,
    diagnostic_error_codes: candidate.diagnostic_error_codes,
    principal_refs: candidate.principal_refs,
    delegation_refs: candidate.delegation_refs,
    approval_refs: candidate.approval_refs,
    approval_required: candidate.approval_required,
    completion_contract: candidate.completion_contract,
    valid_until: candidate.valid_until
  };
}

function rowToDecision(row) {
  if (!row) return null;
  return Object.freeze({
    schema: ADMISSION_DECISION_SCHEMA,
    decision_id: row.decision_id,
    transaction_id: row.transaction_id,
    command_id: row.command_id,
    command_fingerprint: row.command_fingerprint,
    repository: row.repository,
    subject: Object.freeze({ algorithm: row.subject_algorithm, oid: row.subject_oid }),
    outcome: row.outcome,
    policy_version: row.policy_version,
    policy_revision: row.policy_revision,
    policy_digest: row.policy_digest,
    input_digest: row.input_digest,
    decision_fingerprint: row.decision_fingerprint,
    reason_codes: Object.freeze(JSON.parse(row.reason_codes_json)),
    determining_policy_ids: Object.freeze(JSON.parse(row.determining_policy_ids_json)),
    diagnostic_error_codes: Object.freeze(JSON.parse(row.diagnostic_error_codes_json)),
    principal_refs: Object.freeze(JSON.parse(row.principal_refs_json)),
    delegation_refs: Object.freeze(JSON.parse(row.delegation_refs_json)),
    approval_refs: Object.freeze(JSON.parse(row.approval_refs_json)),
    approval_required: Boolean(row.approval_required),
    completion_contract: row.completion_contract_json === null ? null : Object.freeze(JSON.parse(row.completion_contract_json)),
    valid_until: row.valid_until,
    committed_at: row.committed_at
  });
}

function assertAdmissionSchema(kernel) {
  const row = kernel.db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='admission_decisions'").get();
  if (!row) throw admissionError('ADMISSION_REQUEST_INVALID', 'Foundation-006 schema v5 not installed');
}

function inspectDecisionRow(kernel, transactionId) {
  assertAdmissionSchema(kernel);
  return kernel.db.prepare('SELECT * FROM admission_decisions WHERE transaction_id=?').get(transactionId) ?? null;
}

function stableTerminalResult(tx, decision) {
  if (!decision) return null;
  if (tx.state === 'ADMITTED' && decision.outcome === 'ALLOW') return Object.freeze({ outcome: 'ALREADY_ADMITTED', duplicate: true, decision });
  if (tx.state === 'REJECTED' && decision.outcome === 'DENY') return Object.freeze({ outcome: 'ALREADY_REJECTED', duplicate: true, decision });
  throw admissionError('ADMISSION_DECISION_CONFLICT', 'durable admission decision and transaction state disagree');
}

function commitTerminalDecision(kernel, request, snapshot, candidate, nowMs) {
  const semantic = decisionSemanticBody(request, candidate);
  const decisionFingerprint = sha256(semantic);
  const committedAt = new Date(nowMs).toISOString();
  try {
    return kernel.atomic(() => {
      const existingByTx = kernel.db.prepare('SELECT * FROM admission_decisions WHERE transaction_id=?').get(request.transaction_id);
      if (existingByTx) {
        if (existingByTx.decision_id === candidate.decision_id && existingByTx.decision_fingerprint === decisionFingerprint) {
          const tx = kernel.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(request.transaction_id);
          return stableTerminalResult(tx, rowToDecision(existingByTx));
        }
        throw admissionError('ADMISSION_DECISION_CONFLICT', 'transaction already has conflicting admission decision');
      }
      const existingById = kernel.db.prepare('SELECT transaction_id,decision_fingerprint FROM admission_decisions WHERE decision_id=?').get(candidate.decision_id);
      if (existingById && (existingById.transaction_id !== request.transaction_id || existingById.decision_fingerprint !== decisionFingerprint)) throw admissionError('ADMISSION_DECISION_CONFLICT', 'decision id reused');

      const tx = kernel.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(request.transaction_id);
      const commandRow = tx ? kernel.db.prepare('SELECT * FROM commands WHERE command_id=?').get(tx.command_id) : null;
      if (!tx || !commandRow) throw admissionError('ADMISSION_STATE_STALE', 'transaction/command disappeared before commit');
      if (tx.state !== 'OPEN') throw admissionError('ADMISSION_STATE_STALE', 'transaction no longer OPEN');
      if (tx.updated_at !== snapshot.transaction_updated_at || commandRow.fingerprint !== snapshot.command_fingerprint || tx.command_id !== snapshot.command_id || tx.subject_repo !== snapshot.repository || tx.subject_algorithm !== snapshot.subject_algorithm || tx.subject_oid !== snapshot.subject_oid) throw admissionError('ADMISSION_STATE_STALE', 'durable admission input changed');
      const { payload: command } = parseCommandRow(commandRow);
      if (command.required_policy_version !== candidate.policy_version) throw admissionError('POLICY_VERSION_MISMATCH', 'required policy version changed/mismatched');
      if (candidate.input_digest !== sha256(request)) throw admissionError('POLICY_INPUT_DIGEST_MISMATCH', 'authorization input digest mismatch');
      if (candidate.valid_until !== null && Date.parse(candidate.valid_until) <= nowMs) throw admissionError('ADMISSION_DECISION_EXPIRED', 'decision expired before commit');

      kernel.db.prepare(`INSERT INTO admission_decisions(
        decision_id,transaction_id,command_id,command_fingerprint,repository,subject_algorithm,subject_oid,outcome,
        policy_version,policy_revision,policy_digest,input_digest,decision_fingerprint,reason_codes_json,
        determining_policy_ids_json,diagnostic_error_codes_json,principal_refs_json,delegation_refs_json,
        approval_refs_json,approval_required,completion_contract_json,valid_until,committed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        candidate.decision_id, request.transaction_id, request.command_id, request.command_fingerprint, request.repository,
        request.subject.algorithm, request.subject.oid, candidate.outcome, candidate.policy_version, candidate.policy_revision,
        candidate.policy_digest, candidate.input_digest, decisionFingerprint, canonicalize(candidate.reason_codes),
        canonicalize(candidate.determining_policy_ids), canonicalize(candidate.diagnostic_error_codes), canonicalize(candidate.principal_refs),
        canonicalize(candidate.delegation_refs), canonicalize(candidate.approval_refs), candidate.approval_required ? 1 : 0,
        candidate.completion_contract === null ? null : canonicalize(candidate.completion_contract), candidate.valid_until, committedAt
      );

      if (candidate.outcome === 'ALLOW') {
        kernel.db.prepare('UPDATE transactions SET completion_contract_json=? WHERE transaction_id=?').run(canonicalize(candidate.completion_contract), request.transaction_id);
        kernel._transitionTransaction(request.transaction_id, 'ADMITTED', {
          admission_decision_id: candidate.decision_id,
          admission_decision_fingerprint: decisionFingerprint,
          completion_contract: candidate.completion_contract
        });
      } else if (candidate.outcome === 'DENY') {
        kernel._transitionTransaction(request.transaction_id, 'REJECTED', {
          admission_decision_id: candidate.decision_id,
          admission_decision_fingerprint: decisionFingerprint,
          reason_codes: candidate.reason_codes
        });
      } else {
        throw admissionError('POLICY_DECISION_INVALID', 'DEFER cannot commit terminal decision');
      }
      const decision = rowToDecision(kernel.db.prepare('SELECT * FROM admission_decisions WHERE transaction_id=?').get(request.transaction_id));
      return Object.freeze({ outcome: candidate.outcome === 'ALLOW' ? 'ADMITTED' : 'REJECTED', duplicate: false, decision });
    });
  } catch (error) {
    if (error instanceof ControllerError && error.code === 'ADMISSION_STATE_STALE') return Object.freeze({ outcome: 'STALE_RECONCILE_INPUT', duplicate: false, reason_codes: Object.freeze(['ADMISSION_STATE_STALE']) });
    throw error;
  }
}

export function listUndecidedOpenTransactions(kernel, limit = 100) {
  assertAdmissionSchema(kernel);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw admissionError('ADMISSION_REQUEST_INVALID', 'invalid rediscovery limit');
  return Object.freeze(kernel.db.prepare(`SELECT t.transaction_id
    FROM transactions t
    LEFT JOIN admission_decisions d ON d.transaction_id=t.transaction_id
    WHERE t.state='OPEN' AND d.transaction_id IS NULL
    ORDER BY t.created_at,t.transaction_id LIMIT ?`).all(limit).map((row) => row.transaction_id));
}

export function createAdmissionPort(kernel, policyPort, evidenceValidators = {}, profile = {}) {
  if (!kernel?.db || typeof kernel.atomic !== 'function') throw admissionError('ADMISSION_REQUEST_INVALID', 'Controller kernel required');
  if (!policyPort || typeof policyPort.evaluate !== 'function') throw admissionError('POLICY_PORT_INVALID', 'policy port requires evaluate(request)');
  assertAdmissionSchema(kernel);

  return Object.freeze({
    async reconcileTransaction(transactionId) {
      assertAdmissionSchema(kernel);
      const before = kernel.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(transactionId);
      if (!before) throw admissionError('ADMISSION_REQUEST_INVALID', 'transaction not found');
      const existing = inspectDecisionRow(kernel, transactionId);
      if (existing) return stableTerminalResult(before, rowToDecision(existing));
      if (before.state !== 'OPEN') throw admissionError('ADMISSION_TRANSACTION_NOT_OPEN', 'transaction is not OPEN and has no terminal admission decision');

      const commandRow = kernel.db.prepare('SELECT * FROM commands WHERE command_id=?').get(before.command_id);
      const { payload: command } = parseCommandRow(commandRow);
      const ownerFacts = await resolveOwnerFacts(profile, Object.freeze({
        transaction_id: before.transaction_id,
        command_id: before.command_id,
        command_fingerprint: commandRow.fingerprint,
        repository: before.subject_repo,
        subject: rowSubject(before),
        command_type: command.command_type
      }));
      const { request, input_digest: inputDigest, snapshot } = buildAuthorizationRequest(kernel, transactionId, ownerFacts, profile);

      let rawCandidate;
      try { rawCandidate = await policyPort.evaluate(Object.freeze(structuredClone(request))); }
      catch (error) {
        const code = error instanceof ControllerError ? error.code : 'POLICY_UNAVAILABLE_PERMANENT';
        if (code === 'POLICY_UNAVAILABLE_TRANSIENT') return Object.freeze({ outcome: 'DEFERRED', duplicate: false, reason_codes: Object.freeze([code]) });
        throw admissionError(code === 'POLICY_UNAVAILABLE_PERMANENT' ? code : 'POLICY_UNAVAILABLE_PERMANENT', 'policy evaluation unavailable');
      }
      const validated = validatePolicyDecisionCandidate(rawCandidate, request, inputDigest, profile);
      if (validated.deferred) return Object.freeze({ outcome: 'DEFERRED', duplicate: false, reason_codes: validated.defer_reason_codes });

      const candidate = validated.candidate;
      const standing = await validateEvidenceStanding(candidate, request, evidenceValidators);
      if (!standing.ok) return Object.freeze({ outcome: 'DEFERRED', duplicate: false, reason_codes: Object.freeze([standing.code]) });

      return commitTerminalDecision(kernel, request, snapshot, candidate, Date.now());
    },

    inspectDecision(transactionId) {
      const row = inspectDecisionRow(kernel, transactionId);
      return rowToDecision(row);
    },

    rediscoverOpen(limit = 100) {
      return listUndecidedOpenTransactions(kernel, limit);
    }
  });
}
