package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class RecoveryClassifier {
    private final Gwp003Store store;
    private final RecoveryAuthority authority;
    public RecoveryClassifier(Path dir,RecoveryAuthority authority){this.store=new Gwp003Store(dir);this.authority=Objects.requireNonNull(authority,"authority");}
    public RecoveryClassification classify(String recoveryId,EvidenceSet e){
        Objects.requireNonNull(e,"evidence");
        RecoveryAuthority.Handle h=authority.get(recoveryId);
        String digest=e.digest(); RecoveryClassification prior=store.classification(recoveryId);
        if(prior!=null&&prior.evidenceSetDigest().equals(digest))return prior;
        RecoveryAuthority.Handle current=h;
        if("DETECTED".equals(current.state()))current=authority.transition(recoveryId,current.version(),"DETECTED","CLASSIFYING","classification started",e.evidenceRefs(),"classify-start:"+digest);
        if(!"CLASSIFYING".equals(current.state())&&!isDispositionState(current.state()))throw new IllegalStateException("recovery not classifiable from "+current.state());
        Decision d=decide(e);
        String id="class-"+Gwp003Store.sha256(recoveryId+"|"+digest+"|"+d.recoveryClass()).substring(0,24);
        RecoveryClassification c=new RecoveryClassification(id,recoveryId,h.workUnitId(),d.recoveryClass(),d.reasons(),e.checkpointCandidateRef(),e.externalEffect().name(),e.compatibility().name(),e.authority().name(),d.confidence(),e.evidenceRefs(),digest,Instant.now());
        store.putClassification(c);
        String target=stateFor(d.recoveryClass());
        if(target!=null&&"CLASSIFYING".equals(current.state()))authority.transition(recoveryId,current.version(),"CLASSIFYING",target,"classification "+d.recoveryClass(),e.evidenceRefs(),"classify-disposition:"+digest);
        return c;
    }
    public RecoveryClassification get(String recoveryId){return store.classification(recoveryId);}
    private static boolean isDispositionState(String s){return List.of("WAITING_DEPENDENCY","BLOCKED","MANUAL_DECISION","QUARANTINED","TERMINAL_FAILED").contains(s);}
    private static String stateFor(RecoveryClassification.RecoveryClass c){return switch(c){case WAIT_DEPENDENCY->"WAITING_DEPENDENCY";case MANUAL->"MANUAL_DECISION";case QUARANTINE->"QUARANTINED";case TERMINAL->"TERMINAL_FAILED";default->null;};}
    static Decision decide(EvidenceSet e){
        List<String> r=new ArrayList<>();
        if(e.terminalEvidence()){r.add("TERMINAL_EVIDENCE");return new Decision(RecoveryClassification.RecoveryClass.TERMINAL,r,1.0);}
        if(e.checkpoint()==CheckpointState.CORRUPT){r.add("CHECKPOINT_CORRUPT");return new Decision(RecoveryClassification.RecoveryClass.QUARANTINE,r,1.0);}
        if(e.authority()==AuthorityState.UNKNOWN||e.compatibility()==CompatibilityState.UNKNOWN||e.checkpoint()==CheckpointState.UNKNOWN){r.add("CRITICAL_EVIDENCE_UNKNOWN");return new Decision(RecoveryClassification.RecoveryClass.MANUAL,r,0.2);}
        if(e.authority()==AuthorityState.DENIED){r.add("AUTHORITY_DENIED");return new Decision(RecoveryClassification.RecoveryClass.MANUAL,r,1.0);}
        if(e.dependency()==DependencyState.WAITING){r.add("DEPENDENCY_WAITING");return new Decision(RecoveryClassification.RecoveryClass.WAIT_DEPENDENCY,r,0.9);}
        if(e.compatibility()==CompatibilityState.INCOMPATIBLE){r.add("RUNTIME_INCOMPATIBLE");return new Decision(e.oldRuntimeAvailable()?RecoveryClassification.RecoveryClass.OLD_RUNTIME:RecoveryClassification.RecoveryClass.MIGRATE,r,0.9);}
        if(e.externalEffect()==ExternalEffectState.UNKNOWN||e.externalEffect()==ExternalEffectState.DIVERGED){r.add("EXTERNAL_EFFECT_RECONCILIATION_REQUIRED");return new Decision(RecoveryClassification.RecoveryClass.RECONCILE_THEN_RESUME,r,0.9);}
        if(e.checkpoint()==CheckpointState.VALID){r.add("VALID_CHECKPOINT");return new Decision(RecoveryClassification.RecoveryClass.RESUME,r,0.95);}
        if(e.safeBoundaryAvailable()){r.add("SAFE_BOUNDARY_AVAILABLE");return new Decision(RecoveryClassification.RecoveryClass.RESTART_SAFE_BOUNDARY,r,0.9);}
        r.add("NO_CHECKPOINT_RESTART_BEGINNING");return new Decision(RecoveryClassification.RecoveryClass.RESTART_BEGINNING,r,0.85);
    }
    public enum CheckpointState{VALID,NONE,UNKNOWN,CORRUPT}
    public enum ExternalEffectState{NONE,KNOWN_COMMITTED,UNKNOWN,DIVERGED}
    public enum CompatibilityState{COMPATIBLE,INCOMPATIBLE,UNKNOWN}
    public enum AuthorityState{AUTHORIZED,DENIED,UNKNOWN}
    public enum DependencyState{READY,WAITING}
    public record EvidenceSet(CheckpointState checkpoint,String checkpointCandidateRef,ExternalEffectState externalEffect,CompatibilityState compatibility,AuthorityState authority,DependencyState dependency,boolean safeBoundaryAvailable,boolean oldRuntimeAvailable,boolean terminalEvidence,List<String> evidenceRefs){
        public EvidenceSet{Objects.requireNonNull(checkpoint);Objects.requireNonNull(externalEffect);Objects.requireNonNull(compatibility);Objects.requireNonNull(authority);Objects.requireNonNull(dependency);evidenceRefs=List.copyOf(evidenceRefs==null?List.of():evidenceRefs);}
        public String digest(){return Gwp003Store.sha256(checkpoint+"|"+String.valueOf(checkpointCandidateRef)+"|"+externalEffect+"|"+compatibility+"|"+authority+"|"+dependency+"|"+safeBoundaryAvailable+"|"+oldRuntimeAvailable+"|"+terminalEvidence+"|"+String.join(",",evidenceRefs));}
    }
    record Decision(RecoveryClassification.RecoveryClass recoveryClass,List<String> reasons,double confidence){}
}
