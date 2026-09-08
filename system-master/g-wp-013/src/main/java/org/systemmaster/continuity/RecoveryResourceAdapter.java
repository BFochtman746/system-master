package org.systemmaster.continuity;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Admission adapter only; allocation remains with 021H through ResourceAuthority. */
public final class RecoveryResourceAdapter {
    public enum AuthorityDecision { ADMIT, WAIT, DENY, UNKNOWN }
    public enum AdmissionState { ADMITTED, QUEUED, DENIED, BLOCKED_POLICY }
    public interface ResourceAuthority { AuthorityDecision requestAdmission(String workUnitId,String resourceClass,int priority); }
    public record Admission(String admissionId,String workUnitId,String resourceClass,int priority,AdmissionState state,String reason,Instant requestedAt,Instant retryAfter) {}
    public record BacklogEntry(String workUnitId,String resourceClass,int priority,long ageSeconds,String reason) {}
    public record BacklogSnapshot(String metricDefinitionVersion,List<BacklogEntry> entries,int admittedNow,int queuedNow,Instant observedAt) {
        public BacklogSnapshot{entries=List.copyOf(entries);}
    }
    private final ContinuityPolicyRegistry policies; private final ResourceAuthority authority; private final String metricsVersion;
    private final ConcurrentHashMap<String,Admission> states=new ConcurrentHashMap<>(); private final AtomicLong seq=new AtomicLong();
    public RecoveryResourceAdapter(ContinuityPolicyRegistry policies,ResourceAuthority authority,String metricsVersion){this.policies=Objects.requireNonNull(policies);this.authority=Objects.requireNonNull(authority);this.metricsVersion=RecoveryAuthorizationGate.req(metricsVersion,"metricsVersion");}
    public Admission requestRecoveryAdmission(String workUnitId,String continuityClass,String resourceClass,int priority){
        workUnitId=RecoveryAuthorizationGate.req(workUnitId,"workUnitId");resourceClass=RecoveryAuthorizationGate.req(resourceClass,"resourceClass");
        var policy=policies.getContinuityPolicy(continuityClass);Instant now=Instant.now();
        if(policy.isEmpty())return save(new Admission(id(),workUnitId,resourceClass,priority,AdmissionState.BLOCKED_POLICY,"NO_CLASS_POLICY",now,null));
        long active=states.values().stream().filter(x->x.state()==AdmissionState.ADMITTED).count();
        if(active>=policy.get().maxConcurrentRecoveries())return queue(workUnitId,resourceClass,priority,"LOCAL_PACING_BOUND",now,policy.get().admissionBackoff());
        AuthorityDecision d=authority.requestAdmission(workUnitId,resourceClass,priority);
        return switch(d){case ADMIT->save(new Admission(id(),workUnitId,resourceClass,priority,AdmissionState.ADMITTED,"021H_ADMITTED",now,null));case DENY->save(new Admission(id(),workUnitId,resourceClass,priority,AdmissionState.DENIED,"021H_DENIED",now,null));case WAIT,UNKNOWN->queue(workUnitId,resourceClass,priority,"021H_"+d,now,policy.get().admissionBackoff());};
    }
    public BacklogSnapshot getRecoveryBacklog(){Instant now=Instant.now();List<BacklogEntry> q=new ArrayList<>();int admitted=0;for(var a:states.values()){if(a.state()==AdmissionState.ADMITTED)admitted++;if(a.state()==AdmissionState.QUEUED)q.add(new BacklogEntry(a.workUnitId(),a.resourceClass(),a.priority(),Math.max(0,Duration.between(a.requestedAt(),now).toSeconds()),a.reason()));}q.sort(Comparator.comparingInt(BacklogEntry::priority).reversed().thenComparingLong(BacklogEntry::ageSeconds).reversed());return new BacklogSnapshot(metricsVersion,q,admitted,q.size(),now);}
    private Admission queue(String w,String r,int p,String reason,Instant now,Duration backoff){return save(new Admission(id(),w,r,p,AdmissionState.QUEUED,reason,now,now.plus(backoff)));}
    private Admission save(Admission a){states.put(a.workUnitId(),a);return a;} private String id(){return "adm-"+seq.incrementAndGet();}
}
