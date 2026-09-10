'use strict';

const vr = require('./version-and-rollback-core.js');

// Compatibility shims are private to this new Export Freeze subject. They do not
// modify Version/Rollback source bytes or authority; the core module object is
// augmented only in this process before Export Freeze loads it.
if (typeof vr.stable !== 'function') vr.stable = vr.stableStringify;
if (typeof vr.validateAppendOnlyPreservation !== 'function') {
  vr.validateAppendOnlyPreservation = function validateAppendOnlyPreservation(currentState, proposedState) {
    const collections = {
      research_evidence_links: 'link_id',
      author_decisions: 'decision_id',
      integration_proposals: 'proposal_id',
      export_releases: 'release_id',
    };
    for (const [collection, idField] of Object.entries(collections)) {
      const oldMap = new Map();
      for (const item of currentState[collection]) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item[idField] || '').trim()) {
          const e = new Error(`INVALID_APPEND_ONLY_ENTRY:${collection}`); e.code = 'INVALID_APPEND_ONLY_ENTRY'; throw e;
        }
        oldMap.set(String(item[idField]), vr.digest(item));
      }
      const nextMap = new Map();
      for (const item of proposedState[collection]) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item[idField] || '').trim()) {
          const e = new Error(`INVALID_APPEND_ONLY_ENTRY:${collection}`); e.code = 'INVALID_APPEND_ONLY_ENTRY'; throw e;
        }
        const id = String(item[idField]);
        if (nextMap.has(id)) { const e = new Error(`DUPLICATE_APPEND_ONLY_ID:${collection}:${id}`); e.code = 'DUPLICATE_APPEND_ONLY_ID'; throw e; }
        nextMap.set(id, vr.digest(item));
      }
      for (const [id, d] of oldMap) {
        if (!nextMap.has(id)) { const e = new Error(`APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN:${collection}:${id}`); e.code = 'APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN'; throw e; }
        if (nextMap.get(id) !== d) { const e = new Error(`APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN:${collection}:${id}`); e.code = 'APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN'; throw e; }
      }
    }
    return true;
  };
}

module.exports = require('./export-freeze-core.js');
