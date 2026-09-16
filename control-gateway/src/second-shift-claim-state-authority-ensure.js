import {
  DEFAULT_ACTIVE_WORK_HEAD_PATH,
  GitHubActiveWorkPublisher
} from './github-active-work-publication.js';
import {
  SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
  SECOND_SHIFT_CLAIM_STATE_TARGET_REF,
  SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
  assertSecondShiftClaimStateAuthority,
  buildSecondShiftClaimStateAuthorityGenesis,
  buildSecondShiftClaimStateBootstrapRequest
} from './second-shift-claim-state-authority.js';

const SHA1 = /^[0-9a-f]{40}$/;

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA1.test(value)) fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', `${label} must be a lowercase SHA-1`);
  return value;
}

function requirePositiveInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', `${label} must be a positive safe integer`);
  return value;
}

async function getRefOrNull(transport, ref) {
  try {
    return await transport.getRef(ref);
  } catch (error) {
    if (error?.details?.status === 404) return null;
    throw error;
  }
}

function authorityResult(state, reconstructed) {
  const packet = reconstructed?.envelope?.packet;
  return Object.freeze({
    state,
    authority_ref: SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
    authority_commit_sha: reconstructed.head_commit_sha,
    authority_epoch: packet.authority_epoch,
    authoritative_subject_sha: packet.authoritative_subject.oid,
    target_ref: packet.branch_or_ref,
    current_operation_id: packet.current_operation.operation_id,
    packet_digest: reconstructed.packet_digest,
    publication_digest: reconstructed.publication_digest
  });
}

async function reconstructExactAuthority({ publisher, repository, expectedRefSha = null, state }) {
  const reconstructed = await publisher.reconstruct();
  requireSha(reconstructed?.head_commit_sha, 'authority head commit');
  if (expectedRefSha !== null && reconstructed.head_commit_sha !== expectedRefSha) {
    fail('CLAIM_STATE_AUTHORITY_RECONSTRUCTION_MOVED', 'authority ref moved during exact reconstruction', {
      expected_ref_sha: expectedRefSha,
      observed_ref_sha: reconstructed.head_commit_sha
    });
  }
  assertSecondShiftClaimStateAuthority(reconstructed?.envelope?.packet, { repository });
  return authorityResult(state, reconstructed);
}

/**
 * Ensure the narrow Second Shift claim-state authority exists without ever exposing the
 * protected writer App credential to the caller. A missing authority is prepared as an
 * unattached exact publication commit, then main's protected bootstrap workflow is
 * dispatched at most once. Any ambiguous dispatch is reconciliation-only.
 */
export async function ensureSecondShiftClaimStateAuthority({
  repository,
  transport,
  publisher,
  dispatchBootstrap,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollAttempts = 180,
  pollDelayMs = 1000
}) {
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', 'repository must be owner/name');
  }
  if (!transport || typeof transport.getRef !== 'function' || typeof transport.readFile !== 'function' || typeof transport.createCommitFromFiles !== 'function') {
    fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', 'GitHub transport is incomplete');
  }
  if (!(publisher instanceof GitHubActiveWorkPublisher) && (!publisher || typeof publisher.reconstruct !== 'function' || typeof publisher.readEnvelopeAtCommit !== 'function' || typeof publisher.verifyHistory !== 'function')) {
    fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', 'authority publisher is incomplete');
  }
  if (typeof dispatchBootstrap !== 'function') fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', 'dispatchBootstrap function required');
  if (typeof sleep !== 'function') fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', 'sleep function required');
  requirePositiveInt(pollAttempts, 'pollAttempts');
  if (!Number.isSafeInteger(pollDelayMs) || pollDelayMs < 0) fail('CLAIM_STATE_AUTHORITY_ENSURE_INVALID', 'pollDelayMs must be a nonnegative safe integer');

  const existing = await getRefOrNull(transport, SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF);
  if (existing !== null) {
    requireSha(existing.sha, 'existing authority ref');
    return reconstructExactAuthority({ publisher, repository, expectedRefSha: existing.sha, state: 'EXISTING_VERIFIED' });
  }

  const target = await transport.getRef(SECOND_SHIFT_CLAIM_STATE_TARGET_REF);
  const predecessorSha = requireSha(target?.sha, 'claim-state target ref');
  const predecessorHead = await transport.readFile(predecessorSha, DEFAULT_ACTIVE_WORK_HEAD_PATH);
  if (predecessorHead !== null) {
    fail('CLAIM_STATE_AUTHORITY_GENESIS_PREDECESSOR_DIRTY', 'claim-state target predecessor already contains an active-work head');
  }

  const genesis = buildSecondShiftClaimStateAuthorityGenesis({ repository, predecessorCommitSha: predecessorSha });
  const created = await transport.createCommitFromFiles({
    parentSha: predecessorSha,
    files: {
      [DEFAULT_ACTIVE_WORK_HEAD_PATH]: genesis.body,
      [genesis.revision_path]: genesis.body
    },
    message: `control-gateway claim-state authority genesis ${genesis.envelope.packet_digest.slice(0, 12)}`
  });
  const publicationCommitSha = requireSha(created?.sha, 'authority publication commit');
  const verifiedPublication = await publisher.readEnvelopeAtCommit(publicationCommitSha);
  if (!verifiedPublication || verifiedPublication.envelope?.packet_digest !== genesis.envelope.packet_digest || verifiedPublication.envelope?.publication_digest !== genesis.envelope.publication_digest) {
    fail('CLAIM_STATE_AUTHORITY_PUBLICATION_VERIFY_FAILED', 'prepared authority publication does not match exact genesis bytes');
  }
  await publisher.verifyHistory(publicationCommitSha);

  // Another writer may have won the create-only bootstrap while we prepared the unattached
  // commit. Verify and use it; never dispatch another bootstrap merely because our own
  // publication commit is different.
  const appearedBeforeDispatch = await getRefOrNull(transport, SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF);
  if (appearedBeforeDispatch !== null) {
    requireSha(appearedBeforeDispatch.sha, 'raced authority ref');
    return reconstructExactAuthority({ publisher, repository, expectedRefSha: appearedBeforeDispatch.sha, state: 'RACE_EXISTING_VERIFIED' });
  }

  const request = buildSecondShiftClaimStateBootstrapRequest({ repository, publicationCommitSha, genesis });
  let ambiguousDispatch = false;
  try {
    await dispatchBootstrap(request);
  } catch (error) {
    if (error?.code !== 'GITHUB_NETWORK_AMBIGUOUS') throw error;
    ambiguousDispatch = true;
  }

  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const observed = await getRefOrNull(transport, SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF);
    if (observed !== null) {
      requireSha(observed.sha, 'bootstrapped authority ref');
      return reconstructExactAuthority({
        publisher,
        repository,
        expectedRefSha: observed.sha,
        state: observed.sha === publicationCommitSha ? 'BOOTSTRAPPED_VERIFIED' : 'RACE_BOOTSTRAPPED_VERIFIED'
      });
    }
    if (attempt < pollAttempts && pollDelayMs > 0) await sleep(pollDelayMs);
  }

  if (ambiguousDispatch) {
    fail('CLAIM_STATE_AUTHORITY_BOOTSTRAP_DISPATCH_UNCERTAIN', 'bootstrap dispatch acceptance is uncertain; refusing to redispatch');
  }
  fail('CLAIM_STATE_AUTHORITY_BOOTSTRAP_RESULT_NOT_OBSERVED', 'bootstrap dispatch was accepted but exact authority publication was not observed');
}

export const CLAIM_STATE_AUTHORITY_ENSURE_DEFAULTS = Object.freeze({
  authority_ref: SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
  target_ref: SECOND_SHIFT_CLAIM_STATE_TARGET_REF,
  workstream_id: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM,
  poll_attempts: 180,
  poll_delay_ms: 1000
});
