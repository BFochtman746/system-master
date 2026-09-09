from copy import deepcopy
from real_book_admission import evaluate_admission

PKG = "ec0f5475c05cf6c11a75d139f2dbd131e6133d6abba9121be8b8ef18454b31df"
ACCEPT = "34be877efdbe08436177f4d5f996a8629aef781336fa6fa3e9ec086066c532c7"
REJECT = "a48378682ee15fd4b24bc97293ce43a37f096db254a0b78f715081a8aa8a59ee"


def valid_state():
    return {
        "decision": "ADMITTED",
        "admission_id": "LPE-RBQ-AGLO-001",
        "project_id": "AGLO",
        "book_id": "A-GATE-LEFT-OPEN",
        "source_ownership_or_authorization": "USER_OWNED_OR_AUTHORIZED",
        "source_reference": "A Gate Left Open - Master .docx",
        "source_package_digest": PKG,
        "qualification_scope": "CHAPTER",
        "baseline_version_id": "AGLO-BASELINE-REJECT-ALL-v1",
        "baseline_text_digest": REJECT,
        "revision_projection": "REJECT_ALL",
        "preservation_obligations": {
            "canon": "BIND",
            "authorial_intent": "BIND",
            "protected_language": "BIND",
            "pov_focalization": "BIND",
            "character_knowledge_integrity": "BIND",
            "explicit_user_constraints": "BIND",
            "required_ambiguity": "BIND",
            "historical_constraints": "WHEN_APPLICABLE",
            "theological_constraints": "WHEN_APPLICABLE"
        },
        "allowed_persistence": {
            "raw_manuscript_text": "TRANSIENT_PROCESSING_ONLY",
            "derived_metrics": "PERSIST_DERIVED_ONLY",
            "candidate_text": "TRANSIENT_PROCESSING_ONLY",
            "digests": "PERSIST",
            "evidence_references": "PERSIST",
            "learning_records": "PERSIST_NONRECONSTRUCTIVE"
        },
        "user_authorization": {
            "explicit": True,
            "objective": "LITERARY-PROSE-ENGINE-001-REAL-BOOK-QUALIFICATION",
            "qualification_only": True,
            "publication_authorized": False,
            "automatic_overwrite_authorized": False
        },
        "admitted_at": "2026-09-09T00:00:00Z",
        "candidate": {
            "tracked_changes": {
                "canonical_projection_ratified": True,
                "accept_all_narrative_sha256": ACCEPT,
                "reject_all_narrative_sha256": REJECT
            }
        },
        "named_author_target": False,
        "universal_prose_score": False
    }


def blocked(name, mutate, reason_contains=None):
    s = valid_state()
    mutate(s)
    r = evaluate_admission(s)
    ok = r["authorized"] is False
    if reason_contains:
        ok = ok and any(reason_contains in x for x in r.get("reasons", []))
    return {"case_id": name, "pass": ok, "standing": r["standing"], "reasons": r.get("reasons", [])}


results = []
r = evaluate_admission(valid_state())
results.append({"case_id": "valid_reject_all_admission", "pass": r["authorized"] is True, "standing": r["standing"]})

s = valid_state(); s["revision_projection"] = "ACCEPT_ALL"; s["baseline_version_id"] = "AGLO-BASELINE-ACCEPT-ALL-v1"; s["baseline_text_digest"] = ACCEPT
r = evaluate_admission(s)
results.append({"case_id": "valid_accept_all_when_explicitly_ratified", "pass": r["authorized"] is True, "standing": r["standing"]})

results.append(blocked("not_admitted", lambda s: s.__setitem__("decision", "NOT_ADMITTED"), "EXPLICIT_ADMISSION_REQUIRED"))
results.append(blocked("missing_baseline_text_digest", lambda s: s.__setitem__("baseline_text_digest", None), "BASELINE_TEXT_DIGEST"))
results.append(blocked("bad_package_digest", lambda s: s.__setitem__("source_package_digest", "bad"), "INVALID_SOURCE_PACKAGE_DIGEST"))
results.append(blocked("bad_baseline_digest", lambda s: s.__setitem__("baseline_text_digest", "bad"), "INVALID_BASELINE_TEXT_DIGEST"))
results.append(blocked("projection_not_ratified", lambda s: s["candidate"]["tracked_changes"].__setitem__("canonical_projection_ratified", False), "CANONICAL_TRACKED_CHANGE_PROJECTION_NOT_RATIFIED"))
results.append(blocked("reject_all_digest_mismatch", lambda s: s.__setitem__("baseline_text_digest", ACCEPT), "REJECT_ALL_BASELINE_DIGEST_MISMATCH"))

def mixed_without_manifest(s):
    s["revision_projection"] = "MIXED_EXACT"
    s["baseline_text_digest"] = "1" * 64
results.append(blocked("mixed_exact_needs_manifest", mixed_without_manifest, "MIXED_EXACT_PROJECTION_MANIFEST_REQUIRED"))
results.append(blocked("ownership_missing", lambda s: s.__setitem__("source_ownership_or_authorization", "UNKNOWN"), "USER_OWNED_OR_AUTHORIZED_REQUIRED"))
results.append(blocked("explicit_authorization_missing", lambda s: s["user_authorization"].__setitem__("explicit", False), "EXPLICIT_USER_AUTHORIZATION_REQUIRED"))
results.append(blocked("authorization_wrong_objective", lambda s: s["user_authorization"].__setitem__("objective", "OTHER"), "AUTHORIZATION_OBJECTIVE_MISMATCH"))
results.append(blocked("publication_boundary_broken", lambda s: s["user_authorization"].__setitem__("publication_authorized", True), "PUBLICATION_MUST_REMAIN_UNAUTHORIZED"))
results.append(blocked("overwrite_boundary_broken", lambda s: s["user_authorization"].__setitem__("automatic_overwrite_authorized", True), "AUTOMATIC_OVERWRITE_MUST_REMAIN_UNAUTHORIZED"))
results.append(blocked("invalid_scope", lambda s: s.__setitem__("qualification_scope", "EVERYTHING"), "INVALID_QUALIFICATION_SCOPE"))
results.append(blocked("named_author_target", lambda s: s.__setitem__("named_author_target", "Author X"), "NAMED_AUTHOR_TARGET_FORBIDDEN"))
results.append(blocked("universal_score", lambda s: s.__setitem__("universal_prose_score", 0.9), "UNIVERSAL_PROSE_SCORE_FORBIDDEN"))
results.append(blocked("raw_text_repo_persistence", lambda s: s["allowed_persistence"].__setitem__("raw_manuscript_text", "REPOSITORY"), "RAW_MANUSCRIPT_REPOSITORY_PERSISTENCE_FORBIDDEN"))
results.append(blocked("candidate_repo_persistence", lambda s: s["allowed_persistence"].__setitem__("candidate_text", "REPOSITORY"), "CANDIDATE_TEXT_REPOSITORY_PERSISTENCE_FORBIDDEN"))
results.append(blocked("missing_canon_preservation", lambda s: s["preservation_obligations"].pop("canon"), "PRESERVATION_OBLIGATIONS_MISSING"))
results.append(blocked("missing_learning_persistence", lambda s: s["allowed_persistence"].pop("learning_records"), "PERSISTENCE_POLICY_MISSING"))

s = valid_state(); s["revision_projection"] = "NO_TRACKED_CHANGES"; s["candidate"] = {}; s["baseline_text_digest"] = "2" * 64
r = evaluate_admission(s)
results.append({"case_id": "valid_no_tracked_changes_source", "pass": r["authorized"] is True, "standing": r["standing"]})

r1 = evaluate_admission(valid_state()); r2 = evaluate_admission(deepcopy(valid_state()))
results.append({"case_id": "deterministic", "pass": r1 == r2, "standing": r1["standing"]})

all_pass = all(x["pass"] for x in results)
print(f"REAL-BOOK ADMISSION FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
if not all_pass:
    print([x for x in results if not x["pass"]])
    raise SystemExit(1)
