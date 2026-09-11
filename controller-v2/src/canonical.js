import { createHash, randomBytes } from 'node:crypto';

function assertValidString(value) {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) throw new TypeError('lone high surrogate');
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new TypeError('lone low surrogate');
    }
  }
}

export function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assertValidString(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${canonicalize(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  throw new TypeError(`unsupported JSON value: ${typeof value}`);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalize(value)).digest('hex');
}

let lastMs = -1;
let sequence = 0;
export function uuidv7(nowMs = Date.now()) {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > 0xffffffffffff) throw new RangeError('invalid UUIDv7 timestamp');
  if (nowMs === lastMs) sequence = (sequence + 1) & 0x0fff;
  else { lastMs = nowMs; sequence = randomBytes(2).readUInt16BE(0) & 0x0fff; }
  const b = randomBytes(16);
  let t = BigInt(nowMs);
  for (let i = 5; i >= 0; i -= 1) { b[i] = Number(t & 0xffn); t >>= 8n; }
  b[6] = 0x70 | ((sequence >> 8) & 0x0f);
  b[7] = sequence & 0xff;
  b[8] = 0x80 | (b[8] & 0x3f);
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function isUuidV7(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
export function isSha1(v) { return /^[0-9a-f]{40}$/i.test(v); }
export function isRfc3339(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v)) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}
