'use strict';

/**
 * foundation-closure-matrix.js
 *
 * Executes SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001 against evidence that
 * actually exists on this ref, and emits the two artifacts the census declares:
 *
 *   1. a 100-percent disposition matrix over every censused module, using the
 *      census's own 15 required columns and 4 allowed states
 *   2. an unresolved-gap successor register
 *
 * Design rule, taken from the census itself: "Missing owner, route, contract,
 * canonical writer, authority boundary, failure semantics, evidence target or
 * acceptance target is an ACTIVE_GAP, not completion." This script therefore
 * marks a column UNPOPULATED unless a real artifact backs it. It will not infer
 * completion from planning volume, and it will not fabricate ownership,
 * authority or evidence. A mostly-gap matrix is the correct output of an honest
 * first pass, not a defect in the script.
 *
 *   node .github/scripts/foundation-closure-matrix.js
 *   node .github/scripts/foundation-closure-matrix.js --json
 *   node .github/scripts/foundation-closure-matrix.js --out governance/census/MATRIX.md
 *   node .github/scripts/foundation-closure-matrix.js --summary
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CENSUS = 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json';
const P6 = 'governance/census/SYSTEM-MASTER-COMPLETION-CENSUS-002-P6-PRODUCT-MODULE-ALLOCATION.json';
const CATALOG = 'governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-003.json';
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const CONTRACT_DIR = 'governance/contracts';

// The eight census gap-forcing sections, as they appear as markdown headings in
// FOUNDATION-CONTRACT-TEMPLATE-001. A section counts as populated only when it
// has real prose: the template's own UNPOPULATED marker, a TBD, or a bare
// placeholder all leave it unpopulated, because the census forbids inferring
// completion from planning volume.
const CONTRACT_SECTIONS = [
  ['contract_or_interface', /^##\s*1\./m],
  ['ingress_routes', /^##\s*2\./m],
  ['egress_routes', /^##\s*3\./m],
  ['persistence_or_canonical_writer', /^##\s*4\./m],
  ['dependencies', /^##\s*5\./m],
  ['failure_semantics', /^##\s*6\./m],
  ['evidence_target', /^##\s*7\./m],
  ['test_or_acceptance_target', /^##\s*8\./m]
];
const PLACEHOLDER = /^(UNPOPULATED|TBD|N\/A|NONE|-|\*\*UNPOPULATED\*\*)$/i;

// Piping to head/less closes stdout early; that is normal shell use, not an error.
process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); throw error; });

function contractPath(key) {
  return `${CONTRACT_DIR}/${key}-FOUNDATION-CONTRACT-001.md`;
}

/** Read a contract and report which required sections carry real content. */
function readContract(key) {
  const rel = contractPath(key);
  if (!exists(rel)) return { present: false, populated: new Set(), missing: CONTRACT_SECTIONS.map((s) => s[0]) };
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const headings = [...text.matchAll(/^##\s+.*$/gm)];
  const populated = new Set();
  for (const [name, re] of CONTRACT_SECTIONS) {
    const start = text.search(re);
    if (start < 0) continue;
    const next = headings.find((h) => h.index > start);
    const body = text
      .slice(start, next ? next.index : text.length)
      .split('\n').slice(1)                      // drop the heading itself
      .filter((line) => !line.trim().startsWith('<!--') && line.trim() !== '')
      .join('\n').trim();
    if (body && !PLACEHOLDER.test(body)) populated.add(name);
  }
  return {
    present: true,
    path: rel,
    populated,
    missing: CONTRACT_SECTIONS.map((s) => s[0]).filter((n) => !populated.has(n))
  };
}

const UNPOPULATED = 'UNPOPULATED';

const STATE = {
  COMPLETE: 'COMPLETE_WITH_EVIDENCE',
  GAP: 'ACTIVE_GAP',
  BLOCKED: 'DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE',
  OUT: 'EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY'
};

// Columns the census requires. Order is authoritative.
const COLUMNS = [
  'requirement_or_capability_id',
  'canonical_owner',
  'authority_source',
  'contract_or_interface',
  'ingress_routes',
  'egress_routes',
  'persistence_or_canonical_writer',
  'dependencies',
  'failure_semantics',
  'evidence_target',
  'test_or_acceptance_target',
  'current_state',
  'gap_or_blocker',
  'successor',
  'evidence_pointer'
];

// Columns whose absence forces ACTIVE_GAP under the census's no-silent-gap rule.
const GAP_FORCING = [
  'canonical_owner',
  'contract_or_interface',
  'ingress_routes',
  'egress_routes',
  'persistence_or_canonical_writer',
  'failure_semantics',
  'evidence_target',
  'test_or_acceptance_target'
];

// Modules whose completion depends on a device, human, private corpus or
// external provider. These are DURABLY_BLOCKED, which is a real disposition,
// not a gap to be closed by more engineering.
const NATIVE_OR_EXTERNAL = new Set(['PHONEOPS', 'PHYSICALAI', 'LOCALAI', 'CAD', 'GEO']);

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function ownerFromDisposition(disposition) {
  if (!disposition) return UNPOPULATED;
  if (disposition.startsWith('SYSTEM_MASTER/')) return disposition.split('__')[0];
  return UNPOPULATED; // OWNER_REGISTRATION_REQUIRED / OWNER_SELECTION_REQUIRED == no owner yet
}

// The allocation registry named by CURRENT-AUTHORITY is the authoritative owner
// source once ownership has been ratified. P6 remains the fallback, because an
// unratified estate must still census honestly.
function loadOwnership() {
  const owners = new Map();
  const deferred = new Map();
  try {
    const authority = readJson(AUTHORITY);
    const rel = authority.headless_tool_owner_allocation;
    if (!rel || !exists(rel)) return { owners, deferred, source: null };
    const alloc = readJson(rel);
    for (const row of alloc.module_ownership || []) owners.set(row.module_key, row.owner_path);
    for (const row of alloc.explicitly_deferred_modules || []) deferred.set(row.module_key, row.disposition);
    return { owners, deferred, source: rel };
  } catch {
    return { owners, deferred, source: null };
  }
}

function classify(module, owner, deferredDisposition) {
  const standing = module.current_standing || '';
  const disposition = module.owner_disposition || '';

  if (deferredDisposition) {
    return { state: STATE.OUT, reason: `Explicitly deferred by ratified allocation authority (${deferredDisposition}).` };
  }

  if (disposition.startsWith('ABSORBED_NO_STANDALONE') || standing.startsWith('ABSORBED_NO_STANDALONE')) {
    return { state: STATE.OUT, reason: 'Absorbed into another foundation; no standalone module owed.' };
  }
  if (disposition === 'DEFERRED_OPTIONAL' || standing === 'DEFERRED_OPTIONAL') {
    return { state: STATE.OUT, reason: 'Deferred by explicit allocation authority.' };
  }
  if (standing.includes('NOT_REQUIRED_UNLESS_CONCRETE_NEED_EMERGES')) {
    return { state: STATE.OUT, reason: 'Dedicated implementation not owed absent a concrete need.' };
  }
  if (NATIVE_OR_EXTERNAL.has(module.module_key)) {
    return { state: STATE.BLOCKED, reason: 'Completion requires native device, external provider or private evidence not obtainable from repository evidence.' };
  }
  if (!owner || owner === UNPOPULATED) {
    return { state: STATE.GAP, reason: `No canonical owner registered (${disposition || 'no disposition'}).` };
  }
  return { state: STATE.GAP, reason: `Owner registered but foundation columns unpopulated (${standing || 'no standing'}).` };
}

function buildRow(module, ownership) {
  const owner = ownership.owners.get(module.module_key) || ownerFromDisposition(module.owner_disposition);
  const deferredDisposition = ownership.deferred.get(module.module_key) || null;
  const contract = readContract(module.module_key);
  let { state, reason } = classify(module, owner, deferredDisposition);

  // A module with an owner AND a fully populated contract is the only path to
  // COMPLETE_WITH_EVIDENCE. This is what lets the count move.
  if (state === STATE.GAP && contract.present) {
    if (contract.missing.length === 0) {
      state = STATE.COMPLETE;
      reason = `Foundation contract complete: ${contract.path}`;
    } else {
      reason = `Contract exists but ${contract.missing.length}/8 required sections unpopulated: ${contract.missing.join(', ')}`;
    }
  }

  const row = {
    requirement_or_capability_id: module.module_id,
    module_key: module.module_key,
    module_name: module.module_name,
    canonical_owner: owner,
    authority_source: ownership.source
      ? `${ownership.source} (ratified ownership); ${AUTHORITY} (pointer of record)`
      : `${P6} (census allocation); ${AUTHORITY} (pointer of record)`,
    contract_or_interface: contract.populated.has('contract_or_interface') ? contract.path : UNPOPULATED,
    ingress_routes: contract.populated.has('ingress_routes') ? contract.path : UNPOPULATED,
    egress_routes: contract.populated.has('egress_routes') ? contract.path : UNPOPULATED,
    persistence_or_canonical_writer: contract.populated.has('persistence_or_canonical_writer') ? contract.path : UNPOPULATED,
    dependencies: contract.populated.has('dependencies') ? contract.path : (module.interaction_direction || UNPOPULATED),
    failure_semantics: contract.populated.has('failure_semantics') ? contract.path : UNPOPULATED,
    evidence_target: contract.populated.has('evidence_target') ? contract.path : UNPOPULATED,
    test_or_acceptance_target: contract.populated.has('test_or_acceptance_target') ? contract.path : UNPOPULATED,
    current_state: state,
    gap_or_blocker: reason,
    successor: UNPOPULATED,
    evidence_pointer: contract.present ? contract.path : (module.evidence_summary ? `${P6}#modules[${module.sequence - 1}]` : UNPOPULATED),
    _historical_standing: module.current_standing || UNPOPULATED,
    _next_disposition: module.next_disposition || UNPOPULATED
  };

  row._unpopulated_required = GAP_FORCING.filter((c) => row[c] === UNPOPULATED);
  return row;
}

/** Platform requirements are censused alongside modules once the crosswalk is ratified. */
function platformRows() {
  let crosswalkRel = null;
  try {
    crosswalkRel = readJson(AUTHORITY).capability_crosswalk;
  } catch { /* handled by caller */ }
  if (!crosswalkRel || !exists(crosswalkRel)) return { rows: [], source: null };

  const crosswalk = readJson(crosswalkRel);
  const rows = (crosswalk.platform_requirements || []).map((entry) => {
    const contract = readContract(entry.platform_id);
    const owner = entry.owner_path || UNPOPULATED;
    // A requirement absorbed into a capability entry is not a gap: the work is
    // owed, but by the absorbing owner, and counting it twice would overstate
    // the surface.
    if (entry.disposition === 'ABSORBED') {
      const absorbedRow = {
        requirement_or_capability_id: entry.platform_id,
        module_key: entry.platform_id,
        module_name: entry.requirement,
        canonical_owner: owner,
        authority_source: `${crosswalkRel} (ratified crosswalk)`,
        contract_or_interface: UNPOPULATED, ingress_routes: UNPOPULATED, egress_routes: UNPOPULATED,
        persistence_or_canonical_writer: UNPOPULATED, dependencies: UNPOPULATED,
        failure_semantics: UNPOPULATED, evidence_target: UNPOPULATED, test_or_acceptance_target: UNPOPULATED,
        current_state: STATE.OUT,
        gap_or_blocker: `Absorbed into ${entry.absorbed_into} by ratified decision: ${entry.absorption_rationale}`,
        successor: entry.absorbed_into,
        evidence_pointer: crosswalkRel,
        _historical_standing: 'PLATFORM_REQUIREMENT_ABSORBED',
        _next_disposition: UNPOPULATED,
        _entry_kind: 'PLATFORM',
        _unpopulated_required: []
      };
      return absorbedRow;
    }
    let state = STATE.GAP;
    let reason = contract.present
      ? `Contract exists but ${contract.missing.length}/8 required sections unpopulated: ${contract.missing.join(', ')}`
      : `No foundation contract at ${contractPath(entry.platform_id)}.`;
    if (contract.present && contract.missing.length === 0) {
      state = STATE.COMPLETE;
      reason = `Foundation contract complete: ${contract.path}`;
    }
    const row = {
      requirement_or_capability_id: entry.platform_id,
      module_key: entry.platform_id,
      module_name: entry.requirement,
      canonical_owner: owner,
      authority_source: `${crosswalkRel} (ratified crosswalk)`,
      contract_or_interface: contract.populated.has('contract_or_interface') ? contract.path : UNPOPULATED,
      ingress_routes: contract.populated.has('ingress_routes') ? contract.path : UNPOPULATED,
      egress_routes: contract.populated.has('egress_routes') ? contract.path : UNPOPULATED,
      persistence_or_canonical_writer: contract.populated.has('persistence_or_canonical_writer') ? contract.path : UNPOPULATED,
      dependencies: contract.populated.has('dependencies') ? contract.path : (entry.implementation || UNPOPULATED),
      failure_semantics: contract.populated.has('failure_semantics') ? contract.path : UNPOPULATED,
      evidence_target: contract.populated.has('evidence_target') ? contract.path : UNPOPULATED,
      test_or_acceptance_target: contract.populated.has('test_or_acceptance_target') ? contract.path : UNPOPULATED,
      current_state: state,
      gap_or_blocker: reason,
      successor: UNPOPULATED,
      evidence_pointer: contract.present ? contract.path : (entry.implementation || UNPOPULATED),
      _historical_standing: 'PLATFORM_REQUIREMENT',
      _next_disposition: UNPOPULATED,
      _entry_kind: 'PLATFORM'
    };
    row._unpopulated_required = GAP_FORCING.filter((c) => row[c] === UNPOPULATED);
    return row;
  });
  return { rows, source: crosswalkRel };
}

function scopeCoverage(census) {
  // The census declares 10 scope areas. Report honestly which have a source
  // artifact on this ref and which have none.
  const crosswalkPresent = (() => {
    const hits = [];
    const roots = ['governance', 'system-master', 'qualification'];
    const idRe = /\b(C[0-4][0-9]|P0[0-9]|P1[0-5])\b/;
    const walk = (dir) => {
      let entries = [];
      try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(json|md)$/.test(e.name)) {
          try {
            const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
            if (rel === CENSUS) continue;
            // A crosswalk DEFINES many distinct identifiers. A document that merely
            // mentions the range in prose is not a crosswalk — this guard exists
            // because the first version of this detector was fooled by an obligation
            // statement describing the missing crosswalk.
            const distinct = new Set((text.match(/\b(C[0-4][0-9]|P0[0-9]|P1[0-5])\b/g) || []));
            if (distinct.size >= 10) hits.push(rel);
          } catch { /* unreadable file is not evidence */ }
        }
      }
    };
    roots.forEach(walk);
    return hits;
  })();

  return census.scope.map((area, i) => {
    let source = null;
    if (i === 0) source = crosswalkPresent.length ? crosswalkPresent.slice(0, 3).join(', ') : null;
    if (i === 1) source = exists(P6) ? P6 : null;
    // Scope areas 3-10 describe route, transaction, writer, boundary, evidence,
    // failure, test and release semantics. No per-module artifact carries them.
    return {
      scope_index: i + 1,
      area,
      source: source || 'NO SOURCE ARTIFACT ON THIS REF',
      covered: Boolean(source)
    };
  });
}

function build() {
  for (const rel of [CENSUS, P6, CATALOG, AUTHORITY]) {
    if (!exists(rel)) {
      process.stderr.write(`FOUNDATION_MATRIX=FAIL code=INPUT_ABSENT path=${rel}\n`);
      process.exit(2);
    }
  }
  const census = readJson(CENSUS);
  const p6 = readJson(P6);
  const catalog = readJson(CATALOG);

  const ownership = loadOwnership();
  const platform = platformRows();
  const moduleRows = p6.modules.map((m) => buildRow(m, ownership));
  for (const r of moduleRows) r._entry_kind = r._entry_kind || 'MODULE';
  const rows = [...moduleRows, ...platform.rows].sort((a, b) => a.requirement_or_capability_id.localeCompare(b.requirement_or_capability_id));

  const counts = Object.values(STATE).reduce((acc, s) => {
    acc[s] = rows.filter((r) => r.current_state === s).length;
    return acc;
  }, {});

  const register = rows
    .filter((r) => r.current_state === STATE.GAP)
    .map((r) => ({
      gap_id: `FCC-001-GAP-${r.requirement_or_capability_id}`,
      module_key: r.module_key,
      canonical_owner: r.canonical_owner,
      blocker: r.gap_or_blocker,
      unpopulated_required_columns: r._unpopulated_required,
      declared_next_disposition: r._next_disposition
    }));

  return {
    generated_at: new Date().toISOString(),
    census_id: census.census_id,
    census_status: census.status,
    census_purpose: census.purpose,
    allowed_states: census.allowed_states,
    forbidden_claims: census.forbidden_claims,
    required_columns: COLUMNS,
    ownership_source: ownership.source || 'UNRATIFIED — falling back to P6 census allocation',
    crosswalk_source: platform.source || 'UNRATIFIED — platform requirements not censused',
    module_count: rows.length,
    module_entries: moduleRows.length,
    platform_entries: platform.rows.length,
    catalog_module_keys: catalog.historical_inventory?.count ?? null,
    counts,
    completion_percent: rows.length ? Math.round((counts[STATE.COMPLETE] / rows.length) * 100) : 0,
    scope_coverage: scopeCoverage(census),
    rows,
    unresolved_gap_successor_register: register
  };
}

function renderMarkdown(m) {
  const L = [];
  L.push('# Foundation Closure Census 001 — Disposition Matrix');
  L.push('');
  L.push(`Generated ${m.generated_at} · census status \`${m.census_status}\``);
  L.push('');
  L.push(`Ownership source: \`${m.ownership_source}\``);
  L.push('');
  L.push(`Crosswalk source: \`${m.crosswalk_source}\``);
  L.push('');
  L.push(`Entries: ${m.module_entries} capability · ${m.platform_entries} platform`);
  L.push('');
  L.push('> Produced under the census no-silent-gap rule. A column is UNPOPULATED unless a');
  L.push('> real artifact on this ref backs it. Completion is never inferred from planning volume.');
  L.push('');
  L.push('## Disposition summary');
  L.push('');
  L.push('| State | Modules |');
  L.push('| --- | ---: |');
  for (const [k, v] of Object.entries(m.counts)) L.push(`| \`${k}\` | ${v} |`);
  L.push(`| **Total** | **${m.module_count}** |`);
  L.push('');
  L.push(`**Foundation 1.0 closure: ${m.completion_percent}% complete with evidence.**`);
  L.push('');
  L.push('## Scope coverage');
  L.push('');
  L.push('The census declares 10 scope areas. Source artifacts on this ref:');
  L.push('');
  L.push('| # | Scope area | Source |');
  L.push('| ---: | --- | --- |');
  for (const s of m.scope_coverage) {
    L.push(`| ${s.scope_index} | ${s.area} | ${s.covered ? `\`${s.source}\`` : '**none**'} |`);
  }
  L.push('');
  L.push('## Matrix');
  L.push('');
  L.push('| Module | Owner | State | Blocker | Unpopulated required columns |');
  L.push('| --- | --- | --- | --- | ---: |');
  for (const r of m.rows) {
    L.push(`| \`${r.requirement_or_capability_id}\` ${r.module_key} | ${r.canonical_owner} | ${r.current_state.replace(/_/g, ' ')} | ${r.gap_or_blocker} | ${r._unpopulated_required.length}/8 |`);
  }
  L.push('');
  L.push('## Unresolved gap successor register');
  L.push('');
  L.push(`${m.unresolved_gap_successor_register.length} entries.`);
  L.push('');
  for (const g of m.unresolved_gap_successor_register) {
    L.push(`### \`${g.gap_id}\``);
    L.push(`- **Owner:** ${g.canonical_owner}`);
    L.push(`- **Blocker:** ${g.blocker}`);
    L.push(`- **Unpopulated:** ${g.unpopulated_required_columns.join(', ')}`);
    if (g.declared_next_disposition !== UNPOPULATED) L.push(`- **Declared next:** ${g.declared_next_disposition}`);
    L.push('');
  }
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const m = build();
  if (args.includes('--summary')) {
    process.stdout.write(`${JSON.stringify({ counts: m.counts, completion_percent: m.completion_percent, gaps: m.unresolved_gap_successor_register.length, scope_uncovered: m.scope_coverage.filter((s) => !s.covered).length }, null, 2)}\n`);
    return;
  }
  const text = args.includes('--json') ? `${JSON.stringify(m, null, 2)}\n` : `${renderMarkdown(m)}\n`;
  const outIndex = args.indexOf('--out');
  if (outIndex >= 0 && args[outIndex + 1]) {
    const p = path.resolve(ROOT, args[outIndex + 1]);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
    process.stderr.write(`FOUNDATION_MATRIX=WROTE path=${args[outIndex + 1]}\n`);
  } else {
    process.stdout.write(text);
  }
}

main();
