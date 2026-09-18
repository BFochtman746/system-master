#!/usr/bin/env python3
"""
Document truth gate — fails CI when SYSTEM-MAP.md or CURRENT-STATE.md asserts a file the
tree does not contain.

WHY THIS EXISTS.
The recovery's most expensive defects were not broken code. They were documents asserting
capability the tree did not have, which the next session then planned against:

  * the bootstrap inventory in SYSTEM-MAP.md was wrong in every particular -- written in
    without checking the tree -- and cost a whole pass to re-derive (PR #238);
  * PR #239's body claimed SYSTEM-MAP.md and CURRENT-STATE.md recorded the poller's honest
    scope; the diff contained only two Java files, so PR #240 existed purely to correct it.

Both were detectable mechanically at the moment of the claim. Nothing detected them, because
no gate reads the prose. This does.

WHAT IT CHECKS.
Every backticked token in those documents that is unambiguously a repo file path -- contains
a code suffix, no glob, no ellipsis, not build output -- must resolve in the tree. That
narrowness is deliberate: `control-gateway/**` is a path filter, `SYSTEM_MASTER/CORE` is a
subsystem, `controller-v2/foundation-002b` is a branch. None are files, and an earlier
version of this logic miscounted all of them, reporting 46 violations where there was 1.

WHAT IT DELIBERATELY ALLOWS.
A line that describes something ABSENT is the most valuable kind of line in these documents:
abandoned architectures, sole-custodian branches, work known to be missing. Naming a file
that is off main is honest, not false. So a line carrying an absence marker ("off main",
"sole custodian", "abandoned", "never landed", ...) exempts its paths. Absence has to be
sayable, or the gate would pressure the documents into silence -- which is the disease.

WHY IT SELF-TESTS ON EVERY RUN.
The first version of this audit skipped directories with `".git" in dirpath`, which also
skipped `.github/`. Every workflow and qualifier path reported missing, and the gate-set
comparison counted zero files -- a check passing because it inspected nothing. That is the
same class of defect as the reporter that parsed only TAP and fail-closed to `pass=0
fail=-1`. So this script runs its own negative proofs before every real check, and a
self-test failure is a hard failure: the gate cannot report clean unless it has just
demonstrated that it can still detect a planted lie, and that it can still see `.github/`.
"""

import os
import re
import shutil
import sys
import tempfile

CONTRACT_ID = "SYSTEM-MASTER-DOCUMENT-TRUTH-001"

DOCS = ("SYSTEM-MAP.md", "CURRENT-STATE.md")

BACKTICKED = re.compile(r"`([^`\n]+)`")

SUFFIX = (".java", ".js", ".mjs", ".py", ".yml", ".yaml", ".sh", ".md", ".json")

ABSENCE_MARKERS = (
    "off main", "off-main", "sole custodian", "sole-custodian", "abandoned",
    "deleted from", "does not exist", "absent", "branch-only", "not on main",
    "never landed", "was lost", "no longer", "removed", "not in the tree",
    "build output", "scratch worktree", "would be", "does not contain",
)


def is_file_path(token):
    """High-confidence repo file path only."""
    if not token or " " in token:
        return False
    if token.startswith(("$", "-", "http", "#")):
        return False
    if "*" in token or "?" in token or "..." in token:
        return False
    if token.startswith("target/") or "/target/" in token:
        return False
    return token.endswith(SUFFIX)


def walk(root):
    """Walk the tree, skipping only the real .git directory.

    Exact component match, never a substring test -- `".git" in dirpath` silently
    excludes `.github/`, which is where the workflows and every qualifier live.
    """
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
        yield dirpath, dirnames, filenames


def resolve(root, token):
    cleaned = token.rstrip("*").rstrip("/")
    if not cleaned:
        return True
    if os.path.exists(os.path.join(root, cleaned)):
        return True
    base = os.path.basename(cleaned)
    # A doc may quote a relative import exactly as the source writes it; that is a real
    # claim about a real file, just not root-relative.
    if base != cleaned and not cleaned.startswith(".."):
        return False
    for _dirpath, dirnames, filenames in walk(root):
        if base in filenames or base in dirnames:
            return True
    return False


def audit(root, docs=DOCS):
    """Returns (checked, violations, exempted). A violation is (doc, line, token)."""
    checked = 0
    violations = []
    exempted = []
    for doc in docs:
        path = os.path.join(root, doc)
        if not os.path.exists(path):
            violations.append((doc, 0, "<document missing>"))
            continue
        with open(path, encoding="utf-8", errors="replace") as handle:
            for lineno, line in enumerate(handle, 1):
                lowered = line.lower()
                absent_ok = any(marker in lowered for marker in ABSENCE_MARKERS)
                for token in BACKTICKED.findall(line):
                    if not is_file_path(token):
                        continue
                    checked += 1
                    if resolve(root, token):
                        continue
                    if absent_ok:
                        exempted.append((doc, lineno, token))
                    else:
                        violations.append((doc, lineno, token))
    return checked, violations, exempted


# --------------------------------------------------------------------------- self proofs

def _fixture(tmp, body, name="SYSTEM-MAP.md"):
    os.makedirs(os.path.join(tmp, ".github", "workflows"), exist_ok=True)
    with open(os.path.join(tmp, ".github", "workflows", "claim-work.yml"), "w") as fh:
        fh.write("name: Claim Work\n")
    with open(os.path.join(tmp, "real-module.java"), "w") as fh:
        fh.write("// present\n")
    with open(os.path.join(tmp, name), "w", encoding="utf-8") as fh:
        fh.write(body)
    with open(os.path.join(tmp, "CURRENT-STATE.md"), "a", encoding="utf-8") as fh:
        fh.write("")
    return tmp


def self_test():
    """Negative proofs. Each asserts the gate still detects what it claims to detect."""
    results = []

    def check(label, condition):
        results.append((label, bool(condition)))

    tmp = tempfile.mkdtemp(prefix="doctruth-")
    try:
        # 1. A planted lie must be caught.
        root = _fixture(tmp, "The entry point is `totally-invented-module.java`.\n")
        _checked, violations, _ = audit(root)
        check("planted false assertion is detected",
              any(v[2] == "totally-invented-module.java" for v in violations))

        # 2. A real file must not be flagged.
        root = _fixture(tmp, "The entry point is `real-module.java`.\n")
        _checked, violations, _ = audit(root)
        check("present file is not flagged", not violations)

        # 3. The .github bug must stay fixed -- this is the one that made the gate vacuous.
        #    Asserted as a BARE filename on purpose: a full path is answered by
        #    os.path.exists and never exercises the walk, so a full-path fixture would
        #    pass even with the substring skip restored and prove nothing.
        root = _fixture(tmp, "Dispatch runs `claim-work.yml` on cron.\n")
        checked, violations, _ = audit(root)
        check("paths under .github are visible (substring-skip bug stays fixed)",
              checked >= 1 and not violations)

        # 4. Documented absence must be allowed, or the gate pressures docs into silence.
        root = _fixture(
            tmp,
            "The `controller-v2-thing.js` pair is off main and abandoned.\n")
        _checked, violations, exempted = audit(root)
        check("documented absence is exempt, not a violation",
              not violations and len(exempted) == 1)

        # 5. Non-file tokens must be ignored, not miscounted as claims.
        root = _fixture(
            tmp,
            "Filters `control-gateway/**` and subsystem `SYSTEM_MASTER/CORE` "
            "and glob `.github/scripts/*qualify*`.\n")
        checked, violations, _ = audit(root)
        check("globs, filters and subsystem ids are not treated as file paths",
              checked == 0 and not violations)

        # 6. A missing document is itself a violation, never a silent pass.
        empty = tempfile.mkdtemp(prefix="doctruth-empty-")
        try:
            _checked, violations, _ = audit(empty)
            check("missing documents fail closed", len(violations) >= 2)
        finally:
            shutil.rmtree(empty, ignore_errors=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [label for label, passed in results if not passed]
    for label, passed in results:
        print(("  self-proof PASS  " if passed else "  self-proof FAIL  ") + label)
    return failed


def main(argv):
    root = "."
    if "--root" in argv:
        root = argv[argv.index("--root") + 1]

    print(f"{CONTRACT_ID}  root={root}")

    failed = self_test()
    if failed:
        print(f"FAIL {CONTRACT_ID} self_proofs_failed={len(failed)}")
        for label in failed:
            print(f"  BROKEN GATE: {label}")
        return 2

    checked, violations, exempted = audit(root)
    print(f"  path assertions checked: {checked}")
    print(f"  documented-absent (allowed): {len(exempted)}")
    print(f"  contradicted by the tree: {len(violations)}")

    if violations:
        print(f"FAIL {CONTRACT_ID} violations={len(violations)}")
        for doc, lineno, token in violations:
            print(f"  {doc}:{lineno} asserts `{token}` which is not in the tree")
        print("  Either land the file, or say plainly that it is absent "
              "(an absence marker on the line exempts it).")
        return 2

    print(f"PASS {CONTRACT_ID} checked={checked} exempt={len(exempted)} violations=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
