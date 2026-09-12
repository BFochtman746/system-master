'use strict';

const core = require('./canonical-parent-v2-f6-core.js');

// Private compatibility helper for the F9 rebind only. It does not change
// canonical-parent source bytes or authority; it supplies deterministic
// structural comparison to the rebind module in this process.
if (typeof core.stable !== 'function') {
  core.stable = function stable(value) {
    function normalize(v) {
      if (Array.isArray(v)) return v.map(normalize);
      if (v !== null && typeof v === 'object') {
        const out = {};
        for (const key of Object.keys(v).sort()) out[key] = normalize(v[key]);
        return out;
      }
      return v;
    }
    return JSON.stringify(normalize(value));
  };
}

module.exports = require('./export-freeze-v2-rebind.js');
