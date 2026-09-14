'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const CENSUS = 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json';
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const EVIDENCE_REGISTRY = 'governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json';
const CONTRACT_DIR = 'governance/contracts';
const UNPOPULATED = 'UNPOPULATED';

const STATE = {
  COMPLETE: 'COMPLETE_WITH_EVIDENCE',
  GAP: 'ACTIVE_GAP',
  BLOCKED: 'DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE',
  OUT: 'EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY'
};

const REQUIRED_SECTIONS = [
  ['contract_or_interface', /^##\s*1\./m],
  ['ingress_routes', /^##\s*2\./m],
  ['egress_routes', /^##\s*3\./m],
  ['persistence_or_canonical_writer', /^##\s*4\./m],
  ['dependencies', /^##\s*5\./m],
  ['failure_semantics', /^##\s*6\./m],
  ['evidence_target', /^##\s*7\./m],
  ['test_or_acceptance_target', /^##\s*8\./m],
  ['authority_boundary', /^##\s*9\./m]
];
const REQUIRED_FIELDS = REQUIRED_SECTIONS.map(([name]) => name);
const PLACEHOLDER = /^(UNPOPULATED|TBD|N\/A|NONE|-|\*\*UNPOPULATED\*\*)$/i;

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

function abs(rel) { return path.join(ROOT, rel); }
function exists(rel) { return Boolean(rel) && fs.existsSync(abs(rel)); }
function readText(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
function readJson(rel) { return JSON.parse(readText(rel)); }
function contractPath(key) { return `${CONTRACT_DIR}/${key}-FOUNDATION-CONTRACT-001.md`; }
function expected(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
}
function gitBlobSha(rel) {
  const body = fs.readFileSync(abs(rel));
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}

function readContract(rel) {
  if (!exists(rel)) return { present: false, path: rel || null, populated: new Set(), missing: [...REQUIRED_FIELDS] };
  const text = readText(rel);
  const headings = [...text.matchAll(/^##\s+.*$/gm)];
  const populated = new Set();
  for (const [name, regex] of REQUIRED_SECTIONS) {
    const start = text.search(regex);
    if (start < 0) continue;
    const next = headings.find((heading) => heading.index > start);
    const body = text.slice(start, next ? next.index : text.length)
      .split('\n').slice(1).join('\n')
      .replace(/<!--[\s\S]*?-->/g, '').trim();
    if (body && !PLACEHOLDER.test(body)) populated.add(name);
  }
  return { present: true, path: rel, populated, missing: REQUIRED_FIELDS.filter((name) => !populated.has(name)) };
}

function normalizeAllocation(allocation) {
  const owners = new Map();
  const deferred = new Map();
  for (const row of allocation.module_ownership || []) owners.set(row.module_key, row.owner_path);
  for (const row of allocation.explicitly_deferred_modules || []) deferred.set(row.module_key, row.disposition);
  return { owners, deferred };
}

function evidenceMap(registry) {
  const map = new Map();
  for (const entry of registry.entries || []) {
    if (!entry.requirement_or_capability_id) throw new Error('EVIDENCE_ENTRY_ID_ABSENT');
    if (map.has(entry.requirement_or_capability_id)) throw new Error(`DUPLICATE_EVIDENCE_ENTRY ${entry.requirement_or_capability_id}`);
    map.set(entry.requirement_or_capability_id, entry);
  }
  return map;
}

function validateEvidenceReceipt(id, owner, authority, receipt) {
  if (!receipt) return { proven: false, blocker: false, reason: 'Contract may be populated, but no Foundation evidence receipt is registered.', pointers: [] };
  if (receipt.authority_id !== authority.authority_id) return { proven: false, blocker: false, reason: `Evidence receipt is stale: ${receipt.authority_id || 'ABSENT'} != ${authority.authority_id}.`, pointers: [EVIDENCE_REGISTRY] };
  if (receipt.owner_path !== owner) return { proven: false, blocker: false, reason: `Evidence owner mismatch: ${receipt.owner_path || 'ABSENT'} != ${owner}.`, pointers: [EVIDENCE_REGISTRY] };
  if (!Array.isArray(receipt.subjects) || receipt.subjects.length === 0) return { proven: false, blocker: false, reason: 'Evidence receipt has no exact subject bindings.', pointers: [EVIDENCE_REGISTRY] };
  for (const subject of receipt.subjects) {
    if (!subject.path || !exists(subject.path)) return { proven: false, blocker: false, reason: `Evidence subject is absent: ${subject.path || 'UNPOPULATED'}.`, pointers: [EVIDENCE_REGISTRY] };
    const actual = gitBlobSha(subject.path);
    if (actual !== subject.git_blob_sha) return { proven: false, blocker: false, reason: `Evidence subject drift: ${subject.path} expected=${subject.git_blob_sha} actual=${actual}.`, pointers: [EVIDENCE_REGISTRY, subject.path] };
  }
  if (!Array.isArray(receipt.evidence_refs) || receipt.evidence_refs.length === 0) return { proven: false, blocker: false, reason: 'Evidence receipt has no evidence references.', pointers: [EVIDENCE_REGISTRY] };
  if (receipt.status === 'PASS') return { proven: true, blocker: false, reason: 'Current-authority Foundation evidence receipt PASS with exact subject bindings.', pointers: [EVIDENCE_REGISTRY, ...receipt.evidence_refs] };
  if (receipt.status === 'BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE') return { proven: false, blocker: true, reason: 'Repository-solvable obligations are evidence-complete; remaining dependency is explicitly external/human/private/native.', pointers: [EVIDENCE_REGISTRY, ...receipt.evidence_refs] };
  return { proven: false, blocker: false, reason: `Evidence receipt is not PASS: status=${receipt.status || 'ABSENT'}.`, pointers: [EVIDENCE_REGISTRY, ...receipt.evidence_refs] };
}

function assertCoverage(crosswalk) {
  const actualC = (crosswalk.capability_entries || []).map((entry) => entry.capability_id);
  const actualP = (crosswalk.platform_requirements || []).map((entry) => entry.platform_id);
  if (JSON.stringify(actualC) !== JSON.stringify(expected('C', 50))) throw new Error(`CAPABILITY_COVERAGE_INVALID actual=${actualC.join(',')}`);
  if (JSON.stringify(actualP) !== JSON.stringify(expected('P', 16))) throw new Error(`PLATFORM_COVERAGE_INVALID actual=${actualP.join(',')}`);
}

function baseRow({ id, key, name, owner, authoritySource, contract, state, reason, successor = UNPOPULATED, evidencePointers = [], kind }) {
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
    authority_boundary: contract?.populated.has('authority_boundary') ? contract.path : UNPOPULATED,
    current_state: state,
    gap_or_blocker: reason,
    successor,
    evidence_pointer: evidencePointers.length ? evidencePointers.join('; ') : UNPOPULATED,
    _entry_kind: kind
  };
  row._unpopulated_required = state === STATE.OUT ? [] : REQUIRED_FIELDS.filter((field) => row[field] === UNPOPULATED);
  return row;
}

function classifyOwned({ id, key, name, owner, contract, source, authority, receipts, kind }) {
  if (!owner) return baseRow({ id, key, name, owner, authoritySource: source, contract, state: STATE.GAP, reason: 'No canonical owner registered.', evidencePointers: [], kind });
  if (!contract.present) return baseRow({ id, key, name, owner, authoritySource: source, contract, state: STATE.GAP, reason: `No canonical Foundation contract at ${contract.path}.`, evidencePointers: [], kind });
  if (contract.missing.length) return baseRow({ id, key, name, owner, authoritySource: source, contract, state: STATE.GAP, reason: `Contract exists but ${contract.missing.length}/9 required sections unpopulated: ${contract.missing.join(', ')}`, evidencePointers: [contract.path], kind });
  const evidence = validateEvidenceReceipt(id, owner, authority, receipts.get(id));
  if (evidence.blocker) return baseRow({ id, key, name, owner, authoritySource: source, contract, state: STATE.BLOCKED, reason: evidence.reason, evidencePointers: [contract.path, ...evidence.pointers], kind });
  return baseRow({ id, key, name, owner, authoritySource: source, contract, state: evidence.proven ? STATE.COMPLETE : STATE.GAP, reason: evidence.reason, evidencePointers: [contract.path, ...evidence.pointers], kind });
}

function capabilityRow(entry, context) {
  const { authority, crosswalkRel, allocationRel, owners, deferred, receipts } = context;
  const source = `${crosswalkRel}; ${allocationRel}; ${AUTHORITY}`;
  const disposition = entry.disposition || '';
  if (disposition === 'RESERVED_UNALLOCATED') {
    return baseRow({ id: entry.capability_id, key: null, name: 'Reserved capability identifier', owner: null, authoritySource: source, contract: null, state: STATE.OUT, reason: 'Reserved unallocated capability identifier by canonical crosswalk authority.', evidencePointers: [crosswalkRel], kind: 'CAPABILITY' });
  }
  if (disposition.startsWith('EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY')) {
    const allocationDisposition = deferred.get(entry.module_key);
    if (allocationDisposition !== disposition) throw new Error(`DEFERRED_DISPOSITION_MISMATCH ${entry.capability_id} crosswalk=${disposition} allocation=${allocationDisposition || 'ABSENT'}`);
    return baseRow({ id: entry.capability_id, key: entry.module_key, name: entry.module_key, owner: entry.owner_path, authoritySource: source, contract: null, state: STATE.OUT, reason: `Explicitly out of scope by canonical crosswalk and owner-allocation authority (${disposition}).`, evidencePointers: [crosswalkRel, allocationRel], kind: 'CAPABILITY' });
  }
  const allocationOwner = owners.get(entry.module_key);
  if (allocationOwner !== entry.owner_path) throw new Error(`OWNER_MISMATCH ${entry.capability_id} key=${entry.module_key} crosswalk=${entry.owner_path || 'ABSENT'} allocation=${allocationOwner || 'ABSENT'}`);
  const rel = entry.capability_id === 'C40' ? (authority.website_building_foundation_contract || contractPath(entry.module_key)) : contractPath(entry.module_key);
  return classifyOwned({ id: entry.capability_id, key: entry.module_key, name: entry.module_key, owner: entry.owner_path, contract: readContract(rel), source, authority, receipts, kind: 'CAPABILITY' });
}

function platformRow(entry, context) {
  const { authority, crosswalkRel, receipts } = context;
  const source = `${crosswalkRel}; ${AUTHORITY}`;
  if (entry.disposition === 'ABSORBED') {
    return baseRow({ id: entry.platform_id, key: entry.platform_id, name: entry.requirement, owner: entry.owner_path, authoritySource: source, contract: null, state: STATE.OUT, reason: `Absorbed into ${entry.absorbed_into} by canonical crosswalk authority.`, successor: entry.absorbed_into, evidencePointers: [crosswalkRel], kind: 'PLATFORM' });
  }
  return classifyOwned({ id: entry.platform_id, key: entry.platform_id, name: entry.requirement, owner: entry.owner_path, contract: readContract(contractPath(entry.platform_id)), source, authority, receipts, kind: 'PLATFORM' });
}

function rankGap(row) {
  const ownerPriority = {
    'SYSTEM_MASTER/CORE': 0,
    'SYSTEM_MASTER/PROGRAMMING': 1,
    'SYSTEM_MASTER/DOCUMENTS': 2,
    'SYSTEM_MASTER/SPREADSHEET_DATA': 3,
    'SYSTEM_MASTER/RESEARCH_KNOWLEDGE': 4,
    'SYSTEM_MASTER/CONNECTED_ACTIONS': 5,
    'SYSTEM_MASTER/MEDIA': 6,
    'SYSTEM_MASTER/LEARNING': 7,
    'SYSTEM_MASTER/BOOK': 8
  };
  const platformPriority = row._entry_kind === 'PLATFORM' ? 0 : 1;
  const numeric = Number(row.requirement_or_capability_id.slice(1));
  return [platformPriority, ownerPriority[row.canonical_owner] ?? 99, Number.isFinite(numeric) ? numeric : 999];
}
function compareRank(a, b) {
  const ar = rankGap(a); const br = rankGap(b);
  for (let i = 0; i < ar.length; i += 1) {
    if (ar[i] !== br[i]) return ar[i] - br[i];
  }
  return a.requirement_or_capability_id.localeCompare(b.requirement_or_capability_id);
}

function build() {
  const census = readJson(CENSUS);
  const authority = readJson(AUTHORITY);
  const crosswalkRel = authority.capability_crosswalk;
  const allocationRel = authority.headless_tool_owner_allocation;
  if (!exists(crosswalkRel)) throw new Error(`CROSSWALK_ABSENT path=${crosswalkRel || UNPOPULATED}`);
  if (!exists(allocationRel)) throw new Error(`OWNER_ALLOCATION_ABSENT path=${allocationRel || UNPOPULATED}`);
  if (!exists(EVIDENCE_REGISTRY)) throw new Error(`EVIDENCE_REGISTRY_ABSENT path=${EVIDENCE_REGISTRY}`);
  const crosswalk = readJson(crosswalkRel);
  const allocation = readJson(allocationRel);
  const registry = readJson(EVIDENCE_REGISTRY);
  if (registry.authority_id !== authority.authority_id) throw new Error(`EVIDENCE_REGISTRY_AUTHORITY_MISMATCH registry=${registry.authority_id || 'ABSENT'} authority=${authority.authority_id}`);
  assertCoverage(crosswalk);
  const { owners, deferred } = normalizeAllocation(allocation);
  const receipts = evidenceMap(registry);
  const context = { authority, crosswalkRel, allocationRel, owners, deferred, receipts };
  const capabilities = crosswalk.capability_entries.map((entry) => capabilityRow(entry, context));
  const platforms = crosswalk.platform_requirements.map((entry) => platformRow(entry, context));
  const rows = [...capabilities, ...platforms];
  if (capabilities.length !== 50 || platforms.length !== 16 || rows.length !== 66) throw new Error(`CENSUS_CARDINALITY_INVALID capabilities=${capabilities.length} platform=${platforms.length} total=${rows.length}`);
  const counts = Object.values(STATE).reduce((out, state) => ({ ...out, [state]: rows.filter((row) => row.current_state === state).length }), {});
  const gaps = rows.filter((row) => row.current_state === STATE.GAP).sort(compareRank);
  const successors = gaps.map((row) => ({
    gap_id: `FCC-002-GAP-${row.requirement_or_capability_id}`,
    requirement_or_capability_id: row.requirement_or_capability_id,
    module_key: row.module_key,
    canonical_owner: row.canonical_owner,
    blocker: row.gap_or_blocker,
    unpopulated_required_columns: row._unpopulated_required,
    rank: rankGap(row)
  }));
  return {
    census_id: census.census_id,
    census_status: census.status,
    authority_id: authority.authority_id,
    authority_effective_date: authority.effective_date,
    ownership_source: allocationRel,
    crosswalk_source: crosswalkRel,
    evidence_registry: EVIDENCE_REGISTRY,
    capability_entries: capabilities.length,
    platform_entries: platforms.length,
    module_count: rows.length,
    counts,
    completion_percent: Math.round((counts[STATE.COMPLETE] / rows.length) * 100),
    rows,
    unresolved_gap_successor_register: successors,
    next_active_gap: successors[0] || null
  };
}

function esc(value) { return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }
function render(matrix) {
  const lines = [
    '# Foundation Closure Census 001 — Disposition Matrix', '',
    `Authority \`${matrix.authority_id}\` effective ${matrix.authority_effective_date} · census status \`${matrix.census_status}\``, '',
    `Ownership source: \`${matrix.ownership_source}\``, '',
    `Crosswalk source: \`${matrix.crosswalk_source}\``, '',
    `Evidence registry: \`${matrix.evidence_registry}\``, '',
    `Entries: ${matrix.capability_entries} capability · ${matrix.platform_entries} platform · ${matrix.module_count} total`, '',
    '> Integrity repair 002: populated contract prose is specification, not acceptance evidence. COMPLETE requires an explicit current-authority evidence receipt with exact subject blob bindings.', '',
    '## Disposition summary', '', '| State | Rows |', '| --- | ---: |'
  ];
  for (const [state, count] of Object.entries(matrix.counts)) lines.push(`| \`${state}\` | ${count} |`);
  lines.push(`| **Total** | **${matrix.module_count}** |`, '', `**Foundation 1.0 completion with evidence: ${matrix.completion_percent}%.**`, '', '## Full required-column matrix', '');
  const cols = ['requirement_or_capability_id','canonical_owner','authority_source','contract_or_interface','ingress_routes','egress_routes','persistence_or_canonical_writer','dependencies','failure_semantics','evidence_target','test_or_acceptance_target','authority_boundary','current_state','gap_or_blocker','successor','evidence_pointer'];
  lines.push(`| ${cols.join(' | ')} |`);
  lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
  for (const row of matrix.rows) lines.push(`| ${cols.map((col) => esc(row[col])).join(' | ')} |`);
  lines.push('', '## Unresolved gap successor register', '', `${matrix.unresolved_gap_successor_register.length} ACTIVE_GAP entries remain.`, '', '| Gap | Capability / requirement | Owner | Rank | Missing required | Reason |', '| --- | --- | --- | --- | --- | --- |');
  for (const gap of matrix.unresolved_gap_successor_register) lines.push(`| \`${gap.gap_id}\` | ${esc(gap.requirement_or_capability_id)} ${esc(gap.module_key)} | ${esc(gap.canonical_owner)} | ${gap.rank.join('/')} | ${gap.unpopulated_required_columns.length}/9 | ${esc(gap.blocker)} |`);
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
      return;
    }
    process.stdout.write(text);
  } catch (error) {
    process.stderr.write(`FOUNDATION_MATRIX=FAIL ${error.message}\n`);
    process.exit(2);
  }
}
main();
