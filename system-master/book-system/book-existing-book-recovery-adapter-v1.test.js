'use strict';

const assert = require('assert');
const runtime = require('./book-existing-book-recovery-adapter-v1');

let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}
const d = runtime.sha256;
const clone = v => JSON.parse(JSON.stringify(v));

function stableStructure(items) {
  return (items || []).map((item, i) => ({
    structure_id: item.structure_id || `S-${i + 1}`,
    kind: item.kind || 'SECTION',
    title: typeof item.title === 'string' ? item.title : '',
    ordinal: Number.isInteger(item.ordinal) ? item.ordinal : i + 1,
    anchor: item.anchor || `STRUCTURE-${i + 1}`,
    confidence: Number.isFinite(item.confidence) ? Number(item.confidence) : 1,
    ambiguous: item.ambiguous === true
  })).sort((a,b) => a.ordinal - b.ordinal || a.structure_id.localeCompare(b.structure_id));
}
function coreProjectionDigest(p) {
  return d({
    structure: stableStructure(p.structure),
    metadata: p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata) ? p.metadata : {},
    citations: Array.isArray(p.citations) ? p.citations : [],
    comments: Array.isArray(p.comments) ? p.comments : [],
    todos: Array.isArray(p.todos) ? p.todos : [],
    tracked_changes: Array.isArray(p.tracked_changes) ? p.tracked_changes : [],
    story_bible_candidates: Array.isArray(p.story_bible_candidates) ? p.story_bible_candidates : [],
    nonfiction_knowledge_candidates: Array.isArray(p.nonfiction_knowledge_candidates) ? p.nonfiction_knowledge_candidates : [],
    voice_candidates: Array.isArray(p.voice_candidates) ? p.voice_candidates : []
  });
}
function fakeRecoveryKey(request) {
  const identities = request.sources.map(s => ({
    source_id: s.source_id,
    source_digest: s.source_digest,
    projection_digest: coreProjectionDigest(s.normalized_projection)
  })).sort((a,b) => a.source_id.localeCompare(b.source_id));
  return d({
    anchor: request.book_project_id || request.recovery_session_id,
    profile_version: runtime.PROFILE_VERSION,
    reentry_mode: request.reentry_mode,
    source_identities: identities,
    prior_edition_ref: request.reentry_mode === 'NEW_EDITION' ? request.prior_edition_ref : null
  });
}

const calls = { recover: 0, resume: 0, sourceValidate: 0, projectionValidate: 0 };
const acceptanceRuntime = {
  validateSourceCustodyAcceptanceV1(record) {
    calls.sourceValidate += 1;
    if (!record || record.valid !== true) { const e = new Error('invalid'); e.code = 'SOURCE_ACCEPTANCE_DIGEST_MISMATCH'; throw e; }
    return true;
  },
  validateNormalizedSourceProjectionV1(record, source) {
    calls.projectionValidate += 1;
    if (!record || record.valid !== true) { const e = new Error('invalid'); e.code = 'PROJECTION_DIGEST_MISMATCH'; throw e; }
    if (record.source_acceptance_id !== source.source_acceptance_id || record.source_acceptance_digest !== source.source_acceptance_digest) { const e = new Error('mismatch'); e.code = 'PROJECTION_SOURCE_ACCEPTANCE_MISMATCH'; throw e; }
    return true;
  }
};
const b01 = {
  assertNotRetiredExecutionIdentity(capabilityId, ownerPath) {
    if (String(capabilityId || '').toUpperCase().startsWith('PROSE.')) { const e = new Error('retired'); e.code = 'RETIRED_PROSE_EXECUTION_ID'; e.detail = capabilityId; throw e; }
    if (String(ownerPath || '').toUpperCase().startsWith('SYSTEM_MASTER/BOOK/PROSE')) { const e = new Error('retired'); e.code = 'RETIRED_PROSE_OWNER_PATH'; e.detail = ownerPath; throw e; }
    return true;
  }
};
const durable = {
  assertCoordinationOnly(value) {
    function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== 'object') return;
      for (const [k, child] of Object.entries(v)) {
        if (['manuscript_text','passage_text','candidate_text','raw_manuscript'].includes(k)) { const e = new Error('raw'); e.code = 'RAW_CONTENT_PERSISTENCE_FORBIDDEN'; throw e; }
        walk(child);
      }
    }
    walk(value);
    return true;
  }
};
function fakeResult(request) {
  const key = fakeRecoveryKey(request);
  const inputDigest = d({ key, sources: request.sources, mode: request.reentry_mode, prior: request.prior_edition_ref || null });
  const baselinePayload = {
    engine_id: runtime.ENGINE_ID,
    profile_version: runtime.PROFILE_VERSION,
    recovery_key: key,
    book_project_id: request.book_project_id || null,
    recovery_session_id: request.recovery_session_id || null,
    reentry_mode: request.reentry_mode,
    unresolved_findings: [{ finding_code: 'STRUCTURE_BOUNDARIES_AMBIGUOUS', severity: 'BLOCKING', detail: 'chapter-1' }],
    reconstructed_structure: { ambiguous_structure_ids: ['chapter-1'] },
    lifecycle_join_authorized: false,
    canonical_book_mutation_performed: false,
    standing: 'PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION'
  };
  const baselineDigest = d(baselinePayload);
  const baseline = { ...baselinePayload, recovered_book_baseline_id: `RBB-${baselineDigest.slice(0,24)}`, baseline_digest: baselineDigest };
  const receipt = {
    recovery_receipt_id: `EBR-REC-${d({inputDigest, baselineDigest}).slice(0,20)}`,
    engine_id: runtime.ENGINE_ID,
    profile_version: runtime.PROFILE_VERSION,
    recovery_input_digest: inputDigest,
    recovery_key: key,
    output_baseline_digest: baselineDigest,
    idempotency_standing: 'DETERMINISTIC_EXACT_INPUT_PROFILE',
    canonical_mutation_performed: false,
    author_decision_synthesized: false
  };
  return {
    recovery_receipt: receipt,
    recovered_book_baseline: baseline,
    checkpoints: [{
      checkpoint_id: `EBR-CP-${inputDigest.slice(0,16)}`,
      engine_id: runtime.ENGINE_ID,
      profile_version: runtime.PROFILE_VERSION,
      recovery_input_digest: inputDigest,
      phase: 'STRUCTURE_RECONSTRUCTION',
      payload_digest: d('checkpoint-payload')
    }]
  };
}
const recoveryEngine = {
  ENGINE_ID: runtime.ENGINE_ID,
  PROFILE_VERSION: runtime.PROFILE_VERSION,
  recoverExistingBook(request) { calls.recover += 1; return fakeResult(request); },
  resumeExistingBookRecovery(request, checkpoint) {
    calls.resume += 1;
    const result = fakeResult(request);
    if (checkpoint.recovery_input_digest !== result.recovery_receipt.recovery_input_digest) { const e = new Error('mismatch'); e.code = 'RECOVERY_CHECKPOINT_INPUT_MISMATCH'; throw e; }
    return { ...result, resume_receipt: { resumed_from_checkpoint_id: checkpoint.checkpoint_id, recovery_input_digest: checkpoint.recovery_input_digest } };
  }
};

function makeFixture(tag = 'v1', overrides = {}) {
  const sourceDigest = d(`source-bytes-${tag}`);
  const sourceAcceptanceDigest = d(`source-acceptance-${tag}`);
  const source = {
    valid: true,
    source_acceptance_schema_version: '1',
    source_acceptance_id: `book-source-custody-v1:${sourceAcceptanceDigest}`,
    source_acceptance_digest: sourceAcceptanceDigest,
    source_id: `SOURCE-${tag}`,
    source_kind: 'DOCX',
    source_digest_sha256: sourceDigest
  };
  const recoveredDigest = d(`recovered-content-${tag}`);
  const projectionDigest = d(`projection-acceptance-${tag}`);
  const artifactRef = `artifact://normalized/${tag}`;
  const artifactDigest = d(`projection-artifact-${tag}`);
  const projection = {
    valid: true,
    projection_schema_version: '1',
    projection_id: `book-normalized-source-projection-v1:${projectionDigest}`,
    projection_digest: projectionDigest,
    source_acceptance_id: source.source_acceptance_id,
    source_acceptance_digest: source.source_acceptance_digest,
    source_digest_sha256: source.source_digest_sha256,
    projection_artifact_ref: artifactRef,
    projection_artifact_digest: artifactDigest,
    recovered_content_digest_sha256: recoveredDigest,
    extractor_identity: { provider_subject_ref: `extractor-${tag}` }
  };
  const normalizedProjection = {
    structure: [{ structure_id: 'chapter-1', kind: 'CHAPTER', title: 'Chapter 1', ordinal: 0, anchor: 'docx:p:1-20', confidence: 0.7, ambiguous: true }],
    metadata: { title: `Recovered ${tag}` },
    citations: [],
    comments: [{ comment_ref: 'comment://1' }],
    todos: [],
    tracked_changes: [],
    story_bible_candidates: [],
    nonfiction_knowledge_candidates: [],
    voice_candidates: []
  };
  const artifact = {
    artifact_ref: artifactRef,
    artifact_digest: artifactDigest,
    payload: {
      source_acceptance_id: source.source_acceptance_id,
      source_acceptance_digest: source.source_acceptance_digest,
      projection_id: projection.projection_id,
      projection_digest: projection.projection_digest,
      source_digest_sha256: source.source_digest_sha256,
      recovered_content_digest_sha256: recoveredDigest,
      normalized_projection: normalizedProjection,
      version_candidate: {
        candidate_id: `CANDIDATE-${tag}`,
        manuscript_id: 'RECOVERED-MANUSCRIPT',
        version_id: `VERSION-${tag}`,
        content_digest: recoveredDigest,
        parent_candidate_ids: [],
        authority_signal: 'UNRATIFIED'
      }
    }
  };
  const binding = runtime.buildBookRecoveryRuntimeBindingV1(overrides.binding || {});
  const command = {
    capability_id: runtime.CURRENT_CAPABILITY_ID,
    owner_path: runtime.CURRENT_OWNER_PATH,
    binding_id: binding.binding_id,
    binding_digest: binding.binding_digest,
    book_project_id: 'BOOK-PROJECT-001',
    reentry_mode: 'RECOVER_EXISTING',
    source_acceptance_refs: [{ source_acceptance_id: source.source_acceptance_id, source_acceptance_digest: source.source_acceptance_digest }],
    projection_acceptance_refs: [{ projection_id: projection.projection_id, projection_digest: projection.projection_digest }]
  };
  return { source, projection, artifact, binding, command };
}
function opts(f, extra = {}) {
  return {
    acceptance_runtime: acceptanceRuntime,
    recovery_engine: recoveryEngine,
    b01_execution: b01,
    durable_store: durable,
    binding: f.binding,
    source_acceptances: { [f.source.source_acceptance_id]: f.source },
    projection_acceptances: { [f.projection.projection_id]: f.projection },
    projection_artifacts: { [f.artifact.artifact_ref]: f.artifact },
    ...extra
  };
}

const base = makeFixture();

pass('R01', () => {
  const c = clone(base.command); c.capability_id = 'BOOK.SOURCE_RECOVERY.WRONG';
  expectCode(() => runtime.recoverExistingBookV1(c, opts(base)), 'RECOVERY_CAPABILITY_ID_MISMATCH');
});

pass('R02', () => {
  const c = clone(base.command); c.capability_id = 'PROSE.RECOVER_EXISTING_BOOK';
  expectCode(() => runtime.recoverExistingBookV1(c, opts(base)), 'RETIRED_PROSE_EXECUTION_ID');
});

pass('R03', () => {
  assert.strictEqual(base.binding.current_owner_path, 'SYSTEM_MASTER/BOOK');
  const wrong = runtime.buildBookRecoveryRuntimeBindingV1({ current_owner_path: 'SYSTEM_MASTER/BOOK/PROSE' });
  expectCode(() => runtime.validateBookRecoveryRuntimeBindingV1(wrong, { require_current: false }), 'RECOVERY_OWNER_PATH_MISMATCH');
});

pass('R04', () => {
  for (const mutation of [
    { recovery_engine_id: 'OTHER-ENGINE' },
    { recovery_profile_version: 'OTHER-PROFILE' },
    { recovery_engine_subject_ref: 'other://subject' }
  ]) {
    const f = makeFixture('r04', { binding: mutation });
    expectCode(() => runtime.recoverExistingBookV1(f.command, opts(f)), 'RECOVERY_ENGINE_SUBJECT_MISMATCH');
  }
});

pass('R05', () => {
  const f = makeFixture('r05'); f.source.valid = false;
  expectCode(() => runtime.recoverExistingBookV1(f.command, opts(f)), 'SOURCE_ACCEPTANCE_INVALID');
});

pass('R06', () => {
  const before = calls.recover;
  const f = makeFixture('r06');
  expectCode(() => runtime.recoverExistingBookV1(f.command, { ...opts(f), projection_acceptances: {} }), 'PROJECTION_ACCEPTANCE_NOT_FOUND');
  assert.strictEqual(calls.recover, before);
});

pass('R07', () => {
  const p1 = runtime.prepareRecoveryInvocationV1(base.command, opts(base));
  const p2 = runtime.prepareRecoveryInvocationV1(clone(base.command), opts(base));
  assert.strictEqual(p1.operation_identity.operation_digest, p2.operation_identity.operation_digest);
  assert.strictEqual(p1.recovery_key, p2.recovery_key);
});

let firstRun;
pass('R08', () => {
  firstRun = runtime.recoverExistingBookV1(base.command, opts(base));
  const checkpoint = firstRun.recovery_result.checkpoints[0];
  const beforeResume = calls.resume;
  const resumed = runtime.recoverExistingBookV1(base.command, opts(base, { durable_state: { status: 'INTERRUPTED', operation_identity: firstRun.operation_identity, checkpoint } }));
  assert.strictEqual(resumed.execution_class, 'RESUMED_FROM_VALIDATED_CHECKPOINT');
  assert.strictEqual(calls.resume, beforeResume + 1);
  assert.strictEqual(resumed.operation_identity.operation_digest, firstRun.operation_identity.operation_digest);
});

pass('R09', () => {
  const beforeRecover = calls.recover;
  const beforeResume = calls.resume;
  const replay = runtime.recoverExistingBookV1(base.command, opts(base, { durable_state: { status: 'COMPLETED_VERIFIED', operation_identity: firstRun.operation_identity, recovery_evidence_receipt: firstRun.recovery_evidence_receipt } }));
  assert.strictEqual(replay.execution_class, 'REUSE_VERIFIED_RESULT');
  assert.strictEqual(replay.engine_invoked, false);
  assert.strictEqual(calls.recover, beforeRecover);
  assert.strictEqual(calls.resume, beforeResume);
});

pass('R10', () => {
  const changed = makeFixture('source-changed');
  const p1 = runtime.prepareRecoveryInvocationV1(base.command, opts(base));
  const p2 = runtime.prepareRecoveryInvocationV1(changed.command, opts(changed));
  assert.notStrictEqual(p1.operation_identity.operation_digest, p2.operation_identity.operation_digest);
});

pass('R11', () => {
  const f = makeFixture('projection-change');
  f.source = clone(base.source);
  f.projection.source_acceptance_id = f.source.source_acceptance_id;
  f.projection.source_acceptance_digest = f.source.source_acceptance_digest;
  f.projection.source_digest_sha256 = f.source.source_digest_sha256;
  f.artifact.payload.source_acceptance_id = f.source.source_acceptance_id;
  f.artifact.payload.source_acceptance_digest = f.source.source_acceptance_digest;
  f.artifact.payload.source_digest_sha256 = f.source.source_digest_sha256;
  f.command.source_acceptance_refs = clone(base.command.source_acceptance_refs);
  const p1 = runtime.prepareRecoveryInvocationV1(base.command, opts(base));
  const p2 = runtime.prepareRecoveryInvocationV1(f.command, opts(f));
  assert.notStrictEqual(p1.operation_identity.operation_digest, p2.operation_identity.operation_digest);
});

pass('R12', () => {
  const changedAdapter = makeFixture('v1', { binding: { adapter_version: '1.0.1' } });
  changedAdapter.source = clone(base.source);
  changedAdapter.projection = clone(base.projection);
  changedAdapter.artifact = clone(base.artifact);
  changedAdapter.command.source_acceptance_refs = clone(base.command.source_acceptance_refs);
  changedAdapter.command.projection_acceptance_refs = clone(base.command.projection_acceptance_refs);
  const p1 = runtime.prepareRecoveryInvocationV1(base.command, opts(base));
  const p2 = runtime.prepareRecoveryInvocationV1(changedAdapter.command, opts(changedAdapter));
  assert.notStrictEqual(p1.binding.binding_digest, p2.binding.binding_digest);
  assert.notStrictEqual(p1.operation_identity.operation_digest, p2.operation_identity.operation_digest);
  assert.notStrictEqual(runtime.buildBookRecoveryRuntimeBindingV1({ recovery_engine_id: 'OTHER' }).binding_digest, base.binding.binding_digest);
  assert.notStrictEqual(runtime.buildBookRecoveryRuntimeBindingV1({ recovery_profile_version: 'OTHER' }).binding_digest, base.binding.binding_digest);
});

pass('R13', () => {
  for (const status of ['UNKNOWN','CONTRADICTORY']) {
    expectCode(() => runtime.recoverExistingBookV1(base.command, opts(base, { durable_state: { status, operation_identity: firstRun.operation_identity } })), 'BLOCKED_RECONCILIATION');
  }
});

pass('R14', () => {
  const c = clone(base.command); c.manuscript_text = 'must not enter coordination state';
  expectCode(() => runtime.recoverExistingBookV1(c, opts(base)), 'RAW_CONTENT_FORBIDDEN');
});

pass('R15', () => {
  const result = runtime.recoverExistingBookV1(base.command, opts(base));
  const baseline = result.recovery_result.recovered_book_baseline;
  assert.strictEqual(baseline.standing, 'PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION');
  assert.strictEqual(baseline.canonical_book_mutation_performed, false);
  assert.strictEqual(baseline.lifecycle_join_authorized, false);
  assert.deepStrictEqual(result.recovery_evidence_receipt.blocking_finding_codes, ['STRUCTURE_BOUNDARIES_AMBIGUOUS']);
  assert.deepStrictEqual(result.recovery_evidence_receipt.ambiguous_structure_ids, ['chapter-1']);
});

pass('R16', () => {
  assert(runtime.validateRecoveryEvidenceReceiptV1(firstRun.recovery_evidence_receipt, firstRun.operation_identity, firstRun.binding));
  assert.strictEqual(firstRun.recovery_evidence_receipt.current_capability_id, runtime.CURRENT_CAPABILITY_ID);
  assert.strictEqual(firstRun.recovery_evidence_receipt.binding_digest, firstRun.binding.binding_digest);
  assert.strictEqual(firstRun.recovery_evidence_receipt.operation_digest, firstRun.operation_identity.operation_digest);
  assert.strictEqual(firstRun.recovery_evidence_receipt.source_acceptances[0].source_acceptance_digest, base.source.source_acceptance_digest);
  assert.strictEqual(firstRun.recovery_evidence_receipt.projection_acceptances[0].projection_digest, base.projection.projection_digest);
  assert.strictEqual(firstRun.recovery_evidence_receipt.result_baseline_digest, firstRun.recovery_result.recovered_book_baseline.baseline_digest);
});

assert.strictEqual(cases, 16);
console.log(JSON.stringify({
  result: 'PASS',
  denominator: 'R01-R16',
  cases,
  current_capability_id: runtime.CURRENT_CAPABILITY_ID,
  b01_registry_modified: false,
  prose_dispatch_reactivated: false,
  canonical_effect_allowed: false,
  governed_admission_invoked: false,
  native_provider_fidelity_claimed: false
}));
