'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const sourcePath = path.join(root, 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const contractPath = path.join(root, 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-PREREQUISITE-SUBSKILL-TOPOLOGY-CONTRACT-002.json');
const candidatePath = path.join(root, 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');

function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function fail(code, detail = '') { throw new Error(detail ? `${code}:${detail}` : code); }
function ok(value, code, detail = '') { if (!value) fail(code, detail); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

const source = load(sourcePath);
const contract = load(contractPath);
const candidate = load(candidatePath);
let checks = 0;
function check(v, code, detail = '') { checks += 1; ok(v, code, detail); }

check(source.node_count === 66, 'SOURCE_NODE_COUNT', String(source.node_count));
check(Array.isArray(source.nodes) && source.nodes.length === 66, 'SOURCE_NODE_ARRAY_COUNT');
check(source.source && source.source.owner_version === '2022 CSSGB BoK', 'SOURCE_VERSION_DRIFT');
check(text(source.source.requirement_set_digest), 'SOURCE_REQUIREMENT_DIGEST_MISSING');
check(contract.frozen_requirement_set.requirement_count === 66, 'CONTRACT_REQUIREMENT_COUNT');
check(contract.frozen_requirement_set.source_version === '2022', 'CONTRACT_SOURCE_VERSION');
check(contract.frozen_requirement_set.requirement_set_digest === source.source.requirement_set_digest, 'CONTRACT_SOURCE_DIGEST_MISMATCH');
check(candidate.requirement_count === 66, 'CANDIDATE_REQUIREMENT_COUNT');
check(candidate.source_version === '2022', 'CANDIDATE_SOURCE_VERSION');
check(candidate.requirement_set_digest === source.source.requirement_set_digest, 'CANDIDATE_SOURCE_DIGEST_MISMATCH');

const requirementIds = new Set();
for (const row of source.nodes) {
  check(Array.isArray(row) && row.length === 5, 'INVALID_SOURCE_ROW');
  const [id, code, locator, cognitive, title] = row;
  check(text(id) && text(code) && text(locator) && text(cognitive) && text(title), 'INVALID_SOURCE_ROW_FIELD', String(id));
  check(!requirementIds.has(id), 'DUPLICATE_REQUIREMENT_ID', id);
  requirementIds.add(id);
  check(locator.includes('2022'), 'SOURCE_LOCATOR_VERSION_DRIFT', id);
}
check(requirementIds.size === 66, 'UNIQUE_REQUIREMENT_COUNT');

check(Array.isArray(candidate.prerequisite_edges), 'PREREQUISITE_EDGES_ARRAY_REQUIRED');
check(Array.isArray(candidate.subskills), 'SUBSKILLS_ARRAY_REQUIRED');
check(Array.isArray(candidate.unresolved_dependency_candidates), 'UNRESOLVED_ARRAY_REQUIRED');
check(candidate.canonical_admission_ready === false || candidate.derivation_status === 'FULL_TOPOLOGY_VALIDATED', 'PREMATURE_CANONICAL_ADMISSION');

const subskills = new Map();
for (const s of candidate.subskills) {
  for (const field of ['subskill_id','parent_requirement_id','label','capability_statement','derivation_class','evidence_refs','assessment_target_status','validation_status']) {
    check(Object.prototype.hasOwnProperty.call(s, field), 'SUBSKILL_FIELD_MISSING', `${s.subskill_id || '?'}:${field}`);
  }
  check(text(s.subskill_id) && s.subskill_id.startsWith(`CSSGB-2022::${s.parent_requirement_id}::SUBSKILL::`), 'INVALID_SUBSKILL_ID', String(s.subskill_id));
  check(requirementIds.has(s.parent_requirement_id), 'UNKNOWN_SUBSKILL_PARENT', s.parent_requirement_id);
  check(!subskills.has(s.subskill_id), 'DUPLICATE_SUBSKILL_IDENTITY', s.subskill_id);
  check(['SOURCE_EXPLICIT','LEARNING_OWNER_DERIVED_PROVISIONAL'].includes(s.derivation_class), 'INVALID_SUBSKILL_DERIVATION', s.subskill_id);
  check(Array.isArray(s.evidence_refs) && s.evidence_refs.length > 0, 'SUBSKILL_EVIDENCE_REQUIRED', s.subskill_id);
  check(s.assessment_target_status === 'UNBOUND' || s.assessment_target_status === 'BOUND', 'INVALID_ASSESSMENT_TARGET_STATUS', s.subskill_id);
  subskills.set(s.subskill_id, s);
}

const nodes = new Set([...requirementIds, ...subskills.keys()]);
const graph = new Map([...nodes].map(x => [x, []]));
const edgeIds = new Set();
for (const e of candidate.prerequisite_edges) {
  for (const field of ['edge_id','edge_type','from_id','to_id','derivation_class','rationale','evidence_refs','validation_status']) {
    check(Object.prototype.hasOwnProperty.call(e, field), 'EDGE_FIELD_MISSING', `${e.edge_id || '?'}:${field}`);
  }
  check(text(e.edge_id) && !edgeIds.has(e.edge_id), 'DUPLICATE_OR_INVALID_EDGE_ID', String(e.edge_id));
  edgeIds.add(e.edge_id);
  check(['PREREQUISITE','DECOMPOSES_TO'].includes(e.edge_type), 'INVALID_EDGE_TYPE', e.edge_id);
  check(nodes.has(e.from_id) && nodes.has(e.to_id), 'UNRESOLVED_PREREQUISITE', e.edge_id);
  check(e.from_id !== e.to_id, 'SELF_EDGE_FORBIDDEN', e.edge_id);
  check(['SOURCE_EXPLICIT','LEARNING_OWNER_DERIVED_PROVISIONAL'].includes(e.derivation_class), 'INVALID_EDGE_DERIVATION', e.edge_id);
  check(text(e.rationale), 'EDGE_RATIONALE_REQUIRED', e.edge_id);
  check(Array.isArray(e.evidence_refs) && e.evidence_refs.length > 0, 'EDGE_EVIDENCE_REQUIRED', e.edge_id);
  if (e.edge_type === 'PREREQUISITE') graph.get(e.from_id).push(e.to_id);
  if (e.edge_type === 'DECOMPOSES_TO') {
    check(requirementIds.has(e.from_id) && subskills.has(e.to_id), 'INVALID_DECOMPOSITION_EDGE', e.edge_id);
    check(subskills.get(e.to_id).parent_requirement_id === e.from_id, 'SUBSKILL_PARENT_EDGE_MISMATCH', e.edge_id);
  }
}

const mark = new Map();
function visit(id) {
  if (mark.get(id) === 1) fail('UNJUSTIFIED_PREREQUISITE_CYCLE', id);
  if (mark.get(id) === 2) return;
  mark.set(id, 1);
  for (const next of graph.get(id) || []) visit(next);
  mark.set(id, 2);
}
for (const id of nodes) visit(id);
checks += 1;

for (const s of subskills.values()) {
  const reachable = candidate.prerequisite_edges.some(e => e.edge_type === 'DECOMPOSES_TO' && e.from_id === s.parent_requirement_id && e.to_id === s.subskill_id);
  check(reachable, 'ORPHAN_SUBSKILL', s.subskill_id);
}

const human = candidate.human_outcomes || {};
for (const field of ['learner_mastery','retention','transfer','workplace_effectiveness','psychometric_validity','sme_approval','certification_equivalence']) {
  check(human[field] === 'UNOBSERVED', 'UNAUTHORIZED_HUMAN_EVIDENCE_INFERENCE', field);
}

for (const unresolved of candidate.unresolved_dependency_candidates) {
  check(unresolved && typeof unresolved === 'object' && !Array.isArray(unresolved), 'INVALID_UNRESOLVED_CANDIDATE');
  check(text(unresolved.candidate_id) && text(unresolved.reason), 'UNRESOLVED_CANDIDATE_FIELDS');
  check(unresolved.admission_status === 'UNRESOLVED__NOT_CANONICAL', 'UNRESOLVED_CANDIDATE_PREMATURE_ADMISSION', unresolved.candidate_id);
}

const result = {
  qualification: 'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-DERIVATION-VALIDATOR-003',
  standing: 'VALIDATOR_FOUNDATION_PASS__TOPOLOGY_POPULATION_INCOMPLETE',
  checks,
  requirement_nodes: requirementIds.size,
  subskills: subskills.size,
  prerequisite_edges: candidate.prerequisite_edges.filter(e => e.edge_type === 'PREREQUISITE').length,
  decomposition_edges: candidate.prerequisite_edges.filter(e => e.edge_type === 'DECOMPOSES_TO').length,
  unresolved_candidates: candidate.unresolved_dependency_candidates.length,
  canonical_admission_ready: candidate.canonical_admission_ready,
  source_digest: source.source.requirement_set_digest,
  contract_digest: contract.frozen_requirement_set.requirement_set_digest,
  candidate_fingerprint: stable(candidate).length,
  human_outcomes: 'UNOBSERVED',
};
console.log(JSON.stringify(result));
