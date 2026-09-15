#!/usr/bin/env node

import {
  GitHubActiveWorkPublisher,
  GitHubActiveWorkRestTransport
} from '../../control-gateway/src/github-active-work-publication.js';
import {
  CLAIM_STATE_AUTHORITY_ENSURE_DEFAULTS,
  ensureSecondShiftClaimStateAuthority
} from '../../control-gateway/src/second-shift-claim-state-authority-ensure.js';
import {
  SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
  SECOND_SHIFT_CLAIM_STATE_WORKSTREAM
} from '../../control-gateway/src/second-shift-claim-state-authority.js';

function env(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function positiveInt(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonnegativeInt(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative integer`);
  return value;
}

const repository = env('GITHUB_REPOSITORY');
const token = env('GITHUB_TOKEN', env('GH_TOKEN'));
if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must be owner/name');
if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');
const [owner, repo] = repository.split('/');

const transport = new GitHubActiveWorkRestTransport({
  owner,
  repo,
  tokenProvider: async () => token
});
const publisher = new GitHubActiveWorkPublisher({
  transport,
  ref: SECOND_SHIFT_CLAIM_STATE_AUTHORITY_REF,
  workstreamId: SECOND_SHIFT_CLAIM_STATE_WORKSTREAM
});

const workflow = env('CLAIM_STATE_AUTHORITY_BOOTSTRAP_WORKFLOW', 'control-gateway-authority-bootstrap.yml');
const workflowRef = env('CLAIM_STATE_AUTHORITY_BOOTSTRAP_REF', 'main');
const result = await ensureSecondShiftClaimStateAuthority({
  repository,
  transport,
  publisher,
  pollAttempts: positiveInt('CLAIM_STATE_AUTHORITY_BOOTSTRAP_POLL_ATTEMPTS', CLAIM_STATE_AUTHORITY_ENSURE_DEFAULTS.poll_attempts),
  pollDelayMs: nonnegativeInt('CLAIM_STATE_AUTHORITY_BOOTSTRAP_POLL_DELAY_MS', CLAIM_STATE_AUTHORITY_ENSURE_DEFAULTS.poll_delay_ms),
  dispatchBootstrap: async (request) => {
    await transport.request(
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      { ref: workflowRef, inputs: { bootstrap_request_json: JSON.stringify(request) } }
    );
  }
});

console.log(`CLAIM-STATE-AUTHORITY state=${result.state} authorityRef=${result.authority_ref} authorityCommit=${result.authority_commit_sha} epoch=${result.authority_epoch} subject=${result.authoritative_subject_sha}`);
console.log(JSON.stringify(result));
