#!/usr/bin/env python3
"""Exact runnable qualifier for the bounded RESEARCH_KNOWLEDGE source-query provider."""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TEST = ROOT / "tools" / "tests" / "test_research_knowledge_source_query.py"
MIN_TESTS = 12


def main() -> int:
    run = subprocess.run(
        [sys.executable, str(TEST)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    output = run.stdout or ""
    sys.stdout.write(output)
    if run.returncode != 0:
        print("RESEARCH_KNOWLEDGE_SOURCE_QUERY=FAIL reason=TEST_FAILURE")
        return 1

    match = re.search(r"Ran\s+(\d+)\s+tests?\s+in", output)
    if not match:
        print("RESEARCH_KNOWLEDGE_SOURCE_QUERY=FAIL reason=TEST_COUNT_NOT_OBSERVED")
        return 1
    count = int(match.group(1))
    if count < MIN_TESTS:
        print(
            "RESEARCH_KNOWLEDGE_SOURCE_QUERY=FAIL "
            f"reason=UNDER_DISCOVERY discovered={count} required={MIN_TESTS}"
        )
        return 1

    print(
        "RESEARCH_KNOWLEDGE_SOURCE_QUERY=PASS "
        f"tests={count} operation=RESEARCH_KNOWLEDGE.RESEARCH.QUERY.SEARCH_SOURCES_WITH_PROVENANCE"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
