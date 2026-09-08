package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Set;

public final class ContinuityQualificationLedgerTest {
    private static int assertions;
    private static void ok(boolean value,String message){assertions++;if(!value)throw new AssertionError(message);}
    private static void eq(Object expected,Object actual,String message){assertions++;if(!java.util.Objects.equals(expected,actual))throw new AssertionError(message+" expected="+expected+" actual="+actual);}
    private static void throwsIt(Runnable r,String message){assertions++;try{r.run();throw new AssertionError(message);}catch(IllegalStateException expected){}}

    public static void main(String[] args){
        var ledger=new ContinuityQualificationLedger();
        ledger.registerMapping(new ContinuityQualificationLedger.RequirementMapping("G-RQ-071","G-WP-015","TRACEABILITY_META",true));
        ledger.registerMapping(new ContinuityQualificationLedger.RequirementMapping("G-RQ-072","G-WP-015","TARGET_WINDOWS_REBOOT+IOS_CLIENT_SUSPEND_RESUME",true));
        ledger.registerMapping(new ContinuityQualificationLedger.RequirementMapping("G-RQ-073","G-WP-015","HUMAN_HANDOFF",true));
        ledger.registerMapping(new ContinuityQualificationLedger.RequirementMapping("G-RQ-074","G-WP-015","TRACEABILITY_META",true));
        ok(ledger.mappingComplete(Set.of("G-RQ-071","G-RQ-072","G-RQ-073","G-RQ-074")),"meta requirement-to-test mapping complete");
        ledger.recordEvidence(new ContinuityQualificationLedger.Evidence("ev-map","G-RQ-071",ContinuityQualificationLedger.EvidenceClass.TRACEABILITY_META,ContinuityQualificationLedger.Standing.PASS,"matrix:76","digest-map",Instant.now()));
        ledger.recordEvidence(new ContinuityQualificationLedger.Evidence("ev-class","G-RQ-074",ContinuityQualificationLedger.EvidenceClass.TRACEABILITY_META,ContinuityQualificationLedger.Standing.PASS,"classifier:test","digest-class",Instant.now()));
        eq(ContinuityQualificationLedger.Standing.NOT_STARTED,ledger.view("G-RQ-072").standings().get(ContinuityQualificationLedger.EvidenceClass.TARGET_WINDOWS_REBOOT),"windows target remains not started");
        eq(ContinuityQualificationLedger.Standing.NOT_STARTED,ledger.view("G-RQ-072").standings().get(ContinuityQualificationLedger.EvidenceClass.TARGET_IOS_CLIENT_SUSPEND_RESUME),"ios target remains not started");
        eq(ContinuityQualificationLedger.Standing.NOT_STARTED,ledger.view("G-RQ-073").standings().get(ContinuityQualificationLedger.EvidenceClass.EMPIRICAL_HUMAN_EVIDENCE),"human evidence remains separately not started");
        ledger.recordEvidence(new ContinuityQualificationLedger.Evidence("win-only","G-RQ-072",ContinuityQualificationLedger.EvidenceClass.TARGET_WINDOWS_REBOOT,ContinuityQualificationLedger.Standing.PASS,"fixture:windows","digest-win",Instant.now()));
        ok(!ledger.view("G-RQ-072").implementationSatisfied(),"one target class cannot satisfy the two-target evidence requirement");
        throwsIt(()->ledger.recordEvidence(new ContinuityQualificationLedger.Evidence("bad","G-RQ-072",ContinuityQualificationLedger.EvidenceClass.PORTABLE_NON_TARGET,ContinuityQualificationLedger.Standing.PASS,"wrong","bad",Instant.now())),"portable evidence cannot masquerade as target evidence");
        throwsIt(()->ledger.recordEvidence(new ContinuityQualificationLedger.Evidence("bad-human","G-RQ-073",ContinuityQualificationLedger.EvidenceClass.TRACEABILITY_META,ContinuityQualificationLedger.Standing.PASS,"wrong","bad",Instant.now())),"human evidence cannot be relabelled traceability evidence");
        ok(!ledger.implementationQualified(Set.of("G-RQ-071","G-RQ-072","G-RQ-073","G-RQ-074")),"target and human gaps block qualification");
        ok(ledger.view("G-RQ-071").implementationSatisfied(),"mapping meta invariant satisfied");
        ok(ledger.view("G-RQ-074").implementationSatisfied(),"evidence class invariant satisfied");
        System.out.println("ASSERTIONS="+assertions);
        System.out.println("PASS CONTINUITY-QUALIFICATION-CLOSURE portable_meta=2 target_pending=1 human_pending=1");
    }
}
