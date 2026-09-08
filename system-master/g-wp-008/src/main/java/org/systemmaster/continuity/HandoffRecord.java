package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record HandoffRecord(
        String handoffId,
        String workUnitId,
        long recoveryEpoch,
        String fromActorRef,
        String toRoleOrActorRef,
        String stateDigest,
        String checkpointRef,
        List<String> unresolvedEffectRefs,
        List<String> pendingSignalRefs,
        List<String> blockerRefs,
        Instant createdAt,
        String handoffDigest,
        AdoptionState adoptionState,
        String adoptedByActorRef,
        Instant adoptedAt,
        long version) {
    public HandoffRecord {
        handoffId=req(handoffId,"handoffId"); workUnitId=req(workUnitId,"workUnitId");
        if(recoveryEpoch<1) throw new IllegalArgumentException("recoveryEpoch");
        fromActorRef=req(fromActorRef,"fromActorRef"); toRoleOrActorRef=req(toRoleOrActorRef,"toRoleOrActorRef");
        stateDigest=req(stateDigest,"stateDigest"); checkpointRef=norm(checkpointRef);
        unresolvedEffectRefs=copy(unresolvedEffectRefs); pendingSignalRefs=copy(pendingSignalRefs); blockerRefs=copy(blockerRefs);
        createdAt=Objects.requireNonNull(createdAt,"createdAt"); handoffDigest=req(handoffDigest,"handoffDigest");
        adoptionState=Objects.requireNonNull(adoptionState,"adoptionState"); adoptedByActorRef=norm(adoptedByActorRef);
        if(adoptionState==AdoptionState.ADOPTED && adoptedByActorRef==null) throw new IllegalArgumentException("adopted actor required");
        if(adoptionState!=AdoptionState.ADOPTED && adoptedByActorRef!=null) throw new IllegalArgumentException("adopted actor only when adopted");
        if(adoptionState==AdoptionState.ADOPTED && adoptedAt==null) throw new IllegalArgumentException("adoptedAt required");
        if(version<1) throw new IllegalArgumentException("version");
    }
    public enum AdoptionState { PENDING, ADOPTED, STALE, BLOCKED }
    private static List<String> copy(List<String> v){return List.copyOf(v==null?List.of():v);}
    private static String req(String v,String n){String x=norm(v);if(x==null)throw new IllegalArgumentException(n+" required");return x;}
    private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
