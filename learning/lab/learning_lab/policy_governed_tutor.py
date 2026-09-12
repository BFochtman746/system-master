from __future__ import annotations

from typing import Any, Dict

from .instructional_policy import INSTRUCTIONAL_POLICY_VERSION, validate_tutor_move_against_policy


class InstructionalPolicyGovernanceMixin:
    """Apply Curriculum instructional-policy fences to an existing grounded tutor.

    The wrapped tutor still owns domain-grounded content realization. This mixin
    only validates and annotates how much support is allowed. It never writes
    mastery, next-action eligibility, or a new canonical tutor truth family.
    """

    def process_turn(self, **kwargs: Any) -> Dict[str, Any]:
        result = super().process_turn(**kwargs)
        active_assessment = bool(kwargs.get("active_assessment_item_id"))
        original_move = dict(result.get("teaching_move", {}))
        governed_move = validate_tutor_move_against_policy(
            original_move,
            assessment_active=active_assessment,
            independent_evidence_active=active_assessment,
            accommodation_active=bool(kwargs.get("accommodation_active", False)),
            policy_version=INSTRUCTIONAL_POLICY_VERSION,
        )
        out = dict(result)
        out["teaching_move"] = governed_move
        out["instructional_policy"] = {
            "policy_version": INSTRUCTIONAL_POLICY_VERSION,
            "authority": "CURRICULUM_INSTRUCTIONAL_POLICY",
            "tutor_runtime_is_semantic_authority": False,
            "mastery_effect": "NONE",
            "next_action_authority": "LEARNING_ADAPTIVE_POLICY",
            "assessment_integrity_boundary": active_assessment,
            "accommodation_preserved": bool(kwargs.get("accommodation_active", False)),
        }
        return out
