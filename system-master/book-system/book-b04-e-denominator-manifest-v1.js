'use strict';

const BLOCKS = Object.freeze({
  EXPOSURE: Object.freeze({ prefix: 'E', count: 32 }),
  DIMENSION: Object.freeze({ prefix: 'D', count: 32 }),
  PERSPECTIVE: Object.freeze({ prefix: 'P', count: 24 }),
  UNDERSTANDING: Object.freeze({ prefix: 'U', count: 24 }),
  INVALIDATION: Object.freeze({ prefix: 'I', count: 16 })
});

function ids(prefix, count) {
  return Object.freeze(Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`));
}

const CASE_IDS = Object.freeze({
  EXPOSURE: ids('E', 32),
  DIMENSION: ids('D', 32),
  PERSPECTIVE: ids('P', 24),
  UNDERSTANDING: ids('U', 24),
  INVALIDATION: ids('I', 16)
});

const ALL_CASE_IDS = Object.freeze([
  ...CASE_IDS.EXPOSURE,
  ...CASE_IDS.DIMENSION,
  ...CASE_IDS.PERSPECTIVE,
  ...CASE_IDS.UNDERSTANDING,
  ...CASE_IDS.INVALIDATION
]);

const EXTERNAL_EVIDENCE_FENCES = Object.freeze([
  'MODEL_READER_SIMULATION_CALIBRATION_REQUIRED',
  'HUMAN_READER_ALIGNMENT_REQUIRED',
  'REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED',
  'PROVIDER_SUBJECT_ADMISSION_REQUIRED'
]);

function validateFrozenDenominatorV1() {
  const expected = {
    EXPOSURE: ['E', 32],
    DIMENSION: ['D', 32],
    PERSPECTIVE: ['P', 24],
    UNDERSTANDING: ['U', 24],
    INVALIDATION: ['I', 16]
  };
  for (const [block, [prefix, count]] of Object.entries(expected)) {
    const actual = CASE_IDS[block];
    if (!Array.isArray(actual) || actual.length !== count) throw new Error(`B04_E_DENOMINATOR_COUNT_DRIFT:${block}`);
    actual.forEach((id, index) => {
      const wanted = `${prefix}${String(index + 1).padStart(2, '0')}`;
      if (id !== wanted) throw new Error(`B04_E_DENOMINATOR_ID_DRIFT:${block}:${id}:${wanted}`);
    });
  }
  if (ALL_CASE_IDS.length !== 128) throw new Error(`B04_E_DENOMINATOR_TOTAL_DRIFT:${ALL_CASE_IDS.length}`);
  if (new Set(ALL_CASE_IDS).size !== 128) throw new Error('B04_E_DENOMINATOR_DUPLICATE_ID');
  if (EXTERNAL_EVIDENCE_FENCES.length !== 4 || new Set(EXTERNAL_EVIDENCE_FENCES).size !== 4) throw new Error('B04_E_EXTERNAL_FENCE_DRIFT');
  return true;
}

validateFrozenDenominatorV1();

module.exports = {
  BLOCKS,
  CASE_IDS,
  ALL_CASE_IDS,
  EXTERNAL_EVIDENCE_FENCES,
  validateFrozenDenominatorV1
};
