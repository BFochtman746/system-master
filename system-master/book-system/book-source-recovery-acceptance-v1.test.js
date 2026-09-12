'use strict';

const assert = require('assert');
const intake = require('./book-source-recovery-acceptance-v1');

let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}
function digest(label) { return intake.sha256(label); }

const NOW = '2026-09-12T15:08:00.000Z';
const sourceDigest = digest('original-book-bytes-v1');
const providerContractDigest = digest('provider-contract-v1');

function baseRights(overrides = {}) {
  return {
    evidence_id: 'rights-evidence-001',
    evidence_issuer_ref: 'authority://owner',
    evidence_ref: 'evidence://rights/001',
    source_ref: 'provider://book/source-001',
    source_digest: sourceDigest,
    intended_use_scopes: ['BOOK_RECOVERY_PRIVATE_USE'],
    currentness: 'CURRENT',
    effective_at: '2026-09-01T00:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    conflict_refs: [],
    policy_expression: { type: 'SPDX', license_expression: 'LicenseRef-PrivateBookRecovery' },
    ...overrides
  };
}

function baseSource(overrides = {}) {
  return {
    book_project_id: 'BOOK-PROJECT-001',
    source_id: 'SOURCE-001',
    source_kind: 'DOCX',
    source_locator_ref: 'provider://book/source-001',
    provider_identity: {
      provider_class: 'NATIVE_DOCUMENT_PROVIDER',
      provider_subject_ref: 'provider-subject://book-source-prod',
      provider_contract_ref: 'provider-contract://book-source/v1',
      provider_contract_digest: providerContractDigest,
      object_id: 'object-001',
      object_version_or_generation: 'generation-7',
      content_address_or_etag: `sha256:${sourceDigest}`
    },
    source_digest_sha256: sourceDigest,
    source_byte_length: 4096,
    media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    provider_observation: { source_digest_sha256: sourceDigest, source_byte_length: 4096 },
    rights_evidence: baseRights(),
    intended_use_scope: 'BOOK_RECOVERY_PRIVATE_USE',
    private_source_evidence_required: true,
    private_source_evidence: {
      evidence_ref: 'private-authority://permission/001',
      evidence_digest: digest('private-permission-001'),
      currentness: 'CURRENT'
    },
    ...overrides
  };
}

function accept(source = baseSource()) {
  return intake.acceptOriginalBookSourceV1(source, { rights_options: { now: NOW }, accepted_at: NOW }).acceptance;
}

function baseProjection(acceptance, overrides = {}) {
  return {
    source_acceptance_id: acceptance.source_acceptance_id,
    source_acceptance_digest: acceptance.source_acceptance_digest,
    source_digest_sha256: acceptance.source_digest_sha256,
    extractor_identity: {
      provider_class: 'NATIVE_DOCUMENT_PROVIDER',
      provider_subject_ref: 'provider-subject://book-source-prod',
      provider_service_id: 'DOCX_EXTRACTOR',
      provider_operation_id: 'NORMALIZE_BOOK_SOURCE',
      provider_contract_ref: 'provider-contract://book-source/v1',
      provider_contract_digest: providerContractDigest,
      extractor_version: '3.4.1'
    },
    projection_artifact_ref: 'artifact://normalized/source-001/v1',
    projection_artifact_digest: digest('normalized-artifact-v1'),
    recovered_content_digest_sha256: digest('recovered-content-v1'),
    structure: [
      { structure_id: 'chapter-1', kind: 'CHAPTER', title: 'Chapter 1', ordinal: 0, anchor: 'docx:p:1-24', confidence: 0.99, ambiguous: false }
    ],
    metadata_ref_or_inline: { title: 'Recovered Book', authors: ['Author'] },
    citations_ref_or_inline: [],
    comments_ref_or_inline: [{ anchor: 'docx:p:3', comment_ref: 'comment://1' }],
    todos_ref_or_inline: [{ anchor: 'docx:p:8', kind: 'TODO' }],
    tracked_changes_ref_or_inline: [{ anchor: 'docx:p:10', change_ref: 'change://1' }],
    story_bible_candidate_ref_or_inline: { artifact_ref: 'artifact://story-bible-candidate/1' },
    nonfiction_knowledge_candidate_ref_or_inline: null,
    voice_candidate_ref_or_inline: { artifact_ref: 'artifact://voice-candidate/1' },
    unit_evidence: [],
    ...overrides
  };
}

const accepted = accept();

pass('S01', () => {
  assert(intake.validateSourceCustodyAcceptanceV1(accepted));
  assert.strictEqual(accepted.canonical_write_authority, false);
  assert.strictEqual(accepted.author_decision_authority, false);
  assert.strictEqual(accepted.publication_authority, false);
});

pass('S02', () => {
  const source = baseSource({ provider_observation: { source_digest_sha256: digest('different-bytes'), source_byte_length: 4096 } });
  expectCode(() => accept(source), 'SOURCE_DIGEST_MISMATCH');
});

pass('S03', () => {
  const source = baseSource({ provider_observation: { source_digest_sha256: sourceDigest, source_byte_length: 4095 } });
  expectCode(() => accept(source), 'SOURCE_BYTE_LENGTH_MISMATCH');
});

pass('S04', () => {
  const source = baseSource();
  source.provider_identity.provider_subject_ref = '';
  expectCode(() => accept(source), 'REFERENCE_REQUIRED');
});

pass('S05', () => {
  const source = baseSource();
  source.provider_identity.object_version_or_generation = '';
  expectCode(() => accept(source), 'REFERENCE_REQUIRED');
});

pass('S06', () => {
  const source = baseSource({ intended_use_scope: 'PUBLIC_DISTRIBUTION' });
  expectCode(() => accept(source), 'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY');
});

pass('S07', () => {
  for (const variant of [
    { currentness: 'STALE' },
    { currentness: 'EXPIRED' },
    { currentness: 'REVOKED' },
    { conflict_refs: ['evidence://conflict/1'] }
  ]) {
    const source = baseSource({ rights_evidence: baseRights(variant) });
    expectCode(() => accept(source), 'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY');
  }
});

pass('S08', () => {
  const source = baseSource({ private_source_evidence_required: true, private_source_evidence: null });
  expectCode(() => accept(source), 'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY');
});

pass('S09', () => {
  const source = baseSource({ rights_evidence: baseRights({ policy_expression: { type: 'OPAQUE_EXTERNAL', policy_ref: 'policy://opaque/1', semantics_understood: false } }) });
  expectCode(() => accept(source), 'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY');
});

pass('S10', () => {
  const tampered = { ...accepted, source_acceptance_digest: '0'.repeat(64) };
  expectCode(() => intake.validateSourceCustodyAcceptanceV1(tampered), 'SOURCE_ACCEPTANCE_DIGEST_MISMATCH');
});

pass('S11', () => {
  const same = accept();
  assert.strictEqual(intake.assertSourceAcceptanceCreateOnce(null, accepted).action, 'CREATE');
  assert.strictEqual(intake.assertSourceAcceptanceCreateOnce(accepted, same).action, 'REUSE');
  assert.strictEqual(same.source_acceptance_id, accepted.source_acceptance_id);
});

pass('S12', () => {
  const changedSource = baseSource();
  changedSource.provider_identity = { ...changedSource.provider_identity, provider_subject_ref: 'provider-subject://book-source-prod-2' };
  const changed = accept(changedSource);
  assert.notStrictEqual(changed.source_acceptance_id, accepted.source_acceptance_id);
  expectCode(() => intake.assertSourceAcceptanceCreateOnce(accepted, changed), 'SOURCE_ACCEPTANCE_IDENTITY_CHANGED');
});

pass('S13', () => {
  assert(intake.validateSourceReresolutionV1(accepted, {
    source_locator_ref: accepted.source_locator_ref,
    provider_identity: { ...accepted.provider_identity },
    source_digest_sha256: accepted.source_digest_sha256,
    source_byte_length: accepted.source_byte_length
  }));
});

pass('S14', () => {
  expectCode(() => intake.validateSourceReresolutionV1(accepted, {
    source_locator_ref: accepted.source_locator_ref,
    provider_identity: { ...accepted.provider_identity },
    source_digest_sha256: digest('changed-at-same-display-path'),
    source_byte_length: accepted.source_byte_length
  }), 'SOURCE_STALE');
});

const projection = intake.acceptNormalizedBookSourceProjectionV1(baseProjection(accepted), accepted);

pass('S15', () => {
  assert(intake.validateNormalizedSourceProjectionV1(projection, accepted));
  assert.strictEqual(projection.source_acceptance_digest, accepted.source_acceptance_digest);
});

pass('S16', () => {
  const otherSource = baseSource({
    source_id: 'SOURCE-002',
    source_locator_ref: 'provider://book/source-002',
    source_digest_sha256: digest('source-two'),
    source_byte_length: 3000,
    provider_observation: { source_digest_sha256: digest('source-two'), source_byte_length: 3000 },
    rights_evidence: baseRights({ source_ref: 'provider://book/source-002', source_digest: digest('source-two') })
  });
  const otherAcceptance = accept(otherSource);
  const wrong = baseProjection(accepted, { source_acceptance_id: otherAcceptance.source_acceptance_id, source_acceptance_digest: otherAcceptance.source_acceptance_digest });
  expectCode(() => intake.acceptNormalizedBookSourceProjectionV1(wrong, accepted), 'PROJECTION_SOURCE_ACCEPTANCE_MISMATCH');
});

pass('S17', () => {
  const tampered = { ...projection, projection_digest: '1'.repeat(64) };
  expectCode(() => intake.validateNormalizedSourceProjectionV1(tampered, accepted), 'PROJECTION_DIGEST_MISMATCH');
});

pass('S18', () => {
  const invalid = baseProjection(accepted, { recovered_content_digest_sha256: '' });
  expectCode(() => intake.acceptNormalizedBookSourceProjectionV1(invalid, accepted), 'INVALID_SHA256');
});

pass('S19', () => {
  assert.strictEqual(projection.unit_evidence.length, 0);
  assert(intake.validateNormalizedSourceProjectionV1(projection, accepted));
  expectCode(() => intake.assertUnitAdmissionEvidenceV1(projection, accepted, ['chapter-1']), 'BLOCKED_PER_UNIT_EVIDENCE');
});

pass('S20', () => {
  const withBadUnit = {
    ...projection,
    unit_evidence: [{
      unit_id: 'chapter-1',
      unit_kind: 'CHAPTER',
      ordinal: 0,
      anchor: 'docx:p:1-24',
      source_acceptance_digest: accepted.source_acceptance_digest,
      projection_digest: digest('wrong-projection'),
      unit_content_digest_sha256: digest('chapter-one-content'),
      unit_locator_ref: 'provider://book/source-001#chapter-1',
      provider_evidence_ref: 'evidence://unit/chapter-1',
      provider_evidence_digest: digest('unit-evidence-chapter-1')
    }]
  };
  expectCode(() => intake.assertUnitAdmissionEvidenceV1(withBadUnit, accepted, ['chapter-1']), 'UNIT_PROJECTION_DIGEST_MISMATCH');
});

assert.strictEqual(cases, 20);
console.log(JSON.stringify({
  result: 'PASS',
  denominator: 'S01-S20',
  cases,
  native_provider_fidelity_claimed: false,
  recovery_engine_invoked: false,
  canonical_effect_allowed: false,
  b01_registry_modified: false
}));
