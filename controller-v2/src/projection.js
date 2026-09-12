import { ControllerError } from './errors.js';
import { reduceSemanticEvents } from './semantic-events.js';
import { checkpointsEqual, normalizeCheckpoint, verifyDurableJournal } from './journal-integrity.js';

export function projectVerifiedDurableJournal(entries,{expectedCheckpoint,nowMs=Date.now()}={}) {
  if (!expectedCheckpoint) throw new ControllerError('JOURNAL_CHECKPOINT_REQUIRED','expected durable journal checkpoint required');
  const expected=normalizeCheckpoint(expectedCheckpoint);
  const verified=verifyDurableJournal(entries,{expectedCheckpoint:expected});
  const state=reduceSemanticEvents(verified.entries);
  const tail=verified.entries.at(-1)??null;
  return {
    source_authority:'DURABLE_VERIFIED',
    semantic_authority:false,
    checkpoint_standing:'AT_CHECKPOINT',
    source_checkpoint:{...verified.checkpoint},
    source_event_count:verified.entries.length,
    source_tail_event_id:tail?.event_id??null,
    source_tail_event_digest:tail?.event_digest??null,
    generated_at:new Date(nowMs).toISOString(),
    state
  };
}

export function projectionCheckpointStanding(projection,observedCheckpoint) {
  if(!projection||projection.source_authority!=='DURABLE_VERIFIED'||projection.semantic_authority!==false||!projection.source_checkpoint) {
    throw new ControllerError('PROJECTION_SOURCE_INVALID','durable verified projection required');
  }
  const source=normalizeCheckpoint(projection.source_checkpoint);
  const observed=normalizeCheckpoint(observedCheckpoint);
  return checkpointsEqual(source,observed)?'AT_OBSERVED_HEAD':'NOT_AT_OBSERVED_HEAD';
}
