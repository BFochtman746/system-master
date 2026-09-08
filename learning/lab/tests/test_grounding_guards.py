import copy
import os
import tempfile
import unittest
from dataclasses import replace

from learning_lab import GroundedLearningEngine, REAL_GIT_OUTCOME, Repository
from learning_lab.real_course import DeterministicModelAdapter, FrozenResearchPort


class BadResearchPort(FrozenResearchPort):
    def __init__(self, mutation):
        self.mutation = mutation
    def research(self, desired_outcome):
        d = super().research(desired_outcome)
        self.mutation(d)
        return d


class BadModelPort(DeterministicModelAdapter):
    def __init__(self, mutation):
        self.mutation = mutation
    def generate_course(self, **kwargs):
        c = super().generate_course(**kwargs)
        return self.mutation(c)


class GroundingGuardTests(unittest.TestCase):
    def _repo(self):
        td = tempfile.TemporaryDirectory()
        return td, Repository(os.path.join(td.name, "lab.sqlite3"))

    def _create(self, engine):
        return engine.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME)

    def test_unknown_goal_fails_closed_before_course(self):
        td, repo = self._repo()
        try:
            engine = GroundedLearningEngine(repo)
            with self.assertRaisesRegex(ValueError, "UNSUPPORTED_REAL_GOAL_FOR_SLICE"):
                engine.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="Other", desired_outcome="Teach me anything at all")
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_missing_required_research_claim_blocks_generation(self):
        td, repo = self._repo()
        try:
            port = BadResearchPort(lambda d: d["claims"].pop())
            engine = GroundedLearningEngine(repo, research_port=port)
            with self.assertRaisesRegex(ValueError, "RESEARCH_CLAIM_COVERAGE_INCOMPLETE"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_unadmitted_source_blocks_course(self):
        td, repo = self._repo()
        try:
            def mutate(d):
                d["sources"][0]["standing"] = "REJECTED"
            engine = GroundedLearningEngine(repo, research_port=BadResearchPort(mutate))
            with self.assertRaisesRegex(ValueError, "GROUNDING_VALIDATION_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_ungrounded_lesson_blocks_persistence(self):
        td, repo = self._repo()
        try:
            def mutate(course):
                lessons = list(course.lessons)
                lessons[0] = replace(lessons[0], claim_refs=[])
                return replace(course, lessons=lessons)
            engine = GroundedLearningEngine(repo, model_port=BadModelPort(mutate))
            with self.assertRaisesRegex(ValueError, "GROUNDING_VALIDATION_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_behaviorally_wrong_mastery_key_blocks_candidate(self):
        td, repo = self._repo()
        try:
            def mutate(course):
                items = list(course.items)
                idx = next(i for i,x in enumerate(items) if x.item_id == "M-GIT-BRANCH-1")
                items[idx] = replace(items[idx], answer="git switch -c topic; git add change.txt; git commit -m \"Add change\"; git merge topic; git switch main")
                return replace(course, items=items)
            engine = GroundedLearningEngine(repo, model_port=BadModelPort(mutate))
            with self.assertRaisesRegex(ValueError, "GIT_BEHAVIOR_ORACLE_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_unmapped_hallucinated_fact_span_blocks_course(self):
        td, repo = self._repo()
        try:
            def mutate(course):
                lessons = list(course.lessons)
                lessons[0] = replace(lessons[0], explanation=lessons[0].explanation + " Git automatically pushes every new local branch to a remote.")
                return replace(course, lessons=lessons)
            engine = GroundedLearningEngine(repo, model_port=BadModelPort(mutate))
            with self.assertRaisesRegex(ValueError, "GROUNDING_VALIDATION_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_mastery_answer_exposed_verbatim_blocks_candidate(self):
        td, repo = self._repo()
        try:
            def mutate(course):
                lessons = list(course.lessons)
                target = lessons[1]
                leaked = target.explanation + " " + next(i.answer for i in course.items if i.item_id == "M-GIT-BRANCH-1")
                # Keep span synchronized so this mutation tests the instructional leak gate, not grounding coverage.
                spans = list(target.grounding_spans)
                spans[0] = dict(spans[0], text=leaked)
                lessons[1] = replace(target, explanation=leaked, grounding_spans=spans)
                return replace(course, lessons=lessons)
            engine = GroundedLearningEngine(repo, model_port=BadModelPort(mutate))
            with self.assertRaisesRegex(ValueError, "INSTRUCTIONAL_VALIDATION_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_reused_practice_family_for_mastery_blocks_candidate(self):
        td, repo = self._repo()
        try:
            def mutate(course):
                items = list(course.items)
                p = next(i for i in items if i.item_id == "P-GIT-STAGE-1")
                idx = next(i for i,x in enumerate(items) if x.item_id == "M-GIT-STAGE-1")
                items[idx] = replace(items[idx], family_id=p.family_id)
                return replace(course, items=items)
            engine = GroundedLearningEngine(repo, model_port=BadModelPort(mutate))
            with self.assertRaisesRegex(ValueError, "INSTRUCTIONAL_VALIDATION_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()

    def test_broken_worked_example_command_blocks_candidate(self):
        td, repo = self._repo()
        try:
            def mutate(course):
                lessons = list(course.lessons)
                target = lessons[1]
                examples = list(target.worked_examples)
                examples[0] = examples[0].replace("`git merge feature`", "`git merge missing-branch`")
                spans = list(target.grounding_spans)
                for i, span in enumerate(spans):
                    if span.get("role") == "WORKED_EXAMPLE" and span.get("text") == target.worked_examples[0]:
                        spans[i] = dict(span, text=examples[0])
                lessons[1] = replace(target, worked_examples=examples, grounding_spans=spans)
                return replace(course, lessons=lessons)
            engine = GroundedLearningEngine(repo, model_port=BadModelPort(mutate))
            with self.assertRaisesRegex(ValueError, "LESSON_BEHAVIOR_ORACLE_FAILED"):
                self._create(engine)
            self.assertEqual(repo.count_objects("course"), 0)
        finally:
            td.cleanup()


if __name__ == "__main__":
    unittest.main()
