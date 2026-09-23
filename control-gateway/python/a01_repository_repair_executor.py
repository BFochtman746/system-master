from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

REPAIR_EXECUTOR_KIND = "A01_REPOSITORY_REPAIR"
REPAIR_EXECUTOR_PROTOCOL = "control-gateway.a01-repository-repair-executor.v1"
PRODUCTION_WRITER_WORKFLOW = "control-gateway-production-writer.yml"
GITHUB_API_VERSION = "2026-03-10"
MAX_WORKFLOW_INPUT_CHARS = 60_000


class RepositoryRepairExecutionError(RuntimeError):
    def __init__(self, code: str, message: str, result: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.result = {"error_code": code, **(result or {})}


def _fail(code: str, message: str, **result: Any) -> None:
    raise RepositoryRepairExecutionError(code, message, result)


def _compact(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("REPAIR_PAYLOAD_INVALID", f"{label} must be an object")
    return value


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value.strip() != value:
        _fail("REPAIR_PAYLOAD_INVALID", f"{label} must be non-empty trimmed text")
    return value


def _sha(value: Any, label: str) -> str:
    value = _text(value, label).lower()
    if len(value) != 40 or any(ch not in "0123456789abcdef" for ch in value):
        _fail("REPAIR_PAYLOAD_INVALID", f"{label} must be a 40-character Git SHA")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _claim(context: Any) -> dict[str, Any]:
    row = context.worker.store.conn.execute("SELECT * FROM claims WHERE lease_id=?", (context.lease_id,)).fetchone()
    if row is None:
        _fail("REPAIR_CLAIM_MISSING", "repository repair has no scheduler claim")
    value = dict(row)
    checks = {
        "lane": "CORE",
        "delegation_id": context.delegation_id,
        "dispatch_id": context.dispatch_id,
        "idempotency_key": context.idempotency_key,
        "fencing_token": context.fencing_token,
    }
    if value.get("released_at") is not None or any(str(value.get(k)) != str(v) for k, v in checks.items()):
        _fail("REPAIR_CLAIM_INVALID", "repository repair claim is released or differs from the live execution fence")
    return value


def _preflight(root: Path) -> dict[str, Any]:
    proc = subprocess.run(
        ["node", str(root / ".github/scripts/a01-repository-repair-preflight.js")],
        cwd=root, capture_output=True, text=True, shell=False, timeout=180,
    )
    try:
        value = json.loads(proc.stdout)
    except json.JSONDecodeError:
        _fail("REPAIR_PREFLIGHT_INVALID", "repository repair preflight did not emit JSON", stderr=proc.stderr[-4000:])
    if proc.returncode != 0 or value.get("standing") != "SAFE_TO_REPAIR":
        _fail("REPAIR_PREFLIGHT_BLOCKED", "repository repair preflight did not report SAFE_TO_REPAIR", standing=value.get("standing"), findings=value.get("findings", []))
    return value


def _readiness(root: Path, value: dict[str, Any]) -> dict[str, Any]:
    module = root / "control-gateway/src/a01-repository-repair-mutation-readiness.js"
    temp = root / ".a01-repair-readiness-input.json"
    temp.write_text(json.dumps(value), encoding="utf-8")
    script = "import fs from'node:fs';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);const i=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(m.buildRepositoryRepairMutationCommand(i)));"
    try:
        proc = subprocess.run(["node", "--input-type=module", "--eval", script, str(module), str(temp)], cwd=root, capture_output=True, text=True, shell=False, timeout=60)
    finally:
        temp.unlink(missing_ok=True)
    if proc.returncode != 0:
        _fail("REPAIR_READINESS_REJECTED", "Gate 4 mutation-readiness rejected repair", stderr=proc.stderr[-4000:])
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        _fail("REPAIR_READINESS_INVALID", "Gate 4 mutation-readiness returned invalid JSON")


class GitHubRepairTransport:
    def __init__(self, owner: str, repo: str, token: str, api_base: str = "https://api.github.com"):
        self.owner, self.repo, self.token, self.api_base = owner, repo, token, api_base.rstrip("/")

    def _request(self, method: str, path: str, body: Optional[dict[str, Any]] = None) -> tuple[int, dict[str, str], bytes]:
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
        headers = {"Accept":"application/vnd.github+json","Authorization":f"Bearer {self.token}","User-Agent":"system-master-a01-repair/1","X-GitHub-Api-Version":GITHUB_API_VERSION}
        if data is not None: headers["Content-Type"] = "application/json"
        url = f"{self.api_base}/repos/{urllib.parse.quote(self.owner)}/{urllib.parse.quote(self.repo)}{path}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=30) as response:
                return response.status, dict(response.headers.items()), response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode(errors="replace")[-4000:]
            limited = exc.code in {403,429} and (exc.headers.get("Retry-After") or exc.headers.get("X-RateLimit-Remaining") == "0")
            _fail("REPAIR_GITHUB_RATE_LIMITED" if limited else "REPAIR_GITHUB_API_ERROR", f"GitHub API HTTP {exc.code}", http_status=exc.code, retry_after=exc.headers.get("Retry-After"), rate_limit_reset=exc.headers.get("X-RateLimit-Reset"), response=raw)
        except (urllib.error.URLError, TimeoutError) as exc:
            _fail("REPAIR_GITHUB_NETWORK_AMBIGUOUS", "GitHub request outcome is ambiguous; do not blindly retry", error=str(exc))

    @staticmethod
    def _json(raw: bytes) -> dict[str, Any]:
        try: value = json.loads(raw.decode())
        except Exception: _fail("REPAIR_GITHUB_RESPONSE_INVALID", "GitHub response was not JSON")
        if not isinstance(value, dict): _fail("REPAIR_GITHUB_RESPONSE_INVALID", "GitHub JSON response was not an object")
        return value

    def dispatch(self, ref: str, inputs: dict[str, str]) -> int:
        status, _, raw = self._request("POST", f"/actions/workflows/{PRODUCTION_WRITER_WORKFLOW}/dispatches", {"ref":ref,"inputs":inputs})
        if status != 200: _fail("REPAIR_WRITER_DISPATCH_AMBIGUOUS", "workflow dispatch did not return exact run details", http_status=status)
        run_id = self._json(raw).get("workflow_run_id")
        if not isinstance(run_id, int) or run_id <= 0: _fail("REPAIR_WRITER_DISPATCH_INVALID", "workflow dispatch response lacks workflow_run_id")
        return run_id

    def run(self, run_id: int) -> dict[str, Any]:
        status, _, raw = self._request("GET", f"/actions/runs/{run_id}")
        if status != 200: _fail("REPAIR_WRITER_RUN_INVALID", f"workflow run read HTTP {status}")
        return self._json(raw)

    def ref(self, name: str) -> str:
        encoded = "/".join(urllib.parse.quote(part) for part in name.split("/"))
        _, _, raw = self._request("GET", f"/git/ref/heads/{encoded}")
        return _sha(self._json(raw).get("object",{}).get("sha"), "target ref SHA")

    def commit(self, sha: str) -> dict[str, Any]:
        _, _, raw = self._request("GET", f"/commits/{sha}")
        return self._json(raw)

    def file(self, sha: str, path: str) -> Optional[bytes]:
        encoded = "/".join(urllib.parse.quote(part) for part in path.split("/"))
        try: _, _, raw = self._request("GET", f"/contents/{encoded}?ref={sha}")
        except RepositoryRepairExecutionError as exc:
            if exc.result.get("http_status") == 404: return None
            raise
        value = self._json(raw)
        if value.get("type") != "file" or value.get("encoding") != "base64": _fail("REPAIR_POSTWRITE_VERIFY_FAILED", "content response is not a base64 file", path=path)
        return base64.b64decode(str(value.get("content","")).replace("\n",""))

    def artifact(self, run_id: int) -> dict[str, Any]:
        _, _, raw = self._request("GET", f"/actions/runs/{run_id}/artifacts?per_page=100")
        expected = f"control-gateway-production-write-{run_id}-evidence"
        matches = [a for a in self._json(raw).get("artifacts",[]) if a.get("name") == expected and not a.get("expired")]
        if len(matches) != 1: _fail("REPAIR_EVIDENCE_MISSING", "exact immutable production-writer artifact is not present", artifact_name=expected)
        return {"artifact_id":matches[0].get("id"),"artifact_digest":matches[0].get("digest"),"artifact_name":expected}


def _paths(plan: dict[str, Any]) -> list[str]:
    return sorted([row["path"] for row in plan.get("writes",[])] + list(plan.get("deletes",[])))


def _verify_result(transport: Any, plan: dict[str, Any], result_sha: str) -> None:
    commit = transport.commit(result_sha)
    if [row.get("sha") for row in commit.get("parents",[])] != [plan["expected_predecessor_sha"]]: _fail("REPAIR_POSTWRITE_VERIFY_FAILED", "result commit is not the exact single-parent CAS successor")
    if sorted(row.get("filename") for row in commit.get("files",[])) != _paths(plan): _fail("REPAIR_POSTWRITE_VERIFY_FAILED", "result commit paths differ from bounded cleanup plan")
    for row in plan.get("writes",[]):
        observed = transport.file(result_sha, row["path"])
        if observed is None or hashlib.sha256(observed).hexdigest() != row["content_sha256"]: _fail("REPAIR_POSTWRITE_VERIFY_FAILED", "result bytes differ from cleanup plan", path=row["path"])
    for path in plan.get("deletes",[]):
        if transport.file(result_sha, path) is not None: _fail("REPAIR_POSTWRITE_VERIFY_FAILED", "deleted cleanup path still exists", path=path)


def execute_repository_repair(payload: dict[str, Any], context: Any, *, claim_loader: Callable[[Any],dict[str,Any]]=_claim, preflight_runner: Callable[[Path],dict[str,Any]]=_preflight, readiness_builder: Callable[[Path,dict[str,Any]],dict[str,Any]]=_readiness, transport_factory: Callable[[str,str,str],Any]=GitHubRepairTransport, sleep_fn: Callable[[float],None]=time.sleep) -> dict[str, Any]:
    payload = _dict(payload, "repair payload")
    expected = {"protocol_version","qualification_id","subject_sha","workstream_id","state_ref","authority","qualification","mutation_plan","effects","development_response_base64","development_response_receipt","writer_timeout_minutes"}
    if set(payload) != expected or payload.get("protocol_version") != REPAIR_EXECUTOR_PROTOCOL: _fail("REPAIR_PAYLOAD_INVALID", "repair payload differs from frozen executor contract")
    subject = _sha(payload["subject_sha"], "subject_sha")
    plan, authority, qualification = _dict(payload["mutation_plan"],"mutation_plan"), _dict(payload["authority"],"authority"), _dict(payload["qualification"],"qualification")
    if qualification.get("result_class") != "PASS" or str(qualification.get("subject_sha","")).lower() != subject or qualification.get("promotion_authorized") is not False: _fail("REPAIR_QUALIFICATION_INVALID", "repair requires fresh exact-subject PASS with no promotion authority")
    if plan.get("expected_predecessor_sha") != subject or authority.get("authoritative_subject",{}).get("oid") != subject: _fail("REPAIR_AUTHORITY_INVALID", "plan/authority subject differs from exact execution subject")
    timeout = payload["writer_timeout_minutes"]
    if not isinstance(timeout,int) or not 1 <= timeout <= 45: _fail("REPAIR_PAYLOAD_INVALID", "writer_timeout_minutes must be 1..45")
    if str(context.worker._git_head()).lower() != subject: _fail("REPAIR_CHECKOUT_MISMATCH", "A-01 checkout differs from exact repair subject")

    context.renew(checkpoint_pointer=f"repository-repair:{context.dispatch_id}:preflight")
    claim, preflight = claim_loader(context), preflight_runner(context.worker.root)
    if str(preflight.get("repository_commit_sha","")).lower() != subject: _fail("REPAIR_PREFLIGHT_STALE", "preflight commit differs from exact subject")
    readiness_input = {"protocol_version":"control-gateway.a01-repository-repair-mutation-readiness.v1","command_id":plan.get("mutation_id"),"state_ref":payload["state_ref"],"authority":authority,"preflight":{"standing":preflight.get("standing"),"repository_commit_sha":preflight.get("repository_commit_sha")},"claim":{"lane":claim["lane"],"delegation_id":claim["delegation_id"],"lease_id":claim["lease_id"],"dispatch_id":claim["dispatch_id"],"idempotency_key":claim["idempotency_key"],"fencing_token":int(claim["fencing_token"]),"control_head":claim["control_head"]},"qualification":qualification,"mutation_plan":plan,"effects":payload["effects"],"development_response_base64":payload["development_response_base64"],"development_response_receipt":payload["development_response_receipt"]}
    evidence_dir = Path(context.evidence_dir); _write_json(evidence_dir/"repository-repair-preflight.json",preflight); _write_json(evidence_dir/"repository-repair-readiness-input.json",readiness_input)
    readiness = readiness_builder(context.worker.root, readiness_input); _write_json(evidence_dir/"repository-repair-readiness.json",readiness)
    if readiness.get("standing") != "MUTATION_READY_FOR_EXISTING_PRODUCTION_WRITER" or any(readiness.get(k) is not False for k in ("direct_github_write_authority","promotion_authority","branch_deletion_authority")): _fail("REPAIR_READINESS_INVALID", "Gate 4 did not preserve existing-writer-only authority")
    command = _dict(readiness.get("command"),"Gate 4 command")
    repository = _text(command.get("mutation_request",{}).get("repository"),"repository"); parts = repository.split("/")
    if len(parts) != 2: _fail("REPAIR_PAYLOAD_INVALID", "repository must be owner/name")
    token = os.environ.get("A01_REPAIR_DISPATCH_TOKEN","").strip()
    if not token: _fail("REPAIR_DISPATCH_TOKEN_MISSING", "A01_REPAIR_DISPATCH_TOKEN is required with Actions:write + Contents:read and no Contents:write")
    inputs = {"state_ref":payload["state_ref"],"mutation_request_json":_compact(command["mutation_request"]),"mutation_plan_json":_compact(command["mutation_plan"]),"development_response_base64":payload["development_response_base64"],"development_response_receipt_json":_compact(payload["development_response_receipt"])}
    if len(_compact(inputs)) > MAX_WORKFLOW_INPUT_CHARS: _fail("REPAIR_DISPATCH_PAYLOAD_TOO_LARGE", "cleanup batch exceeds workflow_dispatch transport budget; split it")

    context.renew(checkpoint_pointer=f"repository-repair:{context.dispatch_id}:dispatch")
    transport = transport_factory(parts[0],parts[1],token); run_id = transport.dispatch(plan.get("target_ref","main"),inputs)
    _write_json(evidence_dir/"production-writer-dispatch.json",{"run_id":run_id,"command_digest":readiness.get("command_digest"),"direct_github_write_authority":False})
    deadline, run = time.monotonic()+timeout*60, None
    while time.monotonic() < deadline:
        context.renew(checkpoint_pointer=f"repository-repair:{context.dispatch_id}:writer-{run_id}"); run = transport.run(run_id)
        if run.get("head_sha") and str(run["head_sha"]).lower() != subject: _fail("REPAIR_WRITER_SUBJECT_MISMATCH", "production writer run head differs from exact repair subject", run_id=run_id)
        if run.get("status") == "completed": break
        sleep_fn(min(5.0,max(.1,float(context.worker.renew_seconds))))
    if not run or run.get("status") != "completed": _fail("REPAIR_WRITER_TIMEOUT", "production writer timed out", run_id=run_id)
    if run.get("conclusion") != "success": _fail("REPAIR_WRITER_FAILED", "existing production writer failed repair", run_id=run_id, conclusion=run.get("conclusion"))
    result_sha = transport.ref(plan.get("target_ref","main"))
    if result_sha == subject: _fail("REPAIR_POSTWRITE_VERIFY_FAILED", "writer succeeded but target ref did not advance")
    _verify_result(transport,plan,result_sha); artifact = transport.artifact(run_id); _write_json(evidence_dir/"production-writer-evidence-summary.json",{**artifact,"result_commit_sha":result_sha})
    return {"protocol_version":REPAIR_EXECUTOR_PROTOCOL,"status":"PASS","executor_kind":REPAIR_EXECUTOR_KIND,"qualification_id":payload["qualification_id"],"subject_sha":subject,"mutation_id":plan.get("mutation_id"),"writer_run_id":run_id,"result_commit_sha":result_sha,"command_digest":readiness.get("command_digest"),"claim_lease_id":context.lease_id,"claim_fencing_token":context.fencing_token,"direct_github_write_authority":False,"production_writer_only":True,**artifact}
