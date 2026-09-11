'use strict';

const crypto = require('crypto');

const PACKAGE_CLASSES = new Set(['GENERATION_CONTEXT','EVALUATION_CONTEXT','ADMISSION_CONTEXT']);
const FORBIDDEN_KEYS = new Set([
  'raw_manuscript_text','raw_candidate_text','private_gold_labels','blind_case_labels',
  'author_secret','provider_chain_of_thought','canonical_mutation_command',
  'publication_credentials','production_credentials'
]);
const DURABLE_PACKAGE_KEYS = [
  'context_package_id','schema_version','package_class','book_project_id','source_identity',
  'book_state_binding','story_bible_binding','author_authority_binding','constraint_set',
  'capability_request','privacy_class','created_at','expires_at','compiler_version',
  'compiler_subject_sha','research_evidence_refs','prior_decision_refs','artifact_refs',
  'evaluation_policy_ref'
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function hasForbidden(value, path = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = hasForbidden(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
      const found = hasForbidden(child, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function normalizeConstraints(list) {
  if (!Array.isArray(list)) return [];
  return list.map(stable).sort((a,b) => String(a.constraint_id || '').localeCompare(String(b.constraint_id || '')));
}

function semanticProjection(input) {
  return stable({
    schema_version: input.schema_version,
    package_class: input.package_class,
    source_identity: input.source_identity,
    book_state_binding: input.book_state_binding,
    story_bible_binding: input.story_bible_binding,
    author_authority_binding: input.author_authority_binding,
    constraint_set: normalizeConstraints(input.constraint_set),
    capability_request: input.capability_request,
    privacy_class: input.privacy_class,
    research_evidence_refs: input.research_evidence_refs || [],
    prior_decision_refs: input.prior_decision_refs || [],
    artifact_refs: input.artifact_refs || [],
    evaluation_policy_ref: input.evaluation_policy_ref || null,
    compiler_version: input.compiler_version,
    compiler_subject_sha: input.compiler_subject_sha,
    expires_at_bucket: String(input.expires_at || '').slice(0,13)
  });
}

function digestProjection(projection) {
  return crypto.createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex');
}

function buildDurablePackage(input, digest) {
  const out = {};
  for (const key of DURABLE_PACKAGE_KEYS) {
    if (input[key] === undefined) continue;
    out[key] = key === 'constraint_set' ? normalizeConstraints(input[key]) : input[key];
  }
  out.package_digest_sha256 = digest;
  return stable(out);
}

function sameBinding(actual, expected, keys) {
  if (!expected) return true;
  for (const key of keys) {
    if (expected[key] !== undefined && actual?.[key] !== expected[key]) return false;
  }
  return true;
}

function detectHardConflict(constraints) {
  const groups = new Map();
  for (const c of constraints || []) {
    if (c.hard_or_advisory !== 'hard' || !c.conflict_group) continue;
    const list = groups.get(c.conflict_group) || [];
    list.push(c);
    groups.set(c.conflict_group, list);
  }
  for (const [group, list] of groups.entries()) {
    if (list.length > 1) return { group, ids: list.map(x => x.constraint_id).filter(Boolean).sort() };
  }
  return null;
}

function compileContext(input, live = {}, now = new Date()) {
  const required = [
    'context_package_id','schema_version','package_class','book_project_id','source_identity',
    'book_state_binding','story_bible_binding','author_authority_binding','constraint_set',
    'capability_request','privacy_class','created_at','expires_at','compiler_version','compiler_subject_sha'
  ];
  const missing = required.filter(k => input?.[k] === undefined || input?.[k] === null);
  if (missing.length) return { result_class: 'INVALID_SOURCE_IDENTITY', reason: `MISSING:${missing.join(',')}`, canonical_effect: false };

  const forbidden = hasForbidden(input);
  if (forbidden) return { result_class: 'REJECTED_AUTHORITY_BOUNDARY', reason: `FORBIDDEN_FIELD:${forbidden}`, canonical_effect: false };

  if (!PACKAGE_CLASSES.has(input.package_class)) return { result_class: 'REJECTED_AUTHORITY_BOUNDARY', reason: 'INVALID_PACKAGE_CLASS', canonical_effect: false };
  if (new Date(input.expires_at).getTime() <= now.getTime()) return { result_class: 'EXPIRED', reason: 'CONTEXT_EXPIRED', canonical_effect: false };

  const authorityDomain = String(input.capability_request?.authority_domain || '');
  if (/PROSE/i.test(authorityDomain) || /SYSTEM_MASTER\/BOOK\/PROSE/i.test(authorityDomain)) {
    return { result_class: 'REJECTED_AUTHORITY_BOUNDARY', reason: 'RETIRED_PROSE_EXECUTION_DOMAIN', canonical_effect: false };
  }
  if (String(input.capability_request?.integration_owner || '').toUpperCase() === 'DOCUMENTS' && input.capability_request?.completed_prose_input === true) {
    return { result_class: 'REJECTED_AUTHORITY_BOUNDARY', reason: 'COMPLETED_PROSE_INTEGRATION_IS_BOOK_OWNED', canonical_effect: false };
  }
  if (input.package_class !== 'ADMISSION_CONTEXT' && /ADMISSION/i.test(authorityDomain)) {
    return { result_class: 'REJECTED_AUTHORITY_BOUNDARY', reason: 'ADMISSION_BOUNDARY_REQUIRES_ADMISSION_CONTEXT', canonical_effect: false };
  }
  if (input.package_class === 'EVALUATION_CONTEXT' && input.capability_request?.consumer_role === 'BOOK_OWNED_GENERATION_ADAPTER') {
    return { result_class: 'REJECTED_AUTHORITY_BOUNDARY', reason: 'EVALUATOR_GENERATION_CONTEXT_REUSE_FORBIDDEN', canonical_effect: false };
  }

  if (!sameBinding(input.source_identity, live.source_identity, ['source_manuscript_ref','source_manuscript_sha256','source_version_id']) ||
      !sameBinding(input.book_state_binding, live.book_state_binding, ['expected_book_state_version','expected_book_state_digest_sha256']) ||
      !sameBinding(input.story_bible_binding, live.story_bible_binding, ['story_bible_snapshot_ref','story_bible_snapshot_sha256','canon_version']) ||
      !sameBinding(input.capability_request, live.capability_request, ['service_registry_id','service_registry_subject_sha'])) {
    return { result_class: 'STALE_CONTEXT', reason: 'LIVE_BINDING_MISMATCH', canonical_effect: false };
  }

  const unresolved = input.author_authority_binding?.unresolved_author_questions;
  if (input.author_authority_binding?.decision_required === true && Array.isArray(unresolved) && unresolved.length > 0) {
    return { result_class: 'AUTHOR_DECISION_REQUIRED', unresolved_author_questions: [...unresolved], canonical_effect: false };
  }

  const conflict = detectHardConflict(input.constraint_set);
  if (conflict) return { result_class: 'CONSTRAINT_CONFLICT', conflict_group: conflict.group, conflict_ids: conflict.ids, canonical_effect: false };

  const projection = semanticProjection(input);
  const digest = digestProjection(projection);
  const durablePackage = buildDurablePackage(input, digest);
  return {
    result_class: 'PACKAGE_READY',
    context_package_id: input.context_package_id,
    package_class: input.package_class,
    package_digest_sha256: digest,
    canonical_effect: false,
    package: durablePackage,
    semantic_projection: projection
  };
}

module.exports = { compileContext, stable, semanticProjection, digestProjection, buildDurablePackage, hasForbidden, normalizeConstraints };
