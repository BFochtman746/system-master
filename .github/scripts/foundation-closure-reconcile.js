'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY_PATH = 'governance/CURRENT-AUTHORITY.json';
const CENSUS_PATH = 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json';
const EVIDENCE_REGISTRY_PATH = 'governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json';
const RAW_GENERATOR = '.github/scripts/foundation-closure-matrix.js';
const GAP = 'ACTIVE_GAP';
const COMPLETE = 'COMPLETE_WITH_EVIDENCE';
const BLOCKED = 'DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE';
const OUT = 'EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY';
const UNPOPULATED = 'UNPOPULATED';

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function exists(rel) {
  return Boolean(rel) && fs.existsSync(path.join(ROOT, rel));
}

function workingBlob(rel) {
  const body = fs.readFileSync(path.join(ROOT, rel));
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}

function fail(code, detail = '') {
  process.stderr.write(`FOUNDATION_RECONCILE=FAIL code=${code}${detail ? ` detail=${detail}` : ''}\n`);
  process.exit(2);
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function peerFromOwnerPath(ownerPath) {
  if (!ownerPath || ownerPath === UNPOPULATED) return null;
  const parts = String(ownerPath).split('/').filter(Boolean);
  if (parts[0] !== 'SYSTEM_MASTER' || parts.length !== 2) return null;
  return parts[1];
}

function evidenceState(entry, row, authority) {
  if (!entry) {
    return {
      state: 'NO_REGISTERED_EVIDENCE',
      current: false,
      drift: [],
      evidence_refs: []
    };
  }

  const drift = [];
  if (entry.authority_id !== authority.authority_id) drift.push(`authority:${entry.authority_id}`);
  if (entry.owner_path !== row.canonical_owner) drift.push(`owner:${entry.owner_path}`);
  if (entry.status !== 'PASS') drift.push(`status:${entry.status}`);
  if (!Array.isArray(entry.subjects) || entry.subjects.length === 0) {
    drift.push('subjects:absent');
  } else {
    for (const subject of entry.subjects) {
      if (!subject || !subject.path || !subject.git_blob_sha) {
        drift.push('subject-binding:incomplete');
        continue;
      }
      if (!exists(subject.path)) {
        drift.push(`${subject.path}:absent`);
        continue;
      }
      const current = workingBlob(subject.path);
      if (current !== subject.git_blob_sha) drift.push(`${subject.path}:${subject.git_blob_sha}->${current}`);
    }
  }

  const current = drift.length === 0;
  return {
    state: current ? 'REGISTERED_PASS_CURRENT_SUBJECTS_MATCH' : 'REGISTERED_PASS_STALE_OR_INVALID_CURRENT_SUBJECTS',
    current,
    subject_sha: entry.subject_sha || null,
    qualification: entry.qualification || null,
    drift,
    evidence_refs: entry.evidence_refs || []
  };
}

function effectiveState(row, evidence) {
  if (row.current_state === OUT || row.current_state === BLOCKED) return row.current_state;
  const contractComplete = row.current_state === COMPLETE;
  return contractComplete && evidence.current ? COMPLETE : GAP;
}

function effectiveReason(row, evidence, state) {
  if (state === row.current_state && (state === OUT || state === BLOCKED)) return row.gap_or_blocker;
  if (state === COMPLETE) return `Contract populated and exact registered PASS subjects still match current repository state.`;
  if (row.current_state !== COMPLETE) return row.gap_or_blocker;
  if (evidence.state === 'NO_REGISTERED_EVIDENCE') {
    return 'Foundation contract is populated, but no exact registered Foundation closure evidence exists for this row.';
  }
  return `Foundation contract is populated, but registered evidence is stale or invalid against current subjects (${evidence.drift.length} drift item(s)).`;
}

function build() {
  const authority = readJson(AUTHORITY_PATH);
  const census = readJson(CENSUS_PATH);
  const topologyPath = authority.topology;
  const catalogPath = authority.system_catalog;
  const allocationPath = authority.headless_tool_owner_allocation;
  const crosswalkPath = authority.capability_crosswalk;

  for (const [name, rel] of Object.entries({ topologyPath, catalogPath, allocationPath, crosswalkPath })) {
    if (!rel || !exists(rel)) fail('CURRENT_AUTHORITY_POINTER_MISSING', `${name}:${rel || 'null'}`);
  }
  if (!exists(EVIDENCE_REGISTRY_PATH)) fail('EVIDENCE_REGISTRY_MISSING', EVIDENCE_REGISTRY_PATH);

  if (authority.foundation_closure_census && authority.foundation_closure_census !== CENSUS_PATH) {
    fail('FOUNDATION_CENSUS_POINTER_DRIFT', authority.foundation_closure_census);
  }
  if (census.architecture_authority !== AUTHORITY_PATH) fail('CENSUS_AUTHORITY_POINTER_DRIFT', census.architecture_authority);
  if (census.topology_ref !== topologyPath) fail('CENSUS_TOPOLOGY_POINTER_DRIFT', `${census.topology_ref}!=${topologyPath}`);

  const topology = readJson(topologyPath);
  const catalog = readJson(catalogPath);
  const evidenceRegistry = readJson(EVIDENCE_REGISTRY_PATH);
  const activeOwners = topology.peer_system_ids || [];
  const retired = (topology.retired_systems || []).map((r) => r.system_id);

  if (evidenceRegistry.authority_id !== authority.authority_id) fail('EVIDENCE_REGISTRY_AUTHORITY_DRIFT', evidenceRegistry.authority_id);
  if (evidenceRegistry.crosswalk !== crosswalkPath) fail('EVIDENCE_REGISTRY_CROSSWALK_DRIFT', evidenceRegistry.crosswalk);
  if (evidenceRegistry.allocation !== allocationPath) fail('EVIDENCE_REGISTRY_ALLOCATION_DRIFT', evidenceRegistry.allocation);
  if (evidenceRegistry.topology !== topologyPath) fail('EVIDENCE_REGISTRY_TOPOLOGY_DRIFT', evidenceRegistry.topology);

  if (!sameArray(census.active_owner_order, activeOwners)) {
    fail('CENSUS_ACTIVE_OWNER_SET_DRIFT', `${JSON.stringify(census.active_owner_order)}!=${JSON.stringify(activeOwners)}`);
  }
  for (const id of retired) {
    if (activeOwners.includes(id)) fail('RETIRED_OWNER_ACTIVE', id);
    if (!(census.retired_owner_exclusions || []).includes(id)) fail('RETIRED_OWNER_NOT_EXCLUDED', id);
  }

  const prose = (topology.retired_systems || []).find((r) => r.system_id === 'PROSE');
  if (!prose || prose.lifecycle !== 'RETIRED_TERMINAL') fail('PROSE_RETIREMENT_DRIFT');
  const programming = (topology.canonical_internal_systems || []).find((s) => s.system_id === 'PROGRAMMING');
  if (!programming || !(programming.owns_modules || []).includes('WEBSITE_BUILDING')) fail('WEBSITE_BUILDING_OWNER_DRIFT');
  if (topology.explicit_non_systems?.WEBSITE_BUILDING !== 'PROGRAMMING_CAPABILITY_NOT_PEER_SYSTEM') fail('WEBSITE_BUILDING_PEER_DRIFT');

  let raw;
  try {
    raw = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, RAW_GENERATOR), '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024 * 1024
    }));
  } catch (error) {
    fail('RAW_MATRIX_EXECUTION_FAILED', String(error.message || error));
  }

  if (raw.ownership_source !== allocationPath) fail('OWNERSHIP_SOURCE_DRIFT', raw.ownership_source);
  if (raw.crosswalk_source !== crosswalkPath) fail('CROSSWALK_SOURCE_DRIFT', raw.crosswalk_source);

  const evidenceById = new Map();
  for (const entry of evidenceRegistry.entries || []) {
    const id = entry.requirement_or_capability_id;
    if (!id) fail('EVIDENCE_ENTRY_ID_MISSING');
    if (evidenceById.has(id)) fail('DUPLICATE_EVIDENCE_ENTRY', id);
    evidenceById.set(id, entry);
  }

  const ownerRank = new Map(activeOwners.map((owner, index) => [owner, index]));
  const reconciledRows = raw.rows.map((row) => {
    const ownerPeer = peerFromOwnerPath(row.canonical_owner);
    const ownerValid = ownerPeer !== null && ownerRank.has(ownerPeer);
    const evidence = evidenceState(evidenceById.get(row.requirement_or_capability_id), row, authority);
    const state = effectiveState(row, evidence);
    const dependenciesKnown = row.dependencies && row.dependencies !== UNPOPULATED;
    const contractComplete = row.current_state === COMPLETE;
    return {
      requirement_or_capability_id: row.requirement_or_capability_id,
      module_key: row.module_key,
      canonical_owner_path: row.canonical_owner,
      canonical_owner_peer: ownerPeer || UNPOPULATED,
      owner_valid_under_topology_007: ownerValid,
      contract_state: contractComplete ? 'POPULATED' : (row.current_state === GAP ? 'INCOMPLETE' : 'NOT_APPLICABLE'),
      evidence_state: evidence.state,
      evidence_subject_sha: evidence.subject_sha || null,
      evidence_refs: evidence.evidence_refs,
      evidence_drift: evidence.drift,
      current_state: state,
      contract_evidence_pointer: row.evidence_pointer,
      dependencies: row.dependencies,
      dependency_state: dependenciesKnown ? 'DECLARED' : 'UNPOPULATED',
      gap_or_blocker: effectiveReason(row, evidence, state),
      unpopulated_required_columns: row._unpopulated_required || [],
      declared_next_disposition: row._next_disposition || UNPOPULATED,
      executable_closure_gate: `node .github/scripts/foundation-closure-reconcile.js --assert-complete ${row.requirement_or_capability_id}`
    };
  });

  const open = reconciledRows
    .filter((row) => row.current_state === GAP)
    .sort((a, b) => {
      const ar = ownerRank.has(a.canonical_owner_peer) ? ownerRank.get(a.canonical_owner_peer) : Number.MAX_SAFE_INTEGER;
      const br = ownerRank.has(b.canonical_owner_peer) ? ownerRank.get(b.canonical_owner_peer) : Number.MAX_SAFE_INTEGER;
      return ar - br || a.requirement_or_capability_id.localeCompare(b.requirement_or_capability_id);
    });

  const openByOwner = {};
  for (const owner of activeOwners) openByOwner[owner] = [];
  openByOwner.UNASSIGNED_OR_INVALID = [];
  for (const gap of open) {
    const key = gap.owner_valid_under_topology_007 ? gap.canonical_owner_peer : 'UNASSIGNED_OR_INVALID';
    openByOwner[key].push(gap);
  }

  const ownerSummary = Object.fromEntries(Object.entries(openByOwner).map(([owner, rows]) => [owner, {
    open_count: rows.length,
    contract_incomplete: rows.filter((r) => r.contract_state === 'INCOMPLETE').length,
    evidence_absent: rows.filter((r) => r.evidence_state === 'NO_REGISTERED_EVIDENCE').length,
    evidence_stale_or_invalid: rows.filter((r) => r.evidence_state === 'REGISTERED_PASS_STALE_OR_INVALID_CURRENT_SUBJECTS').length,
    dependency_declared: rows.filter((r) => r.dependency_state === 'DECLARED').length,
    dependency_unpopulated: rows.filter((r) => r.dependency_state === 'UNPOPULATED').length,
    ids: rows.map((r) => r.requirement_or_capability_id)
  }]));

  const reconciledCounts = [COMPLETE, GAP, BLOCKED, OUT].reduce((acc, state) => {
    acc[state] = reconciledRows.filter((row) => row.current_state === state).length;
    return acc;
  }, {});

  return {
    subject_sha: process.env.FOUNDATION_SUBJECT_SHA || process.env.GITHUB_SHA || 'UNBOUND_LOCAL_SUBJECT',
    authority_id: authority.authority_id,
    topology_id: topology.topology_id,
    topology_source: topologyPath,
    current_catalog_source: catalogPath,
    current_catalog_historical_inventory_count: catalog.historical_inventory?.count ?? null,
    ownership_source: allocationPath,
    crosswalk_source: crosswalkPath,
    evidence_registry_source: EVIDENCE_REGISTRY_PATH,
    census_id: census.census_id,
    active_owner_order: activeOwners,
    retired_owner_exclusions: retired,
    website_building_disposition: 'C40_UNDER_PROGRAMMING_NOT_PEER',
    raw_contract_disposition_counts: raw.counts,
    reconciled_disposition_counts: reconciledCounts,
    reconciled_completion_percent: reconciledRows.length ? Math.round((reconciledCounts[COMPLETE] / reconciledRows.length) * 10000) / 100 : 0,
    scope_coverage: raw.scope_coverage,
    open_foundation_obligation_count: open.length,
    open_by_owner_summary: ownerSummary,
    open_foundation_obligations: open,
    reconciled_rows: reconciledRows,
    closure_decision: open.length === 0 && reconciledCounts[BLOCKED] === 0
      ? 'FOUNDATION_1_0_CLOSURE_ELIGIBLE_SUBJECT_TO_AUTHORITY'
      : 'FOUNDATION_1_0_OPEN'
  };
}

function write(result, out) {
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out) {
    const abs = path.resolve(ROOT, out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    process.stderr.write(`FOUNDATION_RECONCILE=WROTE path=${out}\n`);
  } else {
    process.stdout.write(text);
  }
}

function main() {
  const args = process.argv.slice(2);
  const result = build();

  const assertIndex = args.indexOf('--assert-complete');
  if (assertIndex >= 0) {
    const id = args[assertIndex + 1];
    if (!id) fail('ASSERT_COMPLETE_ID_REQUIRED');
    const row = result.reconciled_rows.find((item) => item.requirement_or_capability_id === id);
    if (!row) fail('ASSERT_COMPLETE_ROW_NOT_FOUND', id);
    if (row.current_state !== COMPLETE) {
      fail('ASSERT_COMPLETE_NOT_COMPLETE', `${id}:${row.current_state}:${row.contract_state}:${row.evidence_state}`);
    }
    process.stdout.write(`FOUNDATION_ROW_COMPLETE=PASS id=${id} owner=${row.canonical_owner_path} evidence=${row.evidence_state}\n`);
    return;
  }

  if (args.includes('--summary')) {
    process.stdout.write(`${JSON.stringify({
      authority_id: result.authority_id,
      topology_id: result.topology_id,
      subject_sha: result.subject_sha,
      active_owner_order: result.active_owner_order,
      raw_contract_disposition_counts: result.raw_contract_disposition_counts,
      reconciled_disposition_counts: result.reconciled_disposition_counts,
      reconciled_completion_percent: result.reconciled_completion_percent,
      open_foundation_obligation_count: result.open_foundation_obligation_count,
      open_by_owner_summary: result.open_by_owner_summary,
      closure_decision: result.closure_decision
    }, null, 2)}\n`);
    return;
  }

  const outIndex = args.indexOf('--out');
  write(result, outIndex >= 0 ? args[outIndex + 1] : null);
}

main();
