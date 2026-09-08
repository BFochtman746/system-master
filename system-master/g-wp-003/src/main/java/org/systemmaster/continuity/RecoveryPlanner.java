package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class RecoveryPlanner {
    private final Gwp003Store store; private final RecoveryAuthority authority;
    public RecoveryPlanner(Path dir,RecoveryAuthority authority){this.store=new Gwp003Store(dir);this.authority=Objects.requireNonNull(authority,"authority");}
    public RecoveryPlan plan(String recoveryId,RecoveryClassification c,PlanInputs in){
        Objects.requireNonNull(c,"classification");Objects.requireNonNull(in,"inputs");if(!c.recoveryId().equals(recoveryId))throw new IllegalArgumentException("classification recovery mismatch");
        String inputDigest=in.digest(c); RecoveryPlan prior=store.latestPlan(recoveryId); if(prior!=null&&prior.inputStateDigest().equals(inputDigest))return prior;
        List<String> blockers=blockers(c,in); List<String> steps=steps(c,in,blockers); long version=prior==null?1:prior.version()+1;
        String planId="plan-"+Gwp003Store.sha256(recoveryId).substring(0,20);
        String planDigest=Gwp003Store.sha256(planId+"|"+version+"|"+c.classificationId()+"|"+inputDigest+"|"+String.join(",",steps)+"|"+String.join(",",in.verificationCriteria()));
        RecoveryPlan p=new RecoveryPlan(planId,version,recoveryId,c.classificationId(),c.recoveryClass(),in.checkpointRef(),in.reconcileEffectRefs(),in.compatibilityDigest(),in.authorityDigest(),in.resourceClass(),steps,in.verificationCriteria(),blockers,inputDigest,planDigest,Instant.now());
        store.putPlan(p);
        RecoveryAuthority.Handle h=authority.get(recoveryId);
        if(p.ready()&&"CLASSIFYING".equals(h.state()))authority.transition(recoveryId,h.version(),"CLASSIFYING","PLAN_READY","plan ready",List.of(planDigest),"plan-ready:"+planDigest);
        return p;
    }
    public RecoveryPlan getRecoveryPlan(String recoveryId){return store.latestPlan(recoveryId);}
    private static List<String> blockers(RecoveryClassification c,PlanInputs in){List<String>b=new ArrayList<>();if(in.policyDigest().isBlank())b.add("POLICY_MISSING");if(in.compatibilityDigest().isBlank())b.add("COMPATIBILITY_MISSING");if(in.authorityDigest().isBlank())b.add("AUTHORITY_MISSING");if(in.verificationCriteria().isEmpty())b.add("VERIFICATION_CRITERIA_MISSING");switch(c.recoveryClass()){case MANUAL->b.add("MANUAL_DECISION_REQUIRED");case QUARANTINE->b.add("QUARANTINED");case WAIT_DEPENDENCY->b.add("DEPENDENCY_WAITING");case TERMINAL->b.add("TERMINAL_DISPOSITION");case RECONCILE_THEN_RESUME->{if(in.reconcileEffectRefs().isEmpty())b.add("RECONCILIATION_ITEMS_MISSING");}case RESUME->{if(in.checkpointRef()==null||in.checkpointRef().isBlank())b.add("CHECKPOINT_REQUIRED");}default->{}}return List.copyOf(b);}
    private static List<String> steps(RecoveryClassification c,PlanInputs in,List<String> blockers){if(!blockers.isEmpty())return List.of("HOLD");return switch(c.recoveryClass()){case RESUME->List.of("VALIDATE_CHECKPOINT","START_RESUME","VERIFY");case RECONCILE_THEN_RESUME->List.of("RECONCILE_EFFECTS","START_RESUME","VERIFY");case RESTART_SAFE_BOUNDARY->List.of("RESTORE_SAFE_BOUNDARY","START_RESUME","VERIFY");case RESTART_BEGINNING->List.of("RESTART_BEGINNING","VERIFY");case MIGRATE->List.of("MIGRATE_RUNTIME_OR_STATE","START_RESUME","VERIFY");case OLD_RUNTIME->List.of("SELECT_OLD_RUNTIME","START_RESUME","VERIFY");default->List.of("HOLD");};}
    public record PlanInputs(String policyDigest,String checkpointRef,List<String> reconcileEffectRefs,String compatibilityDigest,String authorityDigest,String resourceClass,List<String> verificationCriteria){
        public PlanInputs{policyDigest=required(policyDigest,"policyDigest");reconcileEffectRefs=List.copyOf(reconcileEffectRefs==null?List.of():reconcileEffectRefs);compatibilityDigest=required(compatibilityDigest,"compatibilityDigest");authorityDigest=required(authorityDigest,"authorityDigest");resourceClass=required(resourceClass,"resourceClass");verificationCriteria=List.copyOf(verificationCriteria==null?List.of():verificationCriteria);}
        String digest(RecoveryClassification c){return Gwp003Store.sha256(c.classificationId()+"|"+c.evidenceSetDigest()+"|"+policyDigest+"|"+String.valueOf(checkpointRef)+"|"+String.join(",",reconcileEffectRefs)+"|"+compatibilityDigest+"|"+authorityDigest+"|"+resourceClass+"|"+String.join(",",verificationCriteria));}
        private static String required(String v,String n){if(v==null||v.trim().isEmpty())throw new IllegalArgumentException(n+" required");return v.trim();}
    }
}
