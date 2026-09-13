'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const CENSUS = 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json';
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const CONTRACT_DIR = 'governance/contracts';
const UNPOPULATED = 'UNPOPULATED';
const STATE = {
  COMPLETE: 'COMPLETE_WITH_EVIDENCE',
  GAP: 'ACTIVE_GAP',
  BLOCKED: 'DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE',
  OUT: 'EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY'
};
const SECTIONS = [
  ['contract_or_interface', /^##\s*1\./m],
  ['ingress_routes', /^##\s*2\./m],
  ['egress_routes', /^##\s*3\./m],
  ['persistence_or_canonical_writer', /^##\s*4\./m],
  ['dependencies', /^##\s*5\./m],
  ['failure_semantics', /^##\s*6\./m],
  ['evidence_target', /^##\s*7\./m],
  ['test_or_acceptance_target', /^##\s*8\./m]
];
const GAP_FORCING = SECTIONS.map(([name]) => name);
const PLACEHOLDER = /^(UNPOPULATED|TBD|N\/A|NONE|-|\*\*UNPOPULATED\*\*)$/i;
const BLOCKED_KEYS = new Set(['GEO', 'LOCALAI']);

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

function relExists(rel) {
  return Boolean(rel) && fs.existsSync(path.join(ROOT, rel));
}
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function contractPath(key) {
  return `${CONTRACT_DIR}/${key}-FOUNDATION-CONTRACT-001.md`;
}
function readContract(rel) {
  if (!relExists(rel)) return { present: false, path: rel || null, populated: new Set(), missing: [...GAP_FORCING] };
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const headings = [...text.matchAll(/^##\s+.*$/gm)];
  const populated = new Set();
  for (const [name, re] of SECTIONS) {
    const start = text.search(re);
    if (start < 0) continue;
    const next = headings.find((heading) => heading.index > start);
    const body = text.slice(start, next ? next.index : text.length)
      .split('\n').slice(1).join('\n')
      .replace(/<!--[\s\S]*?-->/g, '').trim();
    if (body && !PLACEHOLDER.test(body)) populated.add(name);
  }
  return { present: true, path: rel, populated, missing: GAP_FORCING.filter((name) => !populated.has(name)) };
}
function rowBase({ id, key, name, owner, authoritySource, contract, state, reason, successor = UNPOPULATED, evidencePointer, kind }) {
  const row = {
    requirement_or_capability_id: id,
    module_key: key || id,
    module_name: name || key || id,
    canonical_owner: owner || UNPOPULATED,
    authority_source: authoritySource,
    contract_or_interface: contract?.populated.has('contract_or_interface') ? contract.path : UNPOPULATED,
    ingress_routes: contract?.populated.has('ingress_routes') ? contract.path : UNPOPULATED,
    egress_routes: contract?.populated.has('egress_routes') ? contract.path : UNPOPULATED,
    persistence_or_canonical_writer: contract?.populated.has('persistence_or_canonical_writer') ? contract.path : UNPOPULATED,
    dependencies: contract?.populated.has('dependencies') ? contract.path : UNPOPULATED,
    failure_semantics: contract?.populated.has('failure_semantics') ? contract.path : UNPOPULATED,
    evidence_target: contract?.populated.has('evidence_target') ? contract.path : UNPOPULATED,
    test_or_acceptance_target: contract?.populated.has('test_or_acceptance_target') ? contract.path : UNPOPULATED,
    current_state: state,
    gap_or_blocker: reason,
    successor,
    evidence_pointer: evidencePointer || UNPOPULATED,
    _entry_kind: kind
  };
  row._unpopulated_required = state === STATE.OUT ? [] : GAP_FORCING.filter((column) => row[column] === UNPOPULATED);
  return row;
}
function capabilityRow(entry, authority, crosswalkRel) {
  const source = `${crosswalkRel} (canonical C00-C49 crosswalk); ${AUTHORITY} (pointer of record)`;
  const disposition = entry.disposition || '';
  if (disposition === 'RESERVED_UNALLOCATED') {
    return rowBase({ id: entry.capability_id, key: null, name: 'Reserved capability identifier', owner: null, authoritySource: source, contract: null, state: STATE.OUT, reason: 'Reserved unallocated capability identifier by canonical crosswalk authority.', evidencePointer: crosswalkRel, kind: 'CAPABILITY' });
  }
  if (disposition.startsWith('EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY')) {
    return rowBase({ id: entry.capability_id, key: entry.module_key, name: entry.module_key, owner: entry.owner_path, authoritySource: source, contract: null, state: STATE.OUT, reason: `Explicitly out of scope by canonical crosswalk authority (${disposition}).`, evidencePointer: crosswalkRel, kind: 'CAPABILITY' });
  }
  const rel = entry.capability_id === 'C40'
    ? (authority.website_building_foundation_contract || contractPath(entry.module_key))
    : contractPath(entry.module_key);
  const contract = readContract(rel);
  let state = STATE.GAP;
  let reason;
  if (BLOCKED_KEYS.has(entry.module_key)) {
    state = STATE.BLOCKED;
    reason = 'Completion requires native device, external provider or private evidence not obtainable from repository evidence.';
  } else if (!entry.owner_path) {
    reason = 'No canonical owner registered in the current crosswalk.';
  } else if (contract.present && contract.missing.length === 0) {
    state = STATE.COMPLETE;
    reason = `Foundation contract complete: ${contract.path}`;
  } else if (!contract.present) {
    reason = `No canonical Foundation contract at ${rel}.`;
  } else {
    reason = `Contract exists but ${contract.missing.length}/8 required sections unpopulated: ${contract.missing.join(', ')}`;
  }
  return rowBase({ id: entry.capability_id, key: entry.module_key, name: entry.module_key, owner: entry.owner_path, authoritySource: source, contract, state, reason, evidencePointer: contract.present ? contract.path : crosswalkRel, kind: 'CAPABILITY' });
}
function platformRow(entry, crosswalkRel) {
  const source = `${crosswalkRel} (canonical P00-P15 crosswalk); ${AUTHORITY} (pointer of record)`;
  if (entry.disposition === 'ABSORBED') {
    return rowBase({ id: entry.platform_id, key: entry.platform_id, name: entry.requirement, owner: entry.owner_path, authoritySource: source, contract: null, state: STATE.OUT, reason: `Absorbed into ${entry.absorbed_into} by canonical crosswalk authority.`, successor: entry.absorbed_into, evidencePointer: crosswalkRel, kind: 'PLATFORM' });
  }
  const rel = contractPath(entry.platform_id);
  const contract = readContract(rel);
  let state = STATE.GAP;
  let reason;
  if (contract.present && contract.missing.length === 0) {
    state = STATE.COMPLETE;
    reason = `Foundation contract complete: ${contract.path}`;
  } else if (!contract.present) {
    reason = `No Foundation contract at ${rel}.`;
  } else {
    reason = `Contract exists but ${contract.missing.length}/8 required sections unpopulated: ${contract.missing.join(', ')}`;
  }
  return rowBase({ id: entry.platform_id, key: entry.platform_id, name: entry.requirement, owner: entry.owner_path, authoritySource: source, contract, state, reason, evidencePointer: contract.present ? contract.path : (entry.implementation || crosswalkRel), kind: 'PLATFORM' });
}
function expected(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(2, '0')}`);
}
function assertCoverage(crosswalk) {
  const actualC = (crosswalk.capability_entries || []).map((entry) => entry.capability_id);
  const actualP = (crosswalk.platform_requirements || []).map((entry) => entry.platform_id);
  if (JSON.stringify(actualC) !== JSON.stringify(expected('C', 50))) throw new Error(`CAPABILITY_COVERAGE_INVALID actual=${actualC.join(',')}`);
  if (JSON.stringify(actualP) !== JSON.stringify(expected('P', 16))) throw new Error(`PLATFORM_COVERAGE_INVALID actual=${actualP.join(',')}`);
}
function build() {
  const census = readJson(CENSUS);
  const authority = readJson(AUTHORITY);
  const crosswalkRel = authority.capability_crosswalk;
  if (!relExists(crosswalkRel)) throw new Error(`CROSSWALK_ABSENT path=${crosswalkRel || UNPOPULATED}`);
  const crosswalk = readJson(crosswalkRel);
  assertCoverage(crosswalk);
  const capabilities = crosswalk.capability_entries.map((entry) => capabilityRow(entry, authority, crosswalkRel));
  const platforms = crosswalk.platform_requirements.map((entry) => platformRow(entry, crosswalkRel));
  const rows = [...capabilities, ...platforms];
  if (capabilities.length !== 50 || platforms.length !== 16 || rows.length !== 66) throw new Error(`CENSUS_CARDINALITY_INVALID capabilities=${capabilities.length} platform=${platforms.length} total=${rows.length}`);
  const counts = Object.values(STATE).reduce((result, state) => ({ ...result, [state]: rows.filter((row) => row.current_state === state).length }), {});
  const gaps = rows.filter((row) => row.current_state === STATE.GAP).map((row) => ({
    gap_id: `FCC-001-GAP-${row.requirement_or_capability_id}`,
    requirement_or_capability_id: row.requirement_or_capability_id,
    module_key: row.module_key,
    canonical_owner: row.canonical_owner,
    blocker: row.gap_or_blocker,
    unpopulated_required_columns: row._unpopulated_required
  }));
  return {
    census_id: census.census_id,
    census_status: census.status,
    census_purpose: census.purpose,
    authority_id: authority.authority_id,
    authority_effective_date: authority.effective_date,
    ownership_source: authority.headless_tool_owner_allocation || crosswalkRel,
    crosswalk_source: crosswalkRel,
    capability_entries: capabilities.length,
    platform_entries: platforms.length,
    module_count: rows.length,
    counts,
    completion_percent: Math.round((counts[STATE.COMPLETE] / rows.length) * 100),
    rows,
    unresolved_gap_successor_register: gaps,
    next_active_gap: gaps[0] || null
  };
}
function render(matrix) {
  const lines = [
    '# Foundation Closure Census 001 — Disposition Matrix', '',
    `Authority \`${matrix.authority_id}\` effective ${matrix.authority_effective_date} · census status \`${matrix.census_status}\``, '',
    `Ownership source: \`${matrix.ownership_source}\``, '',
    `Crosswalk source: \`${matrix.crosswalk_source}\``, '',
    `Entries: ${matrix.capability_entries} capability · ${matrix.platform_entries} platform · ${matrix.module_count} total`, '',
    '> Produced under the census no-silent-gap rule. C00-C49 and P00-P15 are derived directly from the current canonical crosswalk.', '',
    '## Disposition summary', '', '| State | Rows |', '| --- | ---: |'
  ];
  for (const [state, count] of Object.entries(matrix.counts)) lines.push(`| \`${state}\` | ${count} |`);
  lines.push(`| **Total** | **${matrix.module_count}** |`, '', `**Foundation 1.0 completion with evidence: ${matrix.completion_percent}%.**`, '', '## Matrix', '', '| ID | Capability / requirement | Owner | State | Blocker / evidence | Unpopulated required |', '| --- | --- | --- | --- | --- | ---: |');
  for (const row of matrix.rows) lines.push(`| \`${row.requirement_or_capability_id}\` | ${row.module_name} | ${row.canonical_owner} | ${row.current_state.replace(/_/g, ' ')} | ${row.gap_or_blocker} | ${row._unpopulated_required.length}/8 |`);
  lines.push('', '## Unresolved gap successor register', '', `${matrix.unresolved_gap_successor_register.length} ACTIVE_GAP entries remain.`, '', '| Gap | Capability | Owner | Unpopulated required |', '| --- | --- | --- | ---: |');
  for (const gap of matrix.unresolved_gap_successor_register) lines.push(`| \`${gap.gap_id}\` | ${gap.module_key} | ${gap.canonical_owner} | ${gap.unpopulated_required_columns.length}/8 |`);
  if (matrix.next_active_gap) lines.push('', '## Exact next ACTIVE_GAP', '', `\`${matrix.next_active_gap.requirement_or_capability_id}\` ${matrix.next_active_gap.module_key} — ${matrix.next_active_gap.blocker}`, '');
  return lines.join('\n');
}
function main() {
  try {
    const args = process.argv.slice(2);
    const matrix = build();
    if (args.includes('--summary')) {
      process.stdout.write(`${JSON.stringify({ counts: matrix.counts, completion_percent: matrix.completion_percent, gaps: matrix.unresolved_gap_successor_register.length, capability_entries: matrix.capability_entries, platform_entries: matrix.platform_entries, total_entries: matrix.module_count, next_active_gap: matrix.next_active_gap }, null, 2)}\n`);
      return;
    }
    const text = args.includes('--json') ? `${JSON.stringify(matrix, null, 2)}\n` : `${render(matrix)}\n`;
    const outIndex = args.indexOf('--out');
    if (outIndex >= 0 && args[outIndex + 1]) {
      const output = path.resolve(ROOT, args[outIndex + 1]);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, text, 'utf8');
      process.stderr.write(`FOUNDATION_MATRIX=WROTE path=${args[outIndex + 1]}\n`);
    } else {
      process.stdout.write(text);
    }
  } catch (error) {
    process.stderr.write(`FOUNDATION_MATRIX=FAIL ${error.message}\n`);
    process.exit(2);
  }
}
main();
