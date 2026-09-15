import { createHash } from 'node:crypto';

const ASCII_WS_RUN = /[ \t\r\n\f]+/g;
const ASCII_WS_EDGE = /^[ \t\r\n\f]+|[ \t\r\n\f]+$/g;

function trimRequestId(requestId) {
  return requestId.replace(ASCII_WS_EDGE, '');
}

function normalizePayload(payload) {
  const normalizedLines = payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalizedLines.replace(ASCII_WS_RUN, ' ').replace(/^ +| +$/g, '');
}

export function canonical(requestId, payload) {
  return `${trimRequestId(requestId)}:${normalizePayload(payload)}`;
}

export function sha256(requestId, payload) {
  return createHash('sha256').update(canonical(requestId, payload), 'utf8').digest('hex');
}
