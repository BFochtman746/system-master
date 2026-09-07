from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Optional

from .engine import InjectedCrash
from .repository import Repository, digest

EXTERNAL_STANDARD_INGEST_VERSION = "EXTERNAL-STANDARD-INGEST-V1"
EXTERNAL_REQUIREMENT_SET_VERSION = "EXTERNAL-REQUIREMENT-SET-V1"
CERTIFICATION_READINESS_BLUEPRINT_VERSION = "CERTIFICATION-READINESS-BLUEPRINT-V1"
STANDARD_FRESHNESS_POLICY_VERSION = "EXTERNAL-STANDARD-FRESHNESS-V1"
UPDATE_TRAINING_DELTA_VERSION = "UPDATE-TRAINING-DELTA-V1"

COGNITIVE_LEVELS = {"REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"}
ASQ_SECTIONS = [
    ("I", "Overview: Six Sigma and the Organization", 11),
    ("II", "Define Phase", 20),
    ("III", "Measure Phase", 20),
    ("IV", "Analyze Phase", 18),
    ("V", "Improve Phase", 16),
    ("VI", "Control Phase", 15),
]

# A frozen structured extract of the currently published ASQ CSSGB Body of Knowledge.
# Titles/cognitive levels are represented as structure, not as a substitute for the official source.
ASQ_CSSGB_2022_REQUIREMENTS = [
    # I
    ("I.A.1","Value of Six Sigma","UNDERSTAND",3),("I.A.2","Organizational goals and Six Sigma projects","UNDERSTAND",3),
    ("I.A.3","Organizational drivers and metrics","UNDERSTAND",3),("I.B.1","Lean concepts","APPLY",3),
    ("I.B.2","Value stream mapping","UNDERSTAND",3),("I.C.1","Road maps for DfSS","UNDERSTAND",4),
    ("I.C.2","Basic failure mode and effects analysis (FMEA)","ANALYZE",4),("I.C.3","Design FMEA and process FMEA","APPLY",4),
    # II
    ("II.A.1","Project selection","UNDERSTAND",4),("II.A.2","Process elements","ANALYZE",4),("II.A.3","Benchmarking","UNDERSTAND",4),
    ("II.A.4","Process inputs and outputs (SIPOC)","ANALYZE",4),("II.A.5","Owners and stakeholders","APPLY",4),
    ("II.B.1","Customer identification","APPLY",4),("II.B.2","Customer data","APPLY",4),("II.B.3","Customer requirements","APPLY",4),
    ("II.C.1","Project methodology","APPLY",5),("II.C.2","Project charter","APPLY",5),("II.C.3","Project scope","APPLY",5),
    ("II.C.4","Project metrics","APPLY",5),("II.C.5","Project planning tools","APPLY",5),("II.C.6","Project documentation","APPLY",5),
    ("II.C.7","Project risk analysis and management","UNDERSTAND",5),("II.C.8","Project closure","APPLY",5),
    ("II.D.1","Management and planning tools","APPLY",5),("II.E.1","Process performance metrics","ANALYZE",5),
    ("II.E.2","Organizational communication","APPLY",5),("II.F.1","Team stages and dynamics","UNDERSTAND",5),
    ("II.F.2","Team roles and responsibilities","APPLY",6),("II.F.3","Team tools and decision-making concepts","APPLY",6),
    ("II.F.4","Team communication","APPLY",6),
    # III
    ("III.A.1","Process analysis and documentation","CREATE",6),("III.B.1","Basic probability concepts","UNDERSTAND",6),
    ("III.B.2","Central limit theorem","UNDERSTAND",6),("III.C.1","Statistical distributions","UNDERSTAND",6),
    ("III.D.1","Types of data and measurement scales","ANALYZE",6),("III.D.2","Sampling and data collection plans and methods","APPLY",6),
    ("III.D.3","Descriptive statistics","EVALUATE",6),("III.D.4","Graphical methods","CREATE",6),
    ("III.E.1","Measurement system analysis (MSA)","EVALUATE",6),("III.F.1","Process performance vs. process specifications","EVALUATE",7),
    ("III.F.2","Process capability studies","EVALUATE",7),("III.F.3","Process capability and performance indices","EVALUATE",7),
    ("III.F.4","Short-term vs. long-term capability and sigma shift","EVALUATE",7),
    # IV
    ("IV.A.1","Multi-vari studies","CREATE",7),("IV.A.2","Correlation and linear regression","EVALUATE",7),
    ("IV.B.1","Hypothesis testing basics","APPLY",7),("IV.B.2","Tests for means, variances, and proportions","ANALYZE",7),
    ("IV.C.1","Gap analysis","ANALYZE",7),("IV.C.2","Root cause analysis","ANALYZE",7),
    # V
    ("V.A.1","Design of experiments basic terms","UNDERSTAND",8),("V.A.2","DoE graphs and plots","APPLY",8),
    ("V.B.1","Implementation planning","APPLY",8),("V.C.1","Waste elimination","APPLY",8),
    ("V.C.2","Cycle-time reduction","ANALYZE",8),("V.C.3","Kaizen and kaizen blitz","APPLY",8),
    # VI
    ("VI.A.1","Statistical process control basics","ANALYZE",8),("VI.A.2","Rational subgrouping","UNDERSTAND",8),
    ("VI.A.3","Control charts","APPLY",8),("VI.B.1","Control plan","APPLY",8),("VI.B.2","Document control","UNDERSTAND",8),
    ("VI.B.3","Training plans","APPLY",8),("VI.B.4","Audits","REMEMBER",8),("VI.B.5","Plan-do-check-act (PDCA)","APPLY",8),
    ("VI.C.1","Total productive maintenance (TPM)","UNDERSTAND",8),("VI.C.2","Visual factory","UNDERSTAND",8),
]


def asq_cssgb_2022_standard(observed_at: int = 1788784860) -> Dict[str, Any]:
    sections = [{"section_id":sid,"title":title,"exam_question_weight":weight} for sid,title,weight in ASQ_SECTIONS]
    requirements = []
    for code,title,level,page in ASQ_CSSGB_2022_REQUIREMENTS:
        requirements.append({
            "requirement_id": f"ASQ-CSSGB-2022-{code}",
            "source_code": code,
            "section_id": code.split('.')[0],
            "title": title,
            "highest_cognitive_level": level,
            "source_page": page,
            "source_locator": f"ASQ CSSGB BoK 2022 p.{page} / {code}",
            "mapping_standing": "UNMAPPED",
        })
    packet = {
        "ingest_version": EXTERNAL_STANDARD_INGEST_VERSION,
        "standard_id": "ASQ-CSSGB-BOK-2022",
        "authority": "American Society for Quality (ASQ)",
        "authority_ref": "https://www.asq.org/cert/six-sigma-green-belt",
        "source_ref": "https://www.asq.org/cert/resource/pdf/certification/cssgb-cert-insert.pdf",
        "title": "ASQ Certified Six Sigma Green Belt (CSSGB) Body of Knowledge",
        "published_version_label": "2022 CSSGB BoK",
        "observed_current_at": int(observed_at),
        "capture_class": "AUTHORITATIVE_STRUCTURED_EXTRACT_FROM_LIVE_SOURCE",
        "source_bytes_archived": False,
        "source_structure_verified": True,
        "exam": {
            "computer_delivered_total_questions": 110,
            "computer_delivered_scored_questions": 100,
            "computer_delivered_unscored_questions": 10,
            "exam_minutes": 258,
            "open_book": True,
        },
        "eligibility_context": {
            "experience_years": 3,
            "education_waiver": False,
            "external_authority_controls_eligibility": True,
        },
        "sections": sections,
        "requirements": requirements,
        "cognitive_levels": ["REMEMBER","UNDERSTAND","APPLY","ANALYZE","EVALUATE","CREATE"],
        "limitations": [
            "STRUCTURED_EXTRACT_DOES_NOT_REPLACE_OFFICIAL_ASQ_SOURCE",
            "SYSTEM_MASTER_DOES_NOT_ISSUE_ASQ_CERTIFICATION",
            "BOK_SUBTEXT_IS_NOT_DECLARED_ALL_INCLUSIVE_BY_ASQ",
        ],
    }
    packet["standard_digest"] = digest(packet)
    return packet


def validate_external_standard(packet: Dict[str, Any]) -> Dict[str, Any]:
    p = copy.deepcopy(packet)
    stored = p.pop("standard_digest", None)
    failures: List[str] = []
    if not stored or stored != digest(p): failures.append("STANDARD_DIGEST_MISMATCH")
    if not packet.get("authority") or not packet.get("source_ref") or not packet.get("published_version_label"):
        failures.append("STANDARD_IDENTITY_INCOMPLETE")
    sections = packet.get("sections", [])
    if sum(int(x.get("exam_question_weight",0)) for x in sections) != 100:
        failures.append("EXAM_SECTION_WEIGHTS_NOT_100")
    if [x.get("section_id") for x in sections] != [x[0] for x in ASQ_SECTIONS]:
        failures.append("EXPECTED_SECTION_STRUCTURE_MISMATCH")
    reqs = packet.get("requirements", [])
    ids = [x.get("requirement_id") for x in reqs]
    if len(ids) != len(set(ids)) or any(not x for x in ids): failures.append("REQUIREMENT_ID_DUPLICATE_OR_MISSING")
    if any(x.get("highest_cognitive_level") not in COGNITIVE_LEVELS for x in reqs): failures.append("INVALID_COGNITIVE_LEVEL")
    if packet.get("standard_id") == "ASQ-CSSGB-BOK-2022" and len(reqs) != 66:
        failures.append("CSSGB_2022_EXPECTED_66_LEAF_REQUIREMENTS")
    return {"status":"PASS" if not failures else "FAIL", "failures":failures, "requirement_count":len(reqs), "section_count":len(sections), "standard_digest":stored}


def build_external_requirement_set(packet: Dict[str, Any]) -> Dict[str, Any]:
    v = validate_external_standard(packet)
    if v["status"] != "PASS": raise ValueError("EXTERNAL_STANDARD_INVALID:" + ",".join(v["failures"]))
    reqs=[]
    for item in packet["requirements"]:
        reqs.append({
            "requirement_id": item["requirement_id"],
            "external_source_code": item["source_code"],
            "title": item["title"],
            "highest_cognitive_level": item["highest_cognitive_level"],
            "source_locator": item["source_locator"],
            "mapping": {"standing":"UNMAPPED","local_competency_ref":None},
            "content_coverage": "NOT_MAPPED",
            "learner_evidence_coverage": "NOT_EVALUATED",
        })
    out={
        "version":EXTERNAL_REQUIREMENT_SET_VERSION,
        "requirement_set_id":"REQSET-"+packet["standard_id"],
        "external_standard_id":packet["standard_id"],
        "external_standard_digest":packet["standard_digest"],
        "owner_ref":packet["authority"],
        "owner_version":packet["published_version_label"],
        "sections":copy.deepcopy(packet["sections"]),
        "requirements":reqs,
        "external_certification_status":"NOT_MADE",
    }
    out["requirement_set_digest"]=digest(out)
    return out



def build_requirement_mapping_plan(packet: Dict[str, Any], requirement_set: Dict[str, Any]) -> Dict[str, Any]:
    if requirement_set.get("external_standard_digest") != packet.get("standard_digest"):
        raise ValueError("STANDARD_REQUIREMENT_SET_DIGEST_MISMATCH")
    rows=[]
    for r in requirement_set.get("requirements", []):
        rows.append({
            "external_requirement_id": r["requirement_id"],
            "derived_learning_target_id": "LT-" + r["requirement_id"],
            "title": r["title"],
            "target_cognitive_level": r["highest_cognitive_level"],
            "derivation_standing": "EXACT_DERIVATION_FROM_EXTERNAL_REQUIREMENT",
            "local_competency_mapping_standing": "UNMAPPED",
            "local_competency_ref": None,
            "consequential_equivalence_established": False,
            "deeper_skill_decomposition_standing": "DEFERRED_TO_COURSE_COMPILER_AND_REVIEW",
        })
    out={
        "version":"EXTERNAL-REQUIREMENT-MAPPING-PLAN-V1",
        "external_standard_id":packet["standard_id"],
        "external_standard_digest":packet["standard_digest"],
        "requirement_set_digest":requirement_set["requirement_set_digest"],
        "mappings":rows,
        "mapping_policy":[
            "EXACT_DERIVATION_DOES_NOT_PROVE_EQUIVALENCE_TO_AN_EXISTING_LOCAL_COMPETENCY",
            "AI_SIMILARITY_IS_PLANNING_ONLY",
            "CONSEQUENTIAL_EQUIVALENCE_REQUIRES_EXACT_OR_OWNER_APPROVED_MAPPING",
        ],
    }
    out["mapping_plan_digest"]=digest(out)
    return out


def apply_competency_mapping_snapshot(mapping_plan: Dict[str, Any], mapping_updates: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    allowed={"EXACT_SHARED_REF","OWNER_APPROVED_MAPPING_REF","AI_INFERRED_SIMILARITY","UNMAPPED"}
    byid={x["external_requirement_id"]:copy.deepcopy(x) for x in mapping_plan.get("mappings",[])}
    seen=set()
    for upd in mapping_updates:
        rid=upd.get("external_requirement_id")
        if rid not in byid: raise ValueError("UNKNOWN_EXTERNAL_REQUIREMENT_MAPPING")
        if rid in seen: raise ValueError("DUPLICATE_MAPPING_UPDATE")
        seen.add(rid)
        standing=upd.get("standing","UNMAPPED")
        if standing not in allowed: raise ValueError("INVALID_MAPPING_STANDING")
        ref=upd.get("local_competency_ref")
        if standing != "UNMAPPED" and not ref: raise ValueError("MAPPED_COMPETENCY_REF_REQUIRED")
        row=byid[rid]
        row["local_competency_mapping_standing"]=standing
        row["local_competency_ref"]=ref
        row["consequential_equivalence_established"]=standing in {"EXACT_SHARED_REF","OWNER_APPROVED_MAPPING_REF"}
    rows=[byid[k] for k in sorted(byid)]
    out={
        "version":"EXTERNAL-COMPETENCY-MAPPING-SNAPSHOT-V1",
        "mapping_plan_digest":mapping_plan["mapping_plan_digest"],
        "mappings":rows,
        "consequentially_mapped_count":sum(1 for x in rows if x["consequential_equivalence_established"]),
        "planning_only_mapping_count":sum(1 for x in rows if x["local_competency_mapping_standing"]=="AI_INFERRED_SIMILARITY"),
        "unmapped_count":sum(1 for x in rows if x["local_competency_mapping_standing"]=="UNMAPPED"),
    }
    out["mapping_snapshot_digest"]=digest(out)
    return out

def _evidence_profile_for_level(level: str) -> List[str]:
    if level in {"REMEMBER","UNDERSTAND"}:
        return ["INDEPENDENT_KNOWLEDGE_ASSESSMENT","DELAYED_RETENTION"]
    if level == "APPLY":
        return ["INDEPENDENT_APPLICATION_TASK","DELAYED_RETENTION","NOVEL_TRANSFER"]
    if level == "ANALYZE":
        return ["INDEPENDENT_SCENARIO_ANALYSIS","DELAYED_RETENTION","NOVEL_TRANSFER"]
    if level == "EVALUATE":
        return ["INDEPENDENT_JUDGMENT_TASK","RATIONALE_OR_DEFENSE","DELAYED_RETENTION","NOVEL_TRANSFER"]
    if level == "CREATE":
        return ["AUTHENTIC_CONSTRUCTED_ARTIFACT","INDEPENDENT_DEFENSE","DELAYED_RETENTION","NOVEL_TRANSFER"]
    return ["CONFIGURATION_REQUIRED"]


def build_certification_readiness_blueprint(packet: Dict[str, Any], requirement_set: Dict[str, Any]) -> Dict[str, Any]:
    if requirement_set.get("external_standard_digest") != packet.get("standard_digest"):
        raise ValueError("STANDARD_REQUIREMENT_SET_DIGEST_MISMATCH")
    rows=[]
    for r in requirement_set["requirements"]:
        rows.append({
            "requirement_id":r["requirement_id"],
            "title":r["title"],
            "external_cognitive_level":r["highest_cognitive_level"],
            "content_mapping_standing":r["mapping"]["standing"],
            "required_learning_evidence_profile":_evidence_profile_for_level(r["highest_cognitive_level"]),
            "profile_authority":"SYSTEM_MASTER_INTERNAL_EVIDENCE_AUGMENTATION_NOT_ASQ_REQUIREMENT",
        })
    bp={
        "version":CERTIFICATION_READINESS_BLUEPRINT_VERSION,
        "blueprint_id":"CERT-BP-"+packet["standard_id"],
        "external_standard_id":packet["standard_id"],
        "external_standard_digest":packet["standard_digest"],
        "requirement_set_digest":requirement_set["requirement_set_digest"],
        "exam_section_weights":{x["section_id"]:x["exam_question_weight"] for x in packet["sections"]},
        "requirements":rows,
        "content_coverage_standing":"GAPS_REMAIN" if any(x["content_mapping_standing"]=="UNMAPPED" for x in rows) else "MAPPED",
        "learner_evidence_standing":"NOT_EVALUATED",
        "external_certification_status":"NOT_MADE",
        "external_eligibility_requirements":copy.deepcopy(packet["eligibility_context"]),
        "limitations":[
            "BLUEPRINT_IS_NOT_ASQ_CERTIFICATION",
            "INTERNAL_EVIDENCE_PROFILE_MAY_EXCEED_EXAM_REQUIREMENTS",
            "EXAM_READINESS_REQUIRES FUTURE ASSESSMENT BLUEPRINT AND LEARNER EVIDENCE",
        ],
    }
    bp["blueprint_digest"]=digest(bp)
    return bp


def build_standard_freshness_contract(packet: Dict[str, Any], recheck_interval_seconds: int = 30*24*3600) -> Dict[str, Any]:
    out={
        "version":STANDARD_FRESHNESS_POLICY_VERSION,
        "standard_id":packet["standard_id"],
        "bound_standard_digest":packet["standard_digest"],
        "authority_ref":packet["authority_ref"],
        "source_ref":packet["source_ref"],
        "published_version_label":packet["published_version_label"],
        "observed_current_at":packet["observed_current_at"],
        "recheck_interval_seconds":int(recheck_interval_seconds),
        "trigger_classes":["SCHEDULED_RECHECK","AUTHORITY_VERSION_CHANGE","SOURCE_DIGEST_CHANGE","MANUAL_REFRESH_REQUEST"],
        "on_new_version":"BUILD_IMMUTABLE_SUCCESSOR_AND_UPDATE_TRAINING_DELTA",
        "on_same_version_content_drift":"CONFLICT_REVIEW_REQUIRED",
        "scheduler_execution":"DEFERRED_TO_SHARED_SCHEDULER_INTEGRATION",
        "lab_policy_note":"30_DAY_RECHECK_IS_A_BOUNDED_LAB_POLICY_NOT_A_UNIVERSAL_STANDARD",
    }
    out["freshness_contract_digest"]=digest(out)
    return out


def assess_standard_update(bound_packet: Dict[str, Any], observed_packet: Dict[str, Any]) -> Dict[str, Any]:
    oldv=validate_external_standard(bound_packet); newv=validate_external_standard(observed_packet)
    if oldv["status"]!="PASS" or newv["status"]!="PASS":
        return {"status":"INVALID_STANDARD_EVIDENCE","old":oldv,"new":newv}
    if bound_packet["authority_ref"] != observed_packet["authority_ref"]:
        return {"status":"AUTHORITY_CONFLICT","reason":"AUTHORITY_REF_CHANGED"}
    if bound_packet["published_version_label"] == observed_packet["published_version_label"]:
        status="CURRENT_NO_CHANGE" if bound_packet["standard_digest"]==observed_packet["standard_digest"] else "SAME_VERSION_CONTENT_CONFLICT"
    else:
        status="NEW_VERSION_UPDATE_AVAILABLE"
    return {"status":status,"old_version":bound_packet["published_version_label"],"new_version":observed_packet["published_version_label"],"old_digest":bound_packet["standard_digest"],"new_digest":observed_packet["standard_digest"]}


def build_update_training_delta(old_set: Dict[str, Any], new_set: Dict[str, Any]) -> Dict[str, Any]:
    old={x["requirement_id"]:x for x in old_set.get("requirements",[])}
    new={x["requirement_id"]:x for x in new_set.get("requirements",[])}
    added=sorted(set(new)-set(old)); removed=sorted(set(old)-set(new)); changed=[]
    for rid in sorted(set(old)&set(new)):
        a,b=old[rid],new[rid]
        if (a.get("title"),a.get("highest_cognitive_level")) != (b.get("title"),b.get("highest_cognitive_level")):
            changed.append(rid)
    affected=sorted(set(added+changed))
    delta={
        "version":UPDATE_TRAINING_DELTA_VERSION,
        "old_requirement_set_digest":old_set.get("requirement_set_digest"),
        "new_requirement_set_digest":new_set.get("requirement_set_digest"),
        "added_requirement_ids":added,
        "removed_requirement_ids":removed,
        "changed_requirement_ids":changed,
        "affected_training_requirement_ids":affected,
        "update_training_required":bool(affected),
        "retake_entire_course_required":False,
        "revalidation_policy":"ONLY_AFFECTED_MEANING_OR_EVIDENCE_DEPENDENCIES_REVALIDATE",
    }
    delta["update_training_delta_digest"]=digest(delta)
    return delta


class ExternalStandardIngestionService:
    PHASES=("STANDARD_BOUND","REQUIREMENTS_DECOMPOSED","BLUEPRINT_BUILT","FRESHNESS_BOUND","COMPLETE_BEFORE_RETURN")
    def __init__(self, repo: Repository): self.repo=repo
    def execute(self, *, operation_id: str, job_id: str, packet: Dict[str, Any], crash_after_phase: Optional[str]=None) -> Dict[str, Any]:
        payload={"job_id":job_id,"standard_digest":packet.get("standard_digest")}
        prior=self.repo.operation_result(operation_id,payload)
        if prior: return prior
        v=validate_external_standard(packet)
        if v["status"]!="PASS": raise ValueError("EXTERNAL_STANDARD_INVALID:"+",".join(v["failures"]))
        def phase(name: str):
            self.repo.put_object("external_standard_ingest_phase",f"{job_id}:{name}",1,{"job_id":job_id,"phase":name,"standard_digest":packet["standard_digest"]})
            if crash_after_phase==name: raise InjectedCrash(name)
        phase("STANDARD_BOUND")
        self.repo.put_object("external_standard",packet["standard_id"],1,packet)
        req=build_external_requirement_set(packet); phase("REQUIREMENTS_DECOMPOSED")
        self.repo.put_object("external_requirement_set",req["requirement_set_id"],1,req)
        mapping_plan=build_requirement_mapping_plan(packet,req)
        self.repo.put_object("external_requirement_mapping_plan",packet["standard_id"],1,mapping_plan)
        bp=build_certification_readiness_blueprint(packet,req); phase("BLUEPRINT_BUILT")
        self.repo.put_object("certification_readiness_blueprint",bp["blueprint_id"],1,bp)
        fresh=build_standard_freshness_contract(packet); phase("FRESHNESS_BOUND")
        self.repo.put_object("standard_freshness_contract",packet["standard_id"],1,fresh)
        result={"status":"COMPLETE","standard_id":packet["standard_id"],"standard_digest":packet["standard_digest"],"requirement_set_id":req["requirement_set_id"],"requirement_set_digest":req["requirement_set_digest"],"mapping_plan_digest":mapping_plan["mapping_plan_digest"],"blueprint_id":bp["blueprint_id"],"blueprint_digest":bp["blueprint_digest"],"freshness_contract_digest":fresh["freshness_contract_digest"],"requirement_count":len(req["requirements"]),"external_certification_status":"NOT_MADE"}
        phase("COMPLETE_BEFORE_RETURN")
        self.repo.record_operation(operation_id,payload,result)
        return result
