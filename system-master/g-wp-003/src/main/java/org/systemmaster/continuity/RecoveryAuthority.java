package org.systemmaster.continuity;

import java.util.List;

public interface RecoveryAuthority {
    Handle openRecovery(String workUnitId,long expectedWorkVersion,String interruptionRef);
    Handle get(String recoveryId);
    Handle transition(String recoveryId,long expectedVersion,String fromState,String toState,String reason,List<String> evidenceRefs,String commandId);
    record Handle(String recoveryId,String workUnitId,long version,String state) {}
}
