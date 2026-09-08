package org.systemmaster.continuity;

import java.util.List;

public final class Gwp002RecoveryAuthority implements RecoveryAuthority {
    private final RecoveryRegistry registry;
    public Gwp002RecoveryAuthority(RecoveryRegistry registry){this.registry=java.util.Objects.requireNonNull(registry,"registry");}
    public Handle openRecovery(String workUnitId,long expectedWorkVersion,String interruptionRef){
        RecoveryRecord r=registry.openRecovery(workUnitId,expectedWorkVersion,interruptionRef).record();
        return new Handle(r.recoveryId(),r.workUnitId(),r.version(),r.state().name());
    }
    public Handle get(String recoveryId){
        RecoveryRecord r=registry.getRecovery(recoveryId).orElseThrow(()->new IllegalArgumentException("unknown recovery_id"));
        return new Handle(r.recoveryId(),r.workUnitId(),r.version(),r.state().name());
    }
    public Handle transition(String recoveryId,long expectedVersion,String fromState,String toState,String reason,List<String> evidenceRefs,String commandId){
        RecoveryRecord r=registry.transitionRecovery(recoveryId,expectedVersion,RecoveryRecord.RecoveryState.valueOf(fromState),RecoveryRecord.RecoveryState.valueOf(toState),reason,evidenceRefs,commandId);
        return new Handle(r.recoveryId(),r.workUnitId(),r.version(),r.state().name());
    }
}
