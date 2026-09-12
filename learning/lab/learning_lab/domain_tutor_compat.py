from __future__ import annotations

from types import MethodType
from typing import Any, Dict

from .adaptive_mastery_binding import (
    _s03_bound_compute_projection,
    install_s04_adaptive_mastery_binding,
)
from .domain_general import DomainGeneralTutorDirector
from .policy_governed_tutor import InstructionalPolicyGovernanceMixin


def bind_s04_adaptive_runtime_engine(engine):
    """Bind the qualified S03 mastery evaluator to one S04 runtime engine instance.

    S04 adaptation must consume S03 mastery truth, but importing the tutoring
    compatibility layer must never mutate AdaptiveLearningEngine or its subclasses
    process-wide.  The pre-S04 projection method is retained on the instance for
    provenance/debugging only; no predecessor class authority is replaced.

    The legacy install_s04_adaptive_mastery_binding symbol remains imported above
    as the historical implementation marker, but it is deliberately not invoked:
    class-wide installation would violate the frozen cumulative-authority boundary.
    """
    if engine.__dict__.get("_s04_s03_mastery_binding_installed", False):
        return engine
    engine._s04_prebinding_compute_projection = engine._compute_projection
    engine._compute_projection = MethodType(_s03_bound_compute_projection, engine)
    engine._s04_s03_mastery_binding_installed = True
    engine._s04_s03_mastery_binding_scope = "INSTANCE_ONLY"
    return engine


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

    The associated engine receives the S04-to-S03 mastery binding on this instance
    only.  Other Learning engines in the same process retain their frozen behavior.
    """

    def __init__(self, repo, engine):
        bind_s04_adaptive_runtime_engine(engine)
        super().__init__(repo, engine)

    def _course(self, course_id: str) -> Dict[str, Any]:
        course = super()._course(course_id)
        if course.get("domain_key"):
            return course
        runtime_view = dict(course)
        runtime_view["domain_key"] = self._spec(course_id).domain_key
        return runtime_view
