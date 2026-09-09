'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-system-canonical-state');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(runnerTemp, `book-system-canonical-state-001-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const modelRel = 'qualification/book-system/canonical-state-001/BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001.json';
const fixturesRel = 'qualification/book-system/canonical-state-001/CANONICAL-BOOK-STATE-FIXTURES-001.json';
const scriptRel = '.github/scripts/book-system-canonical-state-001-qualify.js';
const modelPath = path.join(workspace, ...modelRel.split('/'));
const fixturesPath = path.join(workspace, ...fixturesRel.split('/'));

class ModelError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new ModelError(code, detail);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, patch) {
  if (!isPlainObject(patch)) return deepClone(patch);
  const out = isPlainObject(target) ? deepClone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value)) out[key] = deepMerge(out[key], value);
    else out[key] = deepClone(value);
  }
  return out;
}

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableNormalize(value[key]);
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, 'utf8'));
}

function digestState(state) {
  return sha256Text(stableStringify(state));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function requireFields(obj, required, context) {
  if (!isPlainObject(obj)) fail('OBJECT_REQUIRED', context);
  for (const field of required) {
    if (!hasOwn(obj, field)) fail('REQUIRED_FIELD_MISSING', `${context}.${field}`);
  }
}

function validateId(value, regex, context) {
  if (typeof value !== 'string' || !regex.test(value)) fail('INVALID_ID', `${context}:${String(value)}`);
}

function validateDigest(value, regex, context) {
  if (typeof value !== 'string' || !regex.test(value)) fail('INVALID_SHA256_DIGEST', `${context}:${String(value)}`);
}

function validateState(state, model) {
  requireFields(state, model.aggregate.required, 'state');
  if (state.schema_version !== model.version) fail('SCHEMA_VERSION_MISMATCH', String(state.schema_version));
  if (!Number.isInteger(state.state_version) || state.state_version < 1) fail('INVALID_STATE_VERSION', String(state.state_version));

  requireFields(state.book_project, model.object_types.BOOK_PROJECT.required, 'book_project');
  const idRegex = new RegExp(model.id_rules.format);
  const digestRegex = new RegExp(model.digest_rules.format);
  validateId(state.book_project.book_project_id, idRegex, 'book_project.book_project_id');
  validateId(state.book_project.book_id, idRegex, 'book_project.book_id');
  if (!model.project_statuses.includes(state.book_project.status)) fail('INVALID_PROJECT_STATUS', state.book_project.status);

  const collectionSpecs = [
    ['governing_briefs', 'GOVERNING_BRIEF', 'brief_id'],
    ['canon_manifests', 'CANON_MANIFEST', 'canon_manifest_id'],
    ['story_bibles', 'STORY_BIBLE', 'story_bible_id'],
    ['book_plans', 'BOOK_PLAN', 'plan_id'],
    ['manuscripts', 'MANUSCRIPT_MANIFEST', 'version_id'],
    ['research_evidence_links', 'RESEARCH_EVIDENCE_LINK', 'link_id'],
    ['author_decisions', 'AUTHOR_DECISION', 'decision_id'],
    ['integration_proposals', 'INTEGRATION_PROPOSAL_REF', 'proposal_id'],
    ['export_releases', 'EXPORT_RELEASE', 'release_id'],
  ];

  for (const [collectionName, typeName, idField] of collectionSpecs) {
    const collection = state[collectionName];
    if (!isPlainObject(collection)) fail('COLLECTION_REQUIRED', collectionName);
    const spec = model.object_types[typeName];
    for (const [key, obj] of Object.entries(collection)) {
      requireFields(obj, spec.required, `${collectionName}.${key}`);
      if (obj[idField] !== key) fail('COLLECTION_KEY_ID_MISMATCH', `${collectionName}.${key}`);
      validateId(obj[idField], idRegex, `${collectionName}.${key}.${idField}`);
      if (typeName === 'MANUSCRIPT_MANIFEST') {
        validateDigest(obj.artifact_digest, digestRegex, `${collectionName}.${key}.artifact_digest`);
        if (!model.authority_states.includes(obj.authority_state)) fail('INVALID_MANUSCRIPT_AUTHORITY_STATE', obj.authority_state);
      }
      if (typeName === 'RESEARCH_EVIDENCE_LINK') {
        if (!model.research_freshness_states.includes(obj.freshness_state)) fail('INVALID_RESEARCH_FRESHNESS_STATE', obj.freshness_state);
        if (!model.research_conflict_states.includes(obj.conflict_state)) fail('INVALID_RESEARCH_CONFLICT_STATE', obj.conflict_state);
      }
      if (typeName === 'AUTHOR_DECISION') {
        if (!model.author_decision_statuses.includes(obj.status)) fail('INVALID_AUTHOR_DECISION_STATUS', obj.status);
      }
      if (typeName === 'INTEGRATION_PROPOSAL_REF') {
        if (!model.integration_admission_states.includes(obj.admission_state)) fail('INVALID_INTEGRATION_ADMISSION_STATE', obj.admission_state);
      }
      if (typeName === 'EXPORT_RELEASE') {
        validateDigest(obj.digest, digestRegex, `${collectionName}.${key}.digest`);
      }
    }
  }

  requireFields(state.active, model.aggregate.active_required, 'active');
  const pointerChecks = [
    ['governing_brief_ref', 'governing_briefs'],
    ['canon_manifest_ref', 'canon_manifests'],
    ['story_bible_ref', 'story_bibles'],
    ['book_plan_ref', 'book_plans'],
    ['canonical_manuscript_ref', 'manuscripts'],
  ];
  for (const [field, collection] of pointerChecks) {
    const ref = state.active[field];
    if (typeof ref !== 'string' || !hasOwn(state[collection], ref)) fail('ACTIVE_POINTER_UNRESOLVED', `${field}:${String(ref)}`);
  }
  if (state.book_project.governing_brief_ref !== state.active.governing_brief_ref) fail('BOOK_PROJECT_ACTIVE_BRIEF_MISMATCH');
  if (state.book_project.canonical_manifest_ref !== state.active.canon_manifest_ref) fail('BOOK_PROJECT_ACTIVE_CANON_MISMATCH');
  const canonicalManuscript = state.manuscripts[state.active.canonical_manuscript_ref];
  if (canonicalManuscript.authority_state !== 'CANONICAL') fail('ACTIVE_MANUSCRIPT_NOT_CANONICAL');

  return true;
}

const canonicalOps = new Set([
  'ADVANCE_PROJECT_STATUS',
  'SET_ACTIVE_GOVERNING_BRIEF',
  'SET_ACTIVE_CANON_MANIFEST',
  'SET_ACTIVE_STORY_BIBLE',
  'SET_ACTIVE_BOOK_PLAN',
  'SET_ACTIVE_CANONICAL_MANUSCRIPT',
]);

const actorAllowedOps = {
  PARENT_SYSTEM: new Set([
    'ADVANCE_PROJECT_STATUS',
    'SET_ACTIVE_GOVERNING_BRIEF',
    'SET_ACTIVE_CANON_MANIFEST',
    'SET_ACTIVE_STORY_BIBLE',
    'SET_ACTIVE_BOOK_PLAN',
    'SET_ACTIVE_CANONICAL_MANUSCRIPT',
    'REGISTER_RESEARCH_EVIDENCE_LINK',
    'REGISTER_AUTHOR_DECISION',
    'REGISTER_INTEGRATION_PROPOSAL',
    'REGISTER_EXPORT_RELEASE',
  ]),
  AUTHOR: new Set(['REGISTER_AUTHOR_DECISION']),
  PROSE_PROJECT: new Set(['REGISTER_INTEGRATION_PROPOSAL']),
  BOOK_EVALUATOR: new Set(['REGISTER_INTEGRATION_PROPOSAL']),
  RESEARCH_IMPORT: new Set(['REGISTER_RESEARCH_EVIDENCE_LINK']),
};

function requireObjectForRegistration(operation, model, typeName, context) {
  const obj = operation.object;
  requireFields(obj, model.object_types[typeName].required, context);
  return deepClone(obj);
}

function applyMutation(originalState, mutation, model) {
  validateState(originalState, model);
  requireFields(mutation, model.mutation_envelope.required, 'mutation');
  if (!model.authority_classes.includes(mutation.actor_class)) fail('UNKNOWN_ACTOR_CLASS', mutation.actor_class);
  if (!Array.isArray(mutation.operations) || mutation.operations.length === 0) fail('MUTATION_OPERATIONS_REQUIRED');
  if (mutation.expected_state_version !== originalState.state_version) fail('STATE_VERSION_MISMATCH');
  const currentDigest = digestState(originalState);
  if (mutation.expected_state_digest !== currentDigest) fail('STATE_DIGEST_MISMATCH');
  if (mutation.rollback_state_version !== originalState.state_version) fail('ROLLBACK_VERSION_MISMATCH');

  const allowedOps = actorAllowedOps[mutation.actor_class];
  for (const operation of mutation.operations) {
    if (!isPlainObject(operation) || typeof operation.type !== 'string') fail('INVALID_OPERATION');
    if (!model.mutation_envelope.operation_types.includes(operation.type)) fail('UNKNOWN_OPERATION_TYPE', String(operation.type));
    if (!allowedOps.has(operation.type)) {
      if ((mutation.actor_class === 'PROSE_PROJECT' || mutation.actor_class === 'BOOK_EVALUATOR') && canonicalOps.has(operation.type)) {
        fail('CANONICAL_WRITE_AUTHORITY_DENIED', mutation.actor_class);
      }
      if (mutation.actor_class === 'RESEARCH_IMPORT') fail('RESEARCH_WRITE_SCOPE_DENIED', operation.type);
      if (mutation.actor_class === 'AUTHOR') fail('AUTHOR_WRITE_SCOPE_DENIED', operation.type);
      fail('ACTOR_OPERATION_NOT_ALLOWED', `${mutation.actor_class}:${operation.type}`);
    }
  }

  const working = deepClone(originalState);
  for (const operation of mutation.operations) {
    switch (operation.type) {
      case 'ADVANCE_PROJECT_STATUS': {
        const current = working.book_project.status;
        const target = operation.target_status;
        const allowed = model.allowed_project_transitions[current] || [];
        if (!allowed.includes(target)) fail('ILLEGAL_PROJECT_TRANSITION', `${current}->${String(target)}`);
        working.book_project.status = target;
        break;
      }
      case 'SET_ACTIVE_GOVERNING_BRIEF':
        if (!hasOwn(working.governing_briefs, operation.ref)) fail('TARGET_REF_NOT_FOUND', String(operation.ref));
        working.active.governing_brief_ref = operation.ref;
        working.book_project.governing_brief_ref = operation.ref;
        break;
      case 'SET_ACTIVE_CANON_MANIFEST':
        if (!hasOwn(working.canon_manifests, operation.ref)) fail('TARGET_REF_NOT_FOUND', String(operation.ref));
        working.active.canon_manifest_ref = operation.ref;
        working.book_project.canonical_manifest_ref = operation.ref;
        break;
      case 'SET_ACTIVE_STORY_BIBLE':
        if (!hasOwn(working.story_bibles, operation.ref)) fail('TARGET_REF_NOT_FOUND', String(operation.ref));
        working.active.story_bible_ref = operation.ref;
        break;
      case 'SET_ACTIVE_BOOK_PLAN':
        if (!hasOwn(working.book_plans, operation.ref)) fail('TARGET_REF_NOT_FOUND', String(operation.ref));
        working.active.book_plan_ref = operation.ref;
        break;
      case 'SET_ACTIVE_CANONICAL_MANUSCRIPT':
        if (!hasOwn(working.manuscripts, operation.ref)) fail('TARGET_REF_NOT_FOUND', String(operation.ref));
        if (working.manuscripts[operation.ref].authority_state !== 'CANONICAL') fail('TARGET_MANUSCRIPT_NOT_CANONICAL');
        working.active.canonical_manuscript_ref = operation.ref;
        break;
      case 'REGISTER_RESEARCH_EVIDENCE_LINK': {
        const obj = requireObjectForRegistration(operation, model, 'RESEARCH_EVIDENCE_LINK', 'operation.object');
        if (hasOwn(working.research_evidence_links, obj.link_id)) fail('DUPLICATE_OBJECT_ID', obj.link_id);
        working.research_evidence_links[obj.link_id] = obj;
        break;
      }
      case 'REGISTER_AUTHOR_DECISION': {
        const obj = requireObjectForRegistration(operation, model, 'AUTHOR_DECISION', 'operation.object');
        if (hasOwn(working.author_decisions, obj.decision_id)) fail('DUPLICATE_OBJECT_ID', obj.decision_id);
        working.author_decisions[obj.decision_id] = obj;
        break;
      }
      case 'REGISTER_INTEGRATION_PROPOSAL': {
        const obj = requireObjectForRegistration(operation, model, 'INTEGRATION_PROPOSAL_REF', 'operation.object');
        if (hasOwn(working.integration_proposals, obj.proposal_id)) fail('DUPLICATE_OBJECT_ID', obj.proposal_id);
        working.integration_proposals[obj.proposal_id] = obj;
        break;
      }
      case 'REGISTER_EXPORT_RELEASE': {
        const obj = requireObjectForRegistration(operation, model, 'EXPORT_RELEASE', 'operation.object');
        if (hasOwn(working.export_releases, obj.release_id)) fail('DUPLICATE_OBJECT_ID', obj.release_id);
        working.export_releases[obj.release_id] = obj;
        break;
      }
      default:
        fail('UNIMPLEMENTED_OPERATION', operation.type);
    }
  }

  if (working.book_project.status === 'PUBLISHED_OR_DELIVERED') {
    const authorApproved = Object.values(working.author_decisions).some((decision) =>
      decision.decision_type === 'PUBLICATION_AUTHORIZATION' &&
      decision.status === 'APPROVED' &&
      decision.author_choice === 'APPROVE'
    );
    if (!authorApproved) fail('AUTHOR_PUBLICATION_DECISION_REQUIRED');
    const releaseApproved = Object.values(working.export_releases).some((release) =>
      release.publication_authority_state === 'AUTHOR_APPROVED'
    );
    if (!releaseApproved) fail('AUTHOR_APPROVED_EXPORT_REQUIRED');
  }

  working.state_version = originalState.state_version + 1;
  validateState(working, model);
  return {
    next_state: working,
    next_state_digest: digestState(working),
    rollback_state: deepClone(originalState),
    rollback_state_digest: currentDigest,
  };
}

function run(command, args) {
  return spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, shell: false });
}

function gitHead() {
  const result = run('git', ['-c', `safe.directory=${workspace}`, 'rev-parse', 'HEAD']);
  if (result.error || result.status !== 0) fail('GIT_HEAD_FAILED', `${result.error ? result.error.message : ''}${result.stderr || ''}`);
  return result.stdout.trim();
}

function gitBlobSha256(repoPath) {
  const result = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'show', `HEAD:${repoPath}`], {
    cwd: workspace,
    encoding: null,
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) fail('GIT_BLOB_READ_FAILED', repoPath);
  return sha256Bytes(result.stdout || Buffer.alloc(0));
}

function writeEvidence(name, content) {
  fs.writeFileSync(path.join(evidenceDir, name), String(content), 'utf8');
}

try {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  if (fixtures.model_id !== model.model_id) fail('FIXTURE_MODEL_ID_MISMATCH');

  const commit = gitHead();
  const caseResults = [];
  for (const testCase of fixtures.cases) {
    const state = deepMerge(fixtures.base_state, testCase.precondition_patch || {});
    validateState(state, model);
    const beforeDigest = digestState(state);
    let actual = 'PASS';
    let code = null;
    let result = null;
    try {
      if (testCase.type === 'VALIDATE_STATE') {
        validateState(state, model);
      } else if (testCase.type === 'APPLY_MUTATION') {
        const mutation = deepClone(testCase.mutation);
        if (mutation.expected_state_digest === '__CURRENT__') mutation.expected_state_digest = beforeDigest;
        result = applyMutation(state, mutation, model);
      } else {
        fail('UNKNOWN_FIXTURE_CASE_TYPE', testCase.type);
      }
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      actual = 'REJECT';
      code = error.code;
    }

    const afterOriginalDigest = digestState(state);
    if (afterOriginalDigest !== beforeDigest) fail('ORIGINAL_STATE_MUTATED_ON_ATTEMPT', testCase.case_id);
    if (actual !== testCase.expected) fail('FIXTURE_EXPECTATION_MISMATCH', `${testCase.case_id}:expected=${testCase.expected}:actual=${actual}`);
    if (actual === 'REJECT' && testCase.expected_code && code !== testCase.expected_code) {
      fail('FIXTURE_REJECTION_CODE_MISMATCH', `${testCase.case_id}:expected=${testCase.expected_code}:actual=${code}`);
    }
    if (actual === 'PASS' && result) {
      if (testCase.expected_next_state_version !== undefined && result.next_state.state_version !== testCase.expected_next_state_version) {
        fail('NEXT_STATE_VERSION_MISMATCH', testCase.case_id);
      }
      if (testCase.expected_project_status && result.next_state.book_project.status !== testCase.expected_project_status) {
        fail('NEXT_PROJECT_STATUS_MISMATCH', testCase.case_id);
      }
      if (testCase.expect_rollback_exact && result.rollback_state_digest !== beforeDigest) {
        fail('ROLLBACK_STATE_NOT_EXACT', testCase.case_id);
      }
      if (testCase.expect_rollback_exact && result.rollback_state.state_version !== state.state_version) {
        fail('ROLLBACK_VERSION_NOT_RETAINED', testCase.case_id);
      }
    }
    if (testCase.expect_original_unchanged && afterOriginalDigest !== beforeDigest) {
      fail('ATOMICITY_FAILURE', testCase.case_id);
    }
    caseResults.push({ case_id: testCase.case_id, actual, code });
  }

  const subject = {
    qualification_id: 'BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001',
    repository: process.env.GITHUB_REPOSITORY || '',
    commit,
    runner_name: process.env.RUNNER_NAME || '',
    runner_os: process.env.RUNNER_OS || '',
    runner_arch: process.env.RUNNER_ARCH || '',
    model_git_blob_sha256: gitBlobSha256(modelRel),
    fixtures_git_blob_sha256: gitBlobSha256(fixturesRel),
    qualifier_git_blob_sha256: gitBlobSha256(scriptRel),
    test_case_count: caseResults.length,
    qualification_scope: 'SELF_HOSTED_WINDOWS_X64_EXACT_SHA_MODEL_QUALIFICATION__NO_PRODUCTION_OR_PUBLICATION_AUTHORITY',
  };

  writeEvidence('subject.json', `${JSON.stringify(subject, null, 2)}\n`);
  writeEvidence('cases.json', `${JSON.stringify(caseResults, null, 2)}\n`);
  writeEvidence('result.txt', 'result=PASS\n');
  writeEvidence('qualification.txt', [
    `qualification_id=${subject.qualification_id}`,
    `commit=${commit}`,
    `cases=${caseResults.length}`,
    'object_completeness=PASS',
    'state_version_precondition=PASS',
    'state_digest_precondition=PASS',
    'illegal_transition_fail_closed=PASS',
    'prose_canonical_write_denial=PASS',
    'evaluator_canonical_write_denial=PASS',
    'research_scope_and_atomicity=PASS',
    'author_decision_registration=PASS',
    'publication_authority_boundary=PASS',
    'rollback_exact_retention=PASS',
    'result=PASS',
    '',
  ].join('\n'));
  console.log(`BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001 PASS cases=${caseResults.length}`);
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  writeEvidence('result.txt', 'result=FAIL\n');
  writeEvidence('failure.txt', `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
