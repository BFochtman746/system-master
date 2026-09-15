#!/usr/bin/env python3
"""Post-freeze evaluator for A01-CODE-QUAL-001.

Runs only after the CODE job has frozen the candidate artifact. The evaluator
consumes the candidate artifact plus run-local hidden cases and emits raw,
descriptive evidence. It does not assign an aggregate quality score.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path, timeout: int = 120) -> dict:
    p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, timeout=timeout)
    return {"cmd": cmd, "returncode": p.returncode, "stdout": p.stdout, "stderr": p.stderr}


def hidden_python(candidate: Path, cases: dict) -> dict:
    sys.path.insert(0, str(candidate / "python"))
    from store import Store  # type: ignore

    results: dict[str, object] = {}
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "stress.db"
        request_id = cases["request_ids"][0]
        workers = int(cases["concurrency_workers"])

        def claim(i: int) -> dict:
            s = Store(db)
            try:
                try:
                    return {"ok": True, "value": s.claim(request_id, f"worker-{i}", "alpha")}
                except Exception as exc:  # Candidate failures are evidence, not evaluator failures.
                    return {"ok": False, "error_class": type(exc).__name__, "error_message": str(exc)}
            finally:
                s.close()

        with ThreadPoolExecutor(max_workers=workers) as ex:
            claim_results = list(ex.map(claim, range(workers)))
        successful_claims = [item["value"] for item in claim_results if item["ok"]]
        claim_errors = [
            {"error_class": item["error_class"], "error_message": item["error_message"]}
            for item in claim_results
            if not item["ok"]
        ]
        acquired = [bool(item[1]) for item in successful_claims]
        results["concurrency_calls_returned"] = len(claim_errors) == 0
        results["single_owner_reported"] = len(claim_errors) == 0 and sum(acquired) == 1
        results["concurrency_errors"] = claim_errors

        con = sqlite3.connect(db)
        try:
            row = con.execute("SELECT COUNT(*), MIN(generation), MAX(generation) FROM claims WHERE request_id=?", (request_id,)).fetchone()
            results["single_durable_effect"] = row[0] == 1
            results["generation_consistent"] = row[1] == row[2]
        finally:
            con.close()

        s = Store(db)
        try:
            try:
                claim_obj, _ = s.claim(cases["request_ids"][1], "owner-new", "payload")
                stale_ok = s.complete(claim_obj.request_id, "stale-owner", max(0, claim_obj.generation - int(cases["stale_generation_delta"])))
                results["stale_writer_rejected"] = stale_ok is False
                correct_ok = s.complete(claim_obj.request_id, claim_obj.owner, claim_obj.generation)
                results["current_writer_can_complete"] = correct_ok is True
            except Exception as exc:
                results["stale_writer_rejected"] = False
                results["current_writer_can_complete"] = False
                results["recovery_error"] = {"error_class": type(exc).__name__, "error_message": str(exc)}
        finally:
            s.close()

    boolean_results = [value for value in results.values() if isinstance(value, bool)]
    results["passed"] = sum(1 for value in boolean_results if value)
    results["failed"] = sum(1 for value in boolean_results if not value)
    return results


def hidden_javascript(candidate: Path) -> dict:
    js = """
import { validateRequest } from './javascript/validate.js';
const cases = [
  null,
  {},
  {requestId:null, owner:'x', payload:'p'},
  {requestId:'r', owner:null, payload:'p'},
  {requestId:'r', owner:'o', payload:{danger:true}},
  {requestId:'r', owner:'o', payload:'ok'}
];
let failed = 0;
for (let i=0; i<cases.length; i++) {
  const r = validateRequest(cases[i]);
  const shouldPass = i === cases.length - 1;
  if (Boolean(r?.ok) !== shouldPass) failed++;
}
console.log(JSON.stringify({passed: cases.length-failed, failed}));
process.exit(failed ? 1 : 0);
"""
    script = candidate / ".hidden-validate.mjs"
    script.write_text(js, encoding="utf-8")
    try:
        res = run(["node", script.name], candidate)
        try:
            parsed = json.loads(res["stdout"].strip().splitlines()[-1])
        except Exception:
            parsed = {"passed": 0, "failed": 1}
        parsed["returncode"] = res["returncode"]
        return parsed
    finally:
        script.unlink(missing_ok=True)


def hidden_java(candidate: Path, cases: dict) -> dict:
    source = candidate / "java" / "src" / "main" / "java" / "benchmark" / "RequestKey.java"
    if not source.exists():
        return {"passed": 0, "failed": 1, "reason": "RequestKey.java missing"}
    harness_dir = candidate / ".hidden-java"
    harness_dir.mkdir(exist_ok=True)
    harness = harness_dir / "HiddenRequestKey.java"
    rid = cases["request_ids"][2]
    payload = cases["boundary_payloads"][0]
    harness.write_text(f'''import benchmark.RequestKey;\npublic class HiddenRequestKey {{\n  public static void main(String[] args) {{\n    String a = RequestKey.canonical("{rid}", "{payload}");\n    String b = RequestKey.canonical("{rid}", "alpha");\n    if (!a.equals(b)) throw new AssertionError("canonical whitespace mismatch");\n    String h = RequestKey.sha256(a);\n    if (!h.matches("[0-9a-f]{{64}}")) throw new AssertionError("bad sha256");\n  }}\n}}\n''', encoding="utf-8")
    try:
        out = harness_dir / "classes"
        out.mkdir(exist_ok=True)
        c1 = run(["javac", "-d", str(out), str(source), str(harness)], candidate)
        if c1["returncode"] != 0:
            return {"passed": 0, "failed": 1, "compile": c1}
        c2 = run(["java", "-cp", str(out), "HiddenRequestKey"], candidate)
        return {"passed": 1 if c2["returncode"] == 0 else 0, "failed": 0 if c2["returncode"] == 0 else 1, "run": c2}
    finally:
        import shutil
        shutil.rmtree(harness_dir, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--hidden", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    candidate = Path(args.candidate).resolve()
    hidden = Path(args.hidden).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    cases = json.loads((hidden / "cases.json").read_text(encoding="utf-8"))

    visible = run([sys.executable, "-m", "unittest", "discover", "-s", "tests-visible", "-p", "test_*.py"], candidate)
    py_hidden = hidden_python(candidate, cases)
    js_hidden = hidden_javascript(candidate)
    java_hidden = hidden_java(candidate, cases)

    evidence = {
        "operation_id": "A01-CODE-QUAL-001",
        "visible_tests": {
            "passed": 1 if visible["returncode"] == 0 else 0,
            "failed": 0 if visible["returncode"] == 0 else 1,
            "raw": visible,
        },
        "hidden_tests": {
            "passed": int(py_hidden.get("passed", 0)) + int(js_hidden.get("passed", 0)) + int(java_hidden.get("passed", 0)),
            "failed": int(py_hidden.get("failed", 0)) + int(js_hidden.get("failed", 0)) + int(java_hidden.get("failed", 0)),
            "python": py_hidden,
            "javascript": js_hidden,
            "java": java_hidden,
        },
    }
    evidence_path = out / "functional-evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"functional_evidence_sha256": sha256(evidence_path), "hidden_failed": evidence["hidden_tests"]["failed"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())