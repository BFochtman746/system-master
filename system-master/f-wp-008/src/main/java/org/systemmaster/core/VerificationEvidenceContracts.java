package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

public final class VerificationEvidenceContracts {
    private VerificationEvidenceContracts() {}

    public enum EvidenceClass { DOMAIN, TELEMETRY, EXECUTOR, OTHER }
    public enum EvidenceStanding { CURRENT, STALE, UNKNOWN, CORRUPT }
    public enum DataClass { PUBLIC, INTERNAL, SENSITIVE }
    public enum CriterionOutcome { PASS, FAIL, UNKNOWN }
    public enum VerificationStanding { VERIFYING, SUCCEEDED, FAILED, EXCEPTION, QUARANTINED }
    public enum IntegrityStanding { CLEAR, QUARANTINED }

    public record EvidenceSubmission(
            String evidenceId,
            EvidenceClass evidenceClass,
            String sourceAuthority,
            String subjectDigest,
            Instant observedAt,
            Instant expiresAt,
            EvidenceStanding standing,
            String coverageDigest,
            String contentRef,
            DataClass dataClass,
            String rawPayload) {
        public EvidenceSubmission {
            requireText(evidenceId,"evidenceId");
            evidenceClass = Objects.requireNonNull(evidenceClass,"evidenceClass");
            requireText(sourceAuthority,"sourceAuthority"); requireText(subjectDigest,"subjectDigest");
            observedAt = Objects.requireNonNull(observedAt,"observedAt");
            expiresAt = Objects.requireNonNull(expiresAt,"expiresAt");
            if (!observedAt.isBefore(expiresAt)) throw new IllegalArgumentException("INVALID_EVIDENCE_WINDOW");
            standing = Objects.requireNonNull(standing,"standing"); requireText(coverageDigest,"coverageDigest");
            requireText(contentRef,"contentRef"); dataClass = Objects.requireNonNull(dataClass,"dataClass");
        }
    }

    public record EvidenceRef(
            String evidenceId,
            EvidenceClass evidenceClass,
            String sourceAuthority,
            String subjectDigest,
            Instant observedAt,
            Instant expiresAt,
            EvidenceStanding standing,
            String coverageDigest,
            String contentRef,
            DataClass dataClass,
            String evidenceDigest) {
        public EvidenceRef {
            requireText(evidenceId,"evidenceId"); evidenceClass=Objects.requireNonNull(evidenceClass,"evidenceClass");
            requireText(sourceAuthority,"sourceAuthority"); requireText(subjectDigest,"subjectDigest");
            observedAt=Objects.requireNonNull(observedAt,"observedAt"); expiresAt=Objects.requireNonNull(expiresAt,"expiresAt");
            standing=Objects.requireNonNull(standing,"standing"); requireText(coverageDigest,"coverageDigest");
            requireText(contentRef,"contentRef"); dataClass=Objects.requireNonNull(dataClass,"dataClass");
            String computed=VerificationEvidenceContracts.evidenceDigest(evidenceId,evidenceClass,sourceAuthority,subjectDigest,observedAt,expiresAt,standing,coverageDigest,contentRef,dataClass);
            if(evidenceDigest==null||evidenceDigest.isBlank()) evidenceDigest=computed;
            if(!evidenceDigest.equals(computed)) throw new IllegalArgumentException("EVIDENCE_DIGEST_MISMATCH");
        }
        public boolean currentAt(Instant now){return standing==EvidenceStanding.CURRENT && now.isBefore(expiresAt);}
    }

    public record VerificationCriterion(String criterionId, String description,
            Set<EvidenceClass> requiredEvidenceClasses, Set<String> requiredSourceAuthorities) {
        public VerificationCriterion {
            requireText(criterionId,"criterionId"); requireText(description,"description");
            requiredEvidenceClasses=Set.copyOf(Objects.requireNonNull(requiredEvidenceClasses,"requiredEvidenceClasses"));
            requiredSourceAuthorities=Set.copyOf(Objects.requireNonNull(requiredSourceAuthorities,"requiredSourceAuthorities"));
            if(requiredEvidenceClasses.isEmpty()) throw new IllegalArgumentException("EVIDENCE_CLASS_REQUIRED");
        }
    }

    public record VerificationPlanRef(String changeId,long revision,long planVersion,String subjectDigest,
            List<VerificationCriterion> criteria,String planDigest) {
        public VerificationPlanRef {
            requireText(changeId,"changeId"); if(revision<1||planVersion<1) throw new IllegalArgumentException("INVALID_PLAN_VERSION");
            requireText(subjectDigest,"subjectDigest"); criteria=List.copyOf(Objects.requireNonNull(criteria,"criteria"));
            if(criteria.isEmpty()) throw new IllegalArgumentException("CRITERIA_REQUIRED");
            if(criteria.stream().map(VerificationCriterion::criterionId).distinct().count()!=criteria.size()) throw new IllegalArgumentException("DUPLICATE_CRITERION");
            String computed=VerificationEvidenceContracts.planDigest(changeId,revision,planVersion,subjectDigest,criteria);
            if(planDigest==null||planDigest.isBlank()) planDigest=computed;
            if(!planDigest.equals(computed)) throw new IllegalArgumentException("PLAN_DIGEST_MISMATCH");
        }
    }

    public record CriterionResult(String criterionId, CriterionOutcome outcome, List<EvidenceRef> evidenceRefs, String reason) {
        public CriterionResult {
            requireText(criterionId,"criterionId"); outcome=Objects.requireNonNull(outcome,"outcome");
            evidenceRefs=List.copyOf(Objects.requireNonNull(evidenceRefs,"evidenceRefs"));
            reason=reason==null?"":reason;
        }
    }

    public record ResidualException(String exceptionId,String changeId,long revision,Set<String> criterionIds,
            String approvalRef,Instant expiresAt,String exceptionDigest) {
        public ResidualException {
            requireText(exceptionId,"exceptionId"); requireText(changeId,"changeId"); if(revision<1)throw new IllegalArgumentException("INVALID_REVISION");
            criterionIds=Set.copyOf(Objects.requireNonNull(criterionIds,"criterionIds")); if(criterionIds.isEmpty())throw new IllegalArgumentException("EXCEPTION_SCOPE_REQUIRED");
            requireText(approvalRef,"approvalRef"); expiresAt=Objects.requireNonNull(expiresAt,"expiresAt");
            String computed=sha256("FWP008-EXCEPTION-V1|"+exceptionId+"|"+changeId+"|"+revision+"|"+String.join(",",new TreeSet<>(criterionIds))+"|"+approvalRef+"|"+expiresAt);
            if(exceptionDigest==null||exceptionDigest.isBlank())exceptionDigest=computed;
            if(!exceptionDigest.equals(computed))throw new IllegalArgumentException("EXCEPTION_DIGEST_MISMATCH");
        }
    }

    public record ChangeStepReceipt(String changeId,long revision,long epoch,String stepId,String targetRef,
            String outcome,List<String> evidenceIds,Instant recordedAt,String receiptDigest) {
        public ChangeStepReceipt {
            requireText(changeId,"changeId"); if(revision<1||epoch<1)throw new IllegalArgumentException("INVALID_STEP_IDENTITY");
            requireText(stepId,"stepId");requireText(targetRef,"targetRef");requireText(outcome,"outcome");
            evidenceIds=List.copyOf(Objects.requireNonNull(evidenceIds,"evidenceIds")); if(evidenceIds.isEmpty())throw new IllegalArgumentException("STEP_EVIDENCE_REQUIRED");
            recordedAt=Objects.requireNonNull(recordedAt,"recordedAt");
            String computed=VerificationEvidenceContracts.receiptDigest(changeId,revision,epoch,stepId,targetRef,outcome,evidenceIds,recordedAt);
            if(receiptDigest==null||receiptDigest.isBlank())receiptDigest=computed;
            if(!receiptDigest.equals(computed))throw new IllegalArgumentException("STEP_RECEIPT_DIGEST_MISMATCH");
        }
        public String identity(){return changeId+"|"+revision+"|"+epoch+"|"+stepId;}
    }

    public record IntegrityFinding(String findingId,String changeId,String reason,String evidenceId,String findingDigest) {
        public IntegrityFinding {
            requireText(findingId,"findingId");requireText(changeId,"changeId");requireText(reason,"reason");requireText(evidenceId,"evidenceId");
            String computed=sha256("FWP008-FINDING-V1|"+findingId+"|"+changeId+"|"+reason+"|"+evidenceId);
            if(findingDigest==null||findingDigest.isBlank())findingDigest=computed;
            if(!findingDigest.equals(computed))throw new IllegalArgumentException("FINDING_DIGEST_MISMATCH");
        }
    }

    public record VerificationResult(String changeId,long revision,long planVersion,VerificationStanding standing,
            List<CriterionResult> criteria,String residualExceptionId,String resultDigest) {
        public VerificationResult {
            requireText(changeId,"changeId");if(revision<1||planVersion<1)throw new IllegalArgumentException("INVALID_RESULT_IDENTITY");
            standing=Objects.requireNonNull(standing,"standing");criteria=List.copyOf(criteria);residualExceptionId=residualExceptionId==null?"":residualExceptionId;
            String computed=sha256("FWP008-RESULT-V1|"+changeId+"|"+revision+"|"+planVersion+"|"+standing+"|"+criteria.stream().map(c->c.criterionId()+":"+c.outcome()).sorted().toList()+"|"+residualExceptionId);
            if(resultDigest==null||resultDigest.isBlank())resultDigest=computed;
            if(!resultDigest.equals(computed))throw new IllegalArgumentException("VERIFICATION_RESULT_DIGEST_MISMATCH");
        }
    }

    static String evidenceDigest(String id,EvidenceClass cls,String source,String subject,Instant observed,Instant expires,EvidenceStanding standing,String coverage,String ref,DataClass dataClass){
        return sha256("FWP008-EVIDENCE-V1|"+id+"|"+cls+"|"+source+"|"+subject+"|"+observed+"|"+expires+"|"+standing+"|"+coverage+"|"+ref+"|"+dataClass);
    }
    static String planDigest(String change,long rev,long ver,String subject,List<VerificationCriterion> criteria){
        var rows=criteria.stream().map(c->c.criterionId()+":"+new TreeSet<>(c.requiredEvidenceClasses())+":"+new TreeSet<>(c.requiredSourceAuthorities())).sorted().toList();
        return sha256("FWP008-PLAN-V1|"+change+"|"+rev+"|"+ver+"|"+subject+"|"+rows);
    }
    static String receiptDigest(String change,long rev,long epoch,String step,String target,String outcome,List<String> evidenceIds,Instant at){
        return sha256("FWP008-RECEIPT-V1|"+change+"|"+rev+"|"+epoch+"|"+step+"|"+target+"|"+outcome+"|"+new TreeSet<>(evidenceIds)+"|"+at);
    }
    public static String sha256(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    static String requireText(String v,String name){if(v==null||v.isBlank())throw new IllegalArgumentException("REQUIRED:"+name);return v;}
}
