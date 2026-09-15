'use strict';

const understanding = require('./book-reader-understanding-v1');
const d3 = require('./book-reader-currentness-runtime-v1');

function fail(code, detail = '') {
  const error = new d3.BookReaderCurrentnessError(code, detail);
  throw error;
}

function validateExactObservationSet(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'query_input');
  if (!input.exposure_projection || !input.understanding_projection || !Array.isArray(input.observations)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'query_bindings');

  const ids = new Set();
  for (const observation of input.observations) {
    try { understanding.validateReaderObservationV1(observation, input.exposure_projection); }
    catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation:${err.code || err.message || 'invalid'}`); }
    if (ids.has(observation.observation_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `duplicate:${observation.observation_id}`);
    ids.add(observation.observation_id);
  }

  let rebuilt;
  try {
    rebuilt = understanding.assembleReaderUnderstandingProjectionV1({
      exposure_projection: input.exposure_projection,
      observations: input.observations
    });
  } catch (err) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `rebuild:${err.code || err.message || 'invalid'}`);
  }

  if (rebuilt.understanding_projection_id !== input.understanding_projection.understanding_projection_id || rebuilt.understanding_projection_digest !== input.understanding_projection.understanding_projection_digest) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'projection_observation_set');
  }
  return true;
}

function getReaderDimensionEvidenceV1(input) {
  validateExactObservationSet(input);
  return d3.getReaderDimensionEvidenceV1(input);
}

function getReaderLensCoverageV1(input) {
  validateExactObservationSet(input);
  return d3.getReaderLensCoverageV1(input);
}

function createBookReaderQueryRuntimeV1(input) {
  validateExactObservationSet(input);
  const runtime = d3.createBookReaderRuntimeV1(input);
  const originalExecute = runtime.execute;

  function execute(operationName, args = {}) {
    if (operationName === 'GetReaderDimensionEvidenceV1') {
      return getReaderDimensionEvidenceV1({
        exposure_projection: input.exposure_projection,
        understanding_projection: input.understanding_projection,
        observations: input.observations,
        currentness: originalExecute('GetReaderUnderstandingCurrentnessV1'),
        dimension_id: args.dimension_id
      });
    }
    if (operationName === 'GetReaderLensCoverageV1') {
      return getReaderLensCoverageV1({
        exposure_projection: input.exposure_projection,
        understanding_projection: input.understanding_projection,
        observations: input.observations,
        currentness: originalExecute('GetReaderUnderstandingCurrentnessV1'),
        perspective_lens_id: args.perspective_lens_id
      });
    }
    return originalExecute(operationName, args);
  }

  return Object.freeze({ ...runtime, execute });
}

module.exports = {
  validateExactObservationSet,
  getReaderDimensionEvidenceV1,
  getReaderLensCoverageV1,
  createBookReaderQueryRuntimeV1
};