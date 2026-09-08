package org.systemmaster.core;

import java.time.Instant;
import java.util.*;
import static org.systemmaster.core.VerificationEvidenceContracts.*;

public final class ChangeVerifier {
    private final EvidencePublisher publisher;
    private final IntegrityQuarantineService integrity;
    public ChangeVerifier(EvidencePublisher publisher,IntegrityQuarantineService integrity){this.publisher=Objects.requireNonNull(publisher);this.integrity=Objects.requireNonNull(integrity);}

    public VerificationResult verify(VerificationPlanRef plan,List<CriterionResult> results,ResidualException exception,
            Set<String> consequentialStepIds,long executionEpoch,Instant now){
        Objects.requireNonNull(plan);Objects.requireNonNull(results);Objects.requireNonNull(consequentialStepIds);Objects.requireNonNull(now);
        if(integrity.isQuarantined(plan.changeId())) return result(plan,VerificationStanding.QUARANTINED,results,"");
        Map<String,VerificationCriterion> criteria=new LinkedHashMap<>();for(var c:plan.criteria())criteria.put(c.criterionId(),c);
        if(results.stream().map(CriterionResult::criterionId).distinct().count()!=results.size())throw new IllegalArgumentException("DUPLICATE_CRITERION_RESULT");
        for(var r:results)if(!criteria.containsKey(r.criterionId()))throw new IllegalArgumentException("UNKNOWN_CRITERION_RESULT");

        for(String step:consequentialStepIds) if(publisher.receipt(plan.changeId(),plan.revision(),executionEpoch,step).isEmpty())
            return result(plan,VerificationStanding.VERIFYING,results,"");

        Set<String> unresolved=new HashSet<>(); boolean failed=false;
        for(var c:plan.criteria()){
            CriterionResult r=results.stream().filter(x->x.criterionId().equals(c.criterionId())).findFirst().orElse(null);
            if(r==null){unresolved.add(c.criterionId());continue;}
            if(r.outcome()==CriterionOutcome.FAIL){failed=true;unresolved.add(c.criterionId());continue;}
            if(r.outcome()==CriterionOutcome.UNKNOWN){unresolved.add(c.criterionId());continue;}
            if(!evidenceSatisfies(plan,c,r,now)) unresolved.add(c.criterionId());
        }

        if(!unresolved.isEmpty()){
            if(exception!=null&&exception.changeId().equals(plan.changeId())&&exception.revision()==plan.revision()&&now.isBefore(exception.expiresAt())&&exception.criterionIds().containsAll(unresolved))
                return result(plan,VerificationStanding.EXCEPTION,results,exception.exceptionId());
            return result(plan,failed?VerificationStanding.FAILED:VerificationStanding.VERIFYING,results,"");
        }
        return result(plan,VerificationStanding.SUCCEEDED,results,"");
    }

    public void requireTerminalSuccess(VerificationResult result){
        if(result.standing()!=VerificationStanding.SUCCEEDED&&result.standing()!=VerificationStanding.EXCEPTION)throw new IllegalStateException("CHANGE_NOT_VERIFIED:"+result.standing());
    }

    private boolean evidenceSatisfies(VerificationPlanRef plan,VerificationCriterion c,CriterionResult r,Instant now){
        if(r.evidenceRefs().isEmpty())return false;
        Set<EvidenceClass> classes=new HashSet<>();Set<String> authorities=new HashSet<>();
        for(EvidenceRef e:r.evidenceRefs()){
            if(!e.subjectDigest().equals(plan.subjectDigest()))return false;
            if(!e.currentAt(now))return false;
            classes.add(e.evidenceClass());authorities.add(e.sourceAuthority());
        }
        return classes.containsAll(c.requiredEvidenceClasses())&&authorities.containsAll(c.requiredSourceAuthorities());
    }
    private VerificationResult result(VerificationPlanRef p,VerificationStanding s,List<CriterionResult> r,String ex){return new VerificationResult(p.changeId(),p.revision(),p.planVersion(),s,r,ex,null);}
}
