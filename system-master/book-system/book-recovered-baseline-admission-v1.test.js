'use strict';

const assert = require('assert');
const runtime = require('./book-recovered-baseline-admission-v1');
const d = runtime.sha256;
const clone = v => JSON.parse(JSON.stringify(v));
let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}

const calls = { admit: 0, rebind: 0, current: 0, source: 0, projection: 0, unit: 0 };
const behavior = { rebindFail: false, statusChange: false };

const fakeRecoveryRuntime = {
  validateRecoveryEvidenceReceiptV1(receipt) {
    if (receipt.force_error) { const e = new Error(receipt.force_error); e.code = receipt.force_error; throw e; }
    return true;
  }
};
const fakeEngine = { digest: d };
const fakeAcceptance = {
  validateSourceCustodyAcceptanceV1(source) {
    calls.source += 1;
    if (source.invalid_code) { const e = new Error(source.invalid_code); e.code = source.invalid_code; throw e; }
    return true;
  },
  validateNormalizedSourceProjectionV1(projection, source) {
    calls.projection += 1;
    if (projection.invalid_code) { const e = new Error(projection.invalid_code); e.code = projection.invalid_code; throw e; }
    if (projection.source_acceptance_id !== source.source_acceptance_id || projection.source_acceptance_digest !== source.source_acceptance_digest) {
      const e = new Error('mismatch'); e.code = 'PROJECTION_SOURCE_ACCEPTANCE_MISMATCH'; throw e;
    }
    return true;
  },
  validateSourceReresolutionV1(source, observation) {
    if (observation.source_digest_sha256 !== source.source_digest_sha256 || observation.source_byte_length !== source.source_byte_length || observation.object_version !== source.object_version) {
      const e = new Error('stale'); e.code = 'SOURCE_STALE'; throw e;
    }
    return true;
  },
  assertUnitAdmissionEvidenceV1(projection, source, ids) {
    calls.unit += 1;
    const map = new Map((projection.unit_evidence || []).map(x => [x.unit_id, x]));
    const out = [];
    for (const id of ids) {
      if (!map.has(id)) { const e = new Error(id); e.code = 'BLOCKED_PER_UNIT_EVIDENCE'; e.detail = id; throw e; }
      out.push(map.get(id));
    }
    return { standing: 'READY_FOR_UNIT_ADMISSION', unit_evidence: out };
  }
};
const fakeAuthorQueue = {
  digest: d,
  validateQueueLedger() { return true; }
};
const fakeCurrentSubject = {
  assertStrictSubjectCurrent(parent, refs) {
    calls.current += 1;
    if (refs.some(r => r.object_id === 'STALE')) { const e = new Error('stale'); e.code = 'AUTHOR_DECISION_SUBJECT_NOT_CURRENT'; throw e; }
    return true;
  }
};
const fakeVersioning = {
  digest: d,
  validateParentState() { return true; },
  objectRecords(parent) {
    return (parent.manuscripts || []).map(m => ({
      type: 'MANUSCRIPT_MANIFEST', object_id: String(m.manuscript_id), object_version: String(m.version_id),
      object_digest: d(m), payload: clone(m)
    }));
  }
};
const fakeApplicability = {
  commitContentAdmissionWithAuthorDecisionApplicability(args) {
    calls.admit += 1;
    const request = args.request;
    const register = request.operations.find(x => x.operation_type === 'REGISTER_CONTENT_OBJECT_VERSION');
    const setActive = request.operations.find(x => x.operation_type === 'SET_ACTIVE_CONTENT_OBJECT_VERSION');
    const post = clone(args.parentState);
    post.state_version += 1;
    post.manuscripts.push(clone(register.payload));
    post.active.canonical_manuscript_ref = setActive.object_ref;
    if (behavior.statusChange) post.book_project.status = 'PUBLISHED_OR_DELIVERED';
    post.state_digest = d({ tag: 'post', mutation: request.mutation_id, status: post.book_project.status });
    const versionReceipt = {
      receipt_id: `VR-${request.mutation_id}`,
      pre_parent_state_version: args.parentState.state_version,
      pre_parent_state_digest: args.parentState.state_digest,
      post_parent_state_version: post.state_version,
      post_parent_state_digest: post.state_digest,
      lifecycle_transition_performed: false,
      publication_authorized: false
    };
    return {
      parent_state: post,
      version_ledger: { ledger_version: (args.versionLedger.ledger_version || 1) + 1 },
      version_receipt: versionReceipt,
      admission_receipt: {
        mutation_id: request.mutation_id,
        disposition: 'COMMITTED',
        pre_parent_state_version: versionReceipt.pre_parent_state_version,
        pre_parent_state_digest: versionReceipt.pre_parent_state_digest,
        post_parent_state_version: versionReceipt.post_parent_state_version,
        post_parent_state_digest: versionReceipt.post_parent_state_digest
      },
      disposition: 'COMMITTED'
    };
  }
};
const fakeCompatibility = {
  digestCompatibleLedger: d,
  validateCompatibleLedger() { return true; }
};
const fakeRebind = {
  rebindAfterAuthorizedParentSuccessor(args) {
    calls.rebind += 1;
    if (behavior.rebindFail) { const e = new Error('unknown'); e.code = 'REBIND_UNKNOWN'; throw e; }
    return {
      disposition: 'COMMITTED',
      parent_state: clone(args.postParentState),
      lifecycle_ledger: { ...clone(args.lifecycleLedger), ledger_version: args.lifecycleLedger.ledger_version + 1 },
      receipt: {
        rebind_receipt_id: `LR-${args.request.idempotency_key}`,
        lifecycle_status: args.preParentState.book_project.status,
        lifecycle_transition_performed: false,
        publication_authorized: false
      }
    };
  }
};

function makeFixture(tag = 'v1') {
  behavior.rebindFail = false;
  behavior.statusChange = false;
  const oldManifest = {
    manuscript_id: 'MAN-1', version_id: 'V5', artifact_ref: 'artifact://old', artifact_digest: d(`old-${tag}`), authority_state: 'CANONICAL'
  };
  const parent = {
    schema_version: 1,
    state_version: 5,
    state_digest: d(`parent-${tag}`),
    book_project: { book_project_id: 'BOOK-1', book_id: 'B-1', status: 'DRAFT' },
    governing_briefs: [], canon_manifests: [], story_bibles: [], book_plans: [],
    manuscripts: [oldManifest], research_evidence_links: [], integration_proposals: [], export_releases: [],
    author_decisions: [{ decision_id: 'DEC-1', decision_type: runtime.RATIFICATION_DECISION_TYPE, status: 'APPROVED', author_choice: 'APPROVE' }],
    active: { canonical_manuscript_ref: 'MAN-1:V5' }
  };
  const currentManuscriptDigest = d(oldManifest);
  const manuscriptSubject = { object_id: 'MAN-1', object_version: 'V5', object_digest: currentManuscriptDigest };
  const projectSubject = { object_id: 'BOOK-1', object_version: 'STATE-5', object_digest: d(parent.book_project) };
  const resolution = {
    receipt_id: 'RR-1', decision_id: 'DEC-1', decision_request_id: 'REQ-1', decision_type: runtime.RATIFICATION_DECISION_TYPE,
    canonical_decision_status: 'APPROVED', subject_identity_refs: [projectSubject, manuscriptSubject], resolved_at: '2026-09-12T15:00:00Z'
  };
  const queue = { resolution_receipts: { 'RR-1': resolution } };
  const source = {
    source_acceptance_schema_version: '1', source_acceptance_id: `book-source-custody-v1:${d(`sa-${tag}`)}`,
    source_acceptance_digest: d(`sa-${tag}`), source_id: `SOURCE-${tag}`, source_digest_sha256: d(`bytes-${tag}`),
    source_byte_length: 100, object_version: 'G1'
  };
  const unit = {
    unit_id: 'CH-1', unit_kind: 'CHAPTER', ordinal: 1, anchor: 'p1', source_acceptance_digest: source.source_acceptance_digest,
    projection_digest: d(`proj-${tag}`), unit_content_digest_sha256: d(`unit-${tag}`), unit_locator_ref: 'loc://ch1',
    provider_evidence_ref: 'ev://ch1', provider_evidence_digest: d(`ev-${tag}`)
  };
  const projection = {
    projection_schema_version: '1', projection_id: `book-normalized-source-projection-v1:${d(`proj-${tag}`)}`,
    projection_digest: d(`proj-${tag}`), source_acceptance_id: source.source_acceptance_id,
    source_acceptance_digest: source.source_acceptance_digest, source_digest_sha256: source.source_digest_sha256, unit_evidence: [unit]
  };
  const candidate = { candidate_id: 'CAND-1', content_digest: d(`candidate-${tag}`), source_ref: `${source.source_id}@sha256:${source.source_digest_sha256}` };
  const baseline = {
    engine_id: 'BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001', profile_version: 'EBR-SEMANTIC-PROFILE-001',
    recovery_key: d(`rk-${tag}`), book_project_id: 'BOOK-1', recovery_session_id: null, reentry_mode: 'RECOVER_EXISTING',
    source_manifest: [{ source_id: source.source_id, source_digest: source.source_digest_sha256, source_ref: candidate.source_ref, projection_digest: projection.projection_digest }],
    candidate_revision_graph: { nodes: [candidate], heads: ['CAND-1'], proposed_selected_candidate_id: 'CAND-1', selection_basis: 'UNIQUE_REVISION_GRAPH_HEAD__PROPOSED_ONLY', canonical_selection_claimed: false },
    reconstructed_structure: { ambiguous_structure_ids: [] }, proposed_semantic_state: {}, unresolved_findings: [], author_decision_batch: {}, book_maturity_profile: {},
    edition_lineage: null, lifecycle_join_authorized: false, canonical_book_mutation_performed: false, standing: runtime.RECOVERY_STANDING
  };
  baseline.baseline_digest = runtime.baselineDigest(baseline, { recoveryEngine: fakeEngine });
  baseline.recovered_book_baseline_id = `RBB-${baseline.baseline_digest.slice(0, 24)}`;
  const evidence = {
    evidence_id: `EV-${tag}`,
    source_acceptances: [{ source_acceptance_id: source.source_acceptance_id, source_acceptance_digest: source.source_acceptance_digest }],
    projection_acceptances: [{ projection_id: projection.projection_id, projection_digest: projection.projection_digest }],
    result_baseline_id: baseline.recovered_book_baseline_id,
    result_baseline_digest: baseline.baseline_digest,
    canonical_effect: false,
    author_decision_synthesized: false,
    publication_authority: false
  };
  const input = {
    book_project_id: 'BOOK-1', current_book_state_version: parent.state_version, current_book_state_digest: parent.state_digest,
    current_manuscript_id: 'MAN-1', current_manuscript_version: 'V5', current_manuscript_digest: currentManuscriptDigest,
    recovery_execution: { binding: {}, operation_identity: {}, recovery_evidence_receipt: evidence, recovery_result: { recovered_book_baseline: baseline } },
    selected_candidate_id: 'CAND-1', selected_candidate_content_digest: candidate.content_digest,
    source_acceptance_ids_and_digests: clone(evidence.source_acceptances), projection_ids_and_digests: clone(evidence.projection_acceptances),
    source_acceptances: [source], projection_acceptances: [projection],
    author_decision_id: 'DEC-1', author_resolution_receipt_id: 'RR-1', author_resolution_receipt_digest: d(resolution)
  };
  return { input, parent, queue, source, projection, baseline, resolution };
}

function opts(f, extra = {}) {
  return {
    recovery_runtime: fakeRecoveryRuntime, recovery_engine: fakeEngine, acceptance_runtime: fakeAcceptance,
    applicability_guard: fakeApplicability, current_subject_guard: fakeCurrentSubject, author_queue: fakeAuthorQueue,
    versioning: fakeVersioning, lifecycle_rebind: fakeRebind, lifecycle_compatibility: fakeCompatibility,
    parent_state: f.parent, version_ledger: { ledger_version: 1 }, queue_ledger: f.queue,
    lifecycle_ledger: { ledger_version: 1 }, lifecycle_contract: { engine_id: 'BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001' },
    ...extra
  };
}
function prep(f, extra = {}) { return runtime.prepareRecoveredBaselineAdmissionV1(f.input, opts(f, extra)); }
function commit(f, prepared, extra = {}) { return runtime.commitRecoveredBaselineAdmissionV1(prepared, f.input, opts(f, extra)); }
function resealBaseline(f) {
  f.baseline.baseline_digest = runtime.baselineDigest(f.baseline, { recoveryEngine: fakeEngine });
  f.baseline.recovered_book_baseline_id = `RBB-${f.baseline.baseline_digest.slice(0, 24)}`;
  f.input.recovery_execution.recovery_evidence_receipt.result_baseline_id = f.baseline.recovered_book_baseline_id;
  f.input.recovery_execution.recovery_evidence_receipt.result_baseline_digest = f.baseline.baseline_digest;
}

pass('A01', () => {
  const f = makeFixture('a01'); const p = prep(f); const out = commit(f, p);
  assert.strictEqual(out.status, 'COMMITTED_VERIFIED');
  assert.strictEqual(out.parent_state.state_version, 6);
  assert.strictEqual(out.recovery_admission_receipt.admitted_manuscript_ref, p.expected_successor_manuscript_ref);
  const bad = makeFixture('a01-provenance'); bad.baseline.candidate_revision_graph.nodes[0].source_ref = 'missing://source'; resealBaseline(bad);
  expectCode(() => prep(bad), 'RECOVERY_CANDIDATE_PROVENANCE_INCOMPLETE');
});
pass('A02', () => {
  const f = makeFixture('a02'); f.baseline.canonical_book_mutation_performed = true; resealBaseline(f);
  expectCode(() => prep(f), 'RECOVERY_OUTPUT_AUTHORITY_VIOLATION');
});
pass('A03', () => {
  const f = makeFixture('a03'); f.input.author_decision_id = 'MISSING'; expectCode(() => prep(f), 'BLOCKED_AUTHOR_DECISION');
});
pass('A04', () => {
  const stale = makeFixture('a04-stale'); stale.queue.resolution_receipts['RR-1'].subject_identity_refs[0].object_id = 'STALE'; stale.input.author_resolution_receipt_digest = d(stale.queue.resolution_receipts['RR-1']); expectCode(() => prep(stale), 'BLOCKED_AUTHOR_DECISION');
  const wrongType = makeFixture('a04-type'); wrongType.parent.author_decisions[0].decision_type = 'OTHER'; expectCode(() => prep(wrongType), 'BLOCKED_AUTHOR_DECISION');
  const noProject = makeFixture('a04-project'); noProject.queue.resolution_receipts['RR-1'].subject_identity_refs = noProject.queue.resolution_receipts['RR-1'].subject_identity_refs.filter(x => x.object_id !== 'BOOK-1'); noProject.input.author_resolution_receipt_digest = d(noProject.queue.resolution_receipts['RR-1']); expectCode(() => prep(noProject), 'BLOCKED_AUTHOR_DECISION');
  const noManuscript = makeFixture('a04-manuscript'); noManuscript.queue.resolution_receipts['RR-1'].subject_identity_refs = noManuscript.queue.resolution_receipts['RR-1'].subject_identity_refs.filter(x => x.object_id !== 'MAN-1'); noManuscript.input.author_resolution_receipt_digest = d(noManuscript.queue.resolution_receipts['RR-1']); expectCode(() => prep(noManuscript), 'BLOCKED_AUTHOR_DECISION');
});
pass('A05', () => {
  const f = makeFixture('a05'); f.baseline.baseline_digest = d('tampered'); f.input.recovery_execution.recovery_evidence_receipt.result_baseline_digest = f.baseline.baseline_digest;
  expectCode(() => prep(f), 'RECOVERY_BASELINE_DIGEST_MISMATCH');
});
pass('A06', () => {
  const f = makeFixture('a06'); f.baseline.candidate_revision_graph.nodes = []; resealBaseline(f);
  expectCode(() => prep(f), 'RECOVERY_SELECTED_CANDIDATE_CARDINALITY_INVALID');
});
pass('A07', () => {
  const f = makeFixture('a07'); f.baseline.unresolved_findings = [{ finding_code: 'AMBIGUOUS', severity: 'BLOCKING' }]; resealBaseline(f);
  expectCode(() => prep(f), 'BLOCKED_RECOVERY_AMBIGUITY');
});
pass('A08', () => {
  const f = makeFixture('a08'); f.input.current_book_state_digest = d('stale'); expectCode(() => prep(f), 'BLOCKED_CURRENT_PARENT_STALE');
});
pass('A09', () => {
  const f = makeFixture('a09'); const prior = { edition_id: 'ED-1', edition_digest: d('ed1') };
  f.baseline.reentry_mode = 'NEW_EDITION'; f.baseline.edition_lineage = { relationship: 'NEW_EDITION_OF', prior_edition_ref: prior, history_rewrite_permitted: false }; f.input.prior_edition_ref = prior; resealBaseline(f);
  const p = prep(f); const out = commit(f, p);
  assert.deepStrictEqual(out.prepared_admission.content_admission_request.operations[0].payload.prior_edition_ref, prior);
  assert.strictEqual(out.prepared_admission.content_admission_request.operations[0].payload.history_rewrite_permitted, false);
  assert.strictEqual(out.parent_state.manuscripts[0].version_id, 'V5');
});
pass('A10', () => {
  const f = makeFixture('a10'); const p = prep(f); const out = commit(f, p);
  assert.strictEqual(out.parent_state.book_project.status, 'DRAFT'); assert.strictEqual(out.lifecycle_transition_performed, false);
});
pass('A11', () => {
  const f = makeFixture('a11'); const p = prep(f); const out = commit(f, p);
  assert.strictEqual(out.lifecycle_rebind_receipt.lifecycle_status, 'DRAFT'); assert.strictEqual(out.recovery_admission_receipt.admitted_manuscript_ref, p.expected_successor_manuscript_ref);
});
pass('A12', () => {
  const f = makeFixture('a12'); const p = prep(f); const first = commit(f, p); const before = calls.admit;
  const replay = commit(f, p, { prior_admission_state: first });
  assert.strictEqual(replay.disposition, 'REPLAY'); assert.strictEqual(calls.admit, before);
});
let pendingA14;
pass('A13', () => {
  const f = makeFixture('a13'); const p = prep(f); behavior.rebindFail = true; const before = calls.admit; const pending = commit(f, p); behavior.rebindFail = false;
  assert.strictEqual(pending.standing, runtime.RECONCILE_STANDING); assert.strictEqual(pending.status, runtime.PENDING_STATUS); assert.strictEqual(calls.admit, before + 1);
  pendingA14 = { f, p, pending, post: clone(fakeApplicability.commitContentAdmissionWithAuthorDecisionApplicability({ parentState: f.parent, versionLedger: { ledger_version: 1 }, queueLedger: f.queue, request: p.content_admission_request, applicabilityBindings: p.applicability_bindings }).parent_state) };
});
pass('A14', () => {
  const { f, pending } = pendingA14; const before = calls.admit;
  const out = runtime.reconcileRecoveredBaselineAdmissionV1(pending, opts(f, { pre_parent_state: f.parent, post_parent_state: pendingA14.post }));
  assert.strictEqual(out.disposition, 'RECONCILED_LIFECYCLE_ONLY'); assert.strictEqual(out.canonical_admission_performed, false); assert.strictEqual(calls.admit, before);
});
pass('A15', () => {
  const f = makeFixture('a15'); f.input.requested_unit_ids = ['CH-1']; const p = prep(f);
  assert.strictEqual(p.unit_evidence.length, 1); assert.strictEqual(p.unit_evidence[0].unit_id, 'CH-1');
});
pass('A16', () => {
  const f = makeFixture('a16'); const p = prep(f); const out = commit(f, p);
  assert.strictEqual(p.publication_authority, false); assert.strictEqual(p.export_freeze_authority, false); assert.strictEqual(out.recovery_admission_receipt.publication_authority, false); assert.strictEqual(out.recovery_admission_receipt.export_freeze_authority, false);
});

pass('X01', () => {
  const f = makeFixture('x01'); f.input.source_reresolutions = [{ source_acceptance_id: f.source.source_acceptance_id, observation: { source_digest_sha256: d('wrong'), source_byte_length: 100, object_version: 'G1' } }]; expectCode(() => prep(f), 'BLOCKED_SOURCE_STALE');
});
pass('X02', () => {
  const f = makeFixture('x02'); f.input.source_reresolutions = [{ source_acceptance_id: f.source.source_acceptance_id, observation: { source_digest_sha256: f.source.source_digest_sha256, source_byte_length: 101, object_version: 'G1' } }]; expectCode(() => prep(f), 'BLOCKED_SOURCE_STALE');
});
pass('X03', () => {
  const f = makeFixture('x03'); f.projection.invalid_code = 'PROVIDER_SUBJECT_REQUIRED'; expectCode(() => prep(f), 'PROJECTION_ACCEPTANCE_INVALID');
});
pass('X04', () => {
  const f = makeFixture('x04'); f.input.source_acceptances = []; expectCode(() => prep(f), 'ACCEPTED_SOURCE_AND_PROJECTION_RECORDS_REQUIRED');
});
pass('X05', () => {
  const f = makeFixture('x05'); f.input.projection_ids_and_digests[0].projection_digest = d('changed'); expectCode(() => prep(f), 'RECOVERY_PROJECTION_IDENTITY_MISMATCH');
});
pass('X06', () => {
  const f = makeFixture('x06'); f.source.invalid_code = 'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY'; expectCode(() => prep(f), 'SOURCE_ACCEPTANCE_INVALID');
});
pass('X07', () => {
  const f = makeFixture('x07'); f.input.manuscript_text = 'forbidden'; expectCode(() => prep(f), 'RAW_CONTENT_FORBIDDEN');
});
pass('X08', () => {
  const f = makeFixture('x08'); f.input.recovery_execution.recovery_evidence_receipt.force_error = 'RETIRED_PROSE_EXECUTION_ID'; expectCode(() => prep(f), 'RECOVERY_EVIDENCE_INVALID');
});
pass('X09', () => expectCode(() => runtime.assertEvidenceClaimBoundariesV1({ b01_registry_modified: true }), 'B02_DESIGN_COMPATIBILITY_VIOLATION'));
pass('X10', () => expectCode(() => runtime.assertEvidenceClaimBoundariesV1({ parallel_scheduler_created: true }), 'B02_DESIGN_COMPATIBILITY_VIOLATION'));
pass('X11', () => {
  const f = makeFixture('x11'); f.baseline.canonical_book_mutation_performed = true; resealBaseline(f); expectCode(() => prep(f), 'RECOVERY_OUTPUT_AUTHORITY_VIOLATION');
});
pass('X12', () => expectCode(() => runtime.assertEvidenceClaimBoundariesV1({ author_ratification_synthesized: true, publication_authority: true }), 'AUTHORITY_WIDENING_FORBIDDEN'));
pass('X13', () => {
  const f = makeFixture('x13'); f.baseline.candidate_revision_graph.proposed_selected_candidate_id = null; f.baseline.candidate_revision_graph.heads = ['CAND-1','CAND-2']; resealBaseline(f); expectCode(() => prep(f), 'RECOVERY_SELECTED_CANDIDATE_NOT_GOVERNED_GRAPH_SELECTION');
});
pass('X14', () => {
  const f = makeFixture('x14'); f.baseline.unresolved_findings = [{ finding_code: 'BLOCK', severity: 'BLOCKING' }]; resealBaseline(f); expectCode(() => prep(f), 'BLOCKED_RECOVERY_AMBIGUITY');
});
pass('X15', () => {
  const f = makeFixture('x15'); f.queue.resolution_receipts['RR-1'].subject_identity_refs[0].object_id = 'STALE'; f.input.author_resolution_receipt_digest = d(f.queue.resolution_receipts['RR-1']); expectCode(() => prep(f), 'BLOCKED_AUTHOR_DECISION');
});
pass('X16', () => {
  const f = makeFixture('x16'); const prior = { edition_id: 'ED-1', edition_digest: d('ed1') }; f.baseline.reentry_mode = 'NEW_EDITION'; f.baseline.edition_lineage = { relationship: 'NEW_EDITION_OF', prior_edition_ref: prior, history_rewrite_permitted: true }; f.input.prior_edition_ref = prior; resealBaseline(f); expectCode(() => prep(f), 'NEW_EDITION_PRIOR_IDENTITY_MISMATCH');
});
pass('X17', () => {
  const f = makeFixture('x17'); const p = prep(f); behavior.statusChange = true; expectCode(() => commit(f, p), 'LIFECYCLE_STATUS_MUTATION_FORBIDDEN'); behavior.statusChange = false;
});
pass('X18', () => {
  const f = makeFixture('x18'); f.input.requested_unit_ids = ['MISSING']; expectCode(() => prep(f), 'BLOCKED_PER_UNIT_EVIDENCE');
});
pass('X19', () => expectCode(() => runtime.assertEvidenceClaimBoundariesV1({ native_provider_fidelity: true }), 'SYNTHETIC_EVIDENCE_CLAIM_FORBIDDEN'));
pass('X20', () => expectCode(() => runtime.assertEvidenceClaimBoundariesV1({ historical_pass_transferred: true }), 'HISTORICAL_PASS_TRANSFER_FORBIDDEN'));

assert.strictEqual(cases, 36);
console.log(JSON.stringify({
  result: 'PASS', denominator: 'A01-A16 + X01-X20', cases,
  exact_current_subject_ratification_enforced: true,
  candidate_source_provenance_enforced: true,
  reconcile_state_self_consistent: true,
  b01_registry_modified: false,
  second_scheduler_created: false,
  recovery_engine_rewritten: false,
  lifecycle_status_side_effect: false,
  publication_authority: false,
  formal_b02_qualification_claimed: false
}));
