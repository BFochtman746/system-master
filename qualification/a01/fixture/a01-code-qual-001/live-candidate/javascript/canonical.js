import { createHash } from 'node:crypto';

export function canonical(requestId, payload) {
  // Intentionally defective: differs from the required cross-language contract.
  return `${requestId}:${payload}`;
}

export function sha256(requestId, payload) {
  return createHash('sha256').update(canonical(requestId, payload), 'utf8').digest('hex');
}
