#!/usr/bin/env python3
"""Run immutable unittest scopes in bounded parallel subprocesses.

This helper changes scheduling only. It preserves the requested module/test
coverage, captures each subprocess result independently, and fails closed on
any non-zero child, missing unittest count, or aggregate-count mismatch.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import os
from pathlib import Path
import re
import subprocess
import sys
import time


_RAN_RE = re.compile(r"Ran (\d+) tests?")
_OK_RE = re.compile(r"(?:^|\n)OK(?:\s|$)")


def _safe_label(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-") or "run"


def _discover_modules(lab_dir: Path, pattern: str) -> list[str]:
    tests_dir = lab_dir / "tests"
    if not tests_dir.is_dir():
        raise RuntimeError(f"TEST_DIRECTORY_MISSING:{tests_dir}")
    modules = [
        f"tests.{path.stem}"
        for path in sorted(tests_dir.glob(pattern))
        if path.is_file() and path.stem != "__init__"
    ]
    if not modules:
        raise RuntimeError(f"NO_TEST_MODULES_DISCOVERED:{pattern}")
    return modules


def _run_one(lab_dir: Path, label: str, modules: list[str], seed: str) -> dict[str, object]:
    env = os.environ.copy()
    env["PYTHONHASHSEED"] = seed
    started = time.monotonic()
    completed = subprocess.run(
        [sys.executable, "-m", "unittest", "-v", *modules],
        cwd=lab_dir,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    elapsed_ms = max(0, int((time.monotonic() - started) * 1000))
    combined = f"{completed.stdout or ''}\n{completed.stderr or ''}"
    matches = _RAN_RE.findall(combined)
    count = int(matches[-1]) if matches else None
    ok_marker = bool(_OK_RE.search(combined))
    return {
        "label": label,
        "seed": seed,
        "modules": modules,
        "returncode": completed.returncode,
        "stdout": completed.stdout or "",
        "stderr": completed.stderr or "",
        "elapsed_ms": elapsed_ms,
        "count": count,
        "ok_marker": ok_marker,
    }


def _write_evidence(evidence_dir: Path | None, prefix: str, result: dict[str, object]) -> None:
    if evidence_dir is None:
        return
    evidence_dir.mkdir(parents=True, exist_ok=True)
    label = _safe_label(str(result["label"]))
    stem = f"{_safe_label(prefix)}-{label}" if prefix else label
    (evidence_dir / f"{stem}.stdout.txt").write_text(str(result["stdout"]), encoding="utf-8")
    (evidence_dir / f"{stem}.stderr.txt").write_text(str(result["stderr"]), encoding="utf-8")
    (evidence_dir / f"{stem}.timing-ms.txt").write_text(f"{result['elapsed_ms']}\n", encoding="utf-8")
    (evidence_dir / f"{stem}.count.txt").write_text(f"{result['count']}\n", encoding="utf-8")


def _emit_result(result: dict[str, object]) -> None:
    print(
        f"=== PARALLEL UNITTEST RESULT label={result['label']} seed={result['seed']} "
        f"count={result['count']} elapsed_ms={result['elapsed_ms']} returncode={result['returncode']} ==="
    )
    stdout = str(result["stdout"])
    stderr = str(result["stderr"])
    if stdout:
        print(stdout, end="" if stdout.endswith("\n") else "\n")
    if stderr:
        print(stderr, file=sys.stderr, end="" if stderr.endswith("\n") else "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lab-dir", required=True)
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--pattern", default="test_*.py")
    parser.add_argument("--module", action="append", default=[])
    parser.add_argument("--seed", action="append", default=[])
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--expected-total", type=int, required=True)
    parser.add_argument("--expected-per-run", type=int)
    parser.add_argument("--evidence-dir")
    parser.add_argument("--evidence-prefix", default="parallel")
    args = parser.parse_args()

    lab_dir = Path(args.lab_dir).resolve()
    if not lab_dir.is_dir():
        raise RuntimeError(f"LAB_DIRECTORY_MISSING:{lab_dir}")
    if args.workers < 1 or args.workers > 8:
        raise RuntimeError(f"INVALID_WORKER_COUNT:{args.workers}")
    seeds = args.seed or ["0"]

    if args.discover and args.module:
        raise RuntimeError("DISCOVER_AND_EXPLICIT_MODULES_ARE_MUTUALLY_EXCLUSIVE")
    if not args.discover and not args.module:
        raise RuntimeError("TEST_SCOPE_REQUIRED")

    tasks: list[tuple[str, list[str], str]] = []
    if args.discover:
        modules = _discover_modules(lab_dir, args.pattern)
        if len(seeds) != 1:
            raise RuntimeError("DISCOVERY_MODE_REQUIRES_EXACTLY_ONE_SEED")
        seed = seeds[0]
        tasks = [(module, [module], seed) for module in modules]
    else:
        modules = list(args.module)
        tasks = [(f"seed-{seed}", modules, seed) for seed in seeds]

    evidence_dir = Path(args.evidence_dir).resolve() if args.evidence_dir else None
    started = time.monotonic()
    results: list[dict[str, object]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(args.workers, len(tasks))) as pool:
        future_map = {
            pool.submit(_run_one, lab_dir, label, module_group, seed): (label, seed)
            for label, module_group, seed in tasks
        }
        for future in concurrent.futures.as_completed(future_map):
            results.append(future.result())

    results.sort(key=lambda item: str(item["label"]))
    failures: list[str] = []
    total = 0
    for result in results:
        _write_evidence(evidence_dir, args.evidence_prefix, result)
        _emit_result(result)
        count = result["count"]
        if result["returncode"] != 0:
            failures.append(f"CHILD_FAILED:{result['label']}:{result['returncode']}")
        if count is None:
            failures.append(f"TEST_COUNT_NOT_OBSERVED:{result['label']}")
        else:
            total += int(count)
            if args.expected_per_run is not None and int(count) != args.expected_per_run:
                failures.append(
                    f"PER_RUN_COUNT_MISMATCH:{result['label']}:expected={args.expected_per_run}:actual={count}"
                )
        if not result["ok_marker"]:
            failures.append(f"OK_MARKER_NOT_OBSERVED:{result['label']}")

    elapsed = time.monotonic() - started
    if total != args.expected_total:
        failures.append(f"TOTAL_TEST_COUNT_MISMATCH:expected={args.expected_total}:actual={total}")

    summary = f"Ran {total} tests in {elapsed:.3f}s"
    print(summary)
    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        print(summary, file=sys.stderr)
        print("FAILED", file=sys.stderr)
        return 1

    print("OK")
    # The parent qualifier historically concatenates stdout + stderr before
    # parsing the terminal unittest count. Emit the aggregate again at the
    # terminal end of stderr so per-module unittest summaries cannot shadow it.
    print(summary, file=sys.stderr)
    print("OK", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"PARALLEL_UNITTEST_RUNNER_ERROR:{exc}", file=sys.stderr)
        raise
