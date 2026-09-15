'use strict';

function ids(prefix, count) {
  return Object.freeze(Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`));
}

const FAMILIES = Object.freeze({
  E: ids('E', 32),
  D: ids('D', 32),
  P: ids('P', 24),
  U: ids('U', 24),
  I: ids('I', 16)
});

const EXPECTED_COUNTS = Object.freeze({ E: 32, D: 32, P: 24, U: 24, I: 16 });
const TOTAL = 128;

function validateDenominatorManifestV1() {
  const all = [];
  for (const [family, expected] of Object.entries(EXPECTED_COUNTS)) {
    const cases = FAMILIES[family];
    if (!Array.isArray(cases) || cases.length !== expected) throw new Error(`B04_E_DENOMINATOR_COUNT_DRIFT:${family}`);
    cases.forEach((id, i) => {
      const expectedId = `${family}${String(i + 1).padStart(2, '0')}`;
      if (id !== expectedId) throw new Error(`B04_E_DENOMINATOR_SEQUENCE_DRIFT:${family}:${id}`);
      all.push(id);
    });
  }
  if (all.length !== TOTAL) throw new Error(`B04_E_DENOMINATOR_TOTAL_DRIFT:${all.length}`);
  if (new Set(all).size !== TOTAL) throw new Error('B04_E_DENOMINATOR_DUPLICATE_ID');
  if (Object.keys(FAMILIES).join(',') !== 'E,D,P,U,I') throw new Error('B04_E_DENOMINATOR_FAMILY_DRIFT');
  return true;
}

function registerFamilyTests(test, family, implementations) {
  validateDenominatorManifestV1();
  const caseIds = FAMILIES[family];
  if (!caseIds) throw new Error(`B04_E_DENOMINATOR_UNKNOWN_FAMILY:${family}`);
  if (!Array.isArray(implementations) || implementations.length !== caseIds.length) {
    throw new Error(`B04_E_DENOMINATOR_IMPLEMENTATION_COUNT_DRIFT:${family}:${implementations && implementations.length}`);
  }
  implementations.forEach((entry, i) => {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim() || typeof entry.run !== 'function') {
      throw new Error(`B04_E_DENOMINATOR_IMPLEMENTATION_INVALID:${caseIds[i]}`);
    }
    test(`${caseIds[i]} ${entry.name}`, entry.run);
  });
}

validateDenominatorManifestV1();

module.exports = {
  FAMILIES,
  EXPECTED_COUNTS,
  TOTAL,
  validateDenominatorManifestV1,
  registerFamilyTests
};