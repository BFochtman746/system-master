import re

HEX64 = re.compile(r"^[0-9a-f]{64}$")
SCOPES = {"PASSAGE", "SCENE", "CHAPTER", "MULTI_CHAPTER_SAMPLE", "FULL_BOOK"}
PROJECTIONS = {"NO_TRACKED_CHANGES", "ACCEPT_ALL", "REJECT_ALL", "MIXED_EXACT"}
PRESERVATION_KEYS = {
    "canon",
    "authorial_intent",
    "protected_language",
    "pov_focalization",
    "character_knowledge_integrity",
    "explicit_user_constraints",
    "required_ambiguity",
    "historical_constraints",
    "theological_constraints",
}
PERSISTENCE_KEYS = {
    "raw_manuscript_text",
    "derived_metrics",
    "candidate_text",
    "digests",
    "evidence_references",
    "learning_records",
}


def _present(value):
    return value is not None and value != "" and value != [] and value != {}


def _digest_ok(value):
    return isinstance(value, str) and HEX64.fullmatch(value) is not None


def evaluate_admission(state):
    reasons = []
    decision = state.get("decision", state.get("standing", "NOT_ADMITTED"))
    if decision != "ADMITTED":
        return {
            "authorized": False,
            "standing": "BLOCKED_NOT_ADMITTED",
            "reasons": ["EXPLICIT_ADMISSION_REQUIRED"],
        }

    required = [
        "admission_id",
        "project_id",
        "book_id",
        "source_ownership_or_authorization",
        "source_reference",
        "source_package_digest",
        "qualification_scope",
        "baseline_version_id",
        "baseline_text_digest",
        "revision_projection",
        "preservation_obligations",
        "allowed_persistence",
        "user_authorization",
        "admitted_at",
    ]
    missing = [key for key in required if not _present(state.get(key))]
    if missing:
        reasons.append("MISSING_REQUIRED_FIELDS:" + ",".join(sorted(missing)))

    if state.get("source_ownership_or_authorization") != "USER_OWNED_OR_AUTHORIZED":
        reasons.append("USER_OWNED_OR_AUTHORIZED_REQUIRED")
    if not _digest_ok(state.get("source_package_digest")):
        reasons.append("INVALID_SOURCE_PACKAGE_DIGEST")
    if not _digest_ok(state.get("baseline_text_digest")):
        reasons.append("INVALID_BASELINE_TEXT_DIGEST")
    if state.get("qualification_scope") not in SCOPES:
        reasons.append("INVALID_QUALIFICATION_SCOPE")
    if state.get("revision_projection") not in PROJECTIONS:
        reasons.append("INVALID_REVISION_PROJECTION")

    auth = state.get("user_authorization")
    if not isinstance(auth, dict) or auth.get("explicit") is not True:
        reasons.append("EXPLICIT_USER_AUTHORIZATION_REQUIRED")
    else:
        if auth.get("objective") != "LITERARY-PROSE-ENGINE-001-REAL-BOOK-QUALIFICATION":
            reasons.append("AUTHORIZATION_OBJECTIVE_MISMATCH")
        if auth.get("qualification_only") is not True:
            reasons.append("QUALIFICATION_ONLY_BOUNDARY_REQUIRED")
        if auth.get("publication_authorized") is not False:
            reasons.append("PUBLICATION_MUST_REMAIN_UNAUTHORIZED")
        if auth.get("automatic_overwrite_authorized") is not False:
            reasons.append("AUTOMATIC_OVERWRITE_MUST_REMAIN_UNAUTHORIZED")

    preservation = state.get("preservation_obligations")
    if not isinstance(preservation, dict):
        reasons.append("PRESERVATION_OBLIGATIONS_REQUIRED")
    else:
        missing_preservation = sorted(key for key in PRESERVATION_KEYS if key not in preservation or preservation[key] is None)
        if missing_preservation:
            reasons.append("PRESERVATION_OBLIGATIONS_MISSING:" + ",".join(missing_preservation))

    persistence = state.get("allowed_persistence")
    if not isinstance(persistence, dict):
        reasons.append("ALLOWED_PERSISTENCE_REQUIRED")
    else:
        missing_persistence = sorted(key for key in PERSISTENCE_KEYS if key not in persistence)
        if missing_persistence:
            reasons.append("PERSISTENCE_POLICY_MISSING:" + ",".join(missing_persistence))
        if persistence.get("raw_manuscript_text") == "REPOSITORY":
            reasons.append("RAW_MANUSCRIPT_REPOSITORY_PERSISTENCE_FORBIDDEN")
        if persistence.get("candidate_text") == "REPOSITORY":
            reasons.append("CANDIDATE_TEXT_REPOSITORY_PERSISTENCE_FORBIDDEN")

    if state.get("named_author_target") not in (None, False):
        reasons.append("NAMED_AUTHOR_TARGET_FORBIDDEN")
    if state.get("universal_prose_score") not in (None, False):
        reasons.append("UNIVERSAL_PROSE_SCORE_FORBIDDEN")

    candidate = state.get("candidate") or {}
    tracked = candidate.get("tracked_changes") or {}
    if tracked:
        if tracked.get("canonical_projection_ratified") is not True:
            reasons.append("CANONICAL_TRACKED_CHANGE_PROJECTION_NOT_RATIFIED")
        projection = state.get("revision_projection")
        baseline_digest = state.get("baseline_text_digest")
        if projection == "ACCEPT_ALL":
            expected = tracked.get("accept_all_narrative_sha256")
            if expected and baseline_digest != expected:
                reasons.append("ACCEPT_ALL_BASELINE_DIGEST_MISMATCH")
        elif projection == "REJECT_ALL":
            expected = tracked.get("reject_all_narrative_sha256")
            if expected and baseline_digest != expected:
                reasons.append("REJECT_ALL_BASELINE_DIGEST_MISMATCH")
        elif projection == "MIXED_EXACT":
            if not _digest_ok(state.get("revision_projection_manifest_digest")):
                reasons.append("MIXED_EXACT_PROJECTION_MANIFEST_REQUIRED")

    if reasons:
        return {
            "authorized": False,
            "standing": "BLOCKED_ADMISSION_INVALID",
            "reasons": sorted(set(reasons)),
        }

    return {
        "authorized": True,
        "standing": "ADMITTED_FOR_QUALIFICATION_ONLY",
        "reasons": [],
        "project_id": state["project_id"],
        "book_id": state["book_id"],
        "baseline_version_id": state["baseline_version_id"],
        "baseline_text_digest": state["baseline_text_digest"],
        "qualification_scope": state["qualification_scope"],
        "revision_projection": state["revision_projection"],
    }
