'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUALIFICATION = 'A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001';
const WORKSTREAM = 'SYSTEM-MASTER';
const MODEL = 'gpt-oss-20b-NPU';
const HOST = 'http://127.0.0.1:13305';
const RESULT_PROTOCOL = 'control-gateway.a01-registered-task-result.v1';
const INPUT_PROTOCOL = 'control-gateway.a01-registered-task-input.v1';

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), label + ' fields differ from frozen contract');
}

function requiredString(value, label, maxLength = 0) {
  assert(typeof value === 'string' && value.length > 0, label + ' must be non-empty text');
  if (maxLength > 0) assert(value.length <= maxLength, label + ' exceeds maximum length');
  return value;
}

function safeEvidencePath(file, evidenceDir, label) {
  const resolvedDir = path.resolve(evidenceDir);
  const resolvedFile = path.resolve(file);
  const prefix = resolvedDir.endsWith(path.sep) ? resolvedDir : resolvedDir + path.sep;
  assert(resolvedFile.startsWith(prefix), label + ' must remain inside evidence directory');
  return resolvedFile;
}

async function requestJson(url, { method = 'GET', body = null, timeoutMs = 30000 } = {}) {
  assert(url.startsWith(HOST + '/'), 'local task wrapper may call only the fixed localhost Lemonade host');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: body === null ? undefined : { 'Content-Type': 'application/json' },
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw_text: text };
    }
    if (!response.ok) {
      const error = new Error('HTTP_' + response.status + ':' + url);
      error.status = response.status;
      error.payload = parsed;
      throw error;
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function modelIds(payload) {
  const source = Array.isArray(payload) ? payload :
    Array.isArray(payload?.data) ? payload.data :
    Array.isArray(payload?.models) ? payload.models : [];
  return source.map((item) => typeof item === 'string' ? item : item?.id || item?.model_name || item?.name).filter(Boolean);
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload?.output)) {
    const parts = [];
    for (const item of payload.output) {
      if (typeof item?.text === 'string') parts.push(item.text);
      if (Array.isArray(item?.content)) {
        for (const child of item.content) {
          if (typeof child?.text === 'string') parts.push(child.text);
          if (typeof child?.output_text === 'string') parts.push(child.output_text);
        }
      }
    }
    if (parts.length) return parts.join('\n');
  }
  const chat = payload?.choices?.[0]?.message?.content;
  return typeof chat === 'string' ? chat : '';
}

function extractFinalAnswer(payload) {
  const raw = extractOutputText(payload).trim();
  if (!raw) return '';
  const marker = '<|channel|>final<|message|>';
  const markerIndex = raw.lastIndexOf(marker);
  if (markerIndex === -1) return raw;
  let finalText = raw.slice(markerIndex + marker.length);
  const endIndex = finalText.indexOf('<|end|>');
  if (endIndex !== -1) finalText = finalText.slice(0, endIndex);
  return finalText.trim();
}

function evidenceManifest(evidenceDir, subjectSha, taskId) {
  const files = fs.readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json') && name !== 'registered-task-evidence-manifest.json')
    .sort();
  const manifest = {
    protocol_version: 'control-gateway.a01-registered-task-evidence-manifest.v1',
    qualification_id: QUALIFICATION,
    workstream_id: WORKSTREAM,
    subject_sha: subjectSha,
    task_id: taskId,
    files: files.map((name) => ({ name, sha256: sha256File(path.join(evidenceDir, name)) }))
  };
  writeJson(path.join(evidenceDir, 'registered-task-evidence-manifest.json'), manifest);
  return manifest;
}

async function executeTask() {
  const inputPathRaw = requiredString(process.env.A01_REGISTERED_TASK_INPUT, 'A01_REGISTERED_TASK_INPUT');
  const resultPathRaw = requiredString(process.env.A01_REGISTERED_TASK_RESULT, 'A01_REGISTERED_TASK_RESULT');
  const evidenceDirRaw = requiredString(process.env.A01_REGISTERED_TASK_EVIDENCE_DIR, 'A01_REGISTERED_TASK_EVIDENCE_DIR');
  const subjectFromEnv = requiredString(process.env.A01_SUBJECT_SHA, 'A01_SUBJECT_SHA').toLowerCase();

  const evidenceDir = path.resolve(evidenceDirRaw);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const inputPath = safeEvidencePath(inputPathRaw, evidenceDir, 'registered task input');
  const resultPath = safeEvidencePath(resultPathRaw, evidenceDir, 'registered task result');

  const payload = readJson(inputPath);
  exactKeys(payload, [
    'qualification_id', 'workstream_id', 'subject_sha', 'control_plane_sha',
    'task_id', 'task_type', 'instruction', 'model', 'max_output_tokens', 'temperature'
  ], 'registered task payload');

  assert(payload.qualification_id === QUALIFICATION, 'qualification_id differs from production binding');
  assert(payload.workstream_id === WORKSTREAM, 'workstream_id differs from SYSTEM-MASTER');
  const subjectSha = requiredString(payload.subject_sha, 'subject_sha').toLowerCase();
  const controlPlaneSha = requiredString(payload.control_plane_sha, 'control_plane_sha').toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(subjectSha), 'subject_sha must be lowercase SHA-1');
  assert(subjectSha === subjectFromEnv, 'subject_sha differs from worker environment');
  assert(controlPlaneSha === subjectSha, 'control_plane_sha differs from exact subject');

  const taskId = requiredString(payload.task_id, 'task_id', 191);
  assert(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/.test(taskId), 'task_id has invalid format');
  assert(payload.task_type === 'TEXT_RESPONSE_V1', 'task_type must be TEXT_RESPONSE_V1');
  const instruction = requiredString(payload.instruction, 'instruction', 12000);
  assert(payload.model === MODEL, 'model differs from frozen local model');
  assert(Number.isInteger(payload.max_output_tokens) && payload.max_output_tokens >= 1 && payload.max_output_tokens <= 1024, 'max_output_tokens must be integer 1..1024');
  assert(payload.temperature === 0, 'temperature must be exactly 0');

  const startedAt = new Date();
  const inputRecord = {
    protocol_version: INPUT_PROTOCOL,
    qualification_id: QUALIFICATION,
    workstream_id: WORKSTREAM,
    subject_sha: subjectSha,
    task_id: taskId,
    task_type: payload.task_type,
    model: MODEL,
    instruction,
    max_output_tokens: payload.max_output_tokens,
    temperature: 0,
    idempotency_key: process.env.A01_REGISTERED_TASK_IDEMPOTENCY_KEY || null,
    attempt_id: process.env.A01_REGISTERED_TASK_ATTEMPT_ID || null,
    execution_generation: process.env.A01_REGISTERED_TASK_EXECUTION_GENERATION || null
  };
  writeJson(path.join(evidenceDir, 'registered-task-request.json'), inputRecord);

  let prefix = null;
  const probeErrors = [];
  for (const candidate of ['/api/v1', '/v1']) {
    try {
      const models = await requestJson(HOST + candidate + '/models', { timeoutMs: 30000 });
      const ids = modelIds(models);
      if (!ids.includes(MODEL)) throw new Error('TARGET_MODEL_MISSING:' + MODEL);
      prefix = candidate;
      writeJson(path.join(evidenceDir, 'registered-task-model-list.json'), { model_ids: ids });
      break;
    } catch (error) {
      probeErrors.push({ prefix: candidate, error: error.message });
    }
  }
  if (!prefix) fail('LEMONADE_MODELS_UNREACHABLE:' + JSON.stringify(probeErrors));

  const statsBefore = await requestJson(HOST + prefix + '/stats', { timeoutMs: 30000 });
  writeJson(path.join(evidenceDir, 'registered-task-stats-before.json'), statsBefore);

  const loadRequest = { model_name: MODEL, ctx_size: 4096 };
  writeJson(path.join(evidenceDir, 'registered-task-load-request.json'), loadRequest);
  const loadResponse = await requestJson(HOST + prefix + '/load', { method: 'POST', body: loadRequest, timeoutMs: 180000 });
  writeJson(path.join(evidenceDir, 'registered-task-load-response.json'), loadResponse);

  const responseRequest = {
    model: MODEL,
    input: instruction,
    max_output_tokens: payload.max_output_tokens,
    temperature: 0
  };
  writeJson(path.join(evidenceDir, 'registered-task-response-request.json'), responseRequest);
  const inferenceStarted = Date.now();
  const response = await requestJson(HOST + prefix + '/responses', { method: 'POST', body: responseRequest, timeoutMs: 240000 });
  const inferenceMs = Date.now() - inferenceStarted;
  writeJson(path.join(evidenceDir, 'registered-task-response-raw.json'), response);

  const responseText = extractFinalAnswer(response);
  assert(responseText.length > 0, 'registered local task returned empty final response');

  const statsAfter = await requestJson(HOST + prefix + '/stats', { timeoutMs: 30000 });
  writeJson(path.join(evidenceDir, 'registered-task-stats-after.json'), statsAfter);

  const completedAt = new Date();
  const result = {
    protocol_version: RESULT_PROTOCOL,
    state: 'PASS',
    qualification_id: QUALIFICATION,
    workstream_id: WORKSTREAM,
    subject_sha: subjectSha,
    task_id: taskId,
    task_type: payload.task_type,
    model: MODEL,
    api_prefix: prefix,
    response_text: responseText,
    request_digest: sha256Text(JSON.stringify(inputRecord)),
    inference_ms: inferenceMs,
    time_to_first_token: statsAfter?.time_to_first_token ?? null,
    tokens_per_second: statsAfter?.tokens_per_second ?? null,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString()
  };
  writeJson(resultPath, result);
  evidenceManifest(evidenceDir, subjectSha, taskId);
  console.log('PASS ' + QUALIFICATION + ' task=' + taskId + ' model=' + MODEL + ' prefix=' + prefix);
}

(async () => {
  try {
    assert(process.argv.length === 3 && process.argv[2] === '--execute-task', 'wrapper supports only --execute-task');
    await executeTask();
  } catch (error) {
    const evidenceDir = process.env.A01_REGISTERED_TASK_EVIDENCE_DIR;
    const resultPath = process.env.A01_REGISTERED_TASK_RESULT;
    if (evidenceDir && resultPath) {
      try {
        fs.mkdirSync(evidenceDir, { recursive: true });
        const resolvedResult = safeEvidencePath(resultPath, evidenceDir, 'registered task result');
        writeJson(resolvedResult, {
          protocol_version: RESULT_PROTOCOL,
          state: 'FAIL',
          qualification_id: QUALIFICATION,
          subject_sha: process.env.A01_SUBJECT_SHA || null,
          failure: error && error.message ? error.message : String(error),
          completed_at: new Date().toISOString()
        });
      } catch (_) {}
    }
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
})();
