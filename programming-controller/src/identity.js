'use strict';

const crypto = require('crypto');

class IdentityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
    this.details = details;
  }
}

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};

const requireString = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('INCOMPLETE_INPUT', `${field} must be a non-empty string`, { field });
  return value;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-([89ab])[0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidVersion(value) {
  const match = UUID_RE.exec(value);
  if (!match) throw new IdentityError('INVALID_CANONICAL_ID', 'Canonical UUID text is invalid', { value });
  return Number.parseInt(match[1], 16);
}

function uuidToBytes(value) {
  const normalized = requireString(value, 'uuid').toLowerCase();
  uuidVersion(normalized);
  return Buffer.from(normalized.replaceAll('-', ''), 'hex');
}

function bytesToUuid(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new IdentityError('INVALID_CANONICAL_ID', 'UUID bytes must be Buffer/Uint8Array');
  const buffer = Buffer.from(bytes);
  if (buffer.length !== 16) throw new IdentityError('INVALID_CANONICAL_ID', 'UUID must contain exactly 16 bytes', { length: buffer.length });
  const hex = buffer.toString('hex');
  const value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  uuidVersion(value);
  return value;
}

function assertVariantAndVersion(value, expectedVersion) {
  const bytes = uuidToBytes(value);
  const version = bytes[6] >> 4;
  const variant = bytes[8] >> 6;
  if (version !== expectedVersion || variant !== 2) {
    throw new IdentityError('INVALID_ID_PROFILE', 'UUID version/variant does not match profile', { value, expectedVersion, actualVersion: version, actualVariantBits: variant });
  }
  return true;
}

function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function secureRandomBytes(length) {
  try {
    return crypto.randomBytes(length);
  } catch (error) {
    throw new IdentityError('GENERATOR_UNAVAILABLE', 'CSPRNG unavailable', { cause: error?.message || String(error) });
  }
}

function checkedRandom(source, length) {
  let bytes;
  try {
    bytes = source(length);
  } catch (error) {
    throw new IdentityError('GENERATOR_UNAVAILABLE', 'Random source unavailable', { cause: error?.message || String(error) });
  }
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new IdentityError('GENERATOR_UNAVAILABLE', 'Random source must return bytes');
  const buffer = Buffer.from(bytes);
  if (buffer.length !== length) throw new IdentityError('GENERATOR_UNAVAILABLE', 'Random source returned wrong byte count', { requested: length, actual: buffer.length });
  return buffer;
}

class CanonicalEntityId {
  constructor({ value, scheme_profile_id }) {
    this.value = requireString(value, 'entity_id').toLowerCase();
    this.scheme_profile_id = requireString(scheme_profile_id, 'scheme_profile_id');
    uuidVersion(this.value);
    freeze(this);
  }

  equals(other) {
    const value = other instanceof CanonicalEntityId ? other.value : String(other).toLowerCase();
    return this.value === value;
  }

  toString() { return this.value; }
  toBytes() { return uuidToBytes(this.value); }
}

class IdentitySchemeRegistry {
  constructor({ profiles = null } = {}) {
    this.profiles = new Map();
    const seed = profiles || [
      {
        scheme_profile_id: 'uuidv7-internal-v1',
        scheme_kind: 'UUIDV7',
        version: 1,
        encoding: 'RFC9562_CANONICAL_TEXT',
        exposure_class: 'INTERNAL',
        status: 'ACTIVE'
      },
      {
        scheme_profile_id: 'uuidv4-opaque-v1',
        scheme_kind: 'UUIDV4',
        version: 1,
        encoding: 'RFC9562_CANONICAL_TEXT',
        exposure_class: 'OPAQUE_EXTERNAL_OR_SECURITY_SENSITIVE',
        status: 'ACTIVE'
      }
    ];
    for (const profile of seed) this.register(profile);
  }

  register(profile) {
    const id = requireString(profile?.scheme_profile_id, 'scheme_profile_id');
    if (this.profiles.has(id)) throw new IdentityError('INVALID_ID_PROFILE', `Identity scheme profile already registered: ${id}`, { scheme_profile_id: id });
    if (!['UUIDV7', 'UUIDV4'].includes(profile.scheme_kind)) throw new IdentityError('INVALID_ID_PROFILE', 'Unsupported scheme kind', { scheme_kind: profile.scheme_kind });
    if (!Number.isInteger(profile.version) || profile.version <= 0) throw new IdentityError('INVALID_ID_PROFILE', 'Profile version must be positive integer');
    const record = freeze({
      scheme_profile_id: id,
      scheme_kind: profile.scheme_kind,
      version: profile.version,
      encoding: profile.encoding || 'RFC9562_CANONICAL_TEXT',
      exposure_class: profile.exposure_class || 'INTERNAL',
      status: profile.status || 'ACTIVE'
    });
    this.profiles.set(id, record);
    return record;
  }

  get(schemeProfileId) {
    const profile = this.profiles.get(requireString(schemeProfileId, 'scheme_profile_id'));
    if (!profile || profile.status !== 'ACTIVE') throw new IdentityError('INVALID_ID_PROFILE', `Unknown or inactive identity scheme profile: ${schemeProfileId}`, { scheme_profile_id: schemeProfileId });
    return profile;
  }

  select({ scheme_profile_id = null, exposure_class = 'INTERNAL' } = {}) {
    if (scheme_profile_id) return this.get(scheme_profile_id);
    if (['EXTERNAL', 'SECURITY_SENSITIVE', 'OPAQUE_EXTERNAL_OR_SECURITY_SENSITIVE'].includes(exposure_class)) return this.get('uuidv4-opaque-v1');
    return this.get('uuidv7-internal-v1');
  }
}

class UuidV7Generator {
  constructor({ clock = () => Date.now(), randomBytes = secureRandomBytes } = {}) {
    this.clock = clock;
    this.randomBytes = randomBytes;
    this.lastMs = -1;
    this.sequence = -1;
  }

  next() {
    const observed = Number(this.clock());
    if (!Number.isInteger(observed) || observed < 0 || observed > 0xffffffffffff) throw new IdentityError('GENERATOR_UNAVAILABLE', 'Clock returned invalid UUIDv7 millisecond timestamp', { observed });
    const effectiveMs = Math.max(observed, this.lastMs);
    if (effectiveMs !== this.lastMs) {
      const seed = checkedRandom(this.randomBytes, 2);
      this.sequence = ((seed[0] << 8) | seed[1]) & 0x0fff;
      this.lastMs = effectiveMs;
    } else {
      this.sequence += 1;
      if (this.sequence > 0x0fff) throw new IdentityError('GENERATOR_UNAVAILABLE', 'UUIDv7 monotonic sequence exhausted within one millisecond', { millisecond: this.lastMs });
    }

    const bytes = Buffer.alloc(16);
    let timestamp = BigInt(this.lastMs);
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = Number(timestamp & 0xffn);
      timestamp >>= 8n;
    }
    bytes[6] = 0x70 | ((this.sequence >> 8) & 0x0f);
    bytes[7] = this.sequence & 0xff;
    const tail = checkedRandom(this.randomBytes, 8);
    tail.copy(bytes, 8);
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = formatUuid(bytes);
    assertVariantAndVersion(value, 7);
    return value;
  }
}

function uuidV4(randomBytes = secureRandomBytes) {
  const bytes = checkedRandom(randomBytes, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = formatUuid(bytes);
  assertVariantAndVersion(value, 4);
  return value;
}

class IdentityAllocator {
  constructor({
    schemeRegistry = new IdentitySchemeRegistry(),
    clock = () => Date.now(),
    randomBytes = secureRandomBytes,
    uniquenessProbe = null,
    maxCollisionRetries = 4
  } = {}) {
    if (uniquenessProbe !== null && typeof uniquenessProbe !== 'function') throw new IdentityError('INVALID_PORT', 'uniquenessProbe must be a function when supplied');
    if (!Number.isInteger(maxCollisionRetries) || maxCollisionRetries < 0) throw new IdentityError('INVALID_CONFIGURATION', 'maxCollisionRetries must be a non-negative integer');
    this.registry = schemeRegistry;
    this.randomBytes = randomBytes;
    this.v7 = new UuidV7Generator({ clock, randomBytes });
    this.uniquenessProbe = uniquenessProbe;
    this.maxCollisionRetries = maxCollisionRetries;
  }

  allocateCandidate({ entity_kind, scheme_profile_id = null, exposure_class = 'INTERNAL', command_id }) {
    requireString(entity_kind, 'entity_kind');
    requireString(command_id, 'command_id');
    const profile = this.registry.select({ scheme_profile_id, exposure_class });
    for (let attempt = 0; attempt <= this.maxCollisionRetries; attempt += 1) {
      const value = profile.scheme_kind === 'UUIDV7' ? this.v7.next() : uuidV4(this.randomBytes);
      const canonical = new CanonicalEntityId({ value, scheme_profile_id: profile.scheme_profile_id });
      const collision = this.uniquenessProbe ? this.uniquenessProbe(canonical.value) === true : false;
      if (!collision) {
        return freeze({
          entity_id: canonical.value,
          entity_kind,
          scheme_profile_id: profile.scheme_profile_id,
          scheme_kind: profile.scheme_kind,
          profile_version: profile.version,
          exposure_class: profile.exposure_class,
          command_id,
          allocation_attempt: attempt + 1,
          persistence_standing: this.uniquenessProbe ? 'PROBED_NOT_COMMITTED' : 'UNPROBED_NOT_COMMITTED'
        });
      }
    }
    throw new IdentityError('IDENTITY_COLLISION', 'Unable to allocate collision-free identity within bounded attempts', { attempts: this.maxCollisionRetries + 1 });
  }
}

module.exports = {
  CanonicalEntityId,
  IdentityAllocator,
  IdentityError,
  IdentitySchemeRegistry,
  UuidV7Generator,
  assertVariantAndVersion,
  bytesToUuid,
  uuidToBytes,
  uuidV4,
  uuidVersion
};
