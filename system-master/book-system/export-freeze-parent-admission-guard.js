'use strict';

const base = require('./export-freeze.js');

const GUARD_ID = 'BOOK-SYSTEM-EXPORT-FREEZE-PARENT-ADMISSION-GUARD-001';

class ExportFreezeParentAdmissionGuardError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ExportFreezeParentAdmissionGuardError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new ExportFreezeParentAdmissionGuardError(code, detail); }

function validateParentAdmissionRefs(request) {
  if (!request || !Array.isArray(request.parent_admission_refs) || request.parent_admission_refs.length === 0) {
    fail('PARENT_ADMISSION_REF_REQUIRED');
  }
  const seen = new Set();
  for (const ref of request.parent_admission_refs) {
    if (typeof ref !== 'string' || ref.trim().length === 0) fail('PARENT_ADMISSION_REF_REQUIRED');
    if (seen.has(ref)) fail('DUPLICATE_PARENT_ADMISSION_REF', ref);
    seen.add(ref);
  }
  return true;
}

function freezeExport(args) {
  validateParentAdmissionRefs(args && args.request);
  return base.freezeExport(args);
}

module.exports = {
  ...base,
  GUARD_ID,
  ExportFreezeParentAdmissionGuardError,
  validateParentAdmissionRefs,
  freezeExport,
};
