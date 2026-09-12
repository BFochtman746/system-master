from __future__ import annotations

import json
from typing import Any, Dict, List

from .repository import Repository, digest


def validated_attempts_for_skill(
    repo: Repository, learner_id: str, course_id: str, skill_id: str
) -> List[Dict[str, Any]]:
    """Read attempt evidence with integrity validation before semantic filtering.

    Attempt bytes are existing Learning evidence state. This helper adds no writer
    authority; it prevents corrupted bytes from becoming inputs to mastery.
    """
    with repo.connect() as con:
        rows = con.execute(
            "SELECT body,body_digest FROM attempts ORDER BY rowid"
        ).fetchall()
    values: List[Dict[str, Any]] = []
    for row in rows:
        body = json.loads(row[0])
        if digest(body) != row[1]:
            raise ValueError("ATTEMPT_DIGEST_MISMATCH")
        if (
            body.get("learner_id") == learner_id
            and body.get("course_id") == course_id
            and body.get("skill_id") == skill_id
        ):
            values.append(body)
    return values
