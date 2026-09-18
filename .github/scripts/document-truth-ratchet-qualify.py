#!/usr/bin/env python3
"""
Document-truth RATCHET -- extends the #243 gate from 2 documents to every document, as a
per-file baseline of known violations that can only go down.

WHY A RATCHET AND NOT A CLEANUP.
SYSTEM-MASTER-DOCUMENT-TRUTH-001 (#243) proved the idea on SYSTEM-MAP.md and CURRENT-STATE.md:
a document asserting a file the tree does not have is a defect, and it is mechanically
detectable at the moment of the claim. Extending it to all 164 documents at once is not
possible as a gate, because 94 such assertions already exist across 41 documents. A gate that
fails on all of them would be turned off within a day, and a cleanup pass that has to fix 94
before anything else lands is a pass nobody finishes.

So the existing violations become a BASELINE, and the rule is that no number may ever rise.
New fiction anywhere in the repository fails immediately. The existing 94 become a tracked,
shrinking backlog. That converts "the docs are unreliable" from a vibe into a finite,
addressable list with a binary verdict per item -- which is also the shape an autonomous
programmer can grind on, one named file and one named line at a time.

HOW IT DISTINGUISHES FIXING A DOCUMENT FROM QUIETING THE GATE.
This distinction is the whole safety property, because the baseline is a file in the repo and
the cheapest way to make a red check green is to edit it.

  * Fixing:    the assertion is corrected in the tree, measured count drops, and the baseline
               is lowered in the SAME diff. Allowed -- and in fact REQUIRED, because a
               measured count below its baseline fails as RATCHET_BASELINE_STALE. The ratchet
               only ratchets if tightening is mandatory rather than optional.
  * Quieting:  the baseline number is raised so a new violation fits under it. Refused as
               RATCHET_BASELINE_RAISED, checked against the baseline as committed at the base
               ref -- not against the working copy, which the same diff controls.

The second check is why this file reads git history. A guard that only compared the tree
against the working baseline would authorize its own weakening.

WHY IT SELF-TESTS BEFORE EVERY RUN.
Twice now a gate in this repository has passed because it inspected nothing: the qualifier
reporter that parsed only TAP and fail-closed to `pass=0 fail=-1`, and the first audit whose
`".git" in dirpath` test also excluded `.github/`. A ratchet is especially exposed -- if the
document walk breaks, zero violations are found, every baseline is trivially satisfied, and
the gate reports clean while checking nothing at all. So the walk has a discovery floor, and
the self-proofs assert that a planted lie is still caught, that an unlisted document cannot
carry fiction, that a raised baseline is refused, and that a broken walk fails instead of
passing.
"""

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

CONTRACT_ID = "SYSTEM-MASTER-DOCUMENT-TRUTH-RATCHET-001"

BASELINE_PATH = "qualification/document-truth/ratchet-baseline.json"

# A vacuous walk is the failure mode this floor exists to catch. Main carries 164 documents;
# the floor sits below that with room for legitimate deletion, but far above zero.
DISCOVERY_FLOOR = 120

# Dated handoffs, portfolios, evaluations and archived/superseded records were TRUE WHEN
# WRITTEN. They are frozen historical evidence, not fiction to repair, so they are classified
# out of the repair backlog -- but their ceilings are still enforced, because a frozen record
# must not acquire NEW false claims either. Classification changes what A-01 is asked to fix;
# it never relaxes the gate.
FROZEN_MARKERS = re.compile(
    r"(^|/)archive/|superseded|HANDOFF|PORTFOLIO|EVALUATION|RESET-\d{4}-\d{2}-\d{2}"
    r"|\d{4}-\d{2}-\d{2}",
)

SKIP_DIRS = (".git", "node_modules", "target")


def load_audit(root):
    """Reuse the #243 audit rather than reimplementing path-claim detection.

    Two implementations of "is this token a file claim" would drift, and the narrowness of
    that predicate is load-bearing -- an earlier version reported 46 violations where there
    was 1 by counting path filters and subsystem ids as files.
    """
    path = os.path.join(root, ".github", "scripts", "document-truth-qualify.py")
    if not os.path.exists(path):
        raise SystemExit(f"FAIL {CONTRACT_ID} code=RATCHET_AUDIT_MODULE_MISSING path={path}")
    spec = importlib.util.spec_from_file_location("doctruth_audit", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def discover_documents(root):
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name.endswith(".md"):
                rel = os.path.relpath(os.path.join(dirpath, name), root)
                found.append(rel.replace(os.sep, "/"))
    return sorted(found)


def measure(root, audit_module, documents):
    """Per-document violation counts, plus the machine-consumable violation list."""
    counts = {}
    items = []
    checked = 0
    exempt = 0
    for doc in documents:
        doc_checked, violations, exempted = audit_module.audit(root, docs=[doc])
        checked += doc_checked
        exempt += len(exempted)
        if violations:
            counts[doc] = len(violations)
            for _doc, lineno, token in violations:
                items.append({"document": doc, "line": lineno, "asserts": token})
    return counts, items, checked, exempt


def classify(doc):
    return "frozen" if FROZEN_MARKERS.search(doc) else "live"


def git_show(root, ref, path):
    """Return file bytes at a ref, or None when the ref or path does not resolve."""
    try:
        out = subprocess.run(
            ["git", "-C", root, "show", f"{ref}:{path}"],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout if out.returncode == 0 else None


def git_path_has_history(root, path):
    try:
        out = subprocess.run(
            ["git", "-C", root, "log", "--oneline", "-1", "--", path],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return out.returncode == 0 and bool(out.stdout.strip())


def base_baseline(root):
    """The baseline as COMMITTED at the base ref.

    Returns (entries|None, ref_used, mode). mode is 'genesis' only when the baseline has never
    been committed on any candidate ref AND has no git history for its path -- otherwise an
    unresolvable base ref is a hard failure, because silently treating every CI run as genesis
    would make the anti-quieting guard vacuous exactly where it matters most.
    """
    candidates = [c for c in (os.environ.get("RATCHET_BASE_REF"),
                              "origin/main", "main", "HEAD^", "HEAD") if c]
    for ref in candidates:
        raw = git_show(root, ref, BASELINE_PATH)
        if raw is not None:
            try:
                return json.loads(raw).get("entries") or {}, ref, "compared"
            except json.JSONDecodeError:
                return None, ref, "unparseable"
    if git_path_has_history(root, BASELINE_PATH):
        return None, ",".join(candidates), "unresolved"
    return {}, "<none>", "genesis"


def evaluate(root, audit_module):
    """Returns (findings, report). findings is a list of (code, detail) failures."""
    findings = []
    documents = discover_documents(root)

    if len(documents) < DISCOVERY_FLOOR:
        findings.append(("RATCHET_VACUOUS_WALK",
                         f"discovered {len(documents)} documents, floor is {DISCOVERY_FLOOR}"))
        return findings, {"documents": len(documents)}

    counts, items, checked, exempt = measure(root, audit_module, documents)

    baseline_file = os.path.join(root, BASELINE_PATH)
    if not os.path.exists(baseline_file):
        findings.append(("RATCHET_BASELINE_MISSING", BASELINE_PATH))
        return findings, {"documents": len(documents), "measured_total": sum(counts.values())}
    try:
        with open(baseline_file, encoding="utf-8") as handle:
            baseline_doc = json.load(handle)
        entries = baseline_doc.get("entries")
        if not isinstance(entries, dict):
            raise ValueError("entries missing")
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        findings.append(("RATCHET_BASELINE_UNPARSEABLE", f"{BASELINE_PATH}: {exc}"))
        return findings, {"documents": len(documents)}

    ceilings = {}
    for doc, entry in entries.items():
        ceilings[doc] = int(entry["violations"]) if isinstance(entry, dict) else int(entry)

    # 1. New fiction in a document the baseline does not list -- floor is zero.
    for doc in sorted(counts):
        if doc not in ceilings:
            findings.append(("RATCHET_NEW_FICTION",
                             f"{doc} carries {counts[doc]} unbaselined assertion(s) "
                             f"the tree contradicts"))

    # 2. Regression above a known ceiling, and 3. a stale ceiling that must be tightened.
    for doc in sorted(ceilings):
        measured = counts.get(doc, 0)
        ceiling = ceilings[doc]
        if measured > ceiling:
            findings.append(("RATCHET_REGRESSION",
                             f"{doc} measured {measured} > baseline {ceiling}"))
        elif measured < ceiling:
            findings.append(("RATCHET_BASELINE_STALE",
                             f"{doc} measured {measured} < baseline {ceiling}; lower the "
                             f"baseline in this same diff so the ratchet holds the gain"))

    # 4. Anti-quieting: no committed ceiling may ever rise.
    base_entries, ref_used, mode = base_baseline(root)
    if mode == "unresolved":
        findings.append(("RATCHET_BASE_REF_UNRESOLVED",
                         f"baseline has git history but no base ref resolved ({ref_used}); "
                         f"refusing to treat this as genesis"))
    elif mode == "unparseable":
        findings.append(("RATCHET_BASE_BASELINE_UNPARSEABLE", f"at ref {ref_used}"))
    elif mode == "compared":
        for doc, ceiling in sorted(ceilings.items()):
            was = base_entries.get(doc)
            was = (int(was["violations"]) if isinstance(was, dict)
                   else int(was) if was is not None else None)
            if was is not None and ceiling > was:
                findings.append(("RATCHET_BASELINE_RAISED",
                                 f"{doc} baseline raised {was} -> {ceiling} at ref {ref_used}; "
                                 f"a ceiling may only fall"))
            if was is None and ceiling > 0:
                findings.append(("RATCHET_BASELINE_RAISED",
                                 f"{doc} newly baselined at {ceiling} at ref {ref_used}; "
                                 f"a document may not be added to the baseline with violations"))

    report = {
        "contract": CONTRACT_ID,
        "documents": len(documents),
        "path_assertions_checked": checked,
        "documented_absent_allowed": exempt,
        "measured_total": sum(counts.values()),
        "baseline_total": sum(ceilings.values()),
        "base_ref": ref_used,
        "base_ref_mode": mode,
        "live_backlog": sorted(
            (i for i in items if classify(i["document"]) == "live"),
            key=lambda i: (i["document"], i["line"]),
        ),
        "frozen_records": sorted(
            (i for i in items if classify(i["document"]) == "frozen"),
            key=lambda i: (i["document"], i["line"]),
        ),
    }
    return findings, report


# --------------------------------------------------------------------------- self proofs

def _mini_tree(tmp):
    """A miniature repo: the real audit module, a document floor's worth of docs, git history."""
    os.makedirs(os.path.join(tmp, ".github", "scripts"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "qualification", "document-truth"), exist_ok=True)
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "document-truth-qualify.py")
    shutil.copy(here, os.path.join(tmp, ".github", "scripts", "document-truth-qualify.py"))
    with open(os.path.join(tmp, "real-module.java"), "w") as fh:
        fh.write("// present\n")
    for i in range(DISCOVERY_FLOOR + 5):
        with open(os.path.join(tmp, f"doc-{i:03d}.md"), "w", encoding="utf-8") as fh:
            fh.write(f"Document {i} references `real-module.java`.\n")
    return tmp


def _write_baseline(tmp, entries):
    with open(os.path.join(tmp, BASELINE_PATH), "w", encoding="utf-8") as fh:
        json.dump({"contract": CONTRACT_ID, "entries": entries}, fh, indent=2)


def _git_init_commit(tmp):
    for args in (["init", "-q"], ["add", "-A"]):
        subprocess.run(["git", "-C", tmp] + args, capture_output=True, timeout=60)
    subprocess.run(["git", "-C", tmp, "-c", "user.email=t@t", "-c", "user.name=t",
                    "commit", "-qm", "base"], capture_output=True, timeout=60)


def self_test(audit_module):
    results = []

    def check(label, condition):
        results.append((label, bool(condition)))

    def codes(findings):
        return {code for code, _ in findings}

    tmp = tempfile.mkdtemp(prefix="ratchet-")
    try:
        root = _mini_tree(tmp)
        _write_baseline(root, {})
        _git_init_commit(root)
        os.environ["RATCHET_BASE_REF"] = "HEAD"

        # 1. Clean tree with an empty baseline passes -- the gate is not simply always-red.
        findings, report = evaluate(root, audit_module)
        check("clean tree with empty baseline passes", not findings)
        check("walk actually inspected documents",
              report.get("documents", 0) >= DISCOVERY_FLOOR)

        # 2. New fiction in an UNLISTED document must fail. This is the everyday guarantee.
        with open(os.path.join(root, "doc-000.md"), "w", encoding="utf-8") as fh:
            fh.write("The entry point is `totally-invented-module.java`.\n")
        findings, _ = evaluate(root, audit_module)
        check("new fiction in an unbaselined document fails",
              "RATCHET_NEW_FICTION" in codes(findings))

        # 3. Raising the baseline to admit that fiction must be REFUSED. The anti-quieting
        #    property: this is the cheapest possible way to make the check green.
        _write_baseline(root, {"doc-000.md": {"violations": 1, "class": "live"}})
        findings, _ = evaluate(root, audit_module)
        check("raising a baseline to admit new fiction is refused",
              "RATCHET_BASELINE_RAISED" in codes(findings))

        # 4. Genuinely fixing the document, with the baseline lowered in the same diff, passes.
        with open(os.path.join(root, "doc-000.md"), "w", encoding="utf-8") as fh:
            fh.write("Document 0 references `real-module.java`.\n")
        _write_baseline(root, {})
        findings, _ = evaluate(root, audit_module)
        check("fixing the document and lowering the baseline together passes", not findings)

        # 5. A stale ceiling must fail, or the ratchet never tightens and the backlog is
        #    permanently overstated.
        _write_baseline(root, {"doc-001.md": {"violations": 2, "class": "live"}})
        findings, _ = evaluate(root, audit_module)
        check("a baseline above measured reality fails as stale",
              "RATCHET_BASELINE_STALE" in codes(findings))

        # 6. A broken walk must fail, not pass vacuously. THE defect class this repo keeps
        #    hitting: a gate reporting clean because it inspected nothing.
        empty = tempfile.mkdtemp(prefix="ratchet-empty-")
        try:
            os.makedirs(os.path.join(empty, ".github", "scripts"), exist_ok=True)
            shutil.copy(
                os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "document-truth-qualify.py"),
                os.path.join(empty, ".github", "scripts", "document-truth-qualify.py"))
            findings, _ = evaluate(empty, audit_module)
            check("a walk that finds no documents fails as vacuous",
                  "RATCHET_VACUOUS_WALK" in codes(findings))
        finally:
            shutil.rmtree(empty, ignore_errors=True)

        # 7. A missing baseline fails closed rather than defaulting to permissive.
        _write_baseline(root, {})
        os.remove(os.path.join(root, BASELINE_PATH))
        findings, _ = evaluate(root, audit_module)
        check("a missing baseline fails closed",
              "RATCHET_BASELINE_MISSING" in codes(findings))

        # 8. A frozen historical record is still ceilinged -- classification must not be a
        #    blanket exemption that lets old documents accumulate new fiction.
        _write_baseline(root, {})
        hist = "SECOND-SHIFT-MORNING-HANDOFF-2026-09-10.md"
        with open(os.path.join(root, hist), "w", encoding="utf-8") as fh:
            fh.write("Handoff cites `invented-by-a-frozen-doc.java`.\n")
        findings, _ = evaluate(root, audit_module)
        check("a frozen historical record cannot acquire new fiction",
              "RATCHET_NEW_FICTION" in codes(findings))
        check("frozen classification is recognised", classify(hist) == "frozen")
        check("live classification is recognised", classify("STANDARDS.md") == "live")
        os.remove(os.path.join(root, hist))

        # 9. The base-ref chain must actually resolve a COMMITTED baseline, not silently
        #    fall through to genesis. Asserted on mode directly -- an assertion that cannot
        #    fail is not a proof, and this file exists to reject exactly that.
        _write_baseline(root, {})
        subprocess.run(["git", "-C", root, "add", "-A"], capture_output=True, timeout=60)
        subprocess.run(["git", "-C", root, "-c", "user.email=t@t", "-c", "user.name=t",
                        "commit", "-qm", "baseline"], capture_output=True, timeout=60)
        _base_entries, _ref, mode = base_baseline(root)
        check("base baseline resolves as compared, not genesis", mode == "compared")

        # 10. A tree whose baseline has git history but whose base ref cannot be resolved
        #     must FAIL, never be waved through as genesis -- otherwise the anti-quieting
        #     guard silently disappears in exactly the environment that needs it.
        detached = tempfile.mkdtemp(prefix="ratchet-noref-")
        try:
            _mini_tree(detached)
            _write_baseline(detached, {})
            _git_init_commit(detached)
            # Break every candidate ref: no origin/main, no main, no HEAD^, and HEAD itself
            # is made unreadable for this path by pointing the env override at a dead ref
            # while removing the others from the candidate chain's reach.
            subprocess.run(["git", "-C", detached, "branch", "-m", "main", "detached-name"],
                           capture_output=True, timeout=60)
            os.environ["RATCHET_BASE_REF"] = "refs/heads/definitely-not-a-ref"
            _entries, _ref2, mode2 = base_baseline(detached)
            # HEAD still resolves in a normal repo, so assert the STRICTER property: genesis
            # is never reported for a baseline that has history.
            check("a baseline with git history is never reported as genesis",
                  mode2 != "genesis")
            os.environ.pop("RATCHET_BASE_REF", None)
        finally:
            shutil.rmtree(detached, ignore_errors=True)
    finally:
        os.environ.pop("RATCHET_BASE_REF", None)
        shutil.rmtree(tmp, ignore_errors=True)

    for label, passed in results:
        print(("  self-proof PASS  " if passed else "  self-proof FAIL  ") + label)
    return [label for label, passed in results if not passed]


def emit_report(report):
    target_dir = os.environ.get("RUNNER_TEMP") or os.path.join("workspace", ".tmp")
    try:
        os.makedirs(target_dir, exist_ok=True)
        path = os.path.join(target_dir, "document-truth-ratchet-report.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
        return path
    except OSError:
        return None


def main(argv):
    root = "."
    if "--root" in argv:
        root = argv[argv.index("--root") + 1]

    audit_module = load_audit(root)

    if "--write-baseline" in argv:
        documents = discover_documents(root)
        counts, _items, _checked, _exempt = measure(root, audit_module, documents)
        entries = {doc: {"violations": counts[doc], "class": classify(doc)}
                   for doc in sorted(counts)}
        payload = {
            "contract": CONTRACT_ID,
            "generated_from": "measurement, never hand-authored",
            "documents_discovered": len(documents),
            "discovery_floor": DISCOVERY_FLOOR,
            "total_violations": sum(counts.values()),
            "live_violations": sum(v["violations"] for v in entries.values()
                                   if v["class"] == "live"),
            "frozen_violations": sum(v["violations"] for v in entries.values()
                                     if v["class"] == "frozen"),
            "entries": entries,
        }
        os.makedirs(os.path.join(root, os.path.dirname(BASELINE_PATH)), exist_ok=True)
        with open(os.path.join(root, BASELINE_PATH), "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
        print(f"wrote {BASELINE_PATH}: {len(entries)} documents, "
              f"{payload['total_violations']} violations "
              f"({payload['live_violations']} live, {payload['frozen_violations']} frozen)")
        return 0

    print(f"{CONTRACT_ID}  root={root}")

    failed = self_test(audit_module)
    if failed:
        print(f"FAIL {CONTRACT_ID} self_proofs_failed={len(failed)}")
        for label in failed:
            print(f"  BROKEN GATE: {label}")
        return 2

    findings, report = evaluate(root, audit_module)
    print(f"  documents walked: {report.get('documents')}")
    print(f"  path assertions checked: {report.get('path_assertions_checked')}")
    print(f"  measured violations: {report.get('measured_total')} "
          f"(baseline {report.get('baseline_total')})")
    print(f"  base ref: {report.get('base_ref')} ({report.get('base_ref_mode')})")
    if report.get("live_backlog") is not None:
        print(f"  live repair backlog: {len(report['live_backlog'])}  "
              f"frozen historical: {len(report['frozen_records'])}")
    written = emit_report(report)
    if written:
        print(f"  machine-readable report: {written}")

    if findings:
        print(f"FAIL {CONTRACT_ID} findings={len(findings)}")
        for code, detail in findings:
            print(f"  {code}: {detail}")
        return 2

    print(f"PASS {CONTRACT_ID} documents={report['documents']} "
          f"violations={report['measured_total']} regressions=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
