'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MATRIX_REL = 'governance/census/FOUNDATION-CLOSURE-CENSUS-001-DISPOSITION-MATRIX.md';
const AUTHORITY_REL = 'governance/CURRENT-AUTHORITY.json';
const GENERATOR = path.join(__dirname, 'foundation-closure-matrix.js');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function fail(message) {
  process.stderr.write(`FOUNDATION_MATRIX_FRESHNESS=FAIL ${message}\n`);
  process.exit(2);
}

try {
  const summary = JSON.parse(execFileSync(process.execPath, [GENERATOR, '--summary'], {
    cwd: ROOT,
    encoding: 'utf8'
  }));
  const authority = readJson(AUTHORITY_REL);
  const topology = readJson(authority.topology);
  const matrix = fs.readFileSync(path.join(ROOT, MATRIX_REL), 'utf8');

  const expectedAuthorityHeader = `\`${authority.authority_id}\` / \`${topology.topology_id}\``;
  if (!matrix.includes(expectedAuthorityHeader)) {
    fail(`AUTHORITY_HEADER expected=${expectedAuthorityHeader}`);
  }

  for (const [state, count] of Object.entries(summary.counts)) {
    const row = `| \`${state}\` | ${count} |`;
    if (!matrix.includes(row)) fail(`COUNT_MISMATCH state=${state} expected=${count}`);
  }

  const completionLine = `**Foundation 1.0 completion with evidence: ${summary.completion_percent}% (${summary.counts.COMPLETE_WITH_EVIDENCE} of ${summary.in_scope_rows} in-scope rows).**`;
  if (!matrix.includes(completionLine)) {
    fail(`COMPLETION_SUMMARY expected=${completionLine}`);
  }

  const gapLine = `${summary.gaps} \`ACTIVE_GAP\` rows remain.`;
  if (!matrix.includes(gapLine)) fail(`GAP_COUNT expected=${gapLine}`);

  const nextNeedle = summary.next
    ? `**Exact next ACTIVE_GAP: \`${summary.next}\``
    : '**Exact next ACTIVE_GAP: `NONE`';
  if (!matrix.includes(nextNeedle)) fail(`NEXT_GAP expected=${summary.next || 'NONE'}`);

  process.stdout.write(`FOUNDATION_MATRIX_FRESHNESS=PASS authority=${authority.authority_id} topology=${topology.topology_id} complete=${summary.counts.COMPLETE_WITH_EVIDENCE}/${summary.in_scope_rows} gaps=${summary.gaps} next=${summary.next || 'NONE'}\n`);
} catch (error) {
  fail(error.message);
}
