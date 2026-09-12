import { GitHubProductionMutationError, GitHubReceiptCasRestTransport } from './github-production-mutation.js';

const DEFAULT_POSTWRITE_VERIFY_DELAYS_MS = Object.freeze([0, 100, 250, 500, 1000, 2000, 4000]);

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateDelays(values) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError('postWriteVerifyDelaysMs must be a non-empty array');
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('postWriteVerifyDelaysMs entries must be non-negative integers');
  }
  return [...values];
}

export class GitHubReadConsistentReceiptCasRestTransport extends GitHubReceiptCasRestTransport {
  constructor(options = {}) {
    const {
      postWriteVerifyDelaysMs = DEFAULT_POSTWRITE_VERIFY_DELAYS_MS,
      sleepImpl = defaultSleep,
      ...transportOptions
    } = options;
    super(transportOptions);
    if (typeof sleepImpl !== 'function') throw new TypeError('sleepImpl function required');
    this.postWriteVerifyDelaysMs = validateDelays(postWriteVerifyDelaysMs);
    this.sleepImpl = sleepImpl;
    this.pendingPostWrite = null;
  }

  async updateRefFastForward(ref, sha) {
    try {
      const result = await super.updateRefFastForward(ref, sha);
      if (!result || result.sha !== sha) {
        throw new GitHubProductionMutationError(
          'PRODUCTION_MUTATION_CAS_ACK_MISMATCH',
          'GitHub PATCH response did not acknowledge the exact requested commit',
          { ref, expected_sha: sha, acknowledged_sha: result?.sha ?? null }
        );
      }
      this.pendingPostWrite = { ref, sha };
      return result;
    } catch (error) {
      if (error?.code === 'GITHUB_NETWORK_AMBIGUOUS') this.pendingPostWrite = { ref, sha };
      throw error;
    }
  }

  async getRef(ref) {
    const pending = this.pendingPostWrite;
    if (!pending || pending.ref !== ref) return super.getRef(ref);

    let lastObservedSha = null;
    for (const delayMs of this.postWriteVerifyDelaysMs) {
      if (delayMs > 0) await this.sleepImpl(delayMs);
      const observed = await super.getRef(ref);
      lastObservedSha = observed?.sha ?? null;
      if (lastObservedSha === pending.sha) {
        this.pendingPostWrite = null;
        return observed;
      }
    }

    this.pendingPostWrite = null;
    throw new GitHubProductionMutationError(
      'PRODUCTION_MUTATION_POSTWRITE_RECONCILIATION_EXHAUSTED',
      'GitHub ref read did not converge to the exact acknowledged commit within the bounded verification window',
      { ref, expected_sha: pending.sha, last_observed_sha: lastObservedSha }
    );
  }
}
