from __future__ import annotations

import argparse
import json

from .engine import LearningEngine
from .grounded_engine import GroundedLearningEngine
from .real_course import REAL_GIT_OUTCOME
from .repository import Repository


def main() -> None:
    p = argparse.ArgumentParser(description="Portable System Master Learning Lab")
    p.add_argument("--db", default="learning_lab.sqlite3")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create-course")
    c.add_argument("--goal-id", required=True)
    c.add_argument("--title", required=True)
    c.add_argument("--outcome", required=True)
    c.add_argument("--job-id", default="JOB-001")
    c.add_argument("--operation-id", default="OP-CREATE-001")

    g = sub.add_parser("create-grounded-git-course")
    g.add_argument("--goal-id", required=True)
    g.add_argument("--title", default="Git feature branch workflow")
    g.add_argument("--job-id", default="JOB-GIT-001")
    g.add_argument("--operation-id", default="OP-GIT-CREATE-001")

    a = sub.add_parser("attempt")
    a.add_argument("--learner", required=True)
    a.add_argument("--course", required=True)
    a.add_argument("--item", required=True)
    a.add_argument("--response", required=True)
    a.add_argument("--timestamp", type=int, required=True)
    a.add_argument("--attempt-id", required=True)
    a.add_argument("--operation-id", required=True)
    a.add_argument("--assisted", action="store_true")
    a.add_argument("--grounded", action="store_true")

    n = sub.add_parser("next")
    n.add_argument("--learner", required=True)
    n.add_argument("--course", required=True)
    n.add_argument("--timestamp", type=int, required=True)

    args = p.parse_args()
    repo = Repository(args.db)
    if args.cmd == "create-grounded-git-course":
        engine = GroundedLearningEngine(repo)
        out = engine.create_research_grounded_course_job(
            operation_id=args.operation_id,
            job_id=args.job_id,
            goal_id=args.goal_id,
            title=args.title,
            desired_outcome=REAL_GIT_OUTCOME,
        )
    elif args.cmd == "create-course":
        engine = LearningEngine(repo)
        out = engine.create_course_job(
            operation_id=args.operation_id,
            job_id=args.job_id,
            goal_id=args.goal_id,
            title=args.title,
            desired_outcome=args.outcome,
        )
    elif args.cmd == "attempt":
        engine = GroundedLearningEngine(repo) if args.grounded else LearningEngine(repo)
        out = engine.submit_attempt(
            operation_id=args.operation_id,
            attempt_id=args.attempt_id,
            learner_id=args.learner,
            course_id=args.course,
            item_id=args.item,
            response=args.response,
            submitted_at=args.timestamp,
            assisted=args.assisted,
        )
    else:
        # Next-action logic is shared and deterministic.
        engine = LearningEngine(repo)
        out = engine.next_action(args.learner, args.course, now=args.timestamp)
    print(json.dumps(out, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
