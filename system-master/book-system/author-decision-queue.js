'use strict';

const queue = require('./author-decision-queue-core.js');

module.exports = {
  AuthorDecisionQueueError: queue.AuthorDecisionQueueError,
  QUEUE_STATES: queue.QUEUE_STATES,
  SOURCE_KINDS: queue.SOURCE_KINDS,
  CONFIRMATION_POLICIES: queue.CONFIRMATION_POLICIES,
  digest: queue.digest,
  stable: queue.stable,
  digestQueueLedger: queue.digestQueueLedger,
  digestDecisionRequest: queue.digestDecisionRequest,
  validateQueueLedger: queue.validateQueueLedger,
  createQueueLedger: queue.createQueueLedger,
  enqueueDecision: queue.enqueueDecision,
  presentDecision: queue.presentDecision,
  deferDecision: queue.deferDecision,
  reopenDecision: queue.reopenDecision,
  withdrawDecision: queue.withdrawDecision,
  presentationProjection: queue.presentationProjection,
  resolveDecision: queue.resolveDecision,
  revalidateAgainstParent: queue.revalidateAgainstParent,
};
