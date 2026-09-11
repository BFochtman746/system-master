import { ControllerError } from './kernel.js';

export class MemoryDurableJournal {
  constructor({ failBefore = 0, failAfter = 0 } = {}) {
    this.events = new Map();
    this.failBefore = failBefore;
    this.failAfter = failAfter;
  }

  async putIfAbsent(event) {
    if (this.failBefore > 0) {
      this.failBefore -= 1;
      throw new ControllerError('JOURNAL_UNAVAILABLE', 'simulated journal failure before write');
    }
    const prior = this.events.get(event.event_id);
    if (prior) {
      if (prior.event_digest !== event.event_digest) {
        throw new ControllerError('JOURNAL_CONFLICT', 'event id already exists with different digest');
      }
      return { created: false, event_digest: prior.event_digest };
    }
    const stored = structuredClone(event);
    this.events.set(event.event_id, stored);
    if (this.failAfter > 0) {
      this.failAfter -= 1;
      throw new ControllerError('JOURNAL_ACK_LOST', 'simulated lost acknowledgement after durable write');
    }
    return { created: true, event_digest: stored.event_digest };
  }

  async get(eventId) {
    const e = this.events.get(eventId);
    return e ? structuredClone(e) : null;
  }

  async list() {
    return [...this.events.values()].map((event) => structuredClone(event));
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

export async function publishPendingOutbox(kernel, journal, { limit = Infinity } = {}) {
  const pending = kernel.pendingOutbox().slice(0, limit);
  const results = [];
  for (const row of pending) {
    const event = eventFromOutbox(row);
    try {
      let receipt;
      try {
        receipt = await journal.putIfAbsent(event);
      } catch (error) {
        // An acknowledgement can be lost after a durable write. Observe by immutable event id
        // before classifying the attempt as failed or retrying the mutation.
        const observed = await journal.get(event.event_id).catch(() => null);
        if (!observed || observed.event_digest !== event.event_digest) throw error;
        receipt = { created: false, event_digest: observed.event_digest, recovered_after_error: true };
      }
      if (!receipt || receipt.event_digest !== event.event_digest) {
        throw new ControllerError('JOURNAL_INTEGRITY_FAILURE', 'journal did not confirm exact event digest');
      }
      kernel.markOutboxSealed(row.outbox_id);
      results.push({ outbox_id: row.outbox_id, event_id: event.event_id, sealed: true, ...receipt });
    } catch (error) {
      kernel.recordOutboxFailure(row.outbox_id, error.code || error.message || String(error));
      results.push({ outbox_id: row.outbox_id, event_id: event.event_id, sealed: false, code: error.code || 'JOURNAL_ERROR' });
    }
  }
  return results;
}
