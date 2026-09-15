import hashlib,json
from copy import deepcopy
from dataclasses import dataclass

STANDARDS_INTEROPERABILITY_VERSION="001M-S07-v1"
INTEROPERABILITY_OWNER="LEARNING_ADAPTER_TRANSLATION_ONLY"
STANDARD_CASE,STANDARD_QTI,STANDARD_CALIPER,STANDARD_CLR="CASE","QTI","CALIPER","CLR"
SUPPORTED_VERSIONS={STANDARD_CASE:{"1.1","1.1.0"},STANDARD_QTI:{"3.0"},STANDARD_CALIPER:{"1.2"},STANDARD_CLR:{"2.0"}}
MAPPING_KINDS={"EXACT","BOUNDED","LOSSY","PROPOSED","UNMAPPED","CONFLICT"}
OWNER_ADMISSION_STANDINGS={"SOURCE_ONLY","PROPOSED","DEFERRED","PARTIAL","ADMITTED","REJECTED"}
BROAD_CLAIMS={"COMPETENCY_EQUIVALENCE","CERTIFICATION","LICENSURE","HIRING_ELIGIBILITY","JOB_ELIGIBILITY","EDUCATIONAL_EFFECTIVENESS","MASTERY_VALIDITY","ASSESSMENT_VALIDITY"}
SENSITIVE_INFERENCE_SOURCES={"raw_chat","camera","voice","physiological","device_telemetry"}
class StandardsInteroperabilityError(ValueError): pass

def _u(v): return str(v or "").strip().upper()
def _req(v,code):
    v=str(v or "").strip()
    if not v: raise StandardsInteroperabilityError(code)
    return v
def _copy(v): return deepcopy(dict(v))
def _canon(v): return json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=True)
def digest(v): return hashlib.sha256(_canon(v).encode()).hexdigest()
def _standard(family,version):
    family=_u(family); version=_req(version,"STANDARD_VERSION_REQUIRED")
    if family not in SUPPORTED_VERSIONS: raise StandardsInteroperabilityError("STANDARD_FAMILY_UNSUPPORTED")
    if version not in SUPPORTED_VERSIONS[family]: raise StandardsInteroperabilityError("STANDARD_VERSION_UNSUPPORTED")
    return family,version

def build_exchange_envelope(*,direction,standard_family,standard_version,source_namespace,external_object_id,payload,profile=None,source_revision=None,extensions=None):
    direction=_u(direction)
    if direction not in {"IMPORT","EXPORT"}: raise StandardsInteroperabilityError("DIRECTION_INVALID")
    family,version=_standard(standard_family,standard_version)
    if not isinstance(payload,dict): raise StandardsInteroperabilityError("PAYLOAD_INVALID")
    r={"schema_version":STANDARDS_INTEROPERABILITY_VERSION,"adapter_owner":INTEROPERABILITY_OWNER,"direction":direction,"standard_family":family,"standard_version":version,"profile":str(profile).strip() if profile is not None else None,"source_namespace":_req(source_namespace,"SOURCE_NAMESPACE_REQUIRED"),"external_object_id":_req(external_object_id,"EXTERNAL_OBJECT_ID_REQUIRED"),"source_revision":str(source_revision).strip() if source_revision is not None else None,"payload":deepcopy(payload),"opaque_extensions":deepcopy(dict(extensions or {})),"canonical_learning_effect":"NONE","canonical_curriculum_effect":"NONE","canonical_identity_effect":"NONE","canonical_credential_effect":"NONE"}
    r["external_identity"]=r["source_namespace"]+":"+r["external_object_id"]; r["payload_digest"]=digest(r["payload"]); r["exchange_digest"]=digest(r); return r

def migrate_envelope(envelope,*,to_version,transformation_version,provenance):
    family,target=_standard(envelope.get("standard_family"),to_version); source=_req(envelope.get("standard_version"),"STANDARD_VERSION_REQUIRED")
    if target==source: raise StandardsInteroperabilityError("MIGRATION_TARGET_MUST_DIFFER")
    if not provenance: raise StandardsInteroperabilityError("MIGRATION_PROVENANCE_REQUIRED")
    r={"standard_family":family,"from_version":source,"to_version":target,"transformation_version":_req(transformation_version,"TRANSFORMATION_VERSION_REQUIRED"),"provenance":_copy(provenance),"historical_payload_reinterpreted":False}; r["migration_digest"]=digest(r); return r

def mapping_decision(*,kind,constraints=None,conflict_candidates=None,round_trip_fields=None,omitted_fields=None,opaque_extensions=None):
    kind=_u(kind); constraints=[str(x) for x in constraints or []]; conflicts=[_copy(x) for x in conflict_candidates or []]; omitted=sorted({str(x) for x in omitted_fields or []})
    if kind not in MAPPING_KINDS: raise StandardsInteroperabilityError("MAPPING_KIND_INVALID")
    if kind=="BOUNDED" and not constraints: raise StandardsInteroperabilityError("BOUNDED_MAPPING_CONSTRAINTS_REQUIRED")
    if kind=="CONFLICT" and len(conflicts)<2: raise StandardsInteroperabilityError("MAPPING_CONFLICT_CANDIDATES_REQUIRED")
    if kind=="EXACT" and omitted: raise StandardsInteroperabilityError("EXACT_MAPPING_CANNOT_OMIT")
    r={"kind":kind,"constraints":constraints,"conflict_candidates":conflicts,"round_trip_fields":sorted({str(x) for x in round_trip_fields or []}),"omitted_fields":omitted,"opaque_extensions":deepcopy(dict(opaque_extensions or {})),"authoritative":False,"canonical_semantic_effect":"NONE","equivalence_claim":"EXACT_BOUNDED_ONLY" if kind=="EXACT" else "NOT_CLAIMED","lossy":kind=="LOSSY" or bool(omitted),"unmapped":kind=="UNMAPPED"}; r["mapping_digest"]=digest(r); return r

def validate_sensitive_linkage(*,attribute_source,inferred_sensitive_trait):
    source=str(attribute_source or "").strip().lower()
    if inferred_sensitive_trait and source in SENSITIVE_INFERENCE_SOURCES: raise StandardsInteroperabilityError("SENSITIVE_TRAIT_INFERENCE_FORBIDDEN")
    return {"attribute_source":source,"inferred_sensitive_trait":bool(inferred_sensitive_trait),"admitted":not inferred_sensitive_trait}

def import_external(*,envelope,schema_valid,authorized,rights_certain,provenance,mapping,profile_valid=True,owner_admission="SOURCE_ONLY",partial_admission=None,identity_link_authorized=False,source_trust="UNKNOWN",cryptographically_verified=False,external_score_commit=False,ambiguous=False):
    e=_copy(envelope)
    if e.get("direction")!="IMPORT": raise StandardsInteroperabilityError("IMPORT_DIRECTION_REQUIRED")
    if not schema_valid: raise StandardsInteroperabilityError("SCHEMA_VALIDATION_FAILED")
    if e.get("profile") and not profile_valid: raise StandardsInteroperabilityError("PROFILE_VALIDATION_FAILED")
    if not authorized: raise StandardsInteroperabilityError("IMPORT_AUTHORIZATION_REQUIRED")
    if not rights_certain: raise StandardsInteroperabilityError("IMPORT_RIGHTS_REQUIRED")
    if ambiguous: raise StandardsInteroperabilityError("AMBIGUOUS_IMPORT_FAIL_CLOSED")
    if not provenance: raise StandardsInteroperabilityError("PROVENANCE_REQUIRED")
    p=_copy(provenance); p["source"]=_req(p.get("source"),"PROVENANCE_SOURCE_REQUIRED"); p["captured_at"]=_req(p.get("captured_at"),"PROVENANCE_CAPTURE_REQUIRED")
    m=_copy(mapping)
    if m.get("kind") not in MAPPING_KINDS: raise StandardsInteroperabilityError("MAPPING_DECISION_REQUIRED")
    if m.get("kind")=="CONFLICT": raise StandardsInteroperabilityError("MAPPING_CONFLICT_UNRESOLVED")
    admission=_u(owner_admission)
    if admission not in OWNER_ADMISSION_STANDINGS: raise StandardsInteroperabilityError("OWNER_ADMISSION_STANDING_INVALID")
    if external_score_commit and e["standard_family"]==STANDARD_QTI: raise StandardsInteroperabilityError("EXTERNAL_SCORE_COMMIT_INGRESS_UNRESOLVED")
    if admission=="ADMITTED" and m.get("kind") in {"PROPOSED","UNMAPPED"}: raise StandardsInteroperabilityError("OWNER_ADMISSION_REQUIRES_RESOLVED_MAPPING")
    r={"schema_version":STANDARDS_INTEROPERABILITY_VERSION,"standard_family":e["standard_family"],"standard_version":e["standard_version"],"profile":e.get("profile"),"external_identity":e["external_identity"],"source_revision":e.get("source_revision"),"payload_digest":e["payload_digest"],"provenance":p,"mapping":m,"owner_admission":admission,"partial_admission":{str(k):sorted({str(x) for x in v}) for k,v in (partial_admission or {}).items()},"source_trust":_u(source_trust or "UNKNOWN"),"cryptographically_verified":bool(cryptographically_verified),"identity_link_authorized":bool(identity_link_authorized),"owner_admission_is_separate_from_translation":True,"mental_state_inference":False}
    for k in ("canonical_learning_effect","canonical_curriculum_effect","canonical_identity_effect","mastery_effect","retention_effect","transfer_effect","assessment_attempt_effect","prerequisite_truth_effect","competency_equivalence_effect","credential_acceptance_effect","certification_effect","licensing_effect","hiring_effect","job_eligibility_effect"): r[k]="NONE"
    if e["standard_family"]==STANDARD_CALIPER: r.update(event_observation_only=True,learning_evidence_effect="NONE",competence_effect="NONE",learning_gain_effect="NONE")
    if e["standard_family"]==STANDARD_CLR: r.update(verification_is_semantic_acceptance=False,issuer_authority_duplicated=False)
    if e["standard_family"]==STANDARD_CASE: r["framework_material_standing"]="EXTERNAL_SOURCE_OR_PROPOSED"
    if e["standard_family"]==STANDARD_QTI: r["assessment_material_standing"]="EXTERNAL_SOURCE_OR_PROPOSED"
    r["import_digest"]=digest(r); return r

def export_external(*,source_state,target_standard,target_version,authorized,consent,rights_certain,purpose,minimum_necessary,mapping,requested_claims=None,target_profile=None,transformation_version="1"):
    s=_copy(source_state)
    if not s.get("owner_valid"): raise StandardsInteroperabilityError("OWNER_VALID_SOURCE_REQUIRED")
    if not authorized: raise StandardsInteroperabilityError("EXPORT_AUTHORIZATION_REQUIRED")
    if not consent: raise StandardsInteroperabilityError("EXPORT_CONSENT_REQUIRED")
    if not rights_certain: raise StandardsInteroperabilityError("EXPORT_RIGHTS_REQUIRED")
    if not minimum_necessary: raise StandardsInteroperabilityError("MINIMUM_NECESSARY_REQUIRED")
    family,version=_standard(target_standard,target_version); m=_copy(mapping)
    if m.get("kind") not in MAPPING_KINDS or m.get("kind") in {"CONFLICT","UNMAPPED"}: raise StandardsInteroperabilityError("EXPORT_MAPPING_UNRESOLVED")
    requested={_u(x) for x in requested_claims or []}; supported={_u(x) for x in s.get("supported_claims",[])}
    if any(x in BROAD_CLAIMS and x not in supported for x in requested): raise StandardsInteroperabilityError("CLAIM_BROADENING_FORBIDDEN")
    if not requested.issubset(supported): raise StandardsInteroperabilityError("UNSUPPORTED_EXPORT_CLAIM")
    r={"schema_version":STANDARDS_INTEROPERABILITY_VERSION,"target_standard":family,"target_version":version,"target_profile":str(target_profile).strip() if target_profile else None,"purpose":_req(purpose,"EXPORT_PURPOSE_REQUIRED"),"minimum_necessary":True,"mapping":m,"requested_claims":sorted(requested),"omissions":list(m.get("omitted_fields",[])),"lossy":bool(m.get("lossy")),"transformation_version":_req(transformation_version,"TRANSFORMATION_VERSION_REQUIRED"),"source_versions":deepcopy(s.get("versions",{})),"canonical_learning_effect":"NONE","certification_invented":False,"equivalence_invented":False,"eligibility_invented":False}; r["export_digest"]=digest(r); return r

@dataclass(frozen=True)
class ImportReceipt:
    operation_id:str; semantic_key:str; revision:int; fingerprint:str; standing:str; supersedes:int|None=None
class ImportLedger:
    def __init__(self): self._ops={}; self._history={}
    def semantic_key(self,e): return "|".join(str(e.get(k) or "") for k in ("standard_family","standard_version","source_namespace","external_object_id","source_revision"))
    def fingerprint(self,e,t,a): return digest({"envelope":dict(e),"translation":dict(t),"admission":_u(a)})
    def apply(self,*,operation_id,envelope,translation,admission,expected_revision=None):
        operation_id=_req(operation_id,"IMPORT_OPERATION_ID_REQUIRED"); fp=self.fingerprint(envelope,translation,admission)
        if operation_id in self._ops:
            if self._ops[operation_id].fingerprint!=fp: raise StandardsInteroperabilityError("IDEMPOTENCY_PAYLOAD_CONFLICT")
            return self._ops[operation_id]
        key=self.semantic_key(envelope); h=self._history.setdefault(key,[]); current=h[-1].revision if h else 0
        if expected_revision is not None and expected_revision!=current: raise StandardsInteroperabilityError("CONCURRENT_IMPORT_REVISION_CONFLICT")
        r=ImportReceipt(operation_id,key,current+1,fp,_u(admission)); h.append(r); self._ops[operation_id]=r; return r
    def correct(self,*,operation_id,envelope,translation,admission,expected_revision):
        key=self.semantic_key(envelope); h=self._history.get(key,[])
        if not h: raise StandardsInteroperabilityError("CORRECTION_TARGET_REQUIRED")
        if h[-1].revision!=expected_revision: raise StandardsInteroperabilityError("CONCURRENT_IMPORT_REVISION_CONFLICT")
        fp=self.fingerprint(envelope,translation,admission)
        if operation_id in self._ops:
            if self._ops[operation_id].fingerprint!=fp: raise StandardsInteroperabilityError("IDEMPOTENCY_PAYLOAD_CONFLICT")
            return self._ops[operation_id]
        r=ImportReceipt(_req(operation_id,"IMPORT_OPERATION_ID_REQUIRED"),key,h[-1].revision+1,fp,_u(admission),h[-1].revision); h.append(r); self._ops[operation_id]=r; return r
    def history(self,e): return tuple(self._history.get(self.semantic_key(e),()))
    def revoke_external(self,e,*,reason):
        h=self.history(e)
        if not h: raise StandardsInteroperabilityError("REVOCATION_TARGET_REQUIRED")
        return {"semantic_key":self.semantic_key(e),"reason":_req(reason,"REVOCATION_REASON_REQUIRED"),"historical_evidence_erased":False,"downstream_reprojection_owner":"PROPER_SEMANTIC_OWNER","history_revisions":[x.revision for x in h]}

def conformance_report(*,schema_valid,adapter_software_qualified,transport_success,translation_success,owner_admitted):
    return {"schema_conformance":"PASS" if schema_valid else "FAIL","adapter_software_conformance":"PASS" if adapter_software_qualified else "NOT_QUALIFIED","transport":"SUCCESS" if transport_success else "FAIL","translation":"SUCCESS" if translation_success else "FAIL","owner_admission":"ADMITTED" if owner_admitted else "NOT_ADMITTED","assessment_validity_proven":False,"mastery_validity_proven":False,"educational_effectiveness_proven":False,"competency_equivalence_proven":False,"credential_acceptance_proven":False,"certification_proven":False,"eligibility_proven":False}
def durability_review(*,executable_bytes_changed,semantic_mapping_policy_changed,prior_software_pass):
    fresh=bool(executable_bytes_changed or semantic_mapping_policy_changed); return {"fresh_software_qualification_required":fresh,"prior_software_pass_reusable":bool(prior_software_pass and not fresh),"semantic_reconciliation_required":bool(semantic_mapping_policy_changed),"runtime_pass_is_external_authority_proof":False}
def claim_guard(*,claim,evidence_kind):
    if _u(claim) in BROAD_CLAIMS and _u(evidence_kind) in {"SCHEMA_CONFORMANCE","TRANSPORT_SUCCESS","ADAPTER_SOFTWARE_PASS","ACTIVITY_EVENT","CRYPTOGRAPHIC_VERIFICATION"}: raise StandardsInteroperabilityError("DOWNSTREAM_CLAIM_FORBIDDEN")
    return {"claim":_u(claim),"evidence_kind":_u(evidence_kind),"allowed":True}
