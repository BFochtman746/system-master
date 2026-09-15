export function validateRequest(input) {
  // Intentionally defective: coercion makes malformed values look valid.
  if (!input) return { ok: false, error: 'missing' };
  return {
    ok: true,
    requestId: String(input.requestId).trim(),
    owner: String(input.owner).trim(),
    payload: String(input.payload ?? '')
  };
}
