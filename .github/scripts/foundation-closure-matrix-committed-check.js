'use strict';

/**
 * Fail closed when the checked-in Foundation disposition matrix is stale relative
 * to the live authority-selected matrix generator.
 *
 * The generator is the semantic source. This checker intentionally ignores prose
 * and timestamps and compares the durable projection surface humans act on:
 * inventory IDs, capability/requirement keys, canonical owners, row states,
 * disposition counts, selected authority identifiers, and exact next ACTIVE_GAP.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const GENERATOR = path.join(ROOT, '.github/scripts/foundation-closure-matrix.js');
const COMMITTED = path.join(ROOT, 'governance/census/FOUNDATION-CLOSURE-CENSUS-001-DISPOSITION-MATRIX.md');
const UNPOPULATED = 'UNPOPULATED';

function fail(message) {
  process.stderr.write(`FOUNDATION_MATRIX_COMMITTED_CHECK=FAIL ${message}\n`);
  process.exit(2);
}

function normalizedDisplayKey(row, displayKey) {
  const value = displayKey.trim();
  if (value === 'RESERVED' && row.module_key === row.requirement_or_capability_id) {
    return row.module_key;
  }
  return value;
}

function parseCommitted(markdown) {
  const rows = new Map();
  const rowPattern = /^\|\s*`([CP]\d{2})`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    const [, id, key, owner, state] = match;
    if (rows.has(id)) fail(`duplicate committed matrix row: ${id}`);
    rows.set(id, { id, key: key.trim(), owner: owner.trim(), state: state.trim() });
  }

  let next = null;
  const inlineNext = markdown.match(/\*\*Exact next ACTIVE_GAP:\s*`([^`]+)`/);
  if (inlineNext) next = inlineNext[1];
  if (!next) {
    const sectionNext = markdown.match(/^## Exact next ACTIVE_GAP\s*\n\s*\n?`([^`]+)`/m);
    if (sectionNext) next = sectionNext[1] === 'NONE' ? null : sectionNext[1];
  }

  return { rows, next };
}

function main() {
  let matrix;
  try {
    matrix = JSON.parse(execFileSync(process.execPath, [GENERATOR, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }));
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    fail(`live generator failed: ${detail}`);
  }

  if (!fs.existsSync(COMMITTED)) fail('committed matrix file absent');
  const markdown = fs.readFileSync(COMMITTED, 'utf8');
  const committed = parseCommitted(markdown);

  const expectedIds = new Set(matrix.rows.map((row) => row.requirement_or_capability_id));
  if (committed.rows.size !== matrix.rows.length) {
    fail(`row-count drift: committed=${committed.rows.size} live=${matrix.rows.length}`);
  }

  for (const row of matrix.rows) {
    const id = row.requirement_or_capability_id;
    const observed = committed.rows.get(id);
    if (!observed) fail(`current inventory row missing from committed matrix: ${id}`);
    const displayKey = normalizedDisplayKey(row, observed.key);
    if (displayKey !== row.module_key) {
      fail(`capability/requirement key drift for ${id}: committed=${observed.key} live=${row.module_key}`);
    }
    const expectedOwner = row.canonical_owner || UNPOPULATED;
    if (observed.owner !== expectedOwner) {
      fail(`owner drift for ${id}: committed=${observed.owner} live=${expectedOwner}`);
    }
    if (observed.state !== row.current_state) {
      fail(`state drift for ${id}: committed=${observed.state} live=${row.current_state}`);
    }
  }

  for (const id of committed.rows.keys()) {
    if (!expectedIds.has(id)) fail(`committed matrix contains non-current inventory row: ${id}`);
  }

  const committedCounts = {};
  for (const row of committed.rows.values()) {
    committedCounts[row.state] = (committedCounts[row.state] || 0) + 1;
  }
  for (const [state, expected] of Object.entries(matrix.counts)) {
    const observed = committedCounts[state] || 0;
    if (observed !== expected) fail(`state-count drift for ${state}: committed=${observed} live=${expected}`);
  }

  if (committed.next !== matrix.exact_next_active_gap) {
    fail(`next-gap drift: committed=${committed.next || 'NONE'} live=${matrix.exact_next_active_gap || 'NONE'}`);
  }

  for (const requiredId of [matrix.authority_id, matrix.topology_id, matrix.allocation_id, matrix.crosswalk_id]) {
    if (!markdown.includes(`\`${requiredId}\``)) {
      fail(`committed matrix missing current authority identifier: ${requiredId}`);
    }
  }

  process.stdout.write(`FOUNDATION_MATRIX_COMMITTED_CHECK=PASS rows=${matrix.total_rows} next=${matrix.exact_next_active_gap || 'NONE'} inventory=${matrix.inventory_source}\n`);
}

main();
