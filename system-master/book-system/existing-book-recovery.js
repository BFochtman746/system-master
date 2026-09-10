'use strict';

const crypto = require('crypto');

const ENGINE_ID = 'BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001';
const PROFILE_VERSION = 'EBR-SEMANTIC-PROFILE-001';
const HEX64 = /^[a-f0-9]{64}$/;
const PHASES = [
  'SOURCE_CENSUS',
  'REVISION_GRAPH',
  'STRUCTURE_RECONSTRUCTION',
  'SEMANTIC_PROPOSALS',
  'AUTHOR_DECISION_PREPARATION',
  'BASELINE_ASSEMBLY'
];

class ExistingBookRecoveryError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ExistingBookRecoveryError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new ExistingBookRecoveryError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = canonicalize(v[k]);
  return out;
}
function stableStringify(v) { return JSON.stringify(canonicalize(v)); }
function digest(v) { return crypto.createHash('sha256').update(stableStringify(v)).digest('hex'); }
function assertString(v, code) { if (typeof v !== 'string' || !v.trim()) fail(code); return v.trim(); }
function assertDigest(v, code) { if (typeof v !== 'string' || !HEX64.test(v)) fail(code); return v; }
function uniqueSorted(values) { return [...new Set(values)].sort(); }
function byId(a, b) { return String(a.id || a.source_id || a.candidate_id || '').localeCompare(String(b.id || b.source_id || b.candidate_id || '')); }

function normalizeStructure(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('INVALID_STRUCTURE_ITEM', String(i));
    const kind = assertString(item.kind || 'SECTION', 'STRUCTURE_KIND_REQUIRED');
    const title = typeof item.title === 'string' ? item.title : '';
    const anchor = assertString(item.anchor || `STRUCTURE-${i + 1}`, 'STRUCTURE_ANCHOR_REQUIRED');
    const confidence = Number.isFinite(item.confidence) ? Number(item.confidence) : 1;
    if (confidence < 0 || confidence > 1) fail('INVALID_STRUCTURE_CONFIDENCE', anchor);
    return {
      structure_id: assertString(item.structure_id || `S-${i + 1}`, 'STRUCTURE_ID_REQUIRED'),
      kind,
      title,
      ordinal: Number.isInteger(item.ordinal) ? item.ordinal : i + 1,
      anchor,
      confidence,
      ambiguous: item.ambiguous === true
    };
  }).sort((a, b) => a.ordinal - b.ordinal || a.structure_id.localeCompare(b.structure_id));
}

function normalizeSemanticCandidates(items, candidateClass, sourceRef) {
  if (!Array.isArray(items)) return [];
  return items.map((item, i) => ({
    proposal_id: assertString(item && item.proposal_id || `${candidateClass}-${i + 1}`, 'PROPOSAL_ID_REQUIRED'),
    candidate_class: candidateClass,
    value: clone(item && Object.prototype.hasOwnProperty.call(item, 'value') ? item.value : item),
    evidence_refs: uniqueSorted([sourceRef, ...((item && Array.isArray(item.evidence_refs)) ? item.evidence_refs : [])]),
    standing: 'PROPOSED_NOT_CANONICAL'
  })).sort((a, b) => a.proposal_id.localeCompare(b.proposal_id));
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('INVALID_SOURCE');
  const sourceId = assertString(source.source_id, 'SOURCE_ID_REQUIRED');
  const sourceDigest = assertDigest(source.source_digest, 'SOURCE_DIGEST_REQUIRED');
  const projection = source.normalized_projection;
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) fail('NORMALIZED_PROJECTION_REQUIRED', sourceId);
  const version = source.version_candidate;
  if (!version || typeof version !== 'object' || Array.isArray(version)) fail('VERSION_CANDIDATE_REQUIRED', sourceId);
  const candidateId = assertString(version.candidate_id, 'CANDIDATE_ID_REQUIRED');
  const contentDigest = assertDigest(version.content_digest, 'CONTENT_DIGEST_REQUIRED');
  const parentIds = uniqueSorted((version.parent_candidate_ids || []).map(String).filter(Boolean));
  const sourceRef = `${sourceId}@sha256:${sourceDigest}`;
  const metadata = projection.metadata && typeof projection.metadata === 'object' && !Array.isArray(projection.metadata) ? clone(projection.metadata) : {};
  const citations = Array.isArray(projection.citations) ? projection.citations.map(clone) : [];
  const comments = Array.isArray(projection.comments) ? projection.comments.map(clone) : [];
  const todos = Array.isArray(projection.todos) ? projection.todos.map(clone) : [];
  const trackedChanges = Array.isArray(projection.tracked_changes) ? projection.tracked_changes.map(clone) : [];
  const sourceNormalized = {
    source_id: sourceId,
    source_digest: sourceDigest,
    source_ref: sourceRef,
    source_kind: typeof source.source_kind === 'string' ? source.source_kind : 'NORMALIZED_DOCUMENT',
    projection_digest: digest({
      structure: normalizeStructure(projection.structure),
      metadata,
      citations,
      comments,
      todos,
      tracked_changes: trackedChanges,
      story_bible_candidates: projection.story_bible_candidates || [],
      nonfiction_knowledge_candidates: projection.nonfiction_knowledge_candidates || [],
      voice_candidates: projection.voice_candidates || []
    }),
    structure: normalizeStructure(projection.structure),
    metadata,
    citations,
    comments,
    todos,
    tracked_changes: trackedChanges,
    story_bible_candidates: normalizeSemanticCandidates(projection.story_bible_candidates, 'STORY_BIBLE', sourceRef),
    nonfiction_knowledge_candidates: normalizeSemanticCandidates(projection.nonfiction_knowledge_candidates, 'NONFICTION_KNOWLEDGE', sourceRef),
    voice_candidates: normalizeSemanticCandidates(projection.voice_candidates, 'VOICE_PROFILE', sourceRef),
    version_candidate: {
      candidate_id: candidateId,
      manuscript_id: assertString(version.manuscript_id || 'RECOVERED-MANUSCRIPT', 'MANUSCRIPT_ID_REQUIRED'),
      version_id: assertString(version.version_id || candidateId, 'VERSION_ID_REQUIRED'),
      content_digest: contentDigest,
      parent_candidate_ids: parentIds,
      authority_signal: typeof version.authority_signal === 'string' ? version.authority_signal : 'UNRATIFIED',
      revision_rank: Number.isFinite(version.revision_rank) ? Number(version.revision_rank) : null,
      similarity_key: typeof version.similarity_key === 'string' && version.similarity_key.trim() ? version.similarity_key.trim() : null,
      source_ref: sourceRef
    }
  };
  return sourceNormalized;
}

function validateAndNormalizeRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('INVALID_RECOVERY_REQUEST');
  const sources = (request.sources || []).map(normalizeSource).sort((a, b) => a.source_id.localeCompare(b.source_id));
  if (!sources.length) fail('RECOVERY_SOURCES_REQUIRED');
  const ids = new Set();
  const candidates = new Set();
  for (const source of sources) {
    if (ids.has(source.source_id)) fail('DUPLICATE_SOURCE_ID', source.source_id);
    ids.add(source.source_id);
    if (candidates.has(source.version_candidate.candidate_id)) fail('DUPLICATE_CANDIDATE_ID', source.version_candidate.candidate_id);
    candidates.add(source.version_candidate.candidate_id);
  }
  for (const source of sources) {
    for (const parent of source.version_candidate.parent_candidate_ids) {
      if (!candidates.has(parent)) fail('UNKNOWN_PARENT_CANDIDATE', `${source.version_candidate.candidate_id}->${parent}`);
      if (parent === source.version_candidate.candidate_id) fail('SELF_PARENT_CANDIDATE', parent);
    }
  }
  const anchor = assertString(request.book_project_id || request.recovery_session_id, 'BOOK_PROJECT_OR_RECOVERY_SESSION_REQUIRED');
  const reentryMode = request.reentry_mode || 'RECOVER_EXISTING';
  if (!['RECOVER_EXISTING', 'NEW_EDITION'].includes(reentryMode)) fail('INVALID_REENTRY_MODE', reentryMode);
  let priorEditionRef = null;
  if (reentryMode === 'NEW_EDITION') {
    const p = request.prior_edition_ref;
    if (!p || typeof p !== 'object') fail('PRIOR_EDITION_REF_REQUIRED');
    priorEditionRef = {
      edition_id: assertString(p.edition_id, 'PRIOR_EDITION_ID_REQUIRED'),
      edition_digest: assertDigest(p.edition_digest, 'PRIOR_EDITION_DIGEST_REQUIRED')
    };
  }
  const sourceIdentities = sources.map(s => ({source_id: s.source_id, source_digest: s.source_digest, projection_digest: s.projection_digest}));
  const recoveryKey = digest({anchor, profile_version: PROFILE_VERSION, reentry_mode: reentryMode, source_identities: sourceIdentities, prior_edition_ref: priorEditionRef});
  return {
    recovery_request_id: typeof request.recovery_request_id === 'string' ? request.recovery_request_id : `RECOVERY-${recoveryKey.slice(0, 16)}`,
    anchor,
    book_project_id: request.book_project_id || null,
    recovery_session_id: request.recovery_session_id || null,
    reentry_mode: reentryMode,
    prior_edition_ref: priorEditionRef,
    profile_version: PROFILE_VERSION,
    recovery_key: recoveryKey,
    sources
  };
}

function buildRevisionGraph(sources) {
  const nodes = sources.map(s => ({...clone(s.version_candidate)})).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const referencedParents = new Set(nodes.flatMap(n => n.parent_candidate_ids));
  const heads = nodes.filter(n => !referencedParents.has(n.candidate_id)).map(n => n.candidate_id).sort();
  const accepted = nodes.filter(n => ['AUTHOR_ACCEPTED', 'ACCEPTED_CANONICAL'].includes(n.authority_signal)).map(n => n.candidate_id);
  if (accepted.length > 1) fail('MULTIPLE_ACCEPTED_CANONICAL_CANDIDATES', accepted.join(','));
  let proposedSelectedCandidateId = null;
  let selectionBasis = 'UNRESOLVED_MULTIPLE_HEADS';
  if (accepted.length === 1) {
    proposedSelectedCandidateId = accepted[0];
    selectionBasis = 'EXPLICIT_ACCEPTED_AUTHORITY_SIGNAL';
  } else if (heads.length === 1) {
    proposedSelectedCandidateId = heads[0];
    selectionBasis = 'UNIQUE_REVISION_GRAPH_HEAD__PROPOSED_ONLY';
  }
  return {
    graph_id: `CRG-${digest(nodes).slice(0, 20)}`,
    nodes,
    heads,
    proposed_selected_candidate_id: proposedSelectedCandidateId,
    selection_basis: selectionBasis,
    canonical_selection_claimed: false
  };
}

function duplicateFindings(graph) {
  const findings = [];
  const byDigest = new Map();
  const bySimilarity = new Map();
  for (const node of graph.nodes) {
    if (!byDigest.has(node.content_digest)) byDigest.set(node.content_digest, []);
    byDigest.get(node.content_digest).push(node.candidate_id);
    if (node.similarity_key) {
      if (!bySimilarity.has(node.similarity_key)) bySimilarity.set(node.similarity_key, []);
      bySimilarity.get(node.similarity_key).push(node);
    }
  }
  for (const [contentDigest, ids] of byDigest.entries()) {
    if (ids.length > 1) findings.push({
      finding_code: 'EXACT_CONTENT_DUPLICATES', severity: 'INFO', candidate_ids: ids.sort(), content_digest: contentDigest,
      disposition: 'SHAREABLE_STORAGE_ONLY__DO_NOT_COLLAPSE_SEMANTIC_IDENTITIES'
    });
  }
  for (const [key, nodes] of bySimilarity.entries()) {
    const distinct = uniqueSorted(nodes.map(n => n.content_digest));
    if (nodes.length > 1 && distinct.length > 1) findings.push({
      finding_code: 'NEAR_DUPLICATE_CANDIDATES', severity: 'REVIEW', candidate_ids: nodes.map(n => n.candidate_id).sort(), similarity_key: key,
      disposition: 'PRESERVE_COMPETING_VERSIONS'
    });
  }
  return findings;
}

function reconstructStructure(normalized, graph) {
  const candidates = normalized.sources.map(source => ({
    candidate_id: source.version_candidate.candidate_id,
    source_ref: source.source_ref,
    structure: clone(source.structure)
  })).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const selected = graph.proposed_selected_candidate_id ? candidates.find(c => c.candidate_id === graph.proposed_selected_candidate_id) : null;
  const structure = selected ? clone(selected.structure) : [];
  const ambiguous = structure.filter(item => item.ambiguous || item.confidence < 0.75).map(item => item.structure_id);
  return {
    structure_id: `RBS-${digest(candidates).slice(0, 20)}`,
    source_candidate_id: selected ? selected.candidate_id : null,
    ordered_structure: structure,
    candidate_structures: candidates,
    ambiguous_structure_ids: ambiguous,
    standing: !selected ? 'BLOCKED_VERSION_AUTHORITY_AMBIGUOUS' : ambiguous.length ? 'PROPOSED_WITH_AMBIGUITIES' : 'PROPOSED_EVIDENCE_LINKED'
  };
}

function buildMetadataProposals(sources) {
  const fields = new Map();
  for (const source of sources) {
    for (const [field, value] of Object.entries(source.metadata || {})) {
      if (value === null || value === undefined || value === '') continue;
      if (!fields.has(field)) fields.set(field, []);
      fields.get(field).push({value: clone(value), source_ref: source.source_ref});
    }
  }
  const proposals = [];
  const conflicts = [];
  for (const field of [...fields.keys()].sort()) {
    const raw = fields.get(field);
    const keyed = new Map();
    for (const item of raw) {
      const k = stableStringify(item.value);
      if (!keyed.has(k)) keyed.set(k, {value: item.value, evidence_refs: []});
      keyed.get(k).evidence_refs.push(item.source_ref);
    }
    const values = [...keyed.values()].map(v => ({...v, evidence_refs: uniqueSorted(v.evidence_refs)}));
    proposals.push({field, values, standing: values.length === 1 ? 'PROPOSED_UNRATIFIED' : 'CONFLICTING_PROPOSALS'});
    if (values.length > 1) conflicts.push(field);
  }
  return {proposals, conflict_fields: conflicts};
}

function collectSemanticState(sources) {
  const metadata = buildMetadataProposals(sources);
  return {
    metadata_proposals: metadata.proposals,
    metadata_conflict_fields: metadata.conflict_fields,
    voice_profile_candidates: sources.flatMap(s => s.voice_candidates).sort(byId),
    story_bible_candidates: sources.flatMap(s => s.story_bible_candidates).sort(byId),
    nonfiction_knowledge_candidates: sources.flatMap(s => s.nonfiction_knowledge_candidates).sort(byId),
    citations_imported: sources.flatMap(s => s.citations.map(c => ({source_ref: s.source_ref, citation: clone(c)}))),
    explicit_open_items: sources.flatMap(s => [
      ...s.todos.map(v => ({kind: 'TODO', source_ref: s.source_ref, value: clone(v)})),
      ...s.comments.map(v => ({kind: 'COMMENT_OR_EDITOR_QUERY', source_ref: s.source_ref, value: clone(v)})),
      ...s.tracked_changes.map(v => ({kind: 'TRACKED_CHANGE', source_ref: s.source_ref, value: clone(v)}))
    ]),
    authority_standing: 'PROPOSED_ONLY__NO_AUTOMATIC_CANON_OR_ACCEPTED_TEXT_MUTATION'
  };
}

function makeFinding(code, severity, detail, evidenceRefs = []) {
  return {finding_code: code, severity, detail, evidence_refs: uniqueSorted(evidenceRefs)};
}
function buildFindings(normalized, graph, structure, semantic) {
  const findings = duplicateFindings(graph);
  if (graph.heads.length !== 1 && !graph.proposed_selected_candidate_id) findings.push(makeFinding(
    'VERSION_AUTHORITY_AMBIGUOUS', 'BLOCKING', `Competing revision heads: ${graph.heads.join(',')}`, graph.nodes.map(n => n.source_ref)
  ));
  if (structure.ambiguous_structure_ids.length) findings.push(makeFinding(
    'STRUCTURE_BOUNDARIES_AMBIGUOUS', 'BLOCKING', structure.ambiguous_structure_ids.join(','), normalized.sources.map(s => s.source_ref)
  ));
  if (semantic.metadata_conflict_fields.length) findings.push(makeFinding(
    'SEMANTIC_METADATA_CONFLICT', 'REVIEW', semantic.metadata_conflict_fields.join(','), normalized.sources.map(s => s.source_ref)
  ));
  if (semantic.explicit_open_items.length) findings.push(makeFinding(
    'EXPLICIT_OPEN_ITEMS_RECOVERED', 'REVIEW', `${semantic.explicit_open_items.length} TODO/comment/tracked-change items preserved`, normalized.sources.map(s => s.source_ref)
  ));
  return findings.sort((a, b) => a.finding_code.localeCompare(b.finding_code));
}

function decision(recoveryKey, family, consequence, subjectRefs, evidenceRefs) {
  return {
    decision_request_id: `EBR-DEC-${digest({recoveryKey, family}).slice(0, 20)}`,
    decision_family: family,
    consequence_class: consequence,
    subject_identity_refs: clone(subjectRefs),
    evidence_refs: uniqueSorted(evidenceRefs),
    author_authority_required: true,
    standing: 'AWAITING_AUTHOR_DECISION'
  };
}

function buildAuthorDecisionBatch(normalized, graph, structure, semantic, findings) {
  const refs = normalized.sources.map(s => ({object_id: s.source_id, object_version: 'IMPORTED', object_digest: s.source_digest}));
  const evidenceRefs = normalized.sources.map(s => s.source_ref);
  const decisions = [];
  if (findings.some(f => f.finding_code === 'VERSION_AUTHORITY_AMBIGUOUS')) decisions.push(decision(normalized.recovery_key, 'SELECT_RECOVERED_MANUSCRIPT_VERSION', 'CANONICAL_SELECTION', refs, evidenceRefs));
  if (structure.ambiguous_structure_ids.length) decisions.push(decision(normalized.recovery_key, 'RESOLVE_RECOVERED_STRUCTURE_BOUNDARIES', 'STRUCTURAL_SEMANTIC', refs, evidenceRefs));
  if (semantic.metadata_conflict_fields.length) decisions.push(decision(normalized.recovery_key, 'RESOLVE_RECOVERED_METADATA_CONFLICTS', 'SEMANTIC_METADATA', refs, evidenceRefs));
  decisions.push(decision(normalized.recovery_key, 'RATIFY_RECOVERED_BOOK_BASELINE', 'CANONICAL_BASELINE_ADMISSION', refs, evidenceRefs));
  return {
    batch_id: `EBR-ADB-${digest(decisions).slice(0, 20)}`,
    decisions: decisions.sort((a, b) => a.decision_family.localeCompare(b.decision_family)),
    auto_resolved_decisions: 0,
    author_choice_synthesized: false
  };
}

function buildMaturity(graph, structure, semantic, decisionBatch) {
  const dimensions = [
    {gate: 'SOURCE_CUSTODY', status: 'SATISFIED', reason: 'Exact source identities/digests are present in the normalized recovery request.'},
    {gate: 'VERSION_GRAPH', status: graph.proposed_selected_candidate_id ? 'SATISFIED' : 'BLOCKED', reason: graph.proposed_selected_candidate_id ? graph.selection_basis : 'Multiple unresolved revision heads.'},
    {gate: 'STRUCTURE_RECONSTRUCTION', status: !graph.proposed_selected_candidate_id ? 'BLOCKED' : structure.ambiguous_structure_ids.length ? 'BLOCKED' : 'SATISFIED', reason: !graph.proposed_selected_candidate_id ? 'Version selection unresolved.' : structure.ambiguous_structure_ids.length ? 'Ambiguous boundaries require author adjudication.' : 'Evidence-linked structure proposal available.'},
    {gate: 'SEMANTIC_PROPOSAL', status: 'SATISFIED', reason: 'Evidence-linked semantic proposals and explicit open items preserved without canonicalization.'},
    {gate: 'AUTHOR_RATIFICATION', status: decisionBatch.decisions.length ? 'BLOCKED' : 'SATISFIED', reason: 'Machine recovery never synthesizes author ratification.'},
    {gate: 'LIFECYCLE_JOIN', status: 'BLOCKED', reason: 'Recovered baseline remains proposal state until required author/canonical admission gates pass.'}
  ];
  const firstIncomplete = dimensions.find(d => d.status !== 'SATISFIED');
  return {
    dimensions,
    exact_next_gate: firstIncomplete ? firstIncomplete.gate : 'LIFECYCLE_JOIN',
    exact_next_reason: firstIncomplete ? firstIncomplete.reason : 'Ready for governed lifecycle join.'
  };
}

function checkpoint(recoveryInputDigest, phase, payload) {
  return {
    checkpoint_id: `EBR-CP-${phase}-${digest({recoveryInputDigest, phase, payload}).slice(0, 16)}`,
    engine_id: ENGINE_ID,
    profile_version: PROFILE_VERSION,
    recovery_input_digest: recoveryInputDigest,
    phase,
    payload_digest: digest(payload)
  };
}

function recoverExistingBook(request) {
  const normalized = validateAndNormalizeRequest(request);
  const recoveryInputDigest = digest({
    recovery_key: normalized.recovery_key,
    sources: normalized.sources,
    reentry_mode: normalized.reentry_mode,
    prior_edition_ref: normalized.prior_edition_ref
  });
  const graph = buildRevisionGraph(normalized.sources);
  const structure = reconstructStructure(normalized, graph);
  const semantic = collectSemanticState(normalized.sources);
  const findings = buildFindings(normalized, graph, structure, semantic);
  const decisionBatch = buildAuthorDecisionBatch(normalized, graph, structure, semantic, findings);
  const maturity = buildMaturity(graph, structure, semantic, decisionBatch);
  const editionLineage = normalized.reentry_mode === 'NEW_EDITION' ? {
    relationship: 'NEW_EDITION_OF',
    prior_edition_ref: normalized.prior_edition_ref,
    history_rewrite_permitted: false
  } : null;
  const baselinePayload = {
    engine_id: ENGINE_ID,
    profile_version: PROFILE_VERSION,
    recovery_key: normalized.recovery_key,
    book_project_id: normalized.book_project_id,
    recovery_session_id: normalized.recovery_session_id,
    reentry_mode: normalized.reentry_mode,
    source_manifest: normalized.sources.map(s => ({source_id: s.source_id, source_digest: s.source_digest, source_ref: s.source_ref, projection_digest: s.projection_digest})),
    candidate_revision_graph: graph,
    reconstructed_structure: structure,
    proposed_semantic_state: semantic,
    unresolved_findings: findings,
    author_decision_batch: decisionBatch,
    book_maturity_profile: maturity,
    edition_lineage: editionLineage,
    lifecycle_join_authorized: false,
    canonical_book_mutation_performed: false,
    standing: 'PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION'
  };
  const recoveredBaseline = {
    ...baselinePayload,
    recovered_book_baseline_id: `RBB-${digest(baselinePayload).slice(0, 24)}`,
    baseline_digest: digest(baselinePayload)
  };
  const checkpoints = [
    checkpoint(recoveryInputDigest, PHASES[0], baselinePayload.source_manifest),
    checkpoint(recoveryInputDigest, PHASES[1], graph),
    checkpoint(recoveryInputDigest, PHASES[2], structure),
    checkpoint(recoveryInputDigest, PHASES[3], semantic),
    checkpoint(recoveryInputDigest, PHASES[4], decisionBatch),
    checkpoint(recoveryInputDigest, PHASES[5], {baseline_digest: recoveredBaseline.baseline_digest, maturity})
  ];
  return {
    recovery_receipt: {
      recovery_receipt_id: `EBR-REC-${digest({recoveryInputDigest, baseline: recoveredBaseline.baseline_digest}).slice(0, 20)}`,
      engine_id: ENGINE_ID,
      profile_version: PROFILE_VERSION,
      recovery_input_digest: recoveryInputDigest,
      recovery_key: normalized.recovery_key,
      output_baseline_digest: recoveredBaseline.baseline_digest,
      idempotency_standing: 'DETERMINISTIC_EXACT_INPUT_PROFILE',
      canonical_mutation_performed: false,
      author_decision_synthesized: false
    },
    recovered_book_baseline: recoveredBaseline,
    checkpoints
  };
}

function resumeExistingBookRecovery(request, savedCheckpoint) {
  if (!savedCheckpoint || savedCheckpoint.engine_id !== ENGINE_ID || savedCheckpoint.profile_version !== PROFILE_VERSION) fail('INVALID_RECOVERY_CHECKPOINT');
  if (!PHASES.includes(savedCheckpoint.phase)) fail('UNKNOWN_RECOVERY_CHECKPOINT_PHASE', String(savedCheckpoint.phase));
  const fresh = recoverExistingBook(request);
  if (fresh.recovery_receipt.recovery_input_digest !== savedCheckpoint.recovery_input_digest) fail('RECOVERY_CHECKPOINT_INPUT_MISMATCH');
  return {
    ...fresh,
    resume_receipt: {
      resumed_from_checkpoint_id: savedCheckpoint.checkpoint_id,
      resumed_from_phase: savedCheckpoint.phase,
      recovery_input_digest: savedCheckpoint.recovery_input_digest,
      output_baseline_digest: fresh.recovered_book_baseline.baseline_digest,
      standing: 'DETERMINISTIC_RECOMPUTE_FROM_VALIDATED_CHECKPOINT_BOUNDARY'
    }
  };
}

module.exports = {
  ENGINE_ID,
  PROFILE_VERSION,
  ExistingBookRecoveryError,
  stableStringify,
  digest,
  recoverExistingBook,
  resumeExistingBookRecovery
};
