from __future__ import annotations

from typing import Any, Dict

from .domain_general import DomainGeneralTutorDirector


class LegacyCompatibleDomainGeneralTutorDirector(DomainGeneralTutorDirector):
    """Runtime-only compatibility view for qualified courses predating domain_key.

    DomainGeneralLearningEngine._spec_for_course remains the identity authority.
    This adapter copies the loaded course and adds that resolved key only in memory,
    so the persisted course body/digest and diagnostic pins remain unchanged.
    """

    def _course(self, course_id: str) -> Dict[str, Any]:
        course = super()._course(course_id)
        if course.get("domain_key"):
            return course
        runtime_view = dict(course)
        runtime_view["domain_key"] = self._spec(course_id).domain_key
        return runtime_view
