package org.systemmaster.continuity;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class InterruptionDetector {
    private final Gwp003Store store;
    private final RecoveryAuthority recoveryAuthority;
    public InterruptionDetector(Path storeDirectory, RecoveryAuthority recoveryAuthority){this.store=new Gwp003Store(storeDirectory);this.recoveryAuthority=Objects.requireNonNull(recoveryAuthority,"recoveryAuthority");}

    public ReportResult report(ReportCommand c){
        Objects.requireNonNull(c,"command");
        if(!c.trustedEvidence())throw new IllegalArgumentException("source evidence must be trusted");
        String digest=Gwp003Store.sha256(String.join("|",req(c.workUnitId()),req(c.attemptId()),req(c.source()),req(c.observation()),req(c.dedupeKey()),String.join(",",c.evidenceRefs()==null?List.of():c.evidenceRefs())));
        InterruptionObservation prior=store.observation(c.dedupeKey());
        if(prior!=null){if(!prior.observationDigest().equals(digest))throw new Gwp003Store.StoreConflict("dedupe_key reused with different observation");RecoveryAuthority.Handle h=recoveryAuthority.openRecovery(c.workUnitId(),c.expectedWorkVersion(),prior.interruptionId());return new ReportResult(prior,h,true);}
        Instant now=c.observedAt()==null?Instant.now():c.observedAt();
        String interruptionId="interrupt-"+digest.substring(0,24);
        InterruptionObservation o=new InterruptionObservation(interruptionId,c.workUnitId(),c.attemptId(),c.source(),now,c.lastHeartbeatAt(),n(c.leaseState(),"UNKNOWN"),c.processInstanceRef(),c.providerState(),c.evidenceRefs(),c.dedupeKey(),digest);
        store.putObservation(o);
        RecoveryAuthority.Handle h=recoveryAuthority.openRecovery(c.workUnitId(),c.expectedWorkVersion(),interruptionId);
        if("RECOVERED".equals(h.state())||"TERMINAL_FAILED".equals(h.state()))throw new IllegalStateException("interruption cannot create terminal semantic outcome");
        return new ReportResult(o,h,false);
    }
    public InterruptionObservation getByDedupeKey(String key){return store.observation(req(key));}
    private static String req(String v){if(v==null||v.trim().isEmpty())throw new IllegalArgumentException("required value");return v.trim();}
    private static String n(String v,String d){return v==null||v.trim().isEmpty()?d:v.trim();}
    public record ReportCommand(String workUnitId,long expectedWorkVersion,String attemptId,String source,String observation,String dedupeKey,boolean trustedEvidence,Instant observedAt,Instant lastHeartbeatAt,String leaseState,String processInstanceRef,String providerState,List<String> evidenceRefs){}
    public record ReportResult(InterruptionObservation observation, RecoveryAuthority.Handle recovery, boolean deduped){}
}
