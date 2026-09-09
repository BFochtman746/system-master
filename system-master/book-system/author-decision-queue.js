'use strict';

const queue = require('./author-decision-queue-core.js');
const vr = require('./version-and-rollback.js');

function validateParentQueue(parentState, queueLedger) {
  vr.validateParentState(parentState);
  queue.validateQueueLedger(queueLedger, parentState);
}

function enqueueDecision(args) {
  validateParentQueue(args.parentState, args.queueLedger);
  return queue.enqueueDecision(args);
}
function presentDecision(args) {
  validateParentQueue(args.parentState, args.queueLedger);
  return queue.presentDecision(args);
}
function deferDecision(args) {
  validateParentQueue(args.parentState, args.queueLedger);
  return queue.deferDecision(args);
}
function reopenDecision(args) {
  validateParentQueue(args.parentState, args.queueLedger);
  return queue.reopenDecision(args);
}
function withdrawDecision(args) {
  validateParentQueue(args.parentState, args.queueLedger);
  return queue.withdrawDecision(args);
}
function resolveDecision(args) {
  validateParentQueue(args.parentState, args.queueLedger);
  vr.validateLedger(args.versionLedger, args.parentState);
  return queue.resolveDecision(args);
}
function revalidateAgainstParent(args) {
  vr.validateParentState(args.previousParentState);
  vr.validateParentState(args.currentParentState);
  queue.validateQueueLedger(args.queueLedger, args.previousParentState);
  return queue.revalidateAgainstParent(args);
}

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
  enqueueDecision,
  presentDecision,
  deferDecision,
  reopenDecision,
  withdrawDecision,
  presentationProjection: queue.presentationProjection,
  resolveDecision,
  revalidateAgainstParent,
};
