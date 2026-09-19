'use strict';

/**
 * Foundation Closure Census 001 projection generator.
 *
 * Current inventory authority is resolved only through the live selector chain:
 *   CURRENT-AUTHORITY.json -> capability_crosswalk
 *
 * The authority-selected topology and owner allocation are consistency inputs,
 * not capability-inventory sources. Historical census phases (including P6
 * product/module allocation evidence) remain provenance only and can never add,
 * remove, or define rows in the current matrix.
 *
 * COMPLETE_WITH_EVIDENCE requires a current-authority PASS receipt whose exact
 * subject Git blobs still match.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const CENSUS = 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json';
const EVIDENCE_REGISTRY = 'governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json';
const CONTRACT_DIR = 'governance/contracts';
const UNPOPULATED = 'UNPOPULATED';

const STATE = Object.freeze({
  COMPLETE: 'COMPLETE_WITH_EVIDENCE',
  GAP: 'ACTIVE_GAP',
  BLOCKED: 'DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE',
  OUT: 'EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY'
});

const CONTRACT_SECTIONS = [
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
  'authority_boundary',
  'current_state',
  'gap_or_blocker',
  'successor',
  'evidence_pointer'
];

const PLACEHOLDER = /^(UNPOPULATED|TBD|N\/A|NONE|-|\*\*UNPOPULATED\*\*)$/i;

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

function abs(rel) { return path.join(ROOT, rel); }
function exists(rel) { return fs.existsSync(abs(rel)); }
function readJson(rel) { return JSON.parse(fs.readFileSync(abs(rel), 'utf8')); }
function contractPath(key) { return `${CONTRACT_DIR}/${key}-FOUNDATION-CONTRACT-001.md`; }
function numericId(id) { return Number(String(id).slice(1)); }
function isOutDisposition(disposition) {
  return String(disposition || '').startsWith('EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY');
}

function gitBlobSha(rel) {
  const bytes = fs.readFileSync(abs(rel));
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function readContract(key) {
  const rel = contractPath(key);
  if (!exists(rel)) {
    return { present: false, path: rel, populated: new Set(), missing: CONTRACT_SECTIONS.map(([name]) => name) };
  }
  const text = fs.readFileSync(abs(rel), 'utf8');
  const headings = [...text.matchAll(/^##\s+.*$/gm)];
  const populated = new Set();
  for (const [name, heading] of CONTRACT_SECTIONS) {
    const start = text.search(heading);
    if (start < 0) continue;
    const next = headings.find((hit) => hit.index > start);
    const body = text.slice(start, next ? next.index : text.length)
      .split('\n').slice(1)
      .filter((line) => !line.trim().startsWith('<!--') && line.trim() !== '')
      .join('\n').trim();
    if (body && !PLACEHOLDER.test(body)) populated.add(name);
  }
  return {
    present: true,
    path: rel,
    populated,
    missing: CONTRACT_SECTIONS.map(([name]) => name).filter((name) => !populated.has(name))
  };
}

function requireUnique(entries, idField, label) {
  const seen = new Set();
  for (const entry of entries) {
    const id = entry?.[idField];
    if (!id) throw new Error(`current crosswalk ${label} entry missing ${idField}`);
    if (seen.has(id)) throw new Error(`duplicate current crosswalk ${label} id: ${id}`);
    seen.add(id);
  }
}

function validateInventory(inputs) {
  const capabilities = inputs.crosswalk.capability_entries;
  const platforms = inputs.crosswalk.platform_requirements;
  if (!Array.isArray(capabilities)) throw new Error('current crosswalk capability_entries must be an array');
  if (!Array.isArray(platforms)) throw new Error('current crosswalk platform_requirements must be an array');

  requireUnique(capabilities, 'capability_id', 'capability');
  requireUnique(platforms, 'platform_id', 'platform');

  const capabilityIds = new Set(capabilities.map((entry) => entry.capability_id));
  for (const entry of platforms) {
    if (capabilityIds.has(entry.platform_id)) {
      throw new Error(`current crosswalk id collision: ${entry.platform_id}`);
    }
  }

  if (inputs.crosswalk.allocation && inputs.crosswalk.allocation !== inputs.allocationRel) {
    throw new Error(`crosswalk/allocation pointer mismatch: crosswalk=${inputs.crosswalk.allocation} authority=${inputs.allocationRel}`);
  }
  if (inputs.allocation.topology && inputs.allocation.topology !== inputs.topologyRel) {
    throw new Error(`allocation/topology pointer mismatch: allocation=${inputs.allocation.topology} authority=${inputs.topologyRel}`);
  }

  const byModule = new Map();
  for (const entry of capabilities) {
    const disposition = entry.disposition || '';
    if (disposition === 'RESERVED_UNALLOCATED') {
      if (entry.module_key || entry.owner_path) {
        throw new Error(`reserved capability must not carry module/owner authority: ${entry.capability_id}`);
      }
      continue;
    }
    if (!entry.module_key) throw new Error(`current capability missing module_key: ${entry.capability_id}`);
    if (byModule.has(entry.module_key)) throw new Error(`duplicate current crosswalk module_key: ${entry.module_key}`);
    byModule.set(entry.module_key, entry);
    if (!isOutDisposition(disposition) && !entry.owner_path) {
      throw new Error(`owned current capability missing owner_path: ${entry.capability_id}`);
    }
  }

  const allocationOwners = new Map();
  for (const row of inputs.allocation.module_ownership || []) {
    if (!row.module_key || !row.owner_path) throw new Error('current allocation module_ownership row missing module_key/owner_path');
    if (allocationOwners.has(row.module_key)) throw new Error(`duplicate current allocation module ownership: ${row.module_key}`);
    allocationOwners.set(row.module_key, row.owner_path);
  }

  const allocationDeferred = new Map();
  for (const row of inputs.allocation.explicitly_deferred_modules || []) {
    if (!row.module_key || !row.disposition) throw new Error('current allocation deferred row missing module_key/disposition');
    if (allocationDeferred.has(row.module_key)) throw new Error(`duplicate current allocation deferred module: ${row.module_key}`);
    allocationDeferred.set(row.module_key, row.disposition);
  }

  // Crosswalk is the inventory authority. Allocation is only a consistency guard.
  // A newly allocated/deferred architecture module that is absent from the current
  // crosswalk must fail generation rather than silently disappear from closure math.
  for (const [moduleKey, ownerPath] of allocationOwners) {
    const entry = byModule.get(moduleKey);
    if (!entry) throw new Error(`current allocation module absent from authority-selected crosswalk: ${moduleKey}`);
    if (isOutDisposition(entry.disposition) || entry.disposition === 'RESERVED_UNALLOCATED') {
      throw new Error(`current allocation owns module crosswalk marks non-owned: ${moduleKey}`);
    }
    if (entry.owner_path !== ownerPath) {
      throw new Error(`current owner mismatch for ${moduleKey}: crosswalk=${entry.owner_path || 'UNSET'} allocation=${ownerPath}`);
    }
  }
  for (const [moduleKey, disposition] of allocationDeferred) {
    const entry = byModule.get(moduleKey);
    if (!entry) throw new Error(`current deferred module absent from authority-selected crosswalk: ${moduleKey}`);
    if (entry.disposition !== disposition) {
      throw new Error(`current deferred disposition mismatch for ${moduleKey}: crosswalk=${entry.disposition || 'UNSET'} allocation=${disposition}`);
    }
  }
  for (const entry of capabilities) {
    if (!entry.module_key || entry.disposition === 'RESERVED_UNALLOCATED') continue;
    if (isOutDisposition(entry.disposition)) {
      if (!allocationDeferred.has(entry.module_key)) {
        throw new Error(`crosswalk deferred capability missing from current allocation deferred set: ${entry.capability_id}/${entry.module_key}`);
      }
    } else if (!allocationOwners.has(entry.module_key)) {
      throw new Error(`crosswalk owned capability missing from current allocation ownership set: ${entry.capability_id}/${entry.module_key}`);
    }
  }

  return {
    source: inputs.crosswalkRel,
    capability_ids: capabilities.map((entry) => entry.capability_id),
    platform_ids: platforms.map((entry) => entry.platform_id),
    capability_count: capabilities.length,
    platform_count: platforms.length,
    allocation_owned_modules_validated: allocationOwners.size,
    allocation_deferred_modules_validated: allocationDeferred.size,
    historical_inventory_fallback: false
  };
}

function authorityInputs() {
  const authority = readJson(AUTHORITY);
  const census = readJson(CENSUS);
  const topologyRel = authority.topology;
  const allocationRel = authority.headless_tool_owner_allocation;
  const crosswalkRel = authority.capability_crosswalk;
  for (const rel of [topologyRel, allocationRel, crosswalkRel, EVIDENCE_REGISTRY]) {
    if (!rel || !exists(rel)) throw new Error(`current-authority input absent: ${rel || 'UNSET'}`);
  }
  const topology = readJson(topologyRel);
  const allocation = readJson(allocationRel);
  const crosswalk = readJson(crosswalkRel);
  const evidence = readJson(EVIDENCE_REGISTRY);

  const expected = {
    authority: census.current_authority_id,
    topology: census.current_topology_id,
    allocation: census.current_owner_allocation_id,
    crosswalk: census.current_capability_crosswalk_id
  };
  const observed = {
    authority: authority.authority_id,
    topology: topology.topology_id,
    allocation: allocation.allocation_id,
    crosswalk: crosswalk.crosswalk_id
  };
  for (const key of Object.keys(expected)) {
    if (expected[key] && expected[key] !== observed[key]) {
      throw new Error(`census/current-authority mismatch for ${key}: expected=${expected[key]} observed=${observed[key]}`);
    }
  }
  if (evidence.authority_id !== authority.authority_id) {
    throw new Error(`evidence registry authority mismatch: ${evidence.authority_id}`);
  }
  const inputs = { authority, census, topology, allocation, crosswalk, evidence, topologyRel, allocationRel, crosswalkRel };
  inputs.inventory = validateInventory(inputs);
  return inputs;
}

function evidenceMap(inputs) {
  return new Map((inputs.evidence.entries || []).map((entry) => [entry.requirement_or_capability_id, entry]));
}

function verifyReceipt(receipt, id, owner, authorityId) {
  if (!receipt) return { valid: false, reason: 'NO_RECEIPT' };
  if (receipt.requirement_or_capability_id !== id) return { valid: false, reason: 'ID_MISMATCH' };
  if (receipt.status !== 'PASS') return { valid: false, reason: `STATUS_${receipt.status || 'UNSET'}` };
  if (receipt.authority_id !== authorityId) return { valid: false, reason: 'AUTHORITY_MISMATCH' };
  if (receipt.owner_path !== owner) return { valid: false, reason: 'OWNER_MISMATCH' };
  if (receipt.qualification?.conclusion !== 'success') return { valid: false, reason: 'QUALIFICATION_NOT_SUCCESS' };
  for (const subject of receipt.subjects || []) {
    if (!subject.path || !subject.git_blob_sha || !exists(subject.path)) {
      return { valid: false, reason: `SUBJECT_ABSENT:${subject.path || 'UNSET'}` };
    }
    if (gitBlobSha(subject.path) !== subject.git_blob_sha) {
      return { valid: false, reason: `SUBJECT_DRIFT:${subject.path}` };
    }
  }
  return { valid: true, reason: 'PASS' };
}

function evidencePointer(receipt) {
  if (!receipt) return UNPOPULATED;
  const refs = [...(receipt.evidence_refs || [])];
  const q = receipt.qualification || {};
  if (q.workflow_run_id) refs.push(`github-actions-run:${q.workflow_run_id}`);
  if (q.artifact_id) refs.push(`github-actions-artifact:${q.artifact_id}:${q.artifact_digest || 'digest-unset'}`);
  return refs.length ? refs.join('; ') : EVIDENCE_REGISTRY;
}

function baseFields(contract) {
  const out = {};
  for (const [name] of CONTRACT_SECTIONS) out[name] = contract.populated.has(name) ? contract.path : UNPOPULATED;
  return out;
}

function completeOrGap({ id, key, owner, authoritySource, contract, receipt, receiptCheck }) {
  const fields = baseFields(contract);
  let state = STATE.GAP;
  let reason;
  if (!contract.present) {
    reason = `No Foundation contract at ${contract.path}.`;
  } else if (contract.missing.length) {
    reason = `Contract exists but ${contract.missing.length}/9 required sections unpopulated: ${contract.missing.join(', ')}`;
  } else if (!receipt) {
    reason = 'Contract may be populated, but no current-authority Foundation evidence receipt is registered.';
  } else if (!receiptCheck.valid) {
    reason = `Foundation evidence receipt is not current-valid (${receiptCheck.reason}).`;
  } else {
    state = STATE.COMPLETE;
    reason = 'Current-authority Foundation evidence receipt PASS with exact subject bindings.';
  }
  return {
    requirement_or_capability_id: id,
    module_key: key,
    canonical_owner: owner || UNPOPULATED,
    authority_source: authoritySource,
    ...fields,
    current_state: state,
    gap_or_blocker: reason,
    successor: UNPOPULATED,
    evidence_pointer: state === STATE.COMPLETE ? evidencePointer(receipt) : (contract.present ? contract.path : UNPOPULATED),
    _missing_required: contract.missing
  };
}

function capabilityRows(inputs, receipts) {
  const source = `${AUTHORITY} -> ${inputs.crosswalkRel}; owner consistency validated by ${inputs.allocationRel}`;
  return inputs.crosswalk.capability_entries.map((entry) => {
    const id = entry.capability_id;
    const key = entry.module_key || id;
    const disposition = entry.disposition || '';
    if (isOutDisposition(disposition) || disposition === 'RESERVED_UNALLOCATED') {
      const reason = disposition === 'RESERVED_UNALLOCATED'
        ? 'Reserved unallocated capability identifier by current authority-selected crosswalk.'
        : `Explicitly out of scope by current authority-selected crosswalk (${disposition}).`;
      return {
        requirement_or_capability_id: id,
        module_key: key,
        canonical_owner: entry.owner_path || UNPOPULATED,
        authority_source: source,
        ...Object.fromEntries(CONTRACT_SECTIONS.map(([name]) => [name, UNPOPULATED])),
        current_state: STATE.OUT,
        gap_or_blocker: reason,
        successor: UNPOPULATED,
        evidence_pointer: inputs.crosswalkRel,
        _missing_required: []
      };
    }
    const contract = readContract(key);
    const receipt = receipts.get(id);
    return completeOrGap({
      id, key, owner: entry.owner_path, authoritySource: source, contract, receipt,
      receiptCheck: verifyReceipt(receipt, id, entry.owner_path, inputs.authority.authority_id)
    });
  });
}

function platformRows(inputs, receipts) {
  const source = `${AUTHORITY} -> ${inputs.crosswalkRel}`;
  return inputs.crosswalk.platform_requirements.map((entry) => {
    const id = entry.platform_id;
    if (entry.disposition === 'ABSORBED') {
      return {
        requirement_or_capability_id: id,
        module_key: id,
        canonical_owner: entry.owner_path || UNPOPULATED,
        authority_source: source,
        ...Object.fromEntries(CONTRACT_SECTIONS.map(([name]) => [name, UNPOPULATED])),
        current_state: STATE.OUT,
        gap_or_blocker: `Absorbed into ${entry.absorbed_into} by current authority-selected crosswalk.`,
        successor: entry.absorbed_into || UNPOPULATED,
        evidence_pointer: inputs.crosswalkRel,
        _missing_required: []
      };
    }
    const contract = readContract(id);
    const receipt = receipts.get(id);
    return completeOrGap({
      id, key: id, owner: entry.owner_path, authoritySource: source, contract, receipt,
      receiptCheck: verifyReceipt(receipt, id, entry.owner_path, inputs.authority.authority_id)
    });
  });
}

function ownerRank(census, owner) {
  if (!owner || !owner.startsWith('SYSTEM_MASTER/')) return 999;
  const lane = owner.slice('SYSTEM_MASTER/'.length);
  const i = (census.initial_owner_order || []).indexOf(lane);
  return i < 0 ? 999 : i;
}

function successorSort(census, a, b) {
  const aPlatform = a.requirement_or_capability_id.startsWith('P');
  const bPlatform = b.requirement_or_capability_id.startsWith('P');
  if (aPlatform !== bPlatform) return aPlatform ? -1 : 1;
  if (aPlatform) return numericId(a.requirement_or_capability_id) - numericId(b.requirement_or_capability_id);
  const ownerDelta = ownerRank(census, a.canonical_owner) - ownerRank(census, b.canonical_owner);
  return ownerDelta || numericId(a.requirement_or_capability_id) - numericId(b.requirement_or_capability_id);
}

function build() {
  const inputs = authorityInputs();
  const receipts = evidenceMap(inputs);
  const rows = [...capabilityRows(inputs, receipts), ...platformRows(inputs, receipts)]
    .sort((a, b) => a.requirement_or_capability_id.localeCompare(b.requirement_or_capability_id));

  const counts = Object.fromEntries(Object.values(STATE).map((state) => [state, rows.filter((r) => r.current_state === state).length]));
  const inScope = rows.length - counts[STATE.OUT];
  const completionPercent = inScope ? Math.round((counts[STATE.COMPLETE] / inScope) * 100) : 0;
  const gaps = rows.filter((r) => r.current_state === STATE.GAP).sort((a, b) => successorSort(inputs.census, a, b));

  return {
    generated_at: new Date().toISOString(),
    authority_id: inputs.authority.authority_id,
    topology_id: inputs.topology.topology_id,
    allocation_id: inputs.allocation.allocation_id,
    crosswalk_id: inputs.crosswalk.crosswalk_id,
    inventory_source: inputs.crosswalkRel,
    inventory_guard: inputs.inventory,
    census_id: inputs.census.census_id,
    census_status: inputs.census.status,
    required_columns: COLUMNS,
    total_rows: rows.length,
    capability_entries: inputs.inventory.capability_count,
    platform_entries: inputs.inventory.platform_count,
    in_scope_rows: inScope,
    counts,
    completion_percent: completionPercent,
    rows,
    unresolved_gap_successor_register: gaps.map((r) => ({
      gap_id: `FCC-002-GAP-${r.requirement_or_capability_id}`,
      requirement_or_capability_id: r.requirement_or_capability_id,
      module_key: r.module_key,
      canonical_owner: r.canonical_owner,
      blocker: r.gap_or_blocker,
      missing_required: r._missing_required
    })),
    exact_next_active_gap: gaps[0]?.requirement_or_capability_id || null
  };
}

function esc(value) { return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function renderMarkdown(m) {
  const lines = [];
  lines.push('# Foundation Closure Census 001 - Disposition Matrix', '');
  lines.push(`Generated ${m.generated_at} under \`${m.authority_id}\` / \`${m.topology_id}\`.`,'');
  lines.push(`Inventory authority: \`${m.inventory_source}\` selected by \`${AUTHORITY}\`  `);
  lines.push(`Ownership consistency: \`${m.allocation_id}\`  `);
  lines.push(`Crosswalk: \`${m.crosswalk_id}\`  `);
  lines.push(`Evidence registry: \`${EVIDENCE_REGISTRY}\``, '');
  lines.push(`Entries: ${m.capability_entries} capability + ${m.platform_entries} platform = ${m.total_rows} total.`, '');
  lines.push('> Historical census/P6 module-allocation evidence is provenance only. Current rows are enumerated exclusively from the authority-selected capability crosswalk; allocation is a fail-closed ownership/deferred consistency check.', '');
  lines.push('> Populated contract prose is specification, not acceptance evidence. COMPLETE_WITH_EVIDENCE requires a current-authority PASS receipt whose exact subject blobs still match.', '');
  lines.push('## Disposition summary', '');
  lines.push('| State | Rows |', '| --- | ---: |');
  for (const state of Object.values(STATE)) lines.push(`| \`${state}\` | ${m.counts[state]} |`);
  lines.push(`| **Total** | **${m.total_rows}** |`, '');
  lines.push(`**Foundation 1.0 completion with evidence: ${m.completion_percent}% (${m.counts[STATE.COMPLETE]} of ${m.in_scope_rows} in-scope rows).**`, '');
  lines.push('## Disposition matrix', '');
  lines.push('| ID | Capability / requirement | Owner | State | Missing required | Gap / blocker | Evidence / successor |');
  lines.push('| --- | --- | --- | --- | ---: | --- | --- |');
  for (const r of m.rows) {
    const evidence = r.successor !== UNPOPULATED ? `successor=${r.successor}; ${r.evidence_pointer}` : r.evidence_pointer;
    lines.push(`| \`${r.requirement_or_capability_id}\` | ${esc(r.module_key)} | ${esc(r.canonical_owner)} | \`${esc(r.current_state)}\` | ${r._missing_required.length}/9 | ${esc(r.gap_or_blocker)} | ${esc(evidence)} |`);
  }
  lines.push('', '## Unresolved gap successor register', '');
  lines.push(`${m.unresolved_gap_successor_register.length} ACTIVE_GAP rows remain, ordered by shared platform dependency first and then current nine-peer owner order.`, '');
  lines.push('| Gap | ID | Owner | Missing | Reason |', '| --- | --- | --- | ---: | --- |');
  for (const g of m.unresolved_gap_successor_register) {
    lines.push(`| \`${g.gap_id}\` | ${g.requirement_or_capability_id} ${esc(g.module_key)} | ${esc(g.canonical_owner)} | ${g.missing_required.length}/9 | ${esc(g.blocker)} |`);
  }
  lines.push('', '## Exact next ACTIVE_GAP', '');
  lines.push(m.exact_next_active_gap ? `\`${m.exact_next_active_gap}\`` : '`NONE`', '');
  lines.push('## Machine-readable required columns', '');
  lines.push('The `--json` form contains all required row fields, including authority boundary, exact evidence pointer, successor, and the current-inventory guard.', '');
  return lines.join('\n').replace(/[ \t]+$/gm, '').trimEnd();
}

function main() {
  const args = process.argv.slice(2);
  try {
    const matrix = build();
    if (args.includes('--summary')) {
      process.stdout.write(`${JSON.stringify({
        authority_id: matrix.authority_id,
        inventory_source: matrix.inventory_source,
        inventory_guard: matrix.inventory_guard,
        counts: matrix.counts,
        completion_percent: matrix.completion_percent,
        total_rows: matrix.total_rows,
        in_scope_rows: matrix.in_scope_rows,
        gaps: matrix.unresolved_gap_successor_register.length,
        next: matrix.exact_next_active_gap
      }, null, 2)}\n`);
      return;
    }
    const text = args.includes('--json') ? `${JSON.stringify(matrix, null, 2)}\n` : `${renderMarkdown(matrix)}\n`;
    const outIndex = args.indexOf('--out');
    if (outIndex >= 0) {
      const out = args[outIndex + 1];
      if (!out) throw new Error('--out requires a repository-relative path');
      const outPath = path.resolve(ROOT, out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, text, 'utf8');
      process.stderr.write(`FOUNDATION_MATRIX=WROTE path=${out}\n`);
      return;
    }
    process.stdout.write(text);
  } catch (error) {
    process.stderr.write(`FOUNDATION_MATRIX=FAIL ${error.message}\n`);
    process.exit(2);
  }
}

main();
