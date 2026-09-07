from __future__ import annotations

from typing import Any, Dict, List

from .repository import digest


PROFESSIONAL_QUALITY_PROFILE_VERSION = "PROFESSIONAL-COURSE-QUALITY-V1"

PROFESSIONAL_QUALITY_PROFILE: Dict[str, Any] = {
    "profile_id": PROFESSIONAL_QUALITY_PROFILE_VERSION,
    "claim_boundary": "INTERNAL_PROFESSIONAL_RIGOR_GATE_NOT_ACCREDITATION_OR_COLLEGE_CREDIT",
    "reference_frameworks": [
        {
            "framework": "Quality Matters Higher Education Rubric",
            "purpose": "course-design alignment across objectives, assessment, materials, activities, support, accessibility/usability",
            "external_review_required": True,
        },
        {
            "framework": "ACE Learning Evaluations",
            "purpose": "college-level equivalency depends on faculty review of outcomes, graded assessments, academic level, depth and breadth",
            "external_review_required": True,
        },
        {
            "framework": "ANSI/ASTM E2659-24 / ANAB Certificate Accreditation",
            "purpose": "certificate-program quality includes instructional design, valid/reliable assessment, criterion-referenced passing standards and quality improvement",
            "external_review_required": True,
        },
    ],
    "mechanical_hard_gates": {
        "minimum_criteria": 2,
        "minimum_worked_examples_per_lesson": 2,
        "minimum_practice_items_per_lesson": 2,
        "minimum_admitted_primary_sources": 2,
        "minimum_transfer_task_diversity_for_required_skill": 2,
        "require_practice_mastery_retention_alignment": True,
        "require_independent_mastery_family": True,
        "require_distinct_retention_family": True,
        "require_all_material_claims_grounded": True,
        "require_human_pedagogy_review_boundary": True,
    },
    "human_or_external_review_dimensions": [
        "subject_matter_completeness",
        "academic_or_professional_level",
        "assessment_content_validity",
        "assessment_reliability",
        "workload_or_credit_hour_equivalency",
        "learner_support_quality",
        "accessibility_conformance",
        "real_learner_learning_gain",
        "external_certificate_or_college_credit recognition",
    ],
}


def _semantic_task_signature(task: Dict[str, Any]) -> str:
    return digest({"prompt": task.get("prompt"), "oracle_spec": task.get("oracle_spec")})


def evaluate_professional_quality(
    *,
    course: Dict[str, Any],
    dossier: Dict[str, Any],
    package: Dict[str, Any],
    profile: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    profile = profile or PROFESSIONAL_QUALITY_PROFILE
    gates = profile["mechanical_hard_gates"]
    failures: List[str] = []
    evidence: Dict[str, Any] = {}

    criteria = list(course.get("criteria", []))
    skills = list(course.get("skills", []))
    lessons = list(course.get("lessons", []))
    items = list(course.get("items", []))
    claims = list(dossier.get("claims", []))
    sources = [s for s in dossier.get("sources", []) if s.get("standing") == "ADMITTED"]
    admitted_claim_ids = {c.get("claim_id") for c in claims}

    if len(criteria) < int(gates["minimum_criteria"]):
        failures.append("INSUFFICIENT_CRITERIA_DEPTH")

    criterion_ids = {c["criterion_id"] for c in criteria}
    skill_by_id = {s["skill_id"]: s for s in skills}
    lesson_by_skill = {l["skill_id"]: l for l in lessons}
    item_by_id = {i["item_id"]: i for i in items}

    alignment: Dict[str, Any] = {}
    for criterion_id in sorted(criterion_ids):
        criterion = next(c for c in criteria if c["criterion_id"] == criterion_id)
        sid = criterion["skill_id"]
        criterion_items = [i for i in items if i["criterion_id"] == criterion_id]
        modes = {i["mode"] for i in criterion_items}
        row = {
            "skill_exists": sid in skill_by_id,
            "lesson_exists": sid in lesson_by_skill,
            "practice": "PRACTICE" in modes,
            "mastery": "MASTERY_CHECK" in modes,
            "retention": "RETENTION_CHECK" in modes,
        }
        alignment[criterion_id] = row
        if gates["require_practice_mastery_retention_alignment"] and not all(row.values()):
            failures.append("OUTCOME_ASSESSMENT_ALIGNMENT_GAP:" + criterion_id)
    evidence["criterion_alignment"] = alignment

    lesson_evidence = {}
    for lesson in lessons:
        worked = len(lesson.get("worked_examples", []))
        practice = len(lesson.get("practice_item_ids", []))
        lesson_evidence[lesson["lesson_id"]] = {"worked_examples": worked, "practice_items": practice}
        if worked < int(gates["minimum_worked_examples_per_lesson"]):
            failures.append("INSUFFICIENT_WORKED_EXAMPLES:" + lesson["lesson_id"])
        if practice < int(gates["minimum_practice_items_per_lesson"]):
            failures.append("INSUFFICIENT_PRACTICE:" + lesson["lesson_id"])
        if any(pid not in item_by_id for pid in lesson.get("practice_item_ids", [])):
            failures.append("LESSON_PRACTICE_REFERENCE_MISSING:" + lesson["lesson_id"])
    evidence["lesson_depth"] = lesson_evidence

    if len(sources) < int(gates["minimum_admitted_primary_sources"]):
        failures.append("INSUFFICIENT_ADMITTED_PRIMARY_SOURCES")
    evidence["admitted_source_count"] = len(sources)

    material_refs: List[str] = []
    for lesson in lessons:
        material_refs.extend(lesson.get("claim_refs", []))
        for span in lesson.get("grounding_spans", []):
            material_refs.extend(span.get("claim_refs", []))
    for item in items:
        material_refs.extend(item.get("claim_refs", []))
        for span in item.get("grounding_spans", []):
            material_refs.extend(span.get("claim_refs", []))
    for task in package.get("maintenance_tasks", []) + package.get("transfer_tasks", []):
        material_refs.extend(task.get("claim_refs", []))
    unknown = sorted(set(material_refs) - admitted_claim_ids)
    if gates["require_all_material_claims_grounded"] and unknown:
        failures.append("UNGROUNDED_MATERIAL_CLAIMS:" + ",".join(unknown))
    evidence["grounding"] = {"material_refs": len(material_refs), "unknown_claim_refs": unknown}

    family_evidence = {}
    for criterion_id in sorted(criterion_ids):
        by_mode = {
            mode: {i["family_id"] for i in items if i["criterion_id"] == criterion_id and i["mode"] == mode}
            for mode in ("PRACTICE", "MASTERY_CHECK", "RETENTION_CHECK")
        }
        family_evidence[criterion_id] = {k: sorted(v) for k, v in by_mode.items()}
        if gates["require_independent_mastery_family"] and by_mode["PRACTICE"] & by_mode["MASTERY_CHECK"]:
            failures.append("PRACTICE_MASTERY_FAMILY_CONTAMINATION:" + criterion_id)
        if gates["require_distinct_retention_family"] and by_mode["MASTERY_CHECK"] & by_mode["RETENTION_CHECK"]:
            failures.append("MASTERY_RETENTION_FAMILY_CONTAMINATION:" + criterion_id)
    evidence["assessment_family_independence"] = family_evidence

    transfer_required = set(package.get("transfer_required_skills", []))
    transfer_evidence = {}
    for sid in sorted(transfer_required):
        signatures = {
            _semantic_task_signature(t)
            for t in package.get("transfer_tasks", [])
            if t.get("skill_id") == sid
        }
        transfer_evidence[sid] = len(signatures)
        if len(signatures) < int(gates["minimum_transfer_task_diversity_for_required_skill"]):
            failures.append("INSUFFICIENT_TRANSFER_DIVERSITY:" + sid)
    evidence["transfer_task_diversity"] = transfer_evidence

    pedagogy_review = package.get("pedagogy_review", [])
    review_boundary_ok = bool(pedagogy_review) and all(
        x.get("standing") == "MODEL_PROPOSAL_HUMAN_REVIEW_REQUIRED" for x in pedagogy_review
    )
    if gates["require_human_pedagogy_review_boundary"] and not review_boundary_ok:
        failures.append("HUMAN_PEDAGOGY_REVIEW_BOUNDARY_MISSING")
    evidence["human_review_boundary"] = review_boundary_ok

    return {
        "profile_id": profile["profile_id"],
        "profile_digest": digest(profile),
        "status": "PASS" if not failures else "FAIL",
        "failures": failures,
        "evidence": evidence,
        "external_recognition": "NOT_CLAIMED",
        "standing": (
            "PROFESSIONAL_COURSE_QUALITY_STRUCTURE_GATE_PASS_EXTERNAL_REVIEW_REQUIRED"
            if not failures
            else "PROFESSIONAL_COURSE_QUALITY_GATE_FAILED"
        ),
    }
