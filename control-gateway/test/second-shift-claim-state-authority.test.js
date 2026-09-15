import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
  SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT,
  SECOND_SHIFT_CLAIM_STATE_EFFECT,
  SECOND_SHIFT_CLAIM_STATE_OPERATION,
  SECOND_SHIFT_CLAIM_STATE_PATH,
  SECOND_SHIFT_CLAIM_STATE_TARGET_REF,
  SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
  assertSecondShiftClaimStateAuthority,
  buildSecondShiftClaimStateAuthorityGenesis,
  buildSecondShiftClaimStateBootstrapRequest
} from '../src/second-shift-claim-state-authority.js';
import { canonicalize, sha256 } from '../src/active-work-state.js';
import { computePublicationDigest, publicationRevisionPath, validatePublicationEnvelope } from '../src/github-active-work-publication.js';
import { validateBootstrapRequest } from '../src/github-authority-bootstrap.js';

const repository = 'BFochtman746/system-master';
const predecessor = '7ccb4cfc6c9217e6fe354995ac67fec4861db7cd';
const publication = 'a'.repeat(40);

test('claim-state authority genesis is exact, immutable-scope and bootstrap-valid', () => {
  const genesis = buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha: predecessor });
  const { packet, envelope } = genesis;

  assert.equal(packet.workstream_id, SECOND_SHIFT_CLAIM_STATE_WORKSTREAM);
  assert.equal(packet.branch_or_ref, SECOND_SHIFT_CLAIM_STATE_TARGET_REF);
  assert.equal(packet.authority_epoch, 1);
  assert.deepEqual(packet.allowed_paths_or_effects.paths, [SECOND_SHIFT_CLAIM_STATE_PATH]);
  assert.deepEqual(packet.allowed_paths_or_effects.effects, [SECOND_SHIFT_CLAIM_STATE_EFFECT]);
  assert.equal(packet.current_operation.operation_id, SECOND_SHIFT_CLAIM_STATE_OPERATION);
  assert.equal(packet.current_operation.state, 'ACTIVE');
  assert.equal(packet.current_operation.predecessor_receipt_id, SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT);
  assert.equal(packet.qualification_state, 'PASSED');
  assert.equal(packet.github_admission_state, 'ADMITTED');

  assert.equal(envelope.publication_revision, 1);
  assert.equal(envelope.predecessor_commit_sha, predecessor);
  assert.equal(envelope.predecessor_packet_digest, null);
  assert.equal(envelope.predecessor_publication_digest, null);
  assert.equal(envelope.packet_digest, sha256(packet));
  assert.equal(envelope.publication_digest, computePublicationDigest(envelope));
  assert.equal(genesis.revision_path, publicationRevisionPath(1, envelope.packet_digest));
  assert.equal(genesis.body, `${canonicalize(envelope)}\n`);
  assert.equal(validatePublicationEnvelope(envelope, {
    expectedWorkstreamId: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
    expectedMissionVersion: packet.mission_version
  }), true);

  const request = buildSecondShiftClaimStateBootstrapRequest({ repository, publicationCommitSha: publication, genesis });
  assert.equal(request.state_ref, SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF);
  assert.equal(request.publication_commit_sha, publication);
  assert.equal(request.expected_predecessor_sha, predecessor);
  assert.equal(request.expected_packet_digest, envelope.packet_digest);
  assert.equal(request.expected_publication_digest, envelope.publication_digest);
  assert.equal(request.expected_subject_sha, predecessor);
  assert.equal(request.expected_target_ref, SECOND_SHIFT_CLAIM_STATE_TARGET_REF);
  assert.equal(request.expected_current_operation_id, SECOND_SHIFT_CLAIM_STATE_OPERATION);
  assert.equal(request.expected_authority_epoch, 1);
  assert.deepEqual(request.expected_allowed_paths, [SECOND_SHIFT_CLAIM_STATE_PATH]);
  assert.equal(validateBootstrapRequest(request), request);
  assert.equal(assertSecondShiftClaimStateAuthority(packet, { repository }), true);
});

test('existing exact authority preserves epoch high-water instead of requiring genesis epoch', () => {
  const genesis = buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha: predecessor });
  const evolved = structuredClone(genesis.packet);
  evolved.authority_epoch = 9;
  evolved.authority_rebind_receipt_id = SECOND_SHIFT_CLAIM_STATE_BOOTSTRAP_RECEIPT;
  evolved.authoritative_subject = { algorithm: 'sha1', oid: 'b'.repeat(40) };
  assert.equal(assertSecondShiftClaimStateAuthority(evolved, { repository }), true);
});

test('existing authority fails closed on broadened path scope', () => {
  const genesis = buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha: predecessor });
  const widened = structuredClone(genesis.packet);
  widened.allowed_paths_or_effects.paths.push('execution/**');
  assert.throws(
    () => assertSecondShiftClaimStateAuthority(widened, { repository }),
    (error) => error?.code === 'CLAIM_STATE_AUTHORITY_MISMATCH' && /path scope/.test(error.message)
  );
});

test('existing authority fails closed on wrong effect, ref or operation', () => {
  const genesis = buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha: predecessor });
  for (const mutate of [
    (packet) => { packet.allowed_paths_or_effects.effects = ['OTHER_WRITE']; },
    (packet) => { packet.branch_or_ref = 'main'; },
    (packet) => { packet.current_operation.operation_id = 'OTHER-OP'; }
  ]) {
    const packet = structuredClone(genesis.packet);
    mutate(packet);
    assert.throws(() => assertSecondShiftClaimStateAuthority(packet, { repository }), (error) => error?.code === 'CLAIM_STATE_AUTHORITY_MISMATCH');
  }
});
