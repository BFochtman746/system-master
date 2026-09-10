'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const contractPath = path.join(root, 'qualification/book-system/book-prose-integration/orchestrator/BOOK-WORKFLOW-ORCHESTRATOR-AUTHORITY-CONTRACT-001.json');
const outputDir = process.env.RUNNER_TEMP || root;
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

const REQUIRED_FORBIDDEN = [
  'DIRECT_CANONICAL_MANUSCRIPT_WRITE',
  'DIRECT_MANUSCRIPT_VERSION_PROMOTION',
  'DIRECT_CONTENT_OBJECT_ADMISSION_MUTATION',
  'LITERARY_SUPERIORITY_DECISION_BY_ORCHESTRATOR',
  'CANON_TRUTH_CREATION_OR_RETCON',
  'RESEARCH_FACT_TRUTH_INVENTION',
  'PROSE_HARD_GATE_BYPASS',
  'STORY_BIBLE_CANON_BYPASS',
  'REQUIRED_EVALUATOR_BYPASS',
  'BOOK_ADMISSION_BYPASS',
  'SELF_APPROVE_SPECIALIST_OUTPUT',
  'SELF_ADMIT_CANDIDATE',
  'IMPERSONATE_AUTHOR_OR_SYNTHESIZE_AUTHOR_CONSENT',
  'CONVERT_EVALUATOR_ACCEPTANCE_DIRECTLY_TO_CANONICAL_STATE',
  'TREAT_PROSE_CANDIDATE_AS_CANONICAL_BECAUSE_GENERATION_SUCCEEDED',
  'TRANSFER_A01_PASS_BETWEEN_SUBJECTS',
  'CLAIM_NATIVE_PUBLICATION_OR_PRODUCTION_AUTHORITY_FROM_HOSTED_EVIDENCE',
  'ACCESS_FRESH_BLIND_GROUND_TRUTH_FROM_CONTAMINATED_OWNER_CONTEXT',
  'CREATE_SECOND_DURABLE_EXECUTION_AUTHORITY_DOMAIN'
];

const REQUIRED_FAIL_CLOSED = [
  'UNKNOWN_CAPABILITY_OWNER',
  'AMBIGUOUS_AUTHORITY',
  'STALE_MANUSCRIPT_OR_CONTEXT_IDENTITY',
  'MISSING_REQUIRED_CONTEXT',
  'MISSING_REQUIRED_SPECIALIST_EVIDENCE',
  'SPECIALIST_HARD_GATE_FAILURE',
  'CANON_CONFLICT',
  'AUTHOR_DECISION_REQUIRED_BUT_ABSENT',
  'ADMISSION_PRECONDITION_UNRESOLVED',
  'BLINDNESS_CONTAMINATION',
  'REPLAY_IDENTITY_MISMATCH'
];

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sha(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function includesText(arr, fragment) { return Array.isArray(arr) && arr.some(x => typeof x === 'string' && x.includes(fragment)); }
function assert(cond, code) { if (!cond) { const e = new Error(code); e.code = code; throw e; } }

function validate(c) {
  assert(c && typeof c === 'object' && !Array.isArray(c), 'CONTRACT_OBJECT_REQUIRED');
  for (const field of ['contract_id','contract_version','owner_path','component_id','component_class','purpose','parent_authority','shared_execution_authority','canonical_mutation_authority','specialist_authority_boundaries','allowed_responsibilities','forbidden_capabilities','authority_precedence','coordination_invariants','execution_model_boundary','fail_closed_conditions','qualification_requirements']) {
    assert(Object.prototype.hasOwnProperty.call(c, field), `REQUIRED_FIELD_MISSING:${field}`);
  }
  assert(c.contract_id === 'BOOK-WORKFLOW-ORCHESTRATOR-AUTHORITY-CONTRACT-001', 'CONTRACT_ID_MISMATCH');
  assert(c.component_class === 'COORDINATION_ONLY', 'ORCHESTRATOR_NOT_COORDINATION_ONLY');
  assert(c.owner_path === 'SYSTEM_MASTER/BOOK', 'BOOK_OWNER_PATH_MISMATCH');
  assert(c.parent_authority === 'SYSTEM_MASTER/BOOK', 'BOOK_PARENT_AUTHORITY_MISMATCH');
  assert(c.canonical_mutation_authority && c.canonical_mutation_authority.owner === 'SYSTEM_MASTER/BOOK', 'BOOK_NOT_CANONICAL_MUTATION_OWNER');
  assert(c.canonical_mutation_authority.entrypoint === 'system-master/book-system/content-object-admission.js', 'BOOK_ADMISSION_ENTRYPOINT_MISMATCH');
  const prose = c.specialist_authority_boundaries && c.specialist_authority_boundaries.PROSE;
  assert(prose && prose.owner === 'SYSTEM_MASTER/BOOK/PROSE', 'PROSE_OWNER_MISMATCH');
  assert(prose.canonical_write === false, 'PROSE_CANONICAL_WRITE_MUST_BE_FALSE');
  const bookAdmission = c.specialist_authority_boundaries && c.specialist_authority_boundaries.BOOK_ADMISSION;
  assert(bookAdmission && bookAdmission.canonical_manuscript_write === true, 'BOOK_ADMISSION_CANONICAL_WRITE_REQUIRED');
  assert(c.specialist_authority_boundaries.AUTHOR && /FINAL_CREATIVE_AND_SEMANTIC/.test(c.specialist_authority_boundaries.AUTHOR.authority), 'AUTHOR_FINAL_AUTHORITY_REQUIRED');
  assert(c.specialist_authority_boundaries.STORY_BIBLE_CANON && /CANON_TRUTH/.test(c.specialist_authority_boundaries.STORY_BIBLE_CANON.authority), 'STORY_BIBLE_CANON_AUTHORITY_REQUIRED');
  assert(c.specialist_authority_boundaries.RESEARCH_EVIDENCE && /EXTERNAL_EVIDENCE_TRUTH/.test(c.specialist_authority_boundaries.RESEARCH_EVIDENCE.authority), 'RESEARCH_TRUTH_AUTHORITY_REQUIRED');
  assert(Array.isArray(c.allowed_responsibilities) && c.allowed_responsibilities.length >= 10, 'ALLOWED_RESPONSIBILITIES_INCOMPLETE');
  assert(Array.isArray(c.forbidden_capabilities), 'FORBIDDEN_CAPABILITIES_ARRAY_REQUIRED');
  for (const cap of REQUIRED_FORBIDDEN) assert(c.forbidden_capabilities.includes(cap), `FORBIDDEN_CAPABILITY_MISSING:${cap}`);
  for (const cap of c.forbidden_capabilities) assert(!c.allowed_responsibilities.includes(cap), `FORBIDDEN_CAPABILITY_ALLOWED:${cap}`);
  assert(c.execution_model_boundary.orchestrator_may_mutate_canonical_book_state === false, 'ORCHESTRATOR_CANONICAL_MUTATION_MUST_BE_FALSE');
  assert(c.execution_model_boundary.orchestrator_may_grant_qualification_pass === false, 'ORCHESTRATOR_QUALIFICATION_AUTHORITY_MUST_BE_FALSE');
  assert(c.execution_model_boundary.orchestrator_may_grant_a01_pass === false, 'ORCHESTRATOR_A01_AUTHORITY_MUST_BE_FALSE');
  assert(includesText(c.coordination_invariants, 'LEVEL_0_NO_CHANGE'), 'LEVEL_0_NO_CHANGE_NOT_PRESERVED');
  assert(includesText(c.coordination_invariants, 'Fresh-context blind evaluation'), 'FRESH_BLIND_BOUNDARY_MISSING');
  assert(includesText(c.coordination_invariants, 'missing required specialist receipt') || includesText(c.coordination_invariants, 'missing required specialist'), 'MISSING_EVIDENCE_FAIL_CLOSED_INVARIANT_MISSING');
  assert(Array.isArray(c.fail_closed_conditions), 'FAIL_CLOSED_ARRAY_REQUIRED');
  for (const item of REQUIRED_FAIL_CLOSED) assert(c.fail_closed_conditions.includes(item), `FAIL_CLOSED_CONDITION_MISSING:${item}`);
  assert(c.required_next_packet_on_pass === 'BOOK-WORKFLOW-ORCHESTRATOR-WORKFLOW-STATE-MODEL-001', 'NEXT_PACKET_MISMATCH');
  return true;
}

const results = [];
let assertions = 0;
function passCase(id, fn) {
  fn();
  assertions += 1;
  results.push({ case_id: id, result: 'PASS' });
}
function rejectMutation(id, mutate, acceptedCodes) {
  const copy = clone(contract);
  mutate(copy);
  try {
    validate(copy);
  } catch (e) {
    assertions += 1;
    const code = String(e && e.code || e && e.message || 'UNKNOWN');
    assert(acceptedCodes.some(x => code.startsWith(x)), `${id}:WRONG_FAILURE:${code}`);
    results.push({ case_id: id, result: 'PASS', observed: code });
    return;
  }
  throw new Error(`${id}:UNSAFE_MUTATION_ACCEPTED`);
}

passCase('OWA-001-BASE-CONTRACT', () => validate(contract));
passCase('OWA-002-DETERMINISTIC-HASH', () => assert(sha(contract) === sha(clone(contract)), 'NONDETERMINISTIC_CONTRACT_HASH'));
rejectMutation('OWA-003-COORDINATION-ONLY', c => { c.component_class = 'CANONICAL_WRITER'; }, ['ORCHESTRATOR_NOT_COORDINATION_ONLY']);
rejectMutation('OWA-004-PROSE-NO-WRITE', c => { c.specialist_authority_boundaries.PROSE.canonical_write = true; }, ['PROSE_CANONICAL_WRITE_MUST_BE_FALSE']);
rejectMutation('OWA-005-BOOK-ADMISSION-WRITER', c => { c.specialist_authority_boundaries.BOOK_ADMISSION.canonical_manuscript_write = false; }, ['BOOK_ADMISSION_CANONICAL_WRITE_REQUIRED']);
rejectMutation('OWA-006-NO-BYPASS-DROP', c => { c.forbidden_capabilities = c.forbidden_capabilities.filter(x => x !== 'PROSE_HARD_GATE_BYPASS'); }, ['FORBIDDEN_CAPABILITY_MISSING']);
rejectMutation('OWA-007-NO-FORBIDDEN-AS-ALLOWED', c => { c.allowed_responsibilities.push('SELF_ADMIT_CANDIDATE'); }, ['FORBIDDEN_CAPABILITY_ALLOWED']);
rejectMutation('OWA-008-NO-DIRECT-CANON-MUTATION', c => { c.execution_model_boundary.orchestrator_may_mutate_canonical_book_state = true; }, ['ORCHESTRATOR_CANONICAL_MUTATION_MUST_BE_FALSE']);
rejectMutation('OWA-009-AUTHOR-AUTHORITY', c => { delete c.specialist_authority_boundaries.AUTHOR; }, ['AUTHOR_FINAL_AUTHORITY_REQUIRED']);
rejectMutation('OWA-010-STORY-BIBLE-AUTHORITY', c => { delete c.specialist_authority_boundaries.STORY_BIBLE_CANON; }, ['STORY_BIBLE_CANON_AUTHORITY_REQUIRED']);
rejectMutation('OWA-011-RESEARCH-AUTHORITY', c => { delete c.specialist_authority_boundaries.RESEARCH_EVIDENCE; }, ['RESEARCH_TRUTH_AUTHORITY_REQUIRED']);
rejectMutation('OWA-012-LEVEL0-PRESERVED', c => { c.coordination_invariants = c.coordination_invariants.filter(x => !x.includes('LEVEL_0_NO_CHANGE')); }, ['LEVEL_0_NO_CHANGE_NOT_PRESERVED']);
rejectMutation('OWA-013-BLINDNESS-PRESERVED', c => { c.coordination_invariants = c.coordination_invariants.filter(x => !x.includes('Fresh-context blind evaluation')); }, ['FRESH_BLIND_BOUNDARY_MISSING']);
rejectMutation('OWA-014-MISSING-EVIDENCE-FAIL-CLOSED', c => { c.fail_closed_conditions = c.fail_closed_conditions.filter(x => x !== 'MISSING_REQUIRED_SPECIALIST_EVIDENCE'); }, ['FAIL_CLOSED_CONDITION_MISSING']);
rejectMutation('OWA-015-NO-QUALIFICATION-AUTHORITY', c => { c.execution_model_boundary.orchestrator_may_grant_qualification_pass = true; }, ['ORCHESTRATOR_QUALIFICATION_AUTHORITY_MUST_BE_FALSE']);
rejectMutation('OWA-016-NO-A01-AUTHORITY', c => { c.execution_model_boundary.orchestrator_may_grant_a01_pass = true; }, ['ORCHESTRATOR_A01_AUTHORITY_MUST_BE_FALSE']);

const summary = {
  qualification_id: 'BOOK-WORKFLOW-ORCHESTRATOR-AUTHORITY-CONTRACT-001-QUALIFICATION',
  result: results.every(x => x.result === 'PASS') && results.length === 16 ? 'PASS' : 'FAIL',
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  contract_sha256: sha(contract),
  fixture_class: 'SYNTHETIC_NON_PRIVATE_AUTHORITY_CONTRACT',
  planned_cases: 16,
  passed_cases: results.filter(x => x.result === 'PASS').length,
  assertions,
  fresh_blind_scoring_executed: false,
  manuscript_mutation_executed: false,
  prose_runtime_mutated: false,
  a01_pass_claimed: false,
  native_publication_production_claimed: false,
  results
};

const out = path.join(outputDir, 'book-workflow-orchestrator-authority-contract-001-summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.result !== 'PASS') process.exit(1);
