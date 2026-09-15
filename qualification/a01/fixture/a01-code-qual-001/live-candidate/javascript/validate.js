const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUIRED_FIELDS = new Set(['requestId', 'owner', 'payload']);

function invalid(error) {
  return { ok: false, error };
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateIdentity(value, field) {
  if (typeof value !== 'string') return invalid(`${field}-type`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return invalid(`${field}-empty`);
  if (trimmed.length > 64) return invalid(`${field}-length`);
  if (!ID_PATTERN.test(trimmed)) return invalid(`${field}-format`);
  return { ok: true, value: trimmed };
}

export function validateRequest(input) {
  try {
    if (!isPlainObject(input)) return invalid('input-type');

    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 3 ||
      keys.some((key) => typeof key !== 'string' || !REQUIRED_FIELDS.has(key))
    ) {
      return invalid('fields');
    }

    const requestId = validateIdentity(input.requestId, 'requestId');
    if (!requestId.ok) return requestId;

    const owner = validateIdentity(input.owner, 'owner');
    if (!owner.ok) return owner;

    if (typeof input.payload !== 'string') return invalid('payload-type');
    if (Array.from(input.payload).length > 1024) return invalid('payload-length');
    if (input.payload.includes('\0')) return invalid('payload-nul');

    return {
      ok: true,
      requestId: requestId.value,
      owner: owner.value,
      payload: input.payload
    };
  } catch {
    // Proxies/getters or other hostile object mechanics must not turn malformed
    // input into an exception path. Validation fails closed with a stable code.
    return invalid('input-access');
  }
}
