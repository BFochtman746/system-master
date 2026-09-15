'use strict';

const LENS_REGISTRY_SCHEMA_VERSION = 'BOOK_LITERARY_DIAGNOSTIC_LENS_REGISTRY_V1';

const EXTERNAL_B08_SEAMS = Object.freeze([
  'VOICE_PRESERVATION_EVOLUTION',
  'HOMOGENIZATION_OVEROPTIMIZATION'
]);

const RAW_LENSES = [
  ['B05-LENS-001','SENTENCE_RHYTHM_SYNTAX','B05_DIRECT','B02_SOURCE_ANCHORS;B10_AUTHOR_CONSTRAINTS_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','No universal sentence-quality score; preserve intentional irregularity and voice constraints.'],
  ['B05-LENS-002','PARAGRAPH_MOVEMENT','B05_DIRECT','B02_SOURCE_ANCHORS;B10_AUTHOR_CONSTRAINTS_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','Do not optimize paragraph shape toward one preferred cadence or density.'],
  ['B05-LENS-003','DICTION_REGISTER_LOCAL','B05_DIRECT_WITH_B08_SIGNAL_SEAM','B02_SOURCE_ANCHORS;B08_VOICE_EVIDENCE_OPTIONAL;B10_AUTHOR_CONSTRAINTS_OPTIONAL','DIAGNOSTIC_EVIDENCE_PLUS_LOCAL_VOICE_SIGNAL_ONLY','B05 may flag local diction/register effects but cannot set governing voice preference or degradation standing.'],
  ['B05-LENS-004','POV_FOCALIZATION_DISTANCE_EFFECT','B05_COMPOSED','B03_KNOWLEDGE;B04_READER_EXPOSURE_OPTIONAL;B10_AUTHOR_CONSTRAINTS_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','B05 evaluates literary realization; B03/B04 remain knowledge/exposure authorities.'],
  ['B05-LENS-005','CHARACTER_AGENCY_CONTINUITY_REALIZATION','B05_COMPOSED','B03_ENTITIES_EVENTS_RELATIONSHIPS_ARCS;B10_AUTHOR_CONSTRAINTS_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','B05 may diagnose realization but may not create or repair canon facts.'],
  ['B05-LENS-006','DIALOGUE_SUBTEXT_DISTINCTIVENESS','B05_DIRECT_WITH_B08_SIGNAL_SEAM','B02_SOURCE_ANCHORS;B03_CHARACTER_KNOWLEDGE_OPTIONAL;B08_VOICE_EVIDENCE_OPTIONAL','DIAGNOSTIC_EVIDENCE_PLUS_LOCAL_VOICE_SIGNAL_ONLY','Dialogue distinctiveness is not demographic stereotyping and does not grant B05 voice-learning authority.'],
  ['B05-LENS-007','SCENE_TENSION_CAUSALITY_EFFECT','B05_COMPOSED','B03_CAUSAL_EVENTS_OPTIONAL;B04_READER_TENSION_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','Reader tension evidence may inform diagnosis but is not literary quality truth.'],
  ['B05-LENS-008','PACING_COMPRESSION_EXPANSION_EFFECT','B05_COMPOSED','B02_SOURCE_ANCHORS;B04_PACING_MOMENTUM_OPTIONAL;B10_PURPOSE_CONSTRAINTS_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','No universal fast-is-better pacing objective.'],
  ['B05-LENS-009','INFORMATION_RELEASE_ORIENTATION_EFFECT','B05_COMPOSED','B03_KNOWLEDGE;B04_EXPOSURE_UNDERSTANDING_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','B05 cannot leak future text or overwrite B04 reader-exposure truth.'],
  ['B05-LENS-010','DESCRIPTION_IMAGERY_METAPHOR_MOTIF_EFFECT','B05_COMPOSED','B02_SOURCE_ANCHORS;B03_MOTIFS_OPTIONAL;B04_IMAGERY_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','B05 may analyze motif realization but B03 owns motif identity/truth.'],
  ['B05-LENS-011','EMOTIONAL_PROGRESSION_EFFECT','B05_COMPOSED','B02_SOURCE_ANCHORS;B03_CHARACTER_STATE_OPTIONAL;B04_AFFECT_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','No claim of universal reader emotion and no identity-essentialist prediction.'],
  ['B05-LENS-012','EXPOSITION_ARGUMENT','B05_DIRECT_COMPOSED_WHEN_FACTUAL','B02_SOURCE_ANCHORS;B03_KNOWLEDGE_OPTIONAL;RESEARCH_EVIDENCE_WHEN_FACTUAL','DIAGNOSTIC_EVIDENCE_ONLY','Literary presentation diagnosis cannot certify factual correctness.'],
  ['B05-LENS-013','THEOLOGICAL_PHILOSOPHICAL_PRESENTATION','B05_PRESENTATION_ONLY','B02_SOURCE_ANCHORS;B03_KNOWLEDGE_OPTIONAL;EXTERNAL_DOMAIN_EVIDENCE_WHEN_TRUTH_CLAIM','DIAGNOSTIC_PRESENTATION_EVIDENCE_ONLY','B05 may diagnose presentation but cannot become theology/philosophy/factual truth authority.'],
  ['B05-LENS-014','HISTORICAL_REGISTER_PRESENTATION','B05_PRESENTATION_ONLY','B02_SOURCE_ANCHORS;B03_KNOWLEDGE_OPTIONAL;RESEARCH_EVIDENCE_WHEN_HISTORICAL_TRUTH','DIAGNOSTIC_PRESENTATION_EVIDENCE_ONLY','B05 may diagnose register/presentation but cannot certify historical accuracy.'],
  ['B05-LENS-015','OPENING_ENDING_TURNS','B05_DIRECT_COMPOSED','B02_SOURCE_ANCHORS;B03_PROMISES_OPEN_QUESTIONS_OPTIONAL;B04_RESONANCE_OPTIONAL','DIAGNOSTIC_EVIDENCE_ONLY','No generic hook/closure maxim overrides project purpose.'],
  ['B05-LENS-016','CANON_PROTECTED_LANGUAGE_CONSTRAINT_CHECK','B05_CHECKER_ONLY','B03_CANON;B10_PROTECTED_LANGUAGE_AUTHOR_CONSTRAINTS','CONSTRAINT_CHECK_EVIDENCE_ONLY','B05 consumes canon/constraint truth and may block a literary opportunity; it cannot create canon or author decisions.']
];

const LENSES = Object.freeze(RAW_LENSES.map((row, index) => Object.freeze({
  index,
  lens_id: row[0],
  label: row[1],
  owner_class: row[2],
  required_owner_dependencies: row[3],
  output_authority: row[4],
  anti_abuse_rule: row[5]
})));

class BookLiteraryDiagnosticLensRegistryError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLiteraryDiagnosticLensRegistryError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookLiteraryDiagnosticLensRegistryError(code, detail); }

function validateLiteraryDiagnosticLensRegistryV1() {
  if (LENSES.length !== 16) fail('BLOCKED_DIAGNOSTIC_LENS_REGISTRY_CARDINALITY', String(LENSES.length));
  if (EXTERNAL_B08_SEAMS.length !== 2) fail('BLOCKED_EXTERNAL_B08_SEAM_CARDINALITY', String(EXTERNAL_B08_SEAMS.length));
  const ids = new Set();
  const labels = new Set();
  for (let i = 0; i < LENSES.length; i += 1) {
    const lens = LENSES[i];
    const expected = `B05-LENS-${String(i + 1).padStart(3, '0')}`;
    if (lens.lens_id !== expected) fail('BLOCKED_DIAGNOSTIC_LENS_ID_SEQUENCE', lens.lens_id);
    if (ids.has(lens.lens_id)) fail('BLOCKED_DIAGNOSTIC_LENS_DUPLICATE', lens.lens_id);
    if (labels.has(lens.label)) fail('BLOCKED_DIAGNOSTIC_LENS_LABEL_DUPLICATE', lens.label);
    for (const field of ['label','owner_class','required_owner_dependencies','output_authority','anti_abuse_rule']) {
      if (typeof lens[field] !== 'string' || lens[field].trim().length === 0) fail('BLOCKED_DIAGNOSTIC_LENS_INVALID', `${lens.lens_id}.${field}`);
    }
    ids.add(lens.lens_id);
    labels.add(lens.label);
  }
  if (new Set(EXTERNAL_B08_SEAMS).size !== 2) fail('BLOCKED_EXTERNAL_B08_SEAM_DUPLICATE');
  if (EXTERNAL_B08_SEAMS[0] !== 'VOICE_PRESERVATION_EVOLUTION' || EXTERNAL_B08_SEAMS[1] !== 'HOMOGENIZATION_OVEROPTIMIZATION') {
    fail('BLOCKED_EXTERNAL_B08_SEAM_DRIFT');
  }
  return true;
}

function getLiteraryDiagnosticLensV1(lensId) {
  const lens = LENSES.find(x => x.lens_id === lensId);
  if (!lens) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', String(lensId));
  return lens;
}

function assertLiteraryDiagnosticLensV1(lensId) {
  return getLiteraryDiagnosticLensV1(lensId).lens_id;
}

function normalizeRequestedLiteraryLensesV1(lensIds) {
  if (!Array.isArray(lensIds) || lensIds.length === 0) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', 'requested_lens_ids');
  const unique = new Set();
  for (const lensId of lensIds) {
    assertLiteraryDiagnosticLensV1(lensId);
    if (unique.has(lensId)) fail('BLOCKED_DIAGNOSTIC_LENS_DUPLICATE', lensId);
    unique.add(lensId);
  }
  return [...unique].sort();
}

validateLiteraryDiagnosticLensRegistryV1();

module.exports = {
  LENS_REGISTRY_SCHEMA_VERSION,
  LENSES,
  EXTERNAL_B08_SEAMS,
  BookLiteraryDiagnosticLensRegistryError,
  validateLiteraryDiagnosticLensRegistryV1,
  getLiteraryDiagnosticLensV1,
  assertLiteraryDiagnosticLensV1,
  normalizeRequestedLiteraryLensesV1
};
