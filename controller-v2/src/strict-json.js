import { TextDecoder } from 'node:util';

export class StrictJsonError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StrictJsonError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new StrictJsonError(code, message);
}

function validUnicodeString(value) {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

class Parser {
  constructor(text, maxDepth) {
    this.text = text;
    this.maxDepth = maxDepth;
    this.i = 0;
  }

  parse() {
    this.ws();
    const value = this.value(0);
    this.ws();
    if (this.i !== this.text.length) fail('PROTOCOL_INVALID_JSON', 'trailing non-whitespace bytes');
    return value;
  }

  ws() {
    while (this.i < this.text.length) {
      const c = this.text.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i += 1;
      else break;
    }
  }

  value(depth) {
    if (depth > this.maxDepth) fail('PROTOCOL_NESTING_LIMIT', 'JSON nesting limit exceeded');
    if (this.i >= this.text.length) fail('PROTOCOL_INVALID_JSON', 'unexpected end of JSON');
    const ch = this.text[this.i];
    if (ch === '{') return this.object(depth);
    if (ch === '[') return this.array(depth);
    if (ch === '"') return this.string();
    if (ch === 't') return this.literal('true', true);
    if (ch === 'f') return this.literal('false', false);
    if (ch === 'n') return this.literal('null', null);
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.number();
    fail('PROTOCOL_INVALID_JSON', `unexpected JSON token at ${this.i}`);
  }

  literal(token, value) {
    if (!this.text.startsWith(token, this.i)) fail('PROTOCOL_INVALID_JSON', `invalid literal at ${this.i}`);
    this.i += token.length;
    return value;
  }

  string() {
    const start = this.i;
    this.i += 1;
    while (this.i < this.text.length) {
      const code = this.text.charCodeAt(this.i);
      if (code === 0x22) {
        this.i += 1;
        let value;
        try { value = JSON.parse(this.text.slice(start, this.i)); }
        catch { fail('PROTOCOL_INVALID_JSON', 'invalid JSON string'); }
        if (!validUnicodeString(value)) fail('PROTOCOL_INVALID_JSON', 'lone Unicode surrogate is not allowed');
        return value;
      }
      if (code < 0x20) fail('PROTOCOL_INVALID_JSON', 'unescaped control character in string');
      if (code === 0x5c) {
        this.i += 1;
        if (this.i >= this.text.length) fail('PROTOCOL_INVALID_JSON', 'truncated escape');
        const esc = this.text[this.i];
        if ('"\\/bfnrt'.includes(esc)) {
          this.i += 1;
          continue;
        }
        if (esc !== 'u') fail('PROTOCOL_INVALID_JSON', 'invalid escape');
        const hex = this.text.slice(this.i + 1, this.i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('PROTOCOL_INVALID_JSON', 'invalid unicode escape');
        this.i += 5;
        continue;
      }
      this.i += 1;
    }
    fail('PROTOCOL_INVALID_JSON', 'unterminated string');
  }

  number() {
    const rest = this.text.slice(this.i);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(rest);
    if (!match) fail('PROTOCOL_INVALID_JSON', 'invalid number');
    const token = match[0];
    this.i += token.length;
    const value = Number(token);
    if (!Number.isFinite(value)) fail('PROTOCOL_INVALID_JSON', 'non-finite JSON number');
    return value;
  }

  object(depth) {
    this.i += 1;
    const out = Object.create(null);
    const seen = new Set();
    this.ws();
    if (this.text[this.i] === '}') { this.i += 1; return out; }
    while (true) {
      this.ws();
      if (this.text[this.i] !== '"') fail('PROTOCOL_INVALID_JSON', 'object member name must be a string');
      const key = this.string();
      if (seen.has(key)) fail('PROTOCOL_DUPLICATE_KEY', `duplicate JSON object member ${key}`);
      seen.add(key);
      this.ws();
      if (this.text[this.i] !== ':') fail('PROTOCOL_INVALID_JSON', 'missing object colon');
      this.i += 1;
      this.ws();
      out[key] = this.value(depth + 1);
      this.ws();
      if (this.text[this.i] === '}') { this.i += 1; return out; }
      if (this.text[this.i] !== ',') fail('PROTOCOL_INVALID_JSON', 'missing object separator');
      this.i += 1;
    }
  }

  array(depth) {
    this.i += 1;
    const out = [];
    this.ws();
    if (this.text[this.i] === ']') { this.i += 1; return out; }
    while (true) {
      this.ws();
      out.push(this.value(depth + 1));
      this.ws();
      if (this.text[this.i] === ']') { this.i += 1; return out; }
      if (this.text[this.i] !== ',') fail('PROTOCOL_INVALID_JSON', 'missing array separator');
      this.i += 1;
    }
  }
}

export function parseStrictJsonText(text, { maxDepth = 64 } = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new RangeError('maxDepth must be a positive safe integer');
  return new Parser(text, maxDepth).parse();
}

export function parseStrictJsonBytes(bytes, { maxBytes = 64 * 1024, maxDepth = 64 } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be Uint8Array');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be a positive safe integer');
  if (bytes.byteLength > maxBytes) fail('TRANSPORT_FRAME_TOO_LARGE', `JSON payload exceeds ${maxBytes} bytes`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('PROTOCOL_INVALID_UTF8', 'payload is not valid UTF-8'); }
  return parseStrictJsonText(text, { maxDepth });
}
