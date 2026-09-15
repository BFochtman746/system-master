'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const registry = require('./book-literary-diagnostic-lens-registry-v1');
const diagnosisRuntime = require('./book-literary-diagnosis-v1');
const craftRuntime = require('./book-craft-intelligence-v1');

const LEDGER_SCHEMA_VERSION = 'BOOK_LITERARY_OPPORTUNITY_LEDGER_V1';
const LEDGER_PREFIX = 'book-literary-opportunity-ledger-v1:';
const LEDGER_STANDINGS = Object.freeze(['READY_FOR_REVISION_REVIEW','NO_ACTION','BLOCKED_OWNER_CONSTRAINT','BLOCKED_STALE','BLOCKED_INVALID']);
const CURRENTNESS_STANDINGS = Object.freeze(['CURRENT','STALE','INVALID']);
const EVIDENCE_STRENGTH_CLASSES = Object.freeze(['LIMITED','SUPPORTED','STRONG']);
const PURPOSE_RELEVANCE_CLASSES = Object.freeze(['LOW','MEDIUM','HIGH']);
const RISK_CLASSES = Object.freeze(['NONE','LOW','MEDIUM','HIGH']);
const SHA256 = /^[a-f0-9]{64}$/;

const FORBIDDEN_KEY_PATTERNS = Object.freeze([
  /raw.*(?:manuscript|source|document|text|bytes)/i,
  /full.*text/i,
  /quoted.*text/i,
  /replacement.*prose/i,
  /candidate.*text/i,
  /rewritten.*text/i,
  /applied.*(?:revision|transform)/i,
  /chain.*of.*thought/i,
  /hidden.*reason/i,
  /(?:quality|prose|literary).*score/i,
  /percentile/i,
  /(?:overall|aggregate).*rank/i,
  /named.*author.*target/i,
  /nearest.*author/i,
  /similarity.*author/i,
  /winner/i,
  /evaluation.*disposition/i,
  /candidate.*superior/i,
  /credential/i,
  /access.*token/i,
  /secret/i
]);

class BookLiteraryOpportunityLedgerError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLiteraryOpportunityLedgerError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookLiteraryOpportunityLedgerError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stable(v) { return kb.stableStringify(v); }
function exactKeys(v, fields, code, label) {
  if (!obj(v)) fail(code, `${label}:OBJECT_REQUIRED`);
  const expected = new Set(fields);
  for (const key of Object.keys(v)) if (!expected.has(key)) fail(code, `${label}.unexpected:${key}`);
  for (const field of fields) if (!own(v, field)) fail(code, `${label}.missing:${field}`);
}
function assertNoForbiddenPayload(v, path = '$') {
  if (typeof v === 'string') {
    if (/(?:named[-_ ]?author[-_ ]?target|nearest[-_ ]?author|similarity[-_ ]?author|imitat(?:e|ion)[-_ ]?author|mimic[-_ ]?author|write\s+like|in\s+the\s+style\s+of)/i.test(v)) fail('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN', `${path}:${v}`);
    return;
  }
  if (Array.isArray(v)) return v.forEach((x, i) => assertNoForbiddenPayload(x, `${path}[${i}]`));
  if (!obj(v)) return;
  for (const [key, child] of Object.entries(v)) {
    if (FORBIDDEN_KEY_PATTERNS.some(re => re.test(key))) {
      if (/(?:quality|prose|literary).*score|percentile|(?:overall|aggregate).*rank/i.test(key)) fail('BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN', `${path}.${key}`);
      if (/named.*author.*target|nearest.*author|similarity.*author/i.test(key)) fail('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN', `${path}.${key}`);
      if (/replacement.*prose|candidate.*text|rewritten.*text|applied.*(?:revision|transform)/i.test(key)) fail('BLOCKED_REWRITE_PAYLOAD_FORBIDDEN', `${path}.${key}`);
      if (/winner|evaluation.*disposition|candidate.*superior/i.test(key)) fail('BLOCKED_EVALUATION_AUTHORITY_FORBIDDEN', `${path}.${key}`);
      fail('BLOCKED_RAW_TEXT_FORBIDDEN', `${path}.${key}`);
    }
    assertNoForbiddenPayload(child, `${path}.${key}`);
  }
}
function normalizeStrings(values, label, allowEmpty = true) {
  if (!Array.isArray(values)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:ARRAY_REQUIRED`);
  if (!allowEmpty && values.length === 0) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:NONEMPTY_REQUIRED`);
  const out = [...new Set(values)];
  if (out.some(v => !text(v))) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', label);
  out.forEach(v => assertNoForbiddenPayload(v, label));
  return out.sort();
}
function refObjects(ids, map, idField, digestField, label) {
  return ids.map(id => {
    const item = map.get(id);
    if (!item) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.unbound:${id}`);
    return { [idField]: id, [digestField]: item[digestField] };
  });
}
function ledgerSemanticV1(ledger) {
  const out = clone(ledger);
  delete out.opportunity_ledger_id;
  delete out.opportunity_ledger_digest;
  return out;
}
function opportunityLedgerDigestV1(ledger) { return kb.sha256(ledgerSemanticV1(ledger)); }
function compareClass(a, b, order) { return order.indexOf(a) - order.indexOf(b); }
function conservativeMin(a, b, order) { return compareClass(a,b,order) <= 0 ? a : b; }
function conservativeMax(a, b, order) { return compareClass(a,b,order) >= 0 ? a : b; }
function opportunitySemanticKeyV1(candidate) {
  return `${candidate.opportunity_key}|${candidate.scope_recommendation.scope_kind}|${candidate.scope_recommendation.scope_ref}|${candidate.scope_recommendation.scope_digest}`;
}
function normalizeCandidateV1(candidate, context, observationMap, craftMap) {
  const fields = ['opportunity_key','target_lens_ids','supporting_observation_refs','contradicting_observation_refs','craft_intelligence_refs','purpose_relevance_class','evidence_strength_class','preservation_risk_class','collateral_risk_class','scope_recommendation','owner_constraint_refs'];
  exactKeys(candidate, fields, 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity_candidate');
  assertNoForbiddenPayload(candidate, 'opportunity_candidate');
  if (!text(candidate.opportunity_key)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity_key');
  const lensIds = normalizeStrings(candidate.target_lens_ids, 'target_lens_ids', false);
  for (const lensId of lensIds) {
    try { registry.assertLiteraryDiagnosticLensV1(lensId); }
    catch { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', lensId); }
    if (!context.requested_lens_ids.includes(lensId)) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', `unrequested:${lensId}`);
  }
  const supporting = normalizeStrings(candidate.supporting_observation_refs, 'supporting_observation_refs', false);
  const contradicting = normalizeStrings(candidate.contradicting_observation_refs, 'contradicting_observation_refs');
  if (supporting.some(id => contradicting.includes(id))) fail('BLOCKED_CONFLICT_UNRESOLVED', 'support_and_contradict_same_observation');
  for (const id of [...supporting, ...contradicting]) if (!observationMap.has(id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation_ref:${id}`);
  for (const id of supporting) {
    const finding = observationMap.get(id).finding_class;
    if (!['LIMITATION','RISK','OPPORTUNITY_SUPPORT','CONTRADICTION'].includes(finding)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `supporting_finding_class:${finding}`);
  }
  const craftRefs = normalizeStrings(candidate.craft_intelligence_refs, 'craft_intelligence_refs');
  for (const id of craftRefs) {
    const binding = craftMap.get(id);
    if (!binding) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `craft_ref:${id}`);
    if (binding.current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', `craft_ref:${id}`);
    if (!['APPLICABLE','CONDITIONAL'].includes(binding.record.task_fit_standing)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `craft_task_fit:${binding.record.task_fit_standing}`);
  }
  if (!PURPOSE_RELEVANCE_CLASSES.includes(candidate.purpose_relevance_class) || !EVIDENCE_STRENGTH_CLASSES.includes(candidate.evidence_strength_class) || !RISK_CLASSES.includes(candidate.preservation_risk_class) || !RISK_CLASSES.includes(candidate.collateral_risk_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity_classes');
  exactKeys(candidate.scope_recommendation, ['scope_kind','scope_ref','scope_digest'], 'BLOCKED_DIAGNOSTIC_SCOPE_INVALID', 'scope_recommendation');
  if (stable(candidate.scope_recommendation) !== stable(context.scope)) fail('BLOCKED_DIAGNOSTIC_SCOPE_INVALID', 'scope_escape');
  const ownerRefs = normalizeStrings(candidate.owner_constraint_refs, 'owner_constraint_refs');
  const contextOwnerRefs = new Set(context.author_constraint_refs.map(x => x.evidence_ref));
  for (const ref of ownerRefs) if (!contextOwnerRefs.has(ref)) fail('BLOCKED_OWNER_CONSTRAINT', `owner_constraint_ref:${ref}`);
  return {
    opportunity_key: candidate.opportunity_key.trim(),
    target_lens_ids: lensIds,
    supporting_observation_refs: supporting,
    contradicting_observation_refs: contradicting,
    craft_intelligence_refs: craftRefs,
    purpose_relevance_class: candidate.purpose_relevance_class,
    evidence_strength_class: candidate.evidence_strength_class,
    preservation_risk_class: candidate.preservation_risk_class,
    collateral_risk_class: candidate.collateral_risk_class,
    scope_recommendation: clone(candidate.scope_recommendation),
    owner_constraint_refs: ownerRefs
  };
}
function mergeCandidateV1(a, b) {
  if (opportunitySemanticKeyV1(a) !== opportunitySemanticKeyV1(b)) fail('BLOCKED_CONFLICT_UNRESOLVED', 'opportunity_identity');
  return {
    opportunity_key: a.opportunity_key,
    target_lens_ids: [...new Set([...a.target_lens_ids, ...b.target_lens_ids])].sort(),
    supporting_observation_refs: [...new Set([...a.supporting_observation_refs, ...b.supporting_observation_refs])].sort(),
    contradicting_observation_refs: [...new Set([...a.contradicting_observation_refs, ...b.contradicting_observation_refs])].sort(),
    craft_intelligence_refs: [...new Set([...a.craft_intelligence_refs, ...b.craft_intelligence_refs])].sort(),
    purpose_relevance_class: conservativeMin(a.purpose_relevance_class, b.purpose_relevance_class, PURPOSE_RELEVANCE_CLASSES),
    evidence_strength_class: conservativeMin(a.evidence_strength_class, b.evidence_strength_class, EVIDENCE_STRENGTH_CLASSES),
    preservation_risk_class: conservativeMax(a.preservation_risk_class, b.preservation_risk_class, RISK_CLASSES),
    collateral_risk_class: conservativeMax(a.collateral_risk_class, b.collateral_risk_class, RISK_CLASSES),
    scope_recommendation: clone(a.scope_recommendation),
    owner_constraint_refs: [...new Set([...a.owner_constraint_refs, ...b.owner_constraint_refs])].sort()
  };
}
function rankTupleV1(candidate) {
  const relevanceRank = PURPOSE_RELEVANCE_CLASSES.length - PURPOSE_RELEVANCE_CLASSES.indexOf(candidate.purpose_relevance_class);
  const evidenceRank = EVIDENCE_STRENGTH_CLASSES.length - EVIDENCE_STRENGTH_CLASSES.indexOf(candidate.evidence_strength_class);
  const preservationRank = RISK_CLASSES.indexOf(candidate.preservation_risk_class);
  const collateralRank = RISK_CLASSES.indexOf(candidate.collateral_risk_class);
  const contradictionRank = candidate.contradicting_observation_refs.length === 0 ? 0 : 1;
  return [-relevanceRank, -evidenceRank, preservationRank, collateralRank, contradictionRank, candidate.opportunity_key];
}
function compareTuple(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
function normalizeCraftBindingsV1(bindings) {
  if (!Array.isArray(bindings)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'craft_record_bindings');
  const map = new Map();
  for (let i = 0; i < bindings.length; i += 1) {
    const binding = bindings[i];
    exactKeys(binding, ['record','current'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `craft_record_bindings.${i}`);
    craftRuntime.validateCraftIntelligenceRecordV1(binding.record);
    if (map.has(binding.record.craft_record_id)) fail('BLOCKED_CONFLICT_UNRESOLVED', `duplicate_craft_record:${binding.record.craft_record_id}`);
    map.set(binding.record.craft_record_id, { record: clone(binding.record), current: binding.current === true });
  }
  return map;
}

function assembleLiteraryOpportunityLedgerV1(input) {
  if (!obj(input)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  exactKeys(input, ['diagnostic_context','observations','diagnosis','craft_record_bindings','opportunity_candidates'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  try { diagnosisRuntime.validateLiteraryDiagnosisV1(input.diagnosis, input.diagnostic_context, input.observations); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `diagnosis:${err.detail || err.message}`); }
  if (input.diagnosis.currentness_standing !== 'CURRENT') fail('BLOCKED_CURRENTNESS_REQUIRED', 'diagnosis');
  const observationMap = new Map(input.observations.map(x => [x.diagnostic_observation_id, x]));
  const craftMap = normalizeCraftBindingsV1(input.craft_record_bindings);
  if (!Array.isArray(input.opportunity_candidates)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity_candidates');
  const dedup = new Map();
  for (const raw of input.opportunity_candidates) {
    const candidate = normalizeCandidateV1(raw, input.diagnostic_context, observationMap, craftMap);
    const key = opportunitySemanticKeyV1(candidate);
    dedup.set(key, dedup.has(key) ? mergeCandidateV1(dedup.get(key), candidate) : candidate);
  }
  const ranked = [...dedup.values()].sort((a,b) => compareTuple(rankTupleV1(a), rankTupleV1(b)));
  const selected = ranked.slice(0, 3);
  const contributingIds = [...new Set(selected.flatMap(x => x.supporting_observation_refs))].sort();
  const contradictingIds = [...new Set(selected.flatMap(x => x.contradicting_observation_refs))].sort();
  const craftIds = [...new Set(selected.flatMap(x => x.craft_intelligence_refs))].sort();
  const strengthIds = [...input.diagnosis.strength_observation_refs].sort();
  const opportunities = selected.map(candidate => ({
    opportunity_key: candidate.opportunity_key,
    target_lens_ids: candidate.target_lens_ids,
    supporting_observation_refs: refObjects(candidate.supporting_observation_refs, observationMap, 'observation_id', 'diagnostic_observation_digest', 'supporting_observation_refs'),
    contradicting_observation_refs: refObjects(candidate.contradicting_observation_refs, observationMap, 'observation_id', 'diagnostic_observation_digest', 'contradicting_observation_refs'),
    craft_intelligence_refs: candidate.craft_intelligence_refs.map(id => ({ craft_record_id: id, craft_record_digest: craftMap.get(id).record.craft_record_digest })),
    purpose_relevance_class: candidate.purpose_relevance_class,
    evidence_strength_class: candidate.evidence_strength_class,
    preservation_risk_class: candidate.preservation_risk_class,
    collateral_risk_class: candidate.collateral_risk_class,
    scope_recommendation: clone(candidate.scope_recommendation),
    owner_constraint_refs: candidate.owner_constraint_refs
  }));
  const out = {
    ledger_schema_version: LEDGER_SCHEMA_VERSION,
    opportunity_ledger_id: null,
    opportunity_ledger_digest: null,
    book_project_id: input.diagnosis.book_project_id,
    diagnosis_id: input.diagnosis.diagnosis_id,
    diagnosis_digest: input.diagnosis.diagnosis_digest,
    contributing_observation_refs: refObjects(contributingIds, observationMap, 'observation_id', 'diagnostic_observation_digest', 'contributing_observation_refs'),
    contradicting_observation_refs: refObjects(contradictingIds, observationMap, 'observation_id', 'diagnostic_observation_digest', 'contradicting_observation_refs'),
    craft_intelligence_refs: craftIds.map(id => ({ craft_record_id: id, craft_record_digest: craftMap.get(id).record.craft_record_digest })),
    strengths_to_preserve: refObjects(strengthIds, observationMap, 'observation_id', 'diagnostic_observation_digest', 'strengths_to_preserve'),
    opportunities,
    currentness_standing: 'CURRENT',
    ledger_standing: opportunities.length === 0 ? 'NO_ACTION' : 'READY_FOR_REVISION_REVIEW',
    canonical_effect: false
  };
  const dg = opportunityLedgerDigestV1(out);
  out.opportunity_ledger_digest = dg;
  out.opportunity_ledger_id = `${LEDGER_PREFIX}${dg}`;
  validateLiteraryOpportunityLedgerV1(out, input.diagnosis);
  return out;
}

function validateRefArrayV1(values, idField, digestField, label) {
  if (!Array.isArray(values)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:ARRAY_REQUIRED`);
  let last = null;
  const seen = new Set();
  for (const x of values) {
    exactKeys(x, [idField,digestField], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', label);
    if (!text(x[idField]) || !digest(x[digestField]) || seen.has(x[idField])) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', label);
    if (last !== null && x[idField].localeCompare(last) < 0) fail('BLOCKED_DIGEST_MISMATCH', `${label}:UNSORTED`);
    seen.add(x[idField]); last = x[idField];
  }
}
function validateOpportunityV1(o) {
  exactKeys(o, ['opportunity_key','target_lens_ids','supporting_observation_refs','contradicting_observation_refs','craft_intelligence_refs','purpose_relevance_class','evidence_strength_class','preservation_risk_class','collateral_risk_class','scope_recommendation','owner_constraint_refs'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity');
  assertNoForbiddenPayload(o, 'opportunity');
  if (!text(o.opportunity_key) || !PURPOSE_RELEVANCE_CLASSES.includes(o.purpose_relevance_class) || !EVIDENCE_STRENGTH_CLASSES.includes(o.evidence_strength_class) || !RISK_CLASSES.includes(o.preservation_risk_class) || !RISK_CLASSES.includes(o.collateral_risk_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity');
  const lenses = normalizeStrings(o.target_lens_ids, 'target_lens_ids', false);
  if (stable(lenses) !== stable(o.target_lens_ids)) fail('BLOCKED_DIGEST_MISMATCH', 'opportunity_lenses');
  for (const id of lenses) { try { registry.assertLiteraryDiagnosticLensV1(id); } catch { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', id); } }
  validateRefArrayV1(o.supporting_observation_refs, 'observation_id', 'diagnostic_observation_digest', 'supporting_observation_refs');
  validateRefArrayV1(o.contradicting_observation_refs, 'observation_id', 'diagnostic_observation_digest', 'contradicting_observation_refs');
  validateRefArrayV1(o.craft_intelligence_refs, 'craft_record_id', 'craft_record_digest', 'craft_intelligence_refs');
  exactKeys(o.scope_recommendation, ['scope_kind','scope_ref','scope_digest'], 'BLOCKED_DIAGNOSTIC_SCOPE_INVALID', 'scope_recommendation');
  const owners = normalizeStrings(o.owner_constraint_refs, 'owner_constraint_refs');
  if (stable(owners) !== stable(o.owner_constraint_refs)) fail('BLOCKED_DIGEST_MISMATCH', 'owner_constraint_refs');
}
function validateLiteraryOpportunityLedgerV1(ledger, diagnosis) {
  const fields = ['ledger_schema_version','opportunity_ledger_id','opportunity_ledger_digest','book_project_id','diagnosis_id','diagnosis_digest','contributing_observation_refs','contradicting_observation_refs','craft_intelligence_refs','strengths_to_preserve','opportunities','currentness_standing','ledger_standing','canonical_effect'];
  exactKeys(ledger, fields, 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'ledger');
  assertNoForbiddenPayload(ledger, 'ledger');
  if (ledger.ledger_schema_version !== LEDGER_SCHEMA_VERSION || ledger.book_project_id !== diagnosis.book_project_id || ledger.diagnosis_id !== diagnosis.diagnosis_id || ledger.diagnosis_digest !== diagnosis.diagnosis_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'diagnosis_binding');
  validateRefArrayV1(ledger.contributing_observation_refs, 'observation_id', 'diagnostic_observation_digest', 'contributing_observation_refs');
  validateRefArrayV1(ledger.contradicting_observation_refs, 'observation_id', 'diagnostic_observation_digest', 'contradicting_observation_refs');
  validateRefArrayV1(ledger.craft_intelligence_refs, 'craft_record_id', 'craft_record_digest', 'craft_intelligence_refs');
  validateRefArrayV1(ledger.strengths_to_preserve, 'observation_id', 'diagnostic_observation_digest', 'strengths_to_preserve');
  if (!Array.isArray(ledger.opportunities) || ledger.opportunities.length > 3) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'opportunity_hard_max_3');
  const keys = new Set();
  for (const opportunity of ledger.opportunities) {
    validateOpportunityV1(opportunity);
    if (keys.has(opportunity.opportunity_key)) fail('BLOCKED_CONFLICT_UNRESOLVED', `duplicate_opportunity:${opportunity.opportunity_key}`);
    keys.add(opportunity.opportunity_key);
  }
  if (!CURRENTNESS_STANDINGS.includes(ledger.currentness_standing) || ledger.currentness_standing !== 'CURRENT') fail('BLOCKED_CURRENTNESS_REQUIRED', 'ledger_currentness');
  if (!LEDGER_STANDINGS.includes(ledger.ledger_standing)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'ledger_standing');
  const expectedStanding = ledger.opportunities.length === 0 ? 'NO_ACTION' : 'READY_FOR_REVISION_REVIEW';
  if (ledger.ledger_standing !== expectedStanding) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'ledger_standing_mismatch');
  if (ledger.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  if (!digest(ledger.opportunity_ledger_digest)) fail('BLOCKED_DIGEST_MISMATCH', 'ledger_digest');
  const dg = opportunityLedgerDigestV1(ledger);
  if (ledger.opportunity_ledger_digest !== dg || ledger.opportunity_ledger_id !== `${LEDGER_PREFIX}${dg}`) fail('BLOCKED_DIGEST_MISMATCH', 'ledger_identity');
  return true;
}

module.exports = {
  LEDGER_SCHEMA_VERSION,
  LEDGER_PREFIX,
  LEDGER_STANDINGS,
  CURRENTNESS_STANDINGS,
  EVIDENCE_STRENGTH_CLASSES,
  PURPOSE_RELEVANCE_CLASSES,
  RISK_CLASSES,
  BookLiteraryOpportunityLedgerError,
  opportunityLedgerDigestV1,
  assembleLiteraryOpportunityLedgerV1,
  validateLiteraryOpportunityLedgerV1
};
