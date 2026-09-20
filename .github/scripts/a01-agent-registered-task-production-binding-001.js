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

function runQualification() {
  const cp = require('child_process');
  const qualificationPython = "import datetime as dt\nimport json\nimport os\nimport sys\nimport tempfile\nfrom pathlib import Path\n\nroot = Path(os.environ[\"A01_SUBJECT_ROOT\"]).resolve()\nsys.path.insert(0, str(root))\nsys.path.insert(0, str(root / \"control-gateway\" / \"python\"))\n\nfrom a01_execution_worker import A01ExecutionWorker\nfrom a01_github_ingress import Ingress, night_window, session_date\nfrom a01_night_scheduler import A01NightScheduler\nfrom a01_supervisor_adapter import digest\nfrom a01_supervisor_coordination import COORDINATION_PROTOCOL\nfrom tools.second_shift_supervisor_v2 import SupervisorStore\n\nqualification_id = \"A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001\"\nworkstream_id = \"SYSTEM-MASTER\"\nsubject = os.environ[\"A01_SUBJECT_SHA\"].lower()\nif len(subject) != 40 or any(ch not in \"0123456789abcdef\" for ch in subject):\n    raise RuntimeError(\"qualification subject is not lowercase SHA-1\")\n\npolicy = json.loads((root / \"qualification\" / \"a01\" / \"a01-policy.json\").read_text(encoding=\"utf-8\"))\nregistry = json.loads((root / \"qualification\" / \"a01\" / \"registry.json\").read_text(encoding=\"utf-8\"))\nentry = registry.get(\"qualifications\", {}).get(qualification_id)\nif not isinstance(entry, dict) or entry.get(\"overnight_eligible\") is not True:\n    raise RuntimeError(\"production binding qualification is not registered for overnight ingress\")\n\nnow = dt.datetime(2026, 9, 20, 5, 30, tzinfo=dt.timezone.utc)\novernight = policy[\"overnight\"]\nsession = session_date(now, overnight[\"timezone\"])\nnot_before, not_after = night_window(\n    session,\n    timezone_name=overnight[\"timezone\"],\n    start_local=overnight[\"window_start_local\"],\n    end_local=overnight[\"window_end_local\"],\n)\n\nlane = \"CORE\"\nowner_path = \"SYSTEM_MASTER/CORE\"\ncontrol_ref = \"system-master/owner-lane-execution-lease-adoption-001\"\ncontrol_head = subject\ntask_id = \"A01-REGISTERED-TASK-E2E-QUAL-001\"\ndelegation_id = \"A01-REGISTERED-TASK-E2E-DELEGATION-001\"\nobjective_id = \"A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001\"\nidempotency_key = \"A01-REGISTERED-TASK-E2E-IDEMPOTENCY-001\"\npayload = {\n    \"qualification_id\": qualification_id,\n    \"workstream_id\": workstream_id,\n    \"subject_sha\": subject,\n    \"control_plane_sha\": subject,\n    \"task_id\": task_id,\n    \"task_type\": \"TEXT_RESPONSE_V1\",\n    \"instruction\": \"Reply with exactly: A01_REGISTERED_TASK_OK\",\n    \"model\": \"gpt-oss-20b-NPU\",\n    \"max_output_tokens\": 256,\n    \"temperature\": 0,\n}\n\nreceipt = {\n    \"protocol_version\": \"control-gateway.a01-admission-receipt.v1\",\n    \"decision\": \"GRANTED\",\n    \"admission_id\": \"ADMIT-\" + task_id,\n    \"request_digest\": digest({\"task_id\": task_id, \"subject_sha\": subject}),\n    \"mission_version\": \"SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0\",\n    \"workstream_id\": workstream_id,\n    \"authority_epoch\": 1,\n    \"authority_publication_commit_sha\": subject,\n    \"authority_packet_digest\": digest({\"subject_sha\": subject, \"qualification_id\": qualification_id}),\n    \"authoritative_subject\": {\"algorithm\": \"sha1\", \"oid\": subject},\n    \"repository\": \"BFochtman746/system-master\",\n    \"authority_ref\": control_ref,\n    \"authority_ref_head_sha\": subject,\n    \"operation_id\": qualification_id,\n    \"predecessor_receipt_id\": \"A01-LOCAL-INFERENCE-BASELINE-001-SUCCEEDED-001\",\n    \"command_id\": \"CMD-\" + task_id,\n    \"task_id\": task_id,\n    \"idempotency_key\": idempotency_key,\n    \"execution_class\": \"OVERNIGHT\",\n    \"execution_order\": 1,\n    \"priority\": 100,\n    \"not_before\": not_before,\n    \"not_after\": not_after,\n    \"lane\": lane,\n    \"owner_path\": owner_path,\n    \"delegation_id\": delegation_id,\n    \"objective_id\": objective_id,\n    \"control_ref\": control_ref,\n    \"control_head\": control_head,\n    \"executor_kind\": \"A01_REGISTERED_TASK\",\n    \"payload_digest\": digest(payload),\n    \"dependency_receipt_ids\": [],\n    \"scheduling_owner\": \"A01_SUPERVISOR\",\n    \"github_role\": \"ADMISSION_TRANSPORT_EVIDENCE_ONLY\",\n    \"admission_digest\": \"\",\n}\nreceipt_body = dict(receipt)\nreceipt_body.pop(\"admission_digest\")\nreceipt[\"admission_digest\"] = digest(receipt_body)\n\nhandoff = {\n    \"protocol_version\": \"control-gateway.a01-supervisor-handoff.v1\",\n    \"admission_receipt\": receipt,\n    \"scheduling_owner\": \"A01_SUPERVISOR\",\n    \"github_role\": \"ADMISSION_TRANSPORT_EVIDENCE_ONLY\",\n    \"lane\": lane,\n    \"owner_path\": owner_path,\n    \"delegation_id\": delegation_id,\n    \"objective_id\": objective_id,\n    \"control_ref\": control_ref,\n    \"control_head\": control_head,\n    \"idempotency_key\": idempotency_key,\n    \"executor_kind\": \"A01_REGISTERED_TASK\",\n    \"execution_class\": \"OVERNIGHT\",\n    \"execution_order\": 1,\n    \"priority\": 100,\n    \"not_before\": not_before,\n    \"not_after\": not_after,\n    \"payload_digest\": digest(payload),\n    \"payload\": payload,\n    \"handoff_digest\": \"\",\n}\nhandoff_body = dict(handoff)\nhandoff_body.pop(\"handoff_digest\")\nhandoff[\"handoff_digest\"] = digest(handoff_body)\n\ncontract = {\n    \"protocol_version\": COORDINATION_PROTOCOL,\n    \"handoff_digest\": handoff[\"handoff_digest\"],\n    \"graph_id\": \"A01-REGISTERED-TASK-E2E-GRAPH\",\n    \"graph_version\": 1,\n    \"delegation_id\": delegation_id,\n    \"dependency_ids\": [],\n    \"resource_key\": \"OWNER-LANE:CORE\",\n    \"max_concurrency\": 1,\n    \"cancellation_policy\": \"NO_CASCADE\",\n    \"coordination_digest\": \"\",\n}\ncontract_body = dict(contract)\ncontract_body.pop(\"coordination_digest\")\ncontract[\"coordination_digest\"] = digest(contract_body)\n\ndelegation = {\n    \"delegation_id\": delegation_id,\n    \"objective_id\": objective_id,\n    \"obligation_id\": task_id,\n    \"owner_path\": owner_path,\n    \"state\": \"READY\",\n    \"valid_for_control_ref\": control_ref,\n    \"valid_for_control_head\": control_head,\n    \"a01_execution\": {\n        \"protocol_version\": \"control-gateway.a01-github-ingress-execution.v1\",\n        \"qualification_id\": qualification_id,\n        \"subject_sha\": subject,\n        \"handoff\": handoff,\n        \"coordination_contract\": contract,\n    },\n}\n\nauthority = {\n    \"authority_id\": \"CURRENT-AUTHORITY-005\",\n    \"second_shift_registry\": \"qualification-fixture/second-shift.json\",\n    \"obligation_registry\": \"qualification-fixture/obligations.json\",\n}\nsecond_shift = {\n    \"owner_files\": {\"CORE\": \"qualification-fixture/core-owner.json\"},\n    \"coverage_routes\": {},\n}\nobligations = {\n    \"owner_head_snapshot\": {\"CORE\": control_head},\n    \"obligations\": [{\"obligation_id\": task_id, \"owner_path\": owner_path, \"state\": \"READY\"}],\n}\nowner_file = {\n    \"owner_system_id\": lane,\n    \"owner_path\": owner_path,\n    \"control_ref\": control_ref,\n    \"last_known_control_head\": control_head,\n    \"active_delegations\": [delegation],\n}\n\nclass FixtureSource:\n    repository_full_name = \"BFochtman746/system-master\"\n    def read_json(self, path):\n        if path == \"governance/CURRENT-AUTHORITY.json\":\n            return authority\n        if path == \"qualification-fixture/second-shift.json\":\n            return second_shift\n        if path == \"qualification-fixture/obligations.json\":\n            return obligations\n        if path == \"qualification-fixture/core-owner.json\":\n            return owner_file\n        if path == \"qualification/a01/a01-policy.json\":\n            return policy\n        if path == \"qualification/a01/registry.json\":\n            return registry\n        raise RuntimeError(\"unexpected fixture path: \" + path)\n    def resolve_ref_head(self, ref):\n        if ref != control_ref:\n            raise RuntimeError(\"unexpected control ref: \" + ref)\n        return control_head\n\nevidence_root = Path(os.environ[\"A01_EVIDENCE_DIR\"]).resolve()\nevidence_root.mkdir(parents=True, exist_ok=True)\n\nwith tempfile.TemporaryDirectory(prefix=\"a01-registered-task-e2e-\") as temp_dir:\n    temp = Path(temp_dir)\n    store = SupervisorStore(temp / \"supervisor.db\")\n    try:\n        scheduler = A01NightScheduler(store)\n        ingress = Ingress(FixtureSource(), scheduler=scheduler, state_dir=temp / \"ingress\")\n        ingress_result = ingress.run_once(now=now, dry_run=False)\n        if ingress_result.status != \"PASS\" or ingress_result.enqueued != 1:\n            raise RuntimeError(\"production ingress did not enqueue exact registered task: \" + json.dumps(ingress_result.to_dict(), sort_keys=True))\n\n        worker = A01ExecutionWorker(\n            store,\n            root=root,\n            scheduler=scheduler,\n            lease_seconds=60,\n            renew_seconds=5,\n            heartbeat_sla_seconds=120,\n            evidence_root=evidence_root / \"registered-task-worker\",\n            clock=lambda: now,\n            worker_id=\"a01-production-binding-qualification-worker\",\n        )\n        worker_result = worker.run_once(now=now)\n        execution = worker_result.get(\"execution\")\n        if not isinstance(execution, dict) or execution.get(\"state\") != \"SUCCEEDED\":\n            raise RuntimeError(\"registered task worker did not succeed: \" + json.dumps(worker_result, sort_keys=True))\n        result_json = json.loads(execution.get(\"result_json\") or \"{}\")\n        task_result = result_json.get(\"result\")\n        if not isinstance(task_result, dict):\n            raise RuntimeError(\"registered task worker result envelope is missing nested result payload\")\n        if task_result.get(\"response_text\", \"\").strip() != \"A01_REGISTERED_TASK_OK\":\n            raise RuntimeError(\"registered task final answer mismatch: \" + repr(task_result.get(\"response_text\")))\n\n        summary = {\n            \"qualification_id\": qualification_id,\n            \"state\": \"PASS\",\n            \"subject_sha\": subject,\n            \"ingress_status\": ingress_result.status,\n            \"ingress_enqueued\": ingress_result.enqueued,\n            \"worker_state\": execution.get(\"state\"),\n            \"executor_kind\": execution.get(\"executor_kind\"),\n            \"task_id\": task_result.get(\"task_id\"),\n            \"model\": task_result.get(\"model\"),\n            \"response_text\": task_result.get(\"response_text\"),\n            \"attempt_count\": execution.get(\"attempt_count\"),\n            \"execution_generation\": execution.get(\"execution_generation\"),\n        }\n        (evidence_root / \"production-binding-summary.json\").write_text(json.dumps(summary, indent=2, sort_keys=True) + \"\\n\", encoding=\"utf-8\")\n        print(\"PASS \" + qualification_id + \" task=\" + task_id + \" response=A01_REGISTERED_TASK_OK\")\n    finally:\n        store.close()\n";
  const root = path.resolve(process.env.A01_SUBJECT_ROOT || process.cwd());
  const evidenceDir = requiredString(process.env.A01_EVIDENCE_DIR, 'A01_EVIDENCE_DIR');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const result = cp.spawnSync('python', ['-c', qualificationPython], {
    cwd: root,
    env: { ...process.env, A01_SUBJECT_ROOT: root, A01_EVIDENCE_DIR: evidenceDir },
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 20 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) fail('REGISTERED_TASK_QUALIFICATION_FAILED:' + String(result.status));
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

  let unloadResponse;
  try {
    unloadResponse = await requestJson(HOST + prefix + '/unload', {
      method: 'POST',
      body: { model_name: MODEL },
      timeoutMs: 60000
    });
  } catch (error) {
    if (error?.status !== 404) throw error;
    unloadResponse = { status: 'not_loaded', http_status: 404, model_name: MODEL };
  }
  writeJson(path.join(evidenceDir, 'registered-task-unload-response.json'), unloadResponse);

  const loadRequest = { model_name: MODEL, ctx_size: 4096 };
  writeJson(path.join(evidenceDir, 'registered-task-load-request.json'), loadRequest);
  const loadResponse = await requestJson(HOST + prefix + '/load', { method: 'POST', body: loadRequest, timeoutMs: 180000 });
  writeJson(path.join(evidenceDir, 'registered-task-load-response.json'), loadResponse);

  const responseRequest = {
    model: MODEL,
    messages: [{ role: 'user', content: instruction }],
    max_completion_tokens: payload.max_output_tokens,
    temperature: 0,
    stream: false
  };
  writeJson(path.join(evidenceDir, 'registered-task-response-request.json'), responseRequest);
  const inferenceStarted = Date.now();
  const response = await requestJson(HOST + prefix + '/chat/completions', { method: 'POST', body: responseRequest, timeoutMs: 240000 });
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
    if (process.argv.length === 2) {
      runQualification();
      return;
    }
    assert(process.argv.length === 3 && process.argv[2] === '--execute-task', 'wrapper supports only qualification mode or --execute-task');
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
