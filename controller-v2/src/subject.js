import { isGitObjectId } from './canonical.js';
import { ControllerError } from './errors.js';

export function normalizeSubjectRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ControllerError('SUBJECT_INVALID','SubjectRef object required');
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('algorithm') || !keys.includes('oid')) throw new ControllerError('SUBJECT_INVALID','SubjectRef requires only algorithm and oid');
  const algorithm = String(value.algorithm || '').toLowerCase();
  const oid = String(value.oid || '').toLowerCase();
  if (!isGitObjectId(algorithm, oid)) throw new ControllerError('SUBJECT_INVALID','unsupported Git object algorithm or object id length');
  return { algorithm, oid };
}

export function assertCanonicalSubjectRef(value) {
  const normalized = normalizeSubjectRef(value);
  if (value.algorithm !== normalized.algorithm || value.oid !== normalized.oid) throw new ControllerError('SUBJECT_NOT_CANONICAL','SubjectRef must use canonical lowercase algorithm and object id');
  return normalized;
}

export function sameSubject(a,b) {
  const x = normalizeSubjectRef(a), y = normalizeSubjectRef(b);
  return x.algorithm === y.algorithm && x.oid === y.oid;
}
