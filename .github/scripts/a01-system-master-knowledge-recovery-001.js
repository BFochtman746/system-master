'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(process.env.A01_SUBJECT_ROOT || path.join(__dirname, '..', '..'));
const EVIDENCE_DIR = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(REPO_ROOT, 'build', 'evidence', 'knowledge-recovery-programming-001'));
const MANIFEST_REL = 'governance/catalog/ingest/programming/PROGRAMMING-INGEST-MANIFEST-001.json';
const AUTHORITY_REL = 'governance/CURRENT-AUTHORITY.json';
const PACKET_REL = 'governance/catalog/system-packets/PROGRAMMING.json';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')); }
function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sha256File(rel) { return sha256Bytes(fs.readFileSync(path.join(REPO_ROOT, rel))); }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(name, value) { mkdir(EVIDENCE_DIR); fs.writeFileSync(path.join(EVIDENCE_DIR, name), JSON.stringify(value, null, 2) + '\n'); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}
function canonicalDigest(value) { return sha256Bytes(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8')); }
function stableAssetId(sourceId) { return `PROGRAMMING-ASSET-${sha256Bytes(Buffer.from(sourceId)).slice(0, 16).toUpperCase()}`; }
function locatorKey(locator) { return JSON.stringify(canonicalize(locator)); }
function isSha256(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v); }

function validateManifest(manifest) {
  assert(manifest && manifest.schema_version === 1, 'MANIFEST_SCHEMA_VERSION');
  assert(manifest.manifest_id === 'PROGRAMMING-INGEST-MANIFEST-001', 'MANIFEST_ID');
  assert(manifest.candidate_system_id === 'PROGRAMMING', 'MANIFEST_CANDIDATE_SYSTEM');
  assert(manifest.architecture_authority === false, 'INGEST_MUST_NOT_HAVE_ARCHITECTURE_AUTHORITY');
  assert(manifest.coverage_contract && manifest.coverage_contract.full_byte_verification_required_for_catalog_processing_pass === false, 'COVERAGE_CONTRACT_REQUIRED');
  assert(Array.isArray(manifest.sources) && manifest.sources.length > 0, 'MANIFEST_SOURCES_REQUIRED');
  const ids = new Set();
  for (const source of manifest.sources) {
    assert(source && typeof source === 'object', 'SOURCE_SHAPE');
    assert(typeof source.source_id === 'string' && source.source_id, 'SOURCE_ID_REQUIRED');
    assert(!ids.has(source.source_id), `DUPLICATE_SOURCE_ID:${source.source_id}`);
    ids.add(source.source_id);
    assert(['GITHUB','CHATGPT_LIBRARY','HISTORICAL_REFERENCE'].includes(source.surface), `SOURCE_SURFACE:${source.source_id}`);
    assert(source.locator && typeof source.locator === 'object', `SOURCE_LOCATOR:${source.source_id}`);
    assert(typeof source.evidence_class === 'string' && source.evidence_class, `SOURCE_EVIDENCE_CLASS:${source.source_id}`);
    assert(['SUBJECT_REPO','EXTERNAL_REFERENCE_ONLY','HISTORICAL_BYTES_UNAVAILABLE','QUARANTINED'].includes(source.byte_availability), `SOURCE_BYTE_AVAILABILITY:${source.source_id}`);
    assert(['A01_VERIFY_ON_RUN','CHATGPT_PRESTAGE_OBSERVED','HISTORICAL_CLAIM','NONE','CONFLICT'].includes(source.digest_authority), `SOURCE_DIGEST_AUTHORITY:${source.source_id}`);
    if (source.expected_sha256 !== null && source.expected_sha256 !== undefined) assert(isSha256(source.expected_sha256), `SOURCE_SHA256_FORMAT:${source.source_id}`);
    if (source.surface === 'CHATGPT_LIBRARY') {
      assert(typeof source.locator.file_id === 'string' && source.locator.file_id, `LIBRARY_FILE_ID_REQUIRED:${source.source_id}`);
      assert(String(source.locator.version_id || ''), `LIBRARY_VERSION_REQUIRED:${source.source_id}`);
      assert(source.byte_availability !== 'SUBJECT_REPO', `LIBRARY_CANNOT_CLAIM_SUBJECT_BYTES:${source.source_id}`);
      assert(source.digest_authority !== 'A01_VERIFY_ON_RUN', `LIBRARY_EXTERNAL_CANNOT_CLAIM_A01_VERIFICATION:${source.source_id}`);
    }
    if (source.byte_availability === 'SUBJECT_REPO') {
      assert(source.surface === 'GITHUB', `SUBJECT_REPO_MUST_BE_GITHUB:${source.source_id}`);
      assert(typeof source.locator.path === 'string' && source.locator.path, `SUBJECT_PATH_REQUIRED:${source.source_id}`);
      assert(!path.isAbsolute(source.locator.path) && !source.locator.path.includes('..'), `UNSAFE_SUBJECT_PATH:${source.source_id}`);
    }
  }
}

function main() {
  const manifest = readJson(MANIFEST_REL);
  validateManifest(manifest);
  const authority = readJson(AUTHORITY_REL);
  assert(authority.product_root === 'SYSTEM_MASTER', 'CURRENT_AUTHORITY_ROOT');
  assert(typeof authority.topology === 'string' && authority.topology, 'CURRENT_TOPOLOGY_POINTER');
  const topology = readJson(authority.topology);
  const activeSystems = (topology.canonical_internal_systems || []).map(x => x.system_id).sort();
  assert(activeSystems.includes('CORE') && activeSystems.includes('LEARNING') && activeSystems.includes('BOOK') && activeSystems.includes('DOCUMENTS'), 'EXPECTED_ACTIVE_PEERS_MISSING');
  assert(!activeSystems.includes('PROGRAMMING'), 'PROGRAMMING_MUST_REMAIN_NONACTIVE_DURING_INGEST');
  assert(!activeSystems.includes('PROSE'), 'PROSE_MUST_REMAIN_RETIRED');
  const retired = new Set((topology.retired_systems || []).map(x => x.system_id));
  assert(retired.has('PROSE'), 'PROSE_RETIREMENT_MISSING');

  const packet = readJson(PACKET_REL);
  assert(packet.candidate_system_id === 'PROGRAMMING', 'PROGRAMMING_PACKET_ID');
  assert(packet.architecture_authority === false, 'PROGRAMMING_PACKET_MUST_NOT_BE_AUTHORITY');
  assert(String(packet.lifecycle || '').includes('NOT_ACTIVE_ARCHITECTURE'), 'PROGRAMMING_PACKET_LIFECYCLE');

  const isA01 = String(process.env.RUNNER_NAME || '').toUpperCase() === 'A-01' && String(process.env.RUNNER_OS || '').toLowerCase() === 'windows';
  const observations = [];
  const assets = [];
  const nodes = [{ node_id: 'SYSTEM_CANDIDATE::PROGRAMMING', node_kind: 'SYSTEM_CANDIDATE', label: 'Programming / Software Engineering System' }];
  for (const id of activeSystems) nodes.push({ node_id: `ACTIVE_SYSTEM::${id}`, node_kind: 'ACTIVE_SYSTEM', label: id });
  nodes.push({ node_id: 'RETIRED_SYSTEM::PROSE', node_kind: 'RETIRED_SYSTEM', label: 'PROSE' });
  const edges = [];
  const locatorOwners = new Map();
  const digestOwners = new Map();
  let actualByteCount = 0;
  let externalPendingCount = 0;
  let identityUnprovenCount = 0;
  let quarantineCount = 0;

  for (const source of [...manifest.sources].sort((a,b) => a.source_id.localeCompare(b.source_id))) {
    let observedSha = null;
    let identityState = 'IDENTITY_UNPROVEN';
    if (source.byte_availability === 'SUBJECT_REPO') {
      const full = path.join(REPO_ROOT, source.locator.path);
      assert(fs.existsSync(full) && fs.statSync(full).isFile(), `SUBJECT_SOURCE_MISSING:${source.source_id}:${source.locator.path}`);
      observedSha = sha256File(source.locator.path);
      actualByteCount += 1;
      if (source.expected_sha256) assert(observedSha === source.expected_sha256.toLowerCase(), `SUBJECT_DIGEST_MISMATCH:${source.source_id}`);
      identityState = isA01 ? 'A01_VERIFIED' : 'SUBJECT_REPO_VERIFIED';
    } else if (source.byte_availability === 'EXTERNAL_REFERENCE_ONLY') {
      externalPendingCount += 1;
      identityState = 'EXTERNAL_BYTES_PENDING';
      if (source.digest_authority === 'CHATGPT_PRESTAGE_OBSERVED') assert(isSha256(source.expected_sha256), `PRESTAGE_DIGEST_REQUIRED:${source.source_id}`);
    } else if (source.byte_availability === 'QUARANTINED' || source.digest_authority === 'CONFLICT') {
      quarantineCount += 1;
      identityState = 'QUARANTINE_CONFLICT';
    } else {
      identityUnprovenCount += 1;
      identityState = 'IDENTITY_UNPROVEN';
    }

    const assetId = stableAssetId(source.source_id);
    const sourceNode = `SOURCE::${source.source_id}`;
    nodes.push({ node_id: sourceNode, node_kind: 'SOURCE', label: source.locator.name || source.locator.path || source.source_id });
    nodes.push({ node_id: assetId, node_kind: 'ASSET', label: source.evidence_class });
    edges.push({ edge_id: `EDGE::${assetId}::DERIVED_FROM`, from: assetId, to: sourceNode, relation: 'DERIVED_FROM', source_ids: [source.source_id] });
    for (const affinity of source.system_affinity || ['PROGRAMMING']) {
      const target = affinity === 'PROGRAMMING' ? 'SYSTEM_CANDIDATE::PROGRAMMING' : (activeSystems.includes(affinity) ? `ACTIVE_SYSTEM::${affinity}` : null);
      if (target) edges.push({ edge_id: `EDGE::${assetId}::AFFINITY::${affinity}`, from: assetId, to: target, relation: 'HAS_AFFINITY_TO', source_ids: [source.source_id] });
    }

    const catalogSha = observedSha || (isSha256(source.expected_sha256) ? source.expected_sha256.toLowerCase() : null);
    assets.push({
      asset_id: assetId,
      source_id: source.source_id,
      asset_kind: source.evidence_class,
      system_affinity: source.system_affinity || ['PROGRAMMING'],
      reuse_disposition: source.reuse_disposition,
      identity_state: identityState,
      sha256: catalogSha,
      locator: source.locator,
      evidence_class: source.evidence_class,
      notes: source.notes || ''
    });
    observations.push({
      source_id: source.source_id,
      surface: source.surface,
      byte_availability: source.byte_availability,
      digest_authority_before_run: source.digest_authority,
      expected_sha256: source.expected_sha256 || null,
      observed_sha256: observedSha,
      identity_state: identityState,
      a01_observed_bytes: Boolean(isA01 && observedSha)
    });

    const lk = locatorKey(source.locator);
    if (!locatorOwners.has(lk)) locatorOwners.set(lk, []);
    locatorOwners.get(lk).push(source.source_id);
    if (catalogSha) {
      if (!digestOwners.has(catalogSha)) digestOwners.set(catalogSha, []);
      digestOwners.get(catalogSha).push(source.source_id);
    }
  }

  const duplicateGroups = [];
  for (const [key, ids] of locatorOwners.entries()) if (ids.length > 1) duplicateGroups.push({ basis: 'LOCATOR', key, source_ids: ids.sort() });
  for (const [digest, ids] of digestOwners.entries()) if (ids.length > 1) duplicateGroups.push({ basis: 'SHA256', key: digest, source_ids: ids.sort() });
  let dupCounter = 0;
  for (const group of duplicateGroups) {
    const ids = group.source_ids;
    for (let i = 1; i < ids.length; i += 1) {
      const from = stableAssetId(ids[i]); const to = stableAssetId(ids[0]);
      edges.push({ edge_id: `EDGE::DUPLICATE::${String(++dupCounter).padStart(4,'0')}`, from, to, relation: 'DUPLICATES', source_ids: [ids[0], ids[i]].sort() });
    }
  }

  const assetCatalog = {
    catalog_id: 'PROGRAMMING-RECOVERED-ASSET-CATALOG-PILOT-001',
    schema_version: 1,
    candidate_system_id: 'PROGRAMMING',
    architecture_authority: false,
    assets: assets.sort((a,b) => a.asset_id.localeCompare(b.asset_id))
  };
  const traceGraph = {
    graph_id: 'PROGRAMMING-RECOVERED-TRACE-GRAPH-PILOT-001',
    schema_version: 1,
    candidate_system_id: 'PROGRAMMING',
    architecture_authority: false,
    nodes: nodes.sort((a,b) => a.node_id.localeCompare(b.node_id)),
    edges: edges.sort((a,b) => a.edge_id.localeCompare(b.edge_id))
  };

  const nodeIds = new Set(traceGraph.nodes.map(n => n.node_id));
  const sourceIds = new Set(manifest.sources.map(s => s.source_id));
  for (const edge of traceGraph.edges) {
    assert(nodeIds.has(edge.from), `DANGLING_EDGE_FROM:${edge.edge_id}`);
    assert(nodeIds.has(edge.to), `DANGLING_EDGE_TO:${edge.edge_id}`);
    for (const sid of edge.source_ids) assert(sourceIds.has(sid), `DANGLING_EDGE_SOURCE:${edge.edge_id}:${sid}`);
  }
  assert(assetCatalog.architecture_authority === false && traceGraph.architecture_authority === false, 'DERIVED_OUTPUT_CANNOT_HAVE_ARCHITECTURE_AUTHORITY');

  const assetDigest = canonicalDigest(assetCatalog);
  const graphDigest = canonicalDigest(traceGraph);
  const sourceObservationCanonical = observations.map(x => ({...x})).sort((a,b) => a.source_id.localeCompare(b.source_id));
  const observationDigest = canonicalDigest(sourceObservationCanonical);
  const total = manifest.sources.length;
  const report = {
    report_id: 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-PROGRAMMING-001',
    qualification_scope: 'PIPELINE_INTEGRITY_AND_FROZEN_CORPUS_METADATA_PROCESSING',
    candidate_system_id: 'PROGRAMMING',
    architecture_mutation_performed: false,
    second_shift_eligible: false,
    a01_runner_observed: isA01,
    active_systems_unchanged: activeSystems,
    source_count: total,
    source_records_processed: observations.length,
    metadata_coverage: { processed: observations.length, total, percent: total ? 100 : 0 },
    byte_verification_coverage: {
      bytes_read_from_exact_subject_sources: actualByteCount,
      external_bytes_pending: externalPendingCount,
      identity_unproven: identityUnprovenCount,
      quarantine_conflicts: quarantineCount,
      total_source_records: total,
      full_historical_byte_corpus_verified: externalPendingCount === 0 && identityUnprovenCount === 0 && quarantineCount === 0
    },
    duplicate_groups_detected: duplicateGroups.length,
    canonical_digests: {
      asset_catalog_sha256: assetDigest,
      trace_graph_sha256: graphDigest,
      source_observations_sha256: observationDigest
    },
    standing: externalPendingCount || identityUnprovenCount || quarantineCount ? 'PASS_PIPELINE__EXTERNAL_BYTE_RECOVERY_REMAINS' : 'PASS_PIPELINE__FULL_FROZEN_BYTES_OBSERVED',
    claims_not_made: [
      'PROGRAMMING is an active peer system',
      'all historical Programming bytes were verified',
      'historical research/build-spec closure implies implementation',
      'portable evidence implies Apple-native or production evidence',
      'Second Shift eligibility before supervised receipt review'
    ]
  };

  writeJson('programming-source-observations.json', sourceObservationCanonical);
  writeJson('programming-asset-catalog.json', assetCatalog);
  writeJson('programming-trace-graph.json', traceGraph);
  writeJson('knowledge-recovery-report.json', report);
  console.log(`SYSTEM_MASTER_KNOWLEDGE_RECOVERY=PASS sources=${total} subject_bytes=${actualByteCount} external_pending=${externalPendingCount} identity_unproven=${identityUnprovenCount} quarantine=${quarantineCount}`);
  console.log(`PROGRAMMING_ASSET_CATALOG_SHA256=${assetDigest}`);
  console.log(`PROGRAMMING_TRACE_GRAPH_SHA256=${graphDigest}`);
  console.log('SECOND_SHIFT_ELIGIBLE=false');
}

try { main(); } catch (error) { console.error(`SYSTEM_MASTER_KNOWLEDGE_RECOVERY=FAIL ${error.stack || error.message}`); process.exit(1); }
