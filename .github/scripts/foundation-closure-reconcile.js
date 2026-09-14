'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY_PATH = 'governance/CURRENT-AUTHORITY.json';
const CENSUS_PATH = 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json';
const RAW_GENERATOR = '.github/scripts/foundation-closure-matrix.js';
const GAP = 'ACTIVE_GAP';
const COMPLETE = 'COMPLETE_WITH_EVIDENCE';
const UNPOPULATED = 'UNPOPULATED';

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function fail(code, detail = '') {
  process.stderr.write(`FOUNDATION_RECONCILE=FAIL code=${code}${detail ? ` detail=${detail}` : ''}\n`);
  process.exit(2);
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function build() {
  const authority = readJson(AUTHORITY_PATH);
  const census = readJson(CENSUS_PATH);
  const topologyPath = authority.topology;
  const catalogPath = authority.system_catalog;
  const allocationPath = authority.headless_tool_owner_allocation;
  const crosswalkPath = authority.capability_crosswalk;

  for (const [name, rel] of Object.entries({ topologyPath, catalogPath, allocationPath, crosswalkPath })) {
    if (!rel || !fs.existsSync(path.join(ROOT, rel))) fail('CURRENT_AUTHORITY_POINTER_MISSING', `${name}:${rel || 'null'}`);
  }

  if (authority.foundation_closure_census && authority.foundation_closure_census !== CENSUS_PATH) {
    fail('FOUNDATION_CENSUS_POINTER_DRIFT', authority.foundation_closure_census);
  }
  if (census.architecture_authority !== AUTHORITY_PATH) fail('CENSUS_AUTHORITY_POINTER_DRIFT', census.architecture_authority);
  if (census.topology_ref !== topologyPath) fail('CENSUS_TOPOLOGY_POINTER_DRIFT', `${census.topology_ref}!=${topologyPath}`);

  const topology = readJson(topologyPath);
  const catalog = readJson(catalogPath);
  const activeOwners = topology.peer_system_ids || [];
  const retired = (topology.retired_systems || []).map((r) => r.system_id);

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
  if (topology.explicit_non_systems?.WEBSITE_BUILDING !== 'PROGRAMMING_CAPABILITY_NOT_PEER_SYSTEM') {
    fail('WEBSITE_BUILDING_PEER_DRIFT');
  }

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

  const ownerRank = new Map(activeOwners.map((owner, index) => [owner, index]));
  const open = raw.rows
    .filter((row) => row.current_state === GAP)
    .map((row) => {
      const ownerValid = ownerRank.has(row.canonical_owner);
      const dependenciesKnown = row.dependencies && row.dependencies !== UNPOPULATED;
      return {
        gap_id: `FOUNDATION-1-0-${row.requirement_or_capability_id}`,
        requirement_or_capability_id: row.requirement_or_capability_id,
        module_key: row.module_key,
        canonical_owner: row.canonical_owner,
        owner_valid_under_topology_007: ownerValid,
        evidence_state: row.current_state,
        evidence_pointer: row.evidence_pointer,
        dependencies: row.dependencies,
        dependency_state: dependenciesKnown ? 'DECLARED' : 'UNPOPULATED',
        gap_or_blocker: row.gap_or_blocker,
        unpopulated_required_columns: row._unpopulated_required || [],
        declared_next_disposition: row._next_disposition || UNPOPULATED,
        executable_closure_gate: `node .github/scripts/foundation-closure-reconcile.js --assert-complete ${row.requirement_or_capability_id}`
      };
    })
    .sort((a, b) => {
      const ar = ownerRank.has(a.canonical_owner) ? ownerRank.get(a.canonical_owner) : Number.MAX_SAFE_INTEGER;
      const br = ownerRank.has(b.canonical_owner) ? ownerRank.get(b.canonical_owner) : Number.MAX_SAFE_INTEGER;
      return ar - br || a.requirement_or_capability_id.localeCompare(b.requirement_or_capability_id);
    });

  const openByOwner = {};
  for (const owner of activeOwners) openByOwner[owner] = [];
  openByOwner.UNASSIGNED_OR_INVALID = [];
  for (const gap of open) {
    const key = gap.owner_valid_under_topology_007 ? gap.canonical_owner : 'UNASSIGNED_OR_INVALID';
    openByOwner[key].push(gap);
  }

  const ownerSummary = Object.fromEntries(Object.entries(openByOwner).map(([owner, rows]) => [owner, {
    open_count: rows.length,
    dependency_declared: rows.filter((r) => r.dependency_state === 'DECLARED').length,
    dependency_unpopulated: rows.filter((r) => r.dependency_state === 'UNPOPULATED').length,
    ids: rows.map((r) => r.requirement_or_capability_id)
  }]));

  return {
    subject_sha: process.env.GITHUB_SHA || 'UNBOUND_LOCAL_SUBJECT',
    authority_id: authority.authority_id,
    topology_id: topology.topology_id,
    topology_source: topologyPath,
    current_catalog_source: catalogPath,
    current_catalog_historical_inventory_count: catalog.historical_inventory?.count ?? null,
    ownership_source: allocationPath,
    crosswalk_source: crosswalkPath,
    census_id: census.census_id,
    active_owner_order: activeOwners,
    retired_owner_exclusions: retired,
    website_building_disposition: 'C40_UNDER_PROGRAMMING_NOT_PEER',
    raw_disposition_counts: raw.counts,
    raw_completion_percent: raw.completion_percent,
    scope_coverage: raw.scope_coverage,
    open_foundation_obligation_count: open.length,
    open_by_owner_summary: ownerSummary,
    open_foundation_obligations: open,
    closure_decision: open.length === 0 && (raw.counts?.DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE || 0) === 0
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
    const raw = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, RAW_GENERATOR), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const row = raw.rows.find((r) => r.requirement_or_capability_id === id);
    if (!row) fail('ASSERT_COMPLETE_ROW_NOT_FOUND', id);
    if (row.current_state !== COMPLETE) fail('ASSERT_COMPLETE_NOT_COMPLETE', `${id}:${row.current_state}`);
    process.stdout.write(`FOUNDATION_ROW_COMPLETE=PASS id=${id} owner=${row.canonical_owner}\n`);
    return;
  }

  if (args.includes('--summary')) {
    process.stdout.write(`${JSON.stringify({
      authority_id: result.authority_id,
      topology_id: result.topology_id,
      active_owner_order: result.active_owner_order,
      raw_disposition_counts: result.raw_disposition_counts,
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
