#!/usr/bin/env python3
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
COMPILER = SCRIPT_DIR / "compile-repair005-gate-d-student.py"


def write_jsonl(path: Path, rows):
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def taxonomy_fixture():
    return {
        "task_modes": {
            "CLASSIFY": {
                "specialists": {
                    "SP_A": ["TOKEN_A", "TOKEN_B"],
                    "SP_B": ["TOKEN_C", "TOKEN_D"],
                }
            }
        }
    }


def base_fixture(count=612):
    tokens = [
        ("SP_A", "TOKEN_A"),
        ("SP_A", "TOKEN_B"),
        ("SP_B", "TOKEN_C"),
        ("SP_B", "TOKEN_D"),
    ]
    rows = []
    for i in range(count):
        specialist, token = tokens[i % len(tokens)]
        rows.append(
            {
                "record_id": f"BASE-{i:04d}",
                "task_mode": "CLASSIFY",
                "specialist_id": specialist,
                "correct_token": token,
                "hidden_holdout_gold_used": False,
            }
        )
    return rows


def teacher_fixture(count=440):
    tokens = [
        ("SP_A", "TOKEN_A"),
        ("SP_A", "TOKEN_B"),
        ("SP_B", "TOKEN_C"),
        ("SP_B", "TOKEN_D"),
    ]
    rows = []
    for i in range(count):
        specialist, token = tokens[i % len(tokens)]
        rows.append(
            {
                "teacher_record_id": f"T-{i:04d}",
                "task_mode": "CLASSIFY",
                "specialist_id": specialist,
                "target_token": token,
                "source_lane": "TEACHER_SYNTHETIC",
                "rights_class": "SYNTHETIC_ORIGINAL",
                "hidden_holdout_gold_used": False,
                "visible_regression_gold_used": False,
                "input_text": (
                    f"Synthetic evidence scene {i} with neutral facts only. "
                    f"REFERENCE_LABELS: SCENE_{i}, FACT_{i}."
                ),
                "semantic_fingerprint": (
                    f"Distinctive semantic boundary fingerprint for synthetic case {i}."
                ),
                "counterfactual_neighbor": (
                    f"Counterfactual neighbor changes the decisive synthetic fact for case {i}."
                ),
            }
        )
    return rows


def run_compiler(root: Path, base, teacher):
    taxonomy_path = root / "taxonomy.json"
    base_path = root / "base.jsonl"
    teacher_path = root / "teacher.jsonl"
    output_path = root / "student.jsonl"
    manifest_path = root / "manifest.json"

    taxonomy_path.write_text(
        json.dumps(taxonomy_fixture(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    write_jsonl(base_path, base)
    write_jsonl(teacher_path, teacher)

    proc = subprocess.run(
        [
            sys.executable,
            str(COMPILER),
            "--base-training",
            str(base_path),
            "--teacher",
            str(teacher_path),
            "--taxonomy",
            str(taxonomy_path),
            "--output",
            str(output_path),
            "--manifest",
            str(manifest_path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    return proc, output_path, manifest_path


def expect_failure(name, base, teacher, needle):
    with tempfile.TemporaryDirectory(prefix=f"book-eval-{name}-") as tmp:
        proc, _, _ = run_compiler(Path(tmp), base, teacher)
        if proc.returncode == 0:
            raise AssertionError(f"{name}: compiler unexpectedly succeeded")
        combined = (proc.stdout + "\n" + proc.stderr).lower()
        if needle.lower() not in combined:
            raise AssertionError(
                f"{name}: expected error containing {needle!r}; got: {combined[-1200:]}"
            )
    print(f"PASS {name}")


def test_exact_1052_and_determinism():
    base = base_fixture()
    teacher = teacher_fixture()
    with tempfile.TemporaryDirectory(prefix="book-eval-success-a-") as tmp_a, tempfile.TemporaryDirectory(
        prefix="book-eval-success-b-"
    ) as tmp_b:
        proc_a, output_a, manifest_a = run_compiler(Path(tmp_a), base, teacher)
        proc_b, output_b, manifest_b = run_compiler(Path(tmp_b), base, teacher)
        if proc_a.returncode != 0:
            raise AssertionError(proc_a.stdout + "\n" + proc_a.stderr)
        if proc_b.returncode != 0:
            raise AssertionError(proc_b.stdout + "\n" + proc_b.stderr)

        m = json.loads(manifest_a.read_text(encoding="utf-8"))
        assert m["base_records"] == 612
        assert m["teacher_records"] == 440
        assert m["combined_records"] == 1052
        assert m["missing_specialists"] == []
        assert m["ontology_token_leaks"] == 0
        assert m["hidden_holdout_gold_used"] is False
        assert m["visible_regression_gold_used_by_teacher"] is False

        rows = [
            json.loads(line)
            for line in output_a.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        assert len(rows) == 1052
        assert sum(str(row.get("record_id", "")).startswith("GATED-") for row in rows) == 440
        assert sha256(output_a) == sha256(output_b)
        assert m["combined_training_sha256"] == sha256(output_a)
        m2 = json.loads(manifest_b.read_text(encoding="utf-8"))
        assert m2["combined_training_sha256"] == m["combined_training_sha256"]
    print("PASS exact_1052_and_determinism")


def main():
    if not COMPILER.exists():
        raise SystemExit(f"compiler missing: {COMPILER}")

    test_exact_1052_and_determinism()

    base = base_fixture()
    teacher = teacher_fixture()

    mutated = copy.deepcopy(teacher)
    mutated[0]["visible_regression_gold_used"] = True
    expect_failure("visible_gold_flag_rejected", base, mutated, "teacher gold-use flag violation")

    mutated = copy.deepcopy(teacher)
    mutated[0]["hidden_holdout_gold_used"] = True
    expect_failure("hidden_gold_flag_rejected", base, mutated, "teacher gold-use flag violation")

    mutated = copy.deepcopy(base)
    mutated[0]["hidden_holdout_gold_used"] = True
    expect_failure("base_hidden_gold_flag_rejected", mutated, teacher, "base corpus hidden-holdout flag violation")

    mutated = copy.deepcopy(teacher)
    mutated[0]["input_text"] += " TOKEN_A"
    expect_failure("ontology_token_leak_rejected", base, mutated, "ontology token leak")

    mutated = copy.deepcopy(teacher)
    mutated[0]["specialist_id"] = "SP_B"
    expect_failure("teacher_taxonomy_mismatch_rejected", base, mutated, "teacher taxonomy binding mismatch")

    mutated = copy.deepcopy(teacher)
    mutated[1]["teacher_record_id"] = mutated[0]["teacher_record_id"]
    expect_failure("duplicate_teacher_id_rejected", base, mutated, "duplicate compiled record")

    mutated = copy.deepcopy(teacher)
    mutated[0]["rights_class"] = "UNKNOWN"
    expect_failure("teacher_rights_rejected", base, mutated, "teacher source/rights violation")

    mutated = copy.deepcopy(teacher)
    mutated[0]["semantic_fingerprint"] = "too short"
    expect_failure("weak_semantic_annotation_rejected", base, mutated, "weak teacher semantic annotation")

    print("ALL STUDENT INGEST PREQUAL TESTS PASS")


if __name__ == "__main__":
    main()
