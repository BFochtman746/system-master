package org.systemmaster.core;

import java.time.*;
import java.util.*;
import static org.systemmaster.core.VerificationEvidenceContracts.*;

public final class Fwp008QualificationTest {
    static int tests=0; static void check(boolean ok,String n){tests++;if(!ok)throw new AssertionError(n);} static void throwsLike(Class<? extends Throwable> t,String text,Throwing r,String n){tests++;try{r.run();throw new AssertionError(n+":NO_EXCEPTION");}catch(Throwable x){if(!t.isInstance(x)||!String.valueOf(x.getMessage()).contains(text))throw new AssertionError(n+":"+x,x);}} interface Throwing{void run()throws Exception;}
    static Instant now=Instant.parse("2026-09-08T04:00:00Z");
    static EvidenceSubmission sub(String id,EvidenceClass cls,String auth,EvidenceStanding standing,DataClass dc,String raw){return new EvidenceSubmission(id,cls,auth,"subject-1",now.minusSeconds(10),now.plusSeconds(300),standing,"coverage-"+id,"artifact://"+id,dc,raw);}
    static VerificationCriterion criterion(){return new VerificationCriterion("crit-1","service healthy",Set.of(EvidenceClass.DOMAIN,EvidenceClass.TELEMETRY),Set.of("DOMAIN:SERVICE","021T"));}
    static VerificationPlanRef plan(){return new VerificationPlanRef("C8",4,2,"subject-1",List.of(criterion()),null);}
    static ChangeStepReceipt receipt(List<String> evidence){return new ChangeStepReceipt("C8",4,7,"step-1","svc:A","APPLIED",evidence,now.minusSeconds(5),null);}

    public static void main(String[] args){
        EvidencePublisher p=new EvidencePublisher();IntegrityQuarantineService q=new IntegrityQuarantineService();ChangeVerifier v=new ChangeVerifier(p,q);
        EvidenceRef domain=p.register(sub("domain",EvidenceClass.DOMAIN,"DOMAIN:SERVICE",EvidenceStanding.CURRENT,DataClass.INTERNAL,null));
        EvidenceRef tel=p.register(sub("telemetry",EvidenceClass.TELEMETRY,"021T",EvidenceStanding.CURRENT,DataClass.INTERNAL,null));
        EvidenceRef exec=p.register(sub("executor",EvidenceClass.EXECUTOR,"EXECUTOR",EvidenceStanding.CURRENT,DataClass.INTERNAL,null));
        check(domain.currentAt(now),"domain current");check(tel.currentAt(now),"telemetry current");check(exec.currentAt(now),"executor current");
        p.recordStepReceipt(receipt(List.of(domain.evidenceId(),tel.evidenceId())));check(p.receipt("C8",4,7,"step-1").isPresent(),"step receipt present");
        ChangeStepReceipt same=p.recordStepReceipt(receipt(List.of(domain.evidenceId(),tel.evidenceId())));check(same.receiptDigest().equals(receipt(List.of(domain.evidenceId(),tel.evidenceId())).receiptDigest()),"receipt replay same");
        throwsLike(IllegalStateException.class,"STEP_RECEIPT_CONFLICT",()->p.recordStepReceipt(new ChangeStepReceipt("C8",4,7,"step-1","svc:A","DIFFERENT",List.of(domain.evidenceId()),now.minusSeconds(5),null)),"receipt append conflict");
        throwsLike(SecurityException.class,"RAW_EVIDENCE_PAYLOAD_PROHIBITED",()->p.register(sub("raw",EvidenceClass.DOMAIN,"DOMAIN:SERVICE",EvidenceStanding.CURRENT,DataClass.SENSITIVE,"password=secret")),"raw sensitive reject");
        EvidenceRef sensitive=p.register(sub("sensitive-ref",EvidenceClass.DOMAIN,"DOMAIN:SERVICE",EvidenceStanding.CURRENT,DataClass.SENSITIVE,null));check(sensitive.dataClass()==DataClass.SENSITIVE,"classified reference allowed");
        throwsLike(IllegalArgumentException.class,"EVIDENCE_DIGEST_MISMATCH",()->new EvidenceRef("x",EvidenceClass.DOMAIN,"D","subject-1",now.minusSeconds(1),now.plusSeconds(1),EvidenceStanding.CURRENT,"c","artifact://x",DataClass.INTERNAL,"bad"),"evidence tamper reject");
        throwsLike(IllegalArgumentException.class,"STEP_RECEIPT_DIGEST_MISMATCH",()->new ChangeStepReceipt("C",1,1,"s","t","OK",List.of("e"),now,"bad"),"receipt tamper reject");

        CriterionResult executorOnly=new CriterionResult("crit-1",CriterionOutcome.PASS,List.of(exec),"exit 0");
        VerificationResult falseSuccess=v.verify(plan(),List.of(executorOnly),null,Set.of("step-1"),7,now);check(falseSuccess.standing()==VerificationStanding.VERIFYING,"executor success not change success");
        throwsLike(IllegalStateException.class,"CHANGE_NOT_VERIFIED:VERIFYING",()->v.requireTerminalSuccess(falseSuccess),"false success blocked");
        CriterionResult good=new CriterionResult("crit-1",CriterionOutcome.PASS,List.of(domain,tel),"both authoritative");
        VerificationResult ok=v.verify(plan(),List.of(good),null,Set.of("step-1"),7,now);check(ok.standing()==VerificationStanding.SUCCEEDED,"authoritative evidence succeeds");v.requireTerminalSuccess(ok);check(true,"terminal success accepted");

        EvidenceRef stale=p.register(sub("stale",EvidenceClass.TELEMETRY,"021T",EvidenceStanding.STALE,DataClass.INTERNAL,null));
        VerificationResult staleResult=v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.PASS,List.of(domain,stale),"stale")),null,Set.of("step-1"),7,now);check(staleResult.standing()==VerificationStanding.VERIFYING,"stale evidence gap");
        EvidenceRef unknown=p.register(sub("unknown",EvidenceClass.TELEMETRY,"021T",EvidenceStanding.UNKNOWN,DataClass.INTERNAL,null));
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.PASS,List.of(domain,unknown),"unknown")),null,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"unknown evidence gap");
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.UNKNOWN,List.of(domain,tel),"criterion unknown")),null,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"unknown criterion");
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.FAIL,List.of(domain,tel),"failed")),null,Set.of("step-1"),7,now).standing()==VerificationStanding.FAILED,"failed criterion");
        check(v.verify(plan(),List.of(),null,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"missing criterion result");

        VerificationPlanRef missingReceiptPlan=new VerificationPlanRef("C9",1,1,"subject-1",List.of(criterion()),null);
        check(v.verify(missingReceiptPlan,List.of(good),null,Set.of("step-x"),1,now).standing()==VerificationStanding.VERIFYING,"missing receipt blocks success");

        ResidualException ex=new ResidualException("ex-1","C8",4,Set.of("crit-1"),"approval-1",now.plusSeconds(60),null);
        VerificationResult except=v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.UNKNOWN,List.of(domain,tel),"accepted residual")),ex,Set.of("step-1"),7,now);check(except.standing()==VerificationStanding.EXCEPTION,"approved residual exception");v.requireTerminalSuccess(except);check(true,"exception terminal accepted");
        ResidualException expired=new ResidualException("ex-old","C8",4,Set.of("crit-1"),"approval-2",now.minusSeconds(1),null);
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.UNKNOWN,List.of(domain,tel),"old")),expired,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"expired exception not success");
        ResidualException wrongScope=new ResidualException("ex-wrong","C8",4,Set.of("other"),"approval-3",now.plusSeconds(60),null);
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.UNKNOWN,List.of(domain,tel),"wrong")),wrongScope,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"wrong exception scope");

        EvidenceRef wrongSubject=p.register(new EvidenceSubmission("wrong-sub",EvidenceClass.TELEMETRY,"021T","other-subject",now.minusSeconds(1),now.plusSeconds(20),EvidenceStanding.CURRENT,"cov","artifact://wrong",DataClass.INTERNAL,null));
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.PASS,List.of(domain,wrongSubject),"wrong subject")),null,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"subject mismatch blocks");
        EvidenceRef wrongAuthority=p.register(sub("wrong-auth",EvidenceClass.TELEMETRY,"OTHER",EvidenceStanding.CURRENT,DataClass.INTERNAL,null));
        check(v.verify(plan(),List.of(new CriterionResult("crit-1",CriterionOutcome.PASS,List.of(domain,wrongAuthority),"wrong auth")),null,Set.of("step-1"),7,now).standing()==VerificationStanding.VERIFYING,"authority mismatch blocks");

        IntegrityFinding finding=new IntegrityFinding("find-1","C8","event digest gap",domain.evidenceId(),null);q.quarantine(finding,now);check(q.isQuarantined("C8"),"corruption quarantines");
        VerificationResult quarantined=v.verify(plan(),List.of(good),null,Set.of("step-1"),7,now);check(quarantined.standing()==VerificationStanding.QUARANTINED,"quarantine blocks verification");
        throwsLike(SecurityException.class,"CHANGE_QUARANTINED",()->q.requireClear("C8"),"quarantine execution gate");
        throwsLike(IllegalStateException.class,"RECONCILIATION_EVIDENCE_NOT_CURRENT",()->q.reconcile("C8","find-1",stale,now),"stale repair evidence rejected");
        q.reconcile("C8","find-1",domain,now);check(!q.isQuarantined("C8"),"reconciled quarantine clears");q.requireClear("C8");check(true,"clear gate passes");
        check(v.verify(plan(),List.of(good),null,Set.of("step-1"),7,now).standing()==VerificationStanding.SUCCEEDED,"success after integrity reconcile");
        throwsLike(IllegalArgumentException.class,"FINDING_DIGEST_MISMATCH",()->new IntegrityFinding("f","C","r","e","bad"),"finding tamper rejected");
        throwsLike(IllegalArgumentException.class,"PLAN_DIGEST_MISMATCH",()->new VerificationPlanRef("C",1,1,"s",List.of(criterion()),"bad"),"plan tamper rejected");
        throwsLike(IllegalArgumentException.class,"UNKNOWN_CRITERION_RESULT",()->v.verify(plan(),List.of(new CriterionResult("nope",CriterionOutcome.PASS,List.of(domain,tel),"")),null,Set.of("step-1"),7,now),"unknown criterion rejected");
        throwsLike(IllegalArgumentException.class,"DUPLICATE_CRITERION_RESULT",()->v.verify(plan(),List.of(good,good),null,Set.of("step-1"),7,now),"duplicate criterion rejected");
        throwsLike(IllegalStateException.class,"STEP_EVIDENCE_REF_MISSING",()->p.recordStepReceipt(new ChangeStepReceipt("CX",1,1,"s","t","OK",List.of("missing"),now,null)),"missing receipt evidence rejected");

        System.out.println("PASS F-WP-008 tests="+tests+" requirements=5");
    }
}
