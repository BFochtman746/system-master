'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const QUALIFICATION = 'A01-LOCAL-INFERENCE-BASELINE-001';
const WORKSTREAM = 'SYSTEM-MASTER';
const MODEL = 'gpt-oss-20b-NPU';
const PROMPT = 'Reply with exactly: A01_LOCAL_LLM_OK';
const HOST = 'http://127.0.0.1:13305';
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || os.tmpdir(), `a01-local-inference-baseline-${process.env.GITHUB_RUN_ID || 'local'}`);
const summaryPath = path.join(evidenceDir, 'baseline-summary.json');

function mkdir() {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

function writeJson(name, value) {
  mkdir();
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sanitize(value, key = '') {
  const lower = String(key).toLowerCase();
  if (/(^|_)(path|paths|launch_command|command|cwd|home|user_profile|username)($|_)/.test(lower)) return '<redacted-local-path-or-command>';
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) out[childKey] = sanitize(childValue, childKey);
    return out;
  }
  if (typeof value === 'string' && /^[A-Za-z]:\\/.test(value)) return '<redacted-local-path>';
  return value;
}

async function requestJson(url, { method = 'GET', body = null, timeoutMs = 30000 } = {}) {
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
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw_text: text }; }
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}:${url}`);
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
  const source = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return source.map((item) => typeof item === 'string' ? item : item?.id || item?.model_name || item?.name).filter(Boolean);
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload?.output)) {
    const parts = [];
    for (const item of payload.output) {
      if (typeof item?.text === 'string') parts.push(item.text);
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (typeof content?.text === 'string') parts.push(content.text);
          if (typeof content?.output_text === 'string') parts.push(content.output_text);
        }
      }
    }
    if (parts.length) return parts.join('\n');
  }
  const chat = payload?.choices?.[0]?.message?.content;
  if (typeof chat === 'string') return chat;
  return '';
}

function evidenceManifest() {
  mkdir();
  const files = fs.readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json') && name !== 'evidence-manifest.json')
    .sort();
  const entries = files.map((name) => ({ name, sha256: sha256File(path.join(evidenceDir, name)) }));
  const manifest = {
    qualification: QUALIFICATION,
    workstream: WORKSTREAM,
    subject_sha: process.env.GITHUB_SHA || null,
    files: entries
  };
  writeJson('evidence-manifest.json', manifest);
  return manifest;
}

async function requiredGet(prefix, name) {
  const value = await requestJson(`${HOST}${prefix}/${name}`, { timeoutMs: 30000 });
  writeJson(`${name.replaceAll('/', '-')}.json`, sanitize(value));
  return value;
}

(async () => {
  mkdir();
  const startedAt = new Date();
  try {
    let prefix = null;
    let models = null;
    const probeErrors = [];
    for (const candidate of ['/api/v1', '/v1']) {
      try {
        const payload = await requestJson(`${HOST}${candidate}/models`, { timeoutMs: 30000 });
        const ids = modelIds(payload);
        if (ids.length === 0) throw new Error('MODEL_LIST_EMPTY');
        prefix = candidate;
        models = payload;
        break;
      } catch (error) {
        probeErrors.push({ prefix: candidate, error: error.message });
      }
    }
    if (!prefix) throw new Error(`LEMONADE_MODELS_UNREACHABLE:${JSON.stringify(probeErrors)}`);

    const ids = modelIds(models);
    writeJson('model-list.json', { route: `${HOST}${prefix}/models`, model_ids: ids, raw: sanitize(models) });
    if (!ids.includes(MODEL)) throw new Error(`TARGET_MODEL_MISSING:${MODEL}`);

    const healthBefore = await requiredGet(prefix, 'health');
    const systemInfo = await requiredGet(prefix, 'system-info');
    const systemStatsBefore = await requiredGet(prefix, 'system-stats');
    const statsBefore = await requiredGet(prefix, 'stats');

    const loadRequest = { model_name: MODEL, ctx_size: 4096 };
    writeJson('load-request.json', loadRequest);
    const loadStarted = Date.now();
    const loadResponse = await requestJson(`${HOST}${prefix}/load`, { method: 'POST', body: loadRequest, timeoutMs: 180000 });
    const loadMs = Date.now() - loadStarted;
    writeJson('load-response.json', sanitize(loadResponse));

    const responseRequest = { model: MODEL, input: PROMPT, max_output_tokens: 64, temperature: 0 };
    writeJson('response-request.json', responseRequest);
    const inferenceStarted = Date.now();
    const response = await requestJson(`${HOST}${prefix}/responses`, { method: 'POST', body: responseRequest, timeoutMs: 240000 });
    const inferenceMs = Date.now() - inferenceStarted;
    writeJson('response.json', sanitize(response));
    const outputText = extractOutputText(response).trim();
    if (!outputText) throw new Error('LOCAL_LLM_RESPONSE_TEXT_EMPTY');
    if (!outputText.includes('A01_LOCAL_LLM_OK')) throw new Error(`LOCAL_LLM_SENTINEL_MISSING:${outputText.slice(0, 160)}`);

    const statsAfter = await requiredGet(prefix, 'stats-after');
    const systemStatsAfter = await requiredGet(prefix, 'system-stats-after');
    const healthAfter = await requiredGet(prefix, 'health-after');

    const completedAt = new Date();
    const summary = {
      qualification: QUALIFICATION,
      workstream: WORKSTREAM,
      state: 'PASS',
      subject_sha: process.env.GITHUB_SHA || null,
      runner: {
        name: process.env.RUNNER_NAME || null,
        os: process.env.RUNNER_OS || process.platform,
        arch: process.env.RUNNER_ARCH || process.arch
      },
      lemonade: {
        host: HOST,
        prefix,
        server_version: healthAfter?.version || healthBefore?.version || null,
        target_model: MODEL,
        target_model_present: true,
        model_count: ids.length,
        load_ms: loadMs,
        inference_wall_ms: inferenceMs,
        stats_before: sanitize(statsBefore),
        stats_after: sanitize(statsAfter),
        system_stats_before: sanitize(systemStatsBefore),
        system_stats_after: sanitize(systemStatsAfter)
      },
      hardware: sanitize(systemInfo),
      fixed_prompt: PROMPT,
      response_text: outputText,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      elapsed_ms: completedAt.getTime() - startedAt.getTime(),
      production_model_selected: false,
      next_boundary: 'Compare A-01 measured model performance before locking production model.'
    };
    writeJson('baseline-summary.json', summary);
    evidenceManifest();
    console.log(`PASS ${QUALIFICATION} model=${MODEL} prefix=${prefix} ttft=${statsAfter?.time_to_first_token ?? 'n/a'} tok_s=${statsAfter?.tokens_per_second ?? 'n/a'}`);
  } catch (error) {
    writeJson('baseline-summary.json', {
      qualification: QUALIFICATION,
      workstream: WORKSTREAM,
      state: 'FAIL',
      subject_sha: process.env.GITHUB_SHA || null,
      failure: error && error.message ? error.message : String(error),
      production_model_selected: false,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString()
    });
    evidenceManifest();
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
})();
