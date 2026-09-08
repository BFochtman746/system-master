#!/usr/bin/env python3
"""Deterministic STEP-B literary source admission / derivation reference implementation.

Zero dependencies. This is a qualification implementation, not a production storage service.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

RIGHTS_EVIDENCE = {
    "PUBLIC_DOMAIN_FULL_TEXT": {"PUBLIC_DOMAIN_DETERMINATION"},
    "LICENSED_FULL_TEXT": {"LICENSE_GRANT"},
    "USER_OWNED_OR_AUTHORIZED": {"OWNERSHIP_ATTESTATION", "EXPLICIT_AUTHORIZATION"},
    "ANALYSIS_ONLY_NO_FULL_TEXT": {"ANALYSIS_ONLY_RESTRICTION"},
}
FULL_TEXT_RIGHTS = {
    "PUBLIC_DOMAIN_FULL_TEXT",
    "LICENSED_FULL_TEXT",
    "USER_OWNED_OR_AUTHORIZED",
}
ANALYSIS_ONLY = "ANALYSIS_ONLY_NO_FULL_TEXT"
RAW_FIELD_NAMES = {
    "raw_text", "full_text", "passage_text", "source_excerpt", "quote",
    "prompt_payload", "embedding_payload",
}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_bibliographic(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value).strip())


def normalize_text_for_equivalence(value: str) -> str:
    # Preserve punctuation, paragraph boundaries, dialect, capitalization.
    # Only Unicode normalization and newline canonicalization are allowed.
    return unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n")


def stable_id(prefix: str, material: str) -> str:
    return f"{prefix}-{sha256_hex(material.encode('utf-8'))[:32]}"


def identity_bundle(meta: Dict[str, Any], content: str) -> Dict[str, str]:
    title = normalize_bibliographic(meta["canonical_title"])
    creator = normalize_bibliographic(meta.get("creator_stable_id", "unknown"))
    year = str(meta.get("original_publication_year", "unknown"))
    work_id = stable_id("WORK", f"{title}|{creator}|{year}")

    edition_material = "|".join([
        work_id,
        normalize_bibliographic(meta.get("publisher", "unknown")),
        str(meta.get("publication_date", "unknown")),
        normalize_bibliographic(meta.get("edition_statement", "unknown")),
        normalize_bibliographic(meta.get("contributors", "unknown")),
        normalize_bibliographic(meta.get("standard_identifier", "unknown")),
    ])
    edition_id = stable_id("EDITION", edition_material)
    byte_digest = sha256_hex(content.encode("utf-8"))
    text_digest = sha256_hex(normalize_text_for_equivalence(content).encode("utf-8"))
    source_material = "|".join([
        edition_id,
        normalize_bibliographic(meta["provider"]),
        normalize_bibliographic(meta["locator"]),
        byte_digest,
    ])
    source_id = stable_id("SOURCE", source_material)
    return {
        "work_id": work_id,
        "edition_id": edition_id,
        "source_id": source_id,
        "byte_digest": byte_digest,
        "normalized_text_digest": text_digest,
    }


def passage_identity(source_id: str, structural_locator: str, passage_text: str) -> Dict[str, str]:
    normalized = normalize_text_for_equivalence(passage_text)
    digest = sha256_hex(normalized.encode("utf-8"))
    pid = stable_id("PASSAGE", f"{source_id}|{structural_locator}|{digest}")
    return {"passage_id": pid, "passage_digest": digest}


def validate_manuscript_version(record: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    required = {
        "project_id", "book_id", "version_id", "maturity_state", "authority_state",
        "canon_state", "provenance", "relation_to_other_versions", "user_approval_state",
    }
    missing = sorted(required - set(record))
    if missing:
        errors.append(f"missing manuscript version fields: {missing}")
        return errors
    maturity = {"DRAFT", "REVIEW_COPY", "EDITOR_READY", "MASTERED", "CANONICAL", "UNKNOWN"}
    authority = {"NON_AUTHORITATIVE", "WORKING_AUTHORITY", "AUTHORITATIVE", "UNKNOWN"}
    canon = {"NON_CANONICAL", "PROVISIONAL_CANON", "CANONICAL", "UNKNOWN"}
    approval = {"UNREVIEWED", "PARTIALLY_APPROVED", "APPROVED", "REJECTED", "UNKNOWN"}
    if record["maturity_state"] not in maturity:
        errors.append("invalid manuscript maturity_state")
    if record["authority_state"] not in authority:
        errors.append("invalid manuscript authority_state")
    if record["canon_state"] not in canon:
        errors.append("invalid manuscript canon_state")
    if record["user_approval_state"] not in approval:
        errors.append("invalid manuscript user_approval_state")
    return errors


def validate_rights(request: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    rc = request.get("rights_class")
    if rc not in RIGHTS_EVIDENCE:
        return ["unknown_or_ambiguous_rights"]
    evidence = request.get("rights_evidence", {})
    evidence_type = evidence.get("evidence_type")
    if evidence_type not in RIGHTS_EVIDENCE[rc]:
        errors.append("rights_evidence_not_bound_to_class")
    for field in ("jurisdiction", "evidence_locator", "verified_at", "verified_by", "scope_note"):
        value = evidence.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"rights_evidence_missing_{field}")
    if isinstance(evidence.get("scope_note"), str) and len(evidence["scope_note"].strip()) < 10:
        errors.append("rights_evidence_scope_note_too_short")

    permitted = set(request.get("permitted_uses", []))
    policy = request.get("persistence_policy", {})
    if rc == ANALYSIS_ONLY:
        if policy.get("full_text_allowed") is not False:
            errors.append("analysis_only_full_text_must_be_false")
        if policy.get("passage_text_allowed") is not False:
            errors.append("analysis_only_passage_text_must_be_false")
        if policy.get("raw_text_retention") not in {"TRANSIENT_PROCESSING_ONLY", "NONE"}:
            errors.append("analysis_only_raw_retention_invalid")
        if policy.get("storage_location_class") not in {"DERIVED_ONLY_STORE", "NO_RAW_TEXT_STORE"}:
            errors.append("analysis_only_storage_invalid")
        if "PERSIST_FULL_TEXT" in permitted or "PERSIST_PASSAGES" in permitted:
            errors.append("analysis_only_persistent_raw_use_invalid")
    return errors


def decide_admission(request: Dict[str, Any]) -> Tuple[str, List[str]]:
    errors = validate_rights(request)
    if errors:
        return "REJECT", errors

    rc = request["rights_class"]
    policy = request["persistence_policy"]
    permitted = set(request.get("permitted_uses", []))

    if rc == ANALYSIS_ONLY:
        if "CREATE_DERIVED_ANALYSIS" not in permitted and "PERSIST_ABSTRACT_ANALYSIS_ONLY" not in permitted:
            return "REJECT", ["analysis_only_no_derived_use_authorized"]
        return "ADMIT_DERIVED_ONLY", []

    if (
        rc in FULL_TEXT_RIGHTS
        and policy.get("full_text_allowed") is True
        and policy.get("raw_text_retention") == "PERSIST"
        and policy.get("storage_location_class") in {"AUTHORIZED_CORPUS", "RESTRICTED_PROJECT_VAULT"}
        and "PERSIST_FULL_TEXT" in permitted
    ):
        return "ADMIT_FULL_TEXT", []

    if policy.get("derived_analysis_allowed") is True and "CREATE_DERIVED_ANALYSIS" in permitted:
        return "ADMIT_RESTRICTED", []

    return "REJECT", ["no_authorized_admission_path"]


def nonreconstructive_summary(text: str) -> Dict[str, Any]:
    words = re.findall(r"\b[\w'-]+\b", text, flags=re.UNICODE)
    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
    lengths = [len(re.findall(r"\b[\w'-]+\b", s, flags=re.UNICODE)) for s in sentences]
    return {
        "artifact_type": "TECHNIQUE_PROFILE",
        "feature_scope": "PASSAGE",
        "features": {
            "char_count": len(text),
            "word_count": len(words),
            "paragraph_count": len(paragraphs),
            "sentence_count": len(sentences),
            "mean_sentence_words": round(sum(lengths) / len(lengths), 3) if lengths else 0.0,
            "question_mark_count": text.count("?"),
            "exclamation_mark_count": text.count("!"),
        },
        "named_author_target": False,
        "author_identity_feature_allowed": False,
    }


def contains_prohibited_raw_field(obj: Any) -> bool:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in RAW_FIELD_NAMES:
                return True
            if contains_prohibited_raw_field(v):
                return True
    elif isinstance(obj, list):
        return any(contains_prohibited_raw_field(v) for v in obj)
    return False


def contains_reconstructive_substring(source: str, persistent_obj: Any, threshold: int = 40) -> bool:
    rendered = json.dumps(persistent_obj, sort_keys=True, ensure_ascii=False)
    normalized_source = normalize_text_for_equivalence(source)
    # Test sliding windows from source; threshold intentionally conservative for fixtures.
    if len(normalized_source) < threshold:
        return normalized_source in rendered if normalized_source else False
    for start in range(0, len(normalized_source) - threshold + 1, max(1, threshold // 4)):
        if normalized_source[start:start + threshold] in rendered:
            return True
    return False


@dataclass
class CorpusIndex:
    byte_digest_to_payload: Dict[str, str]
    text_digest_to_weight_key: Dict[str, str]

    @classmethod
    def empty(cls) -> "CorpusIndex":
        return cls({}, {})


def admit_source(request: Dict[str, Any], content: str, index: Optional[CorpusIndex] = None) -> Dict[str, Any]:
    index = index or CorpusIndex.empty()
    decision, reasons = decide_admission(request)
    ids = identity_bundle(request["identity_metadata"], content)
    ledger_id = request["ledger_id"]

    result: Dict[str, Any] = {
        "ledger_id": ledger_id,
        "decision": decision,
        "decision_reasons": reasons,
        "identity": ids,
        "rights_class": request.get("rights_class", "UNKNOWN"),
        "source_class": request.get("source_class", "REFERENCE"),
        "persistence": {},
        "dedup": {},
    }

    if request.get("source_class") == "USER_MANUSCRIPT":
        manuscript = request.get("manuscript_version") or {}
        manuscript_errors = validate_manuscript_version(manuscript)
        if request.get("rights_class") != "USER_OWNED_OR_AUTHORIZED":
            manuscript_errors.append("user_manuscript_requires_user_owned_or_authorized_rights")
        if manuscript_errors:
            result["decision"] = "REJECT"
            result["decision_reasons"] = sorted(set(result["decision_reasons"] + manuscript_errors))
        result["manuscript_version"] = manuscript

    if result["decision"] == "REJECT":
        result["persistence"] = {
            "raw_text_persisted": False,
            "derived_artifact_persisted": False,
            "storage_location_class": "NO_RAW_TEXT_STORE",
        }
        return result

    byte_digest = ids["byte_digest"]
    text_digest = ids["normalized_text_digest"]
    if byte_digest in index.byte_digest_to_payload:
        payload_id = index.byte_digest_to_payload[byte_digest]
        exact_duplicate = True
    else:
        payload_id = stable_id("PAYLOAD", byte_digest)
        index.byte_digest_to_payload[byte_digest] = payload_id
        exact_duplicate = False

    if text_digest in index.text_digest_to_weight_key:
        weight_key = index.text_digest_to_weight_key[text_digest]
        text_equivalent_duplicate = True
    else:
        weight_key = stable_id("WEIGHT", text_digest)
        index.text_digest_to_weight_key[text_digest] = weight_key
        text_equivalent_duplicate = False

    result["dedup"] = {
        "payload_id": payload_id,
        "exact_duplicate": exact_duplicate,
        "weight_key": weight_key,
        "text_equivalent_duplicate": text_equivalent_duplicate,
        "retrieval_weight_multiplier": 0 if text_equivalent_duplicate else 1,
    }

    if result["decision"] == "ADMIT_FULL_TEXT":
        result["persistence"] = {
            "raw_text_persisted": True,
            "storage_location_class": request["persistence_policy"]["storage_location_class"],
            "payload_id": payload_id,
            "content": content,
        }
    elif result["decision"] == "ADMIT_RESTRICTED":
        result["persistence"] = {
            "raw_text_persisted": False,
            "storage_location_class": request["persistence_policy"].get("storage_location_class", "DERIVED_ONLY_STORE"),
            "derived_artifact": nonreconstructive_summary(content),
        }
    else:
        artifact = nonreconstructive_summary(content)
        artifact.update({
            "rights_projection": "DERIVED_ONLY_NONRECONSTRUCTIVE",
            "source_ledger_ids": [ledger_id],
            "content_digest": sha256_hex(json.dumps(artifact, sort_keys=True).encode("utf-8")),
        })
        result["persistence"] = {
            "raw_text_persisted": False,
            "storage_location_class": "DERIVED_ONLY_STORE",
            "derived_artifact": artifact,
        }
        if contains_prohibited_raw_field(result["persistence"]) or contains_reconstructive_substring(content, result["persistence"]):
            result["decision"] = "REJECT"
            result["decision_reasons"].append("nonreconstructive_check_failed")
            result["persistence"] = {
                "raw_text_persisted": False,
                "derived_artifact_persisted": False,
                "storage_location_class": "NO_RAW_TEXT_STORE",
            }
    return result


def assign_overlap_group(source_id: str, passages: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items = [dict(p) for p in passages]
    # Deterministic interval grouping for overlapping character spans within a source.
    ordered = sorted(enumerate(items), key=lambda x: (x[1]["start"], x[1]["end"]))
    current_end = -1
    group_no = -1
    assignments: Dict[int, str] = {}
    for idx, p in ordered:
        if p["start"] >= current_end:
            group_no += 1
            current_end = p["end"]
        else:
            current_end = max(current_end, p["end"])
        assignments[idx] = stable_id("OVERLAP", f"{source_id}|{group_no}")
    for idx, p in enumerate(items):
        p["overlap_group_id"] = assignments[idx]
    return items
