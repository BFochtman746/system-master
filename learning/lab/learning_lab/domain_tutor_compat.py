from __future__ import annotations

from typing import Any, Dict

from .adaptive_mastery_binding import install_s04_adaptive_mastery_binding
from .domain_general import DomainGeneralTutorDirector
from .policy_governed_tutor import InstructionalPolicyGovernanceMixin


# S04 authority binding is installed before journey/runtime components instantiate
# AdaptiveLearningEngine subclasses. It replaces only the adaptive engine's copied
# mastery calculation with the already-qualified S03 evaluator; adaptation retains
# freshness/revalidation scheduling but gains no mastery writer authority.
install_s04_adaptive_mastery_binding()


class LegacyCompatibleDomainGeneralTutorDirector(
    InstructionalPolicyGovernanceMixin, DomainGeneralTutorDirector
):
    """Runtime-only compatibility view for qualified courses predating domain_key.

    DomainGeneralLearningEngine._spec_for_course remains the identity authority.
    This adapter copies the loaded course and adds that resolved key only in memory,
    so the persisted course body/digest and diagnostic pins remain unchanged.

    S04 additionally applies the Curriculum instructional-policy governance mixin.
    The underlying domain tutor still realizes grounded content; the mixin only
    enforces and annotates allowed support semantics and never writes mastery.
    """

    def _course(self, course_id: str) -> Dict[str, Any]:
        course = super()._course(course_id)
        if course.get("domain_key"):
            return course
        runtime_view = dict(course)
        runtime_view["domain_key"] = self._spec(course_id).domain_key
        return runtime_view
