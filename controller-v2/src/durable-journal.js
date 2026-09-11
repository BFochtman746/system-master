import { ControllerError } from './errors.js';
import { sha256 } from './canonical.js';
import { journalDigest, normalizeCheckpoint, checkpointsEqual, verifyDurableJournal } from './journal-integrity.js';

function verifySemanticAppend(event, prior) {
  if (!event || typeof event !== 'object') throw new ControllerError('JOURNAL_EVENT_INVALID', 'event object required');
  const expectedVersion = (prior?.stream_version ?? 0) + 1;
  const expectedPrev = prior?.event_digest ?? null;
  if (event.stream_version !== expectedVersion) throw new ControllerError('JOURNAL_STREAM_GAP', `expected stream version ${expectedVersion}, got ${event.stream_version}`);
  if (event.prev_event_digest !== expectedPrev) throw new ControllerError('JOURNAL_STREAM_FORK', 'semantic stream predecessor digest mismatch');
  const core={event_id:event.event_id,event_schema:event.event_schema,stream_id:event.stream_id,stream_version:event.stream_version,event_type:event.event_type,occurred_at:event.occurred_at,prev_event_digest:event.prev_event_digest,data:event.data};
  if (sha256(core) !== event.event_digest) throw new ControllerError('JOURNAL_EVENT_INTEGRITY_FAILURE', 'semantic event digest does not match event bytes');
}

export class MemoryDurableJournal {
  constructor({ failBefore = 0, failAfter = 0 } = {}) {
    this.events = new Map();
    this.streamHeads = new Map();
    this.head = { size: 0, head_digest: null };
    this.failBefore = failBefore;
    this.failAfter = failAfter;
  }

  async getCheckpoint() { return structuredClone(this.head); }

  async putIfAbsent(event, { expectedCheckpoint = null } = {}) {
    if (this.failBefore > 0) {
      this.failBefore -= 1;
      throw new ControllerError('JOURNAL_UNAVAILABLE', 'simulated journal failure before write');
    }
    const priorEvent = this.events.get(event.event_id);
    if (priorEvent) {
      if (priorEvent.event_digest !== event.event_digest) throw new ControllerError('JOURNAL_CONFLICT', 'event id already exists with different digest');
      return { created: false, event_digest: priorEvent.event_digest, journal_position: priorEvent.journal_position, journal_digest: priorEvent.journal_digest, checkpoint: structuredClone(this.head) };
    }
    if (expectedCheckpoint && !checkpointsEqual(this.head, expectedCheckpoint)) throw new ControllerError('JOURNAL_HEAD_CONFLICT', 'journal head changed before append');
    const streamHead=this.streamHeads.get(event.stream_id)??null;
    verifySemanticAppend(event,streamHead);
    const journal_position = this.head.size + 1;
    const prev_journal_digest = this.head.head_digest;
    const journal_digest = journalDigest({ journal_position, event_id: event.event_id, event_digest: event.event_digest, prev_journal_digest });
    const stored = structuredClone({ ...event, journal_position, prev_journal_digest, journal_digest });
    this.events.set(event.event_id, stored);
    this.streamHeads.set(event.stream_id,{stream_version:event.stream_version,event_digest:event.event_digest});
    this.head = { size: journal_position, head_digest: journal_digest };
    if (this.failAfter > 0) {
      this.failAfter -= 1;
      throw new ControllerError('JOURNAL_ACK_LOST', 'simulated lost acknowledgement after durable write');
    }
    return { created: true, event_digest: stored.event_digest, journal_position, journal_digest, checkpoint: structuredClone(this.head) };
  }

  async get(eventId) {
    const e = this.events.get(eventId);
    return e ? structuredClone(e) : null;
  }

  async list() {
    return [...this.events.values()].sort((a,b)=>a.journal_position-b.journal_position).map((event) => structuredClone(event));
  }

  async verify(expectedCheckpoint = null) {
    return verifyDurableJournal(await this.list(), { expectedCheckpoint });
  }
}

function eventFromOutbox(row) {
  return {
    event_id: row.event_id,
    event_schema: row.event_schema,
    stream_id: row.stream_id,
    stream_version: Number(row.stream_version),
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    data: JSON.parse(row.data_json),
    prev_event_digest: row.prev_event_digest,
    event_digest: row.event_digest
  };
}

// The durable journal must observe the controller's local commit order, never wall-clock order.
// SQLite rowid is used only by this reference storage adapter as its monotonic append cursor;
// it is not part of the Controller protocol or durable journal format.
function pendingOutboxInLocalCommitOrder(kernel) {
  if (!kernel?.db?.prepare) throw new ControllerError('OUTBOX_ADAPTER_INVALID', 'reference SQLite kernel required');
  return kernel.db.prepare("SELECT o.rowid AS local_outbox_sequence,o.*,e.event_schema,e.stream_id,e.stream_version,e.event_type,e.occurred_at,e.data_json,e.prev_event_digest,e.event_digest FROM outbox o JOIN events e ON e.event_id=o.event_id WHERE o.status='PENDING' ORDER BY o.rowid").all();
}

export async function publishPendingOutbox(kernel, journal, { limit = Infinity } = {}) {
  const pending = pendingOutboxInLocalCommitOrder(kernel).slice(0, limit);
  const results = [];
  for (const row of pending) {
    const event = eventFromOutbox(row);
    try {
      let receipt;
      const expectedCheckpoint = normalizeCheckpoint(await journal.getCheckpoint());
      try {
        receipt = await journal.putIfAbsent(event, { expectedCheckpoint });
      } catch (error) {
        const observed = await journal.get(event.event_id).catch(() => null);
        if (!observed || observed.event_digest !== event.event_digest) throw error;
        receipt = {
          created: false,
          event_digest: observed.event_digest,
          journal_position: observed.journal_position,
          journal_digest: observed.journal_digest,
          checkpoint: await journal.getCheckpoint(),
          recovered_after_error: true
        };
      }
      if (!receipt || receipt.event_digest !== event.event_digest || typeof receipt.journal_digest !== 'string') throw new ControllerError('JOURNAL_INTEGRITY_FAILURE', 'journal did not confirm exact event and journal digest');
      kernel.markOutboxSealed(row.outbox_id);
      results.push({ outbox_id: row.outbox_id, event_id: event.event_id, sealed: true, local_outbox_sequence: Number(row.local_outbox_sequence), ...receipt });
    } catch (error) {
      kernel.recordOutboxFailure(row.outbox_id, error.code || error.message || String(error));
      results.push({ outbox_id: row.outbox_id, event_id: event.event_id, sealed: false, local_outbox_sequence: Number(row.local_outbox_sequence), code: error.code || 'JOURNAL_ERROR' });
    }
  }
  return results;
}
