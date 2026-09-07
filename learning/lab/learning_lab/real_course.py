from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from .models import Course, Criterion, Item, Lesson, Skill
from .repository import digest

REAL_GIT_OUTCOME = "Create a Git feature branch, make and commit a change, merge it into main, and verify the result independently."
REAL_GIT_GOAL_KEY = "git-feature-branch-workflow"

SOURCE_DOSSIER = {
    "dossier_id": "RSCH-GIT-FEATURE-WORKFLOW-001",
    "retrieved_date": "2026-09-06",
    "source_policy": "OFFICIAL_PRIMARY_ONLY",
    "sources": [
        {
            "source_id": "SRC-GIT-STATUS",
            "title": "Git - git-status Documentation",
            "url": "https://git-scm.com/docs/git-status",
            "authority": "OFFICIAL_GIT_DOCUMENTATION",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-GIT-ADD",
            "title": "Git - git-add Documentation",
            "url": "https://git-scm.com/docs/git-add",
            "authority": "OFFICIAL_GIT_DOCUMENTATION",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-GIT-COMMIT",
            "title": "Git - git-commit Documentation",
            "url": "https://git-scm.com/docs/git-commit",
            "authority": "OFFICIAL_GIT_DOCUMENTATION",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-GIT-SWITCH",
            "title": "Git - git-switch Documentation",
            "url": "https://git-scm.com/docs/git-switch",
            "authority": "OFFICIAL_GIT_DOCUMENTATION",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-GIT-MERGE",
            "title": "Git - git-merge Documentation",
            "url": "https://git-scm.com/docs/git-merge",
            "authority": "OFFICIAL_GIT_DOCUMENTATION",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-GIT-LOG",
            "title": "Git - git-log Documentation",
            "url": "https://git-scm.com/docs/git-log",
            "authority": "OFFICIAL_GIT_DOCUMENTATION",
            "standing": "ADMITTED",
        },
    ],
    "claims": [
        {
            "claim_id": "CL-GIT-001",
            "source_id": "SRC-GIT-STATUS",
            "text": "git status reports differences among HEAD, the index, and the working tree, including untracked paths.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-GIT-002",
            "source_id": "SRC-GIT-ADD",
            "text": "git add places selected file content into the index (staging area) for a later commit.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-GIT-003",
            "source_id": "SRC-GIT-COMMIT",
            "text": "git commit records the current contents of the index as a new commit and advances the current branch tip when HEAD is attached to a branch.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-GIT-004",
            "source_id": "SRC-GIT-SWITCH",
            "text": "git switch -c <name> creates a new branch and switches the working tree to it as one transactional operation.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-GIT-005",
            "source_id": "SRC-GIT-SWITCH",
            "text": "After switching to a branch, new commits are added to the tip of that branch.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-GIT-006",
            "source_id": "SRC-GIT-MERGE",
            "text": "git merge integrates the named history into the current branch; when the current branch tip is an ancestor of the named commit, a fast-forward can advance the current branch pointer.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-GIT-007",
            "source_id": "SRC-GIT-LOG",
            "text": "git log shows commit history and can be used to inspect reachable commits after a merge.",
            "kind": "FACT",
        },
    ],
}


class FrozenResearchPort:
    """Portable adapter over a real, build-time-researched source dossier.

    It does not pretend to perform live web research at runtime. The source/claim
    set is frozen so the course build can be replayed deterministically.
    """

    def research(self, desired_outcome: str) -> Dict[str, Any]:
        if desired_outcome.strip() != REAL_GIT_OUTCOME:
            raise ValueError("UNSUPPORTED_REAL_GOAL_FOR_SLICE")
        return json.loads(json.dumps(SOURCE_DOSSIER))


class DeterministicModelAdapter:
    """Replaceable ModelPort test adapter.

    Produces candidate instructional objects from admitted claim IDs. It is
    deliberately deterministic so content-grounding and validation can be
    proven before a nondeterministic model/provider is introduced.
    """

    adapter_id = "MODEL-STUB-GROUNDED-V1"

    def generate_course(self, *, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
        claim_ids = {c["claim_id"] for c in dossier["claims"]}
        required = {f"CL-GIT-{i:03d}" for i in range(1, 8)}
        if not required.issubset(claim_ids):
            raise ValueError("RESEARCH_CLAIM_COVERAGE_INCOMPLETE")

        criteria = [
            Criterion("C-GIT-STAGE-COMMIT", "S-GIT-STAGE-COMMIT", "Inspect, stage, and commit a working-tree change using the Git index correctly."),
            Criterion("C-GIT-BRANCH-MERGE", "S-GIT-BRANCH-MERGE", "Create a feature branch, commit there, merge into main, and verify the resulting history."),
        ]
        skills = [
            Skill("S-GIT-STAGE-COMMIT", "Stage and commit a change", ["C-GIT-STAGE-COMMIT"]),
            Skill("S-GIT-BRANCH-MERGE", "Create, work on, and merge a feature branch", ["C-GIT-BRANCH-MERGE"], ["S-GIT-STAGE-COMMIT"]),
        ]
        lessons = [
            Lesson(
                "L-GIT-STAGE-COMMIT",
                "From working tree to commit",
                "S-GIT-STAGE-COMMIT",
                ["C-GIT-STAGE-COMMIT"],
                "Use status, staging, and commit as distinct steps and explain what each step changes.",
                "Use `git status` to inspect what differs. `git add <file>` stages the selected file content in Git's index. `git commit -m <message>` then records the staged index as a new commit. Editing a file after staging it does not automatically update the staged copy; stage again if the later edit belongs in the same commit.",
                [
                    "After editing notes.txt, run `git status`, then `git add notes.txt`, then `git commit -m \"Update notes\"`.",
                    "If notes.txt is edited again after `git add notes.txt`, run `git add notes.txt` again before committing if you want the later edit included.",
                ],
                ["P-GIT-STAGE-1", "P-GIT-STAGE-2"],
                claim_refs=["CL-GIT-001", "CL-GIT-002", "CL-GIT-003"],
                grounding_spans=[
                    {"role": "EXPLANATION", "text": "Use `git status` to inspect what differs. `git add <file>` stages the selected file content in Git's index. `git commit -m <message>` then records the staged index as a new commit. Editing a file after staging it does not automatically update the staged copy; stage again if the later edit belongs in the same commit.", "claim_refs": ["CL-GIT-001", "CL-GIT-002", "CL-GIT-003"]},
                    {"role": "WORKED_EXAMPLE", "text": "After editing notes.txt, run `git status`, then `git add notes.txt`, then `git commit -m \"Update notes\"`.", "claim_refs": ["CL-GIT-001", "CL-GIT-002", "CL-GIT-003"]},
                    {"role": "WORKED_EXAMPLE", "text": "If notes.txt is edited again after `git add notes.txt`, run `git add notes.txt` again before committing if you want the later edit included.", "claim_refs": ["CL-GIT-002", "CL-GIT-003"]},
                ],
            ),
            Lesson(
                "L-GIT-BRANCH-MERGE",
                "Create and merge a feature branch",
                "S-GIT-BRANCH-MERGE",
                ["C-GIT-BRANCH-MERGE"],
                "Create a feature branch, make its commit, return to main, merge the feature, and verify the result.",
                "From a clean main branch, `git switch -c feature` creates and switches to a new branch. Commits made there advance the feature branch. After the feature commit, switch back with `git switch main`, merge with `git merge feature`, then inspect `git status` and `git log --oneline --graph --all` to verify the repository is clean and the feature commit is reachable from main.",
                [
                    "A minimal workflow is: `git switch -c feature`; edit; `git add <file>`; `git commit -m \"Feature\"`; `git switch main`; `git merge feature`.",
                    "When main has not diverged from the feature's starting point, the merge can be a fast-forward: main advances to the feature commit rather than requiring a separate merge commit.",
                ],
                ["P-GIT-BRANCH-1", "P-GIT-BRANCH-2"],
                claim_refs=["CL-GIT-004", "CL-GIT-005", "CL-GIT-006", "CL-GIT-007"],
                grounding_spans=[
                    {"role": "EXPLANATION", "text": "From a clean main branch, `git switch -c feature` creates and switches to a new branch. Commits made there advance the feature branch. After the feature commit, switch back with `git switch main`, merge with `git merge feature`, then inspect `git status` and `git log --oneline --graph --all` to verify the repository is clean and the feature commit is reachable from main.", "claim_refs": ["CL-GIT-001", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006", "CL-GIT-007"]},
                    {"role": "WORKED_EXAMPLE", "text": "A minimal workflow is: `git switch -c feature`; edit; `git add <file>`; `git commit -m \"Feature\"`; `git switch main`; `git merge feature`.", "claim_refs": ["CL-GIT-002", "CL-GIT-003", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006"]},
                    {"role": "WORKED_EXAMPLE", "text": "When main has not diverged from the feature's starting point, the merge can be a fast-forward: main advances to the feature commit rather than requiring a separate merge commit.", "claim_refs": ["CL-GIT-006"]},
                ],
            ),
        ]
        items = [
            Item("P-GIT-STAGE-1", "F-GIT-STAGE-P1", "C-GIT-STAGE-COMMIT", "PRACTICE", "Which command stages the current content of notes.txt for the next commit?", "git add notes.txt", "git add copies the selected file content into the index.", claim_refs=["CL-GIT-002"], grounding_spans=[{"role":"RATIONALE","text":"git add copies the selected file content into the index.","claim_refs":["CL-GIT-002"]}]),
            Item("P-GIT-STAGE-2", "F-GIT-STAGE-P2", "C-GIT-STAGE-COMMIT", "PRACTICE", "Which command shows working-tree and staging status?", "git status", "git status summarizes differences among working tree, index, and HEAD.", claim_refs=["CL-GIT-001"], grounding_spans=[{"role":"RATIONALE","text":"git status summarizes differences among working tree, index, and HEAD.","claim_refs":["CL-GIT-001"]}]),
            Item("M-GIT-STAGE-1", "F-GIT-STAGE-M1", "C-GIT-STAGE-COMMIT", "MASTERY_CHECK", "After editing app.txt, give the two Git commands that stage app.txt and record it as a commit with message Feature work. Separate commands with ;", "git add app.txt; git commit -m \"Feature work\"", "Stage first, then commit the index.", scoring_type="GIT_SEQUENCE", claim_refs=["CL-GIT-002", "CL-GIT-003"], grounding_spans=[{"role":"RATIONALE","text":"Stage first, then commit the index.","claim_refs":["CL-GIT-002","CL-GIT-003"]}]),
            Item("R-GIT-STAGE-1", "F-GIT-STAGE-R1", "C-GIT-STAGE-COMMIT", "RETENTION_CHECK", "After editing later.txt, give the two commands that stage it and commit it with message Later work. Separate commands with ;", "git add later.txt; git commit -m \"Later work\"", "A delayed parallel task uses the same staging/commit distinction.", scoring_type="GIT_SEQUENCE", claim_refs=["CL-GIT-002", "CL-GIT-003"], grounding_spans=[{"role":"RATIONALE","text":"A delayed parallel task uses the same staging/commit distinction.","claim_refs":["CL-GIT-002","CL-GIT-003"]}]),
            Item("P-GIT-BRANCH-1", "F-GIT-BRANCH-P1", "C-GIT-BRANCH-MERGE", "PRACTICE", "Which command creates and switches to a branch named feature?", "git switch -c feature", "The -c form creates the branch and switches to it.", claim_refs=["CL-GIT-004"], grounding_spans=[{"role":"RATIONALE","text":"The -c form creates the branch and switches to it.","claim_refs":["CL-GIT-004"]}]),
            Item("P-GIT-BRANCH-2", "F-GIT-BRANCH-P2", "C-GIT-BRANCH-MERGE", "PRACTICE", "If you are on main, which command integrates branch feature into main?", "git merge feature", "git merge integrates the named history into the current branch.", claim_refs=["CL-GIT-006"], grounding_spans=[{"role":"RATIONALE","text":"git merge integrates the named history into the current branch.","claim_refs":["CL-GIT-006"]}]),
            Item("M-GIT-BRANCH-1", "F-GIT-BRANCH-M1", "C-GIT-BRANCH-MERGE", "MASTERY_CHECK", "From main, give the branch/commit/merge command sequence using branch topic and file change.txt. Use message Add change and separate commands with ;", "git switch -c topic; git add change.txt; git commit -m \"Add change\"; git switch main; git merge topic", "Create/switch, stage, commit on feature, return to main, then merge.", scoring_type="GIT_FEATURE_WORKFLOW", claim_refs=["CL-GIT-002", "CL-GIT-003", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006"], grounding_spans=[{"role":"RATIONALE","text":"Create/switch, stage, commit on feature, return to main, then merge.","claim_refs":["CL-GIT-002","CL-GIT-003","CL-GIT-004","CL-GIT-005","CL-GIT-006"]}]),
            Item("R-GIT-BRANCH-1", "F-GIT-BRANCH-R1", "C-GIT-BRANCH-MERGE", "RETENTION_CHECK", "From main, give the same workflow using branch fix and file fix.txt with message Fix issue. Separate commands with ;", "git switch -c fix; git add fix.txt; git commit -m \"Fix issue\"; git switch main; git merge fix", "Delayed parallel workflow verifies retention without reusing the exact feature family.", scoring_type="GIT_FEATURE_WORKFLOW", claim_refs=["CL-GIT-002", "CL-GIT-003", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006"], grounding_spans=[{"role":"RATIONALE","text":"Delayed parallel workflow verifies retention without reusing the exact feature family.","claim_refs":["CL-GIT-002","CL-GIT-003","CL-GIT-004","CL-GIT-005","CL-GIT-006"]}]),
        ]
        course = Course(
            course_id=f"COURSE-{goal_id}",
            version=1,
            goal_id=goal_id,
            title=title,
            desired_outcome=desired_outcome,
            skills=skills,
            criteria=criteria,
            lessons=lessons,
            items=items,
            source_ids=[s["source_id"] for s in dossier["sources"]],
            research_dossier_id=dossier["dossier_id"],
            generation_adapter=self.adapter_id,
        )
        return course


class GitBehaviorOracle:
    """Independent executable oracle for the bounded Git command semantics."""

    def __init__(self):
        self.git = shutil.which("git")
        if not self.git:
            raise RuntimeError("GIT_RUNTIME_UNAVAILABLE")

    @staticmethod
    def _run(repo: str, args: List[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True, check=False)

    def _repo(self) -> Tuple[tempfile.TemporaryDirectory[str], str]:
        td = tempfile.TemporaryDirectory()
        repo = td.name
        init = self._run(repo, ["init", "-b", "main"])
        if init.returncode != 0:
            td.cleanup()
            raise RuntimeError(f"git init failed: {init.stderr}")
        self._run(repo, ["config", "user.email", "learning-lab@example.invalid"])
        self._run(repo, ["config", "user.name", "Learning Lab"])
        Path(repo, "base.txt").write_text("base\n", encoding="utf-8")
        self._run(repo, ["add", "base.txt"])
        commit = self._run(repo, ["commit", "-m", "Base"])
        if commit.returncode != 0:
            td.cleanup()
            raise RuntimeError(f"git base commit failed: {commit.stderr}")
        return td, repo

    @staticmethod
    def _split(sequence: str) -> List[List[str]]:
        import shlex
        out: List[List[str]] = []
        for raw in sequence.split(";"):
            raw = raw.strip()
            if not raw:
                continue
            parts = shlex.split(raw)
            if not parts or parts[0] != "git":
                raise ValueError("NON_GIT_COMMAND")
            allowed = {"add", "commit", "switch", "merge", "status", "log"}
            if len(parts) < 2 or parts[1] not in allowed:
                raise ValueError("GIT_COMMAND_NOT_ALLOWED")
            out.append(parts[1:])
        return out

    def score(self, item: Dict[str, Any], response: str) -> bool:
        scoring_type = item.get("scoring_type", "EXACT")
        if scoring_type == "EXACT":
            return response.strip() == item["answer"].strip()
        commands = self._split(response)
        if scoring_type == "GIT_SEQUENCE":
            return self._score_stage_commit(commands, item)
        if scoring_type == "GIT_FEATURE_WORKFLOW":
            return self._score_feature_workflow(commands, item)
        if scoring_type == "GIT_TRANSFER_WORKFLOW":
            return self._score_transfer_workflow(commands, item)
        raise ValueError("UNKNOWN_SCORING_TYPE")

    def _score_stage_commit(self, commands: List[List[str]], item: Dict[str, Any]) -> bool:
        td, repo = self._repo()
        try:
            # Derive the requested file from the expected answer so the oracle tests
            # behavior rather than exact command-string formatting.
            expected = self._split(item["answer"])
            file_name = expected[0][-1]
            Path(repo, file_name).write_text("change\n", encoding="utf-8")
            for args in commands:
                r = self._run(repo, args)
                if r.returncode != 0:
                    return False
            status = self._run(repo, ["status", "--porcelain"])
            count = self._run(repo, ["rev-list", "--count", "HEAD"])
            subject = self._run(repo, ["log", "-1", "--pretty=%s"])
            expected_subject = expected[1][-1]
            return (status.returncode == 0 and status.stdout.strip() == "" and count.stdout.strip() == "2" and subject.stdout.strip() == expected_subject)
        finally:
            td.cleanup()

    def _score_feature_workflow(self, commands: List[List[str]], item: Dict[str, Any]) -> bool:
        td, repo = self._repo()
        try:
            expected = self._split(item["answer"])
            branch = expected[0][-1]
            file_name = expected[1][-1]
            # Learner command sequence omits the edit itself; create the intended
            # feature file immediately after branch creation, matching the prompt.
            if not commands:
                return False
            first = self._run(repo, commands[0])
            if first.returncode != 0:
                return False
            Path(repo, file_name).write_text(f"{branch} change\n", encoding="utf-8")
            for args in commands[1:]:
                r = self._run(repo, args)
                if r.returncode != 0:
                    return False
            current = self._run(repo, ["branch", "--show-current"])
            status = self._run(repo, ["status", "--porcelain"])
            merged = self._run(repo, ["merge-base", "--is-ancestor", branch, "main"])
            count = self._run(repo, ["rev-list", "--count", "main"])
            return (
                current.stdout.strip() == "main"
                and status.stdout.strip() == ""
                and merged.returncode == 0
                and count.stdout.strip() == "2"
                and Path(repo, file_name).exists()
            )
        finally:
            td.cleanup()


    def _score_transfer_workflow(self, commands: List[List[str]], item: Dict[str, Any]) -> bool:
        """Execute a novel branch/merge workflow on a non-main base branch."""
        td, repo = self._repo()
        try:
            base_branch = item["base_branch"]
            feature_branch = item["feature_branch"]
            file_name = item["file_name"]
            commit_message = item["commit_message"]
            created = self._run(repo, ["switch", "-c", base_branch])
            if created.returncode != 0:
                return False
            if not commands:
                return False
            first = self._run(repo, commands[0])
            if first.returncode != 0:
                return False
            if self._run(repo, ["branch", "--show-current"]).stdout.strip() != feature_branch:
                return False
            Path(repo, file_name).write_text(f"{feature_branch} transfer change\n", encoding="utf-8")
            for args in commands[1:]:
                r = self._run(repo, args)
                if r.returncode != 0:
                    return False
            current = self._run(repo, ["branch", "--show-current"]).stdout.strip()
            clean = self._run(repo, ["status", "--porcelain"]).stdout.strip() == ""
            merged = self._run(repo, ["merge-base", "--is-ancestor", feature_branch, base_branch]).returncode == 0
            subject = self._run(repo, ["log", "-1", "--pretty=%s"]).stdout.strip()
            return current == base_branch and clean and merged and subject == commit_message and Path(repo, file_name).exists()
        finally:
            td.cleanup()

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        for item in course["items"]:
            if item.get("scoring_type", "EXACT") not in {"GIT_SEQUENCE", "GIT_FEATURE_WORKFLOW"}:
                continue
            ok = self.score(item, item["answer"])
            checked.append({"item_id": item["item_id"], "pass": ok})
        return {"status": "PASS" if all(x["pass"] for x in checked) else "FAIL", "checked": checked}


    @staticmethod
    def _git_code_spans(text: str) -> List[str]:
        import re
        return re.findall(r"`(git [^`]+)`", text)

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        lessons = {l["lesson_id"]: l for l in course["lessons"]}

        # Stage/commit worked example: execute every Git command in order.
        l1 = lessons.get("L-GIT-STAGE-COMMIT")
        ok1 = False
        if l1 and l1.get("worked_examples"):
            commands = self._git_code_spans(l1["worked_examples"][0])
            td, repo = self._repo()
            try:
                Path(repo, "notes.txt").write_text("notes\n", encoding="utf-8")
                ok1 = bool(commands)
                for cmd in commands:
                    args = self._split(cmd)[0]
                    if self._run(repo, args).returncode != 0:
                        ok1 = False
                        break
                if ok1:
                    ok1 = self._run(repo, ["status", "--porcelain"]).stdout.strip() == "" and self._run(repo, ["rev-list", "--count", "HEAD"]).stdout.strip() == "2"
            finally:
                td.cleanup()
        checked.append({"lesson_id": "L-GIT-STAGE-COMMIT", "example_index": 0, "pass": ok1})

        # Branch/merge worked example: replace the generic file token, insert the
        # edit described by the prose, and execute the Git commands exactly.
        l2 = lessons.get("L-GIT-BRANCH-MERGE")
        ok2 = False
        if l2 and l2.get("worked_examples"):
            commands = [x.replace("<file>", "feature.txt") for x in self._git_code_spans(l2["worked_examples"][0])]
            td, repo = self._repo()
            try:
                ok2 = len(commands) >= 5
                for idx, cmd in enumerate(commands):
                    args = self._split(cmd)[0]
                    if self._run(repo, args).returncode != 0:
                        ok2 = False
                        break
                    if idx == 0:
                        Path(repo, "feature.txt").write_text("feature\n", encoding="utf-8")
                if ok2:
                    current = self._run(repo, ["branch", "--show-current"]).stdout.strip()
                    clean = self._run(repo, ["status", "--porcelain"]).stdout.strip() == ""
                    ancestor = self._run(repo, ["merge-base", "--is-ancestor", "feature", "main"]).returncode == 0
                    ok2 = current == "main" and clean and ancestor and Path(repo, "feature.txt").exists()
            finally:
                td.cleanup()
        checked.append({"lesson_id": "L-GIT-BRANCH-MERGE", "example_index": 0, "pass": ok2})
        return {"status": "PASS" if all(x["pass"] for x in checked) else "FAIL", "checked": checked}


def validate_grounding(course: Dict[str, Any], dossier: Dict[str, Any]) -> Dict[str, Any]:
    admitted_sources = {s["source_id"] for s in dossier["sources"] if s["standing"] == "ADMITTED"}
    claims = {c["claim_id"]: c for c in dossier["claims"]}
    errors: List[str] = []
    used_claims: List[str] = []

    def validate_refs(subject: str, refs: List[str]) -> None:
        if not refs:
            errors.append(f"UNGROUNDED:{subject}")
        for ref in refs:
            if ref not in claims:
                errors.append(f"UNKNOWN_CLAIM:{subject}:{ref}")
                continue
            if claims[ref]["source_id"] not in admitted_sources:
                errors.append(f"CLAIM_SOURCE_NOT_ADMITTED:{ref}")
            used_claims.append(ref)

    if not admitted_sources:
        errors.append("NO_ADMITTED_SOURCES")
    for lesson in course["lessons"]:
        validate_refs(f"LESSON:{lesson['lesson_id']}", lesson.get("claim_refs", []))
        spans = lesson.get("grounding_spans", [])
        explanation_spans = [x for x in spans if x.get("role") == "EXPLANATION"]
        example_spans = [x for x in spans if x.get("role") == "WORKED_EXAMPLE"]
        if len(explanation_spans) != 1 or explanation_spans[0].get("text") != lesson.get("explanation"):
            errors.append(f"EXPLANATION_SPAN_COVERAGE:{lesson['lesson_id']}")
        if [x.get("text") for x in example_spans] != lesson.get("worked_examples", []):
            errors.append(f"WORKED_EXAMPLE_SPAN_COVERAGE:{lesson['lesson_id']}")
        for i, span in enumerate(spans):
            validate_refs(f"LESSON_SPAN:{lesson['lesson_id']}:{i}", span.get("claim_refs", []))
    for item in course["items"]:
        validate_refs(f"ITEM:{item['item_id']}", item.get("claim_refs", []))
        spans = item.get("grounding_spans", [])
        rationale_spans = [x for x in spans if x.get("role") == "RATIONALE"]
        if len(rationale_spans) != 1 or rationale_spans[0].get("text") != item.get("rationale"):
            errors.append(f"RATIONALE_SPAN_COVERAGE:{item['item_id']}")
        for i, span in enumerate(spans):
            validate_refs(f"ITEM_SPAN:{item['item_id']}:{i}", span.get("claim_refs", []))
    return {
        "status": "PASS" if not errors else "FAIL",
        "errors": sorted(set(errors)),
        "used_claim_ids": sorted(set(used_claims)),
        "claim_coverage_percent": round(100 * len(set(used_claims)) / max(1, len(claims))),
        "dossier_digest": digest(dossier),
        "closed_world_span_coverage": not any("SPAN_COVERAGE" in e for e in errors),
    }


def validate_instructional_design(course: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    items_by_criterion: Dict[str, List[Dict[str, Any]]] = {}
    for item in course["items"]:
        items_by_criterion.setdefault(item["criterion_id"], []).append(item)

    for skill in course["skills"]:
        lessons = [l for l in course["lessons"] if l["skill_id"] == skill["skill_id"]]
        if not lessons:
            errors.append(f"SKILL_WITHOUT_LESSON:{skill['skill_id']}")
        for cid in skill["criterion_ids"]:
            relevant = items_by_criterion.get(cid, [])
            modes = {i["mode"] for i in relevant}
            for required_mode in ("PRACTICE", "MASTERY_CHECK", "RETENTION_CHECK"):
                if required_mode not in modes:
                    errors.append(f"MISSING_{required_mode}:{cid}")
            practice_families = {i["family_id"] for i in relevant if i["mode"] == "PRACTICE"}
            mastery_families = {i["family_id"] for i in relevant if i["mode"] == "MASTERY_CHECK"}
            retention_families = {i["family_id"] for i in relevant if i["mode"] == "RETENTION_CHECK"}
            if practice_families & mastery_families:
                errors.append(f"PRACTICE_MASTERY_FAMILY_LEAK:{cid}")
            if mastery_families & retention_families:
                errors.append(f"MASTERY_RETENTION_FAMILY_LEAK:{cid}")

    for lesson in course["lessons"]:
        if len(lesson.get("worked_examples", [])) < 2:
            errors.append(f"INSUFFICIENT_WORKED_EXAMPLES:{lesson['lesson_id']}")
        if len(lesson.get("practice_item_ids", [])) < 2:
            errors.append(f"INSUFFICIENT_PRACTICE_VARIATION:{lesson['lesson_id']}")
        lesson_text = "\n".join([lesson.get("explanation", ""), *lesson.get("worked_examples", [])])
        for cid in lesson["criterion_ids"]:
            for item in items_by_criterion.get(cid, []):
                if item["mode"] == "MASTERY_CHECK" and item["answer"] in lesson_text:
                    errors.append(f"MASTERY_ANSWER_EXPOSED_IN_LESSON:{item['item_id']}")

    return {
        "status": "PASS" if not errors else "FAIL",
        "errors": sorted(set(errors)),
        "checks": {
            "practice_mastery_family_independence": not any("PRACTICE_MASTERY_FAMILY_LEAK" in e for e in errors),
            "mastery_retention_family_independence": not any("MASTERY_RETENTION_FAMILY_LEAK" in e for e in errors),
            "mastery_answer_not_exposed_verbatim": not any("MASTERY_ANSWER_EXPOSED" in e for e in errors),
            "worked_examples_present": not any("INSUFFICIENT_WORKED_EXAMPLES" in e for e in errors),
            "practice_variation_present": not any("INSUFFICIENT_PRACTICE_VARIATION" in e for e in errors),
        },
    }


def persist_dossier(path: str) -> None:
    Path(path).write_text(json.dumps(SOURCE_DOSSIER, indent=2, sort_keys=True), encoding="utf-8")
