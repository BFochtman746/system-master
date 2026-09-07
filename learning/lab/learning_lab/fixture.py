from __future__ import annotations

from .models import Course, Criterion, Item, Lesson, Skill

SUPPORTED_OUTCOME = "Classify token stability and select the correct route independently."


def build_synthetic_course(goal_id: str, title: str, desired_outcome: str) -> Course:
    """Controlled synthetic domain with explicit truth rules.

    Domain law (defined by this fixture, not claimed as external fact):
    - A token is STABLE when its left and right marks are equal; otherwise UNSTABLE.
    - Route ALPHA is chosen for STABLE tokens; route BETA for UNSTABLE tokens.
    """
    criteria = [
        Criterion("C-STABILITY", "S-STABILITY", "Classify a token as STABLE or UNSTABLE from its two marks."),
        Criterion("C-ROUTE", "S-ROUTE", "Choose ALPHA for STABLE and BETA for UNSTABLE tokens."),
    ]
    skills = [
        Skill("S-STABILITY", "Token stability classification", ["C-STABILITY"]),
        Skill("S-ROUTE", "Route selection", ["C-ROUTE"], ["S-STABILITY"]),
    ]
    lessons = [
        Lesson(
            "L-STABILITY",
            "Classify token stability",
            "S-STABILITY",
            ["C-STABILITY"],
            "Determine whether two token marks match and classify the token correctly.",
            "Compare the two marks. Equal marks mean STABLE; different marks mean UNSTABLE. Commit the classification before checking feedback.",
            [
                "A token marked 4|4 is STABLE because both marks are equal.",
                "A token marked 2|7 is UNSTABLE because the marks differ.",
            ],
            ["P-STAB-1", "P-STAB-2"],
        ),
        Lesson(
            "L-ROUTE",
            "Select the route",
            "S-ROUTE",
            ["C-ROUTE"],
            "Select the correct route from a token's established stability state.",
            "First classify stability. Then map STABLE to ALPHA and UNSTABLE to BETA. Do not choose a route before establishing stability.",
            [
                "5|5 is STABLE, so choose ALPHA.",
                "3|8 is UNSTABLE, so choose BETA.",
            ],
            ["P-ROUTE-1"],
        ),
    ]
    items = [
        Item("P-STAB-1", "F-STAB-P1", "C-STABILITY", "PRACTICE", "Classify 6|6.", "STABLE", "The two marks are equal."),
        Item("P-STAB-2", "F-STAB-P2", "C-STABILITY", "PRACTICE", "Classify 6|2.", "UNSTABLE", "The two marks differ."),
        Item("M-STAB-1", "F-STAB-M1", "C-STABILITY", "MASTERY_CHECK", "Classify 9|9.", "STABLE", "The two marks are equal."),
        Item("R-STAB-1", "F-STAB-R1", "C-STABILITY", "RETENTION_CHECK", "Classify 1|8.", "UNSTABLE", "The two marks differ."),
        Item("P-ROUTE-1", "F-ROUTE-P1", "C-ROUTE", "PRACTICE", "Choose the route for 7|3.", "BETA", "7|3 is UNSTABLE, so BETA."),
        Item("M-ROUTE-1", "F-ROUTE-M1", "C-ROUTE", "MASTERY_CHECK", "Choose the route for 8|8.", "ALPHA", "8|8 is STABLE, so ALPHA."),
        Item("R-ROUTE-1", "F-ROUTE-R1", "C-ROUTE", "RETENTION_CHECK", "Choose the route for 4|9.", "BETA", "4|9 is UNSTABLE, so BETA."),
    ]
    return Course(
        course_id=f"COURSE-{goal_id}",
        version=1,
        goal_id=goal_id,
        title=title,
        desired_outcome=desired_outcome,
        skills=skills,
        criteria=criteria,
        lessons=lessons,
        items=items,
    )
