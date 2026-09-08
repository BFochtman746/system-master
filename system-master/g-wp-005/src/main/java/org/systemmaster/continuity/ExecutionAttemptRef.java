package org.systemmaster.continuity;

import java.time.Instant;

public record ExecutionAttemptRef(
        String attemptId,String workUnitId,long attemptNo,String recoveryId,String resumedFromCheckpointRef,
        long fenceEpoch,String runtimeIdentity,Instant startedAt,Instant endedAt,String outcome) {
    public ExecutionAttemptRef {
        attemptId=ClaimAuthorities.req(attemptId,"attemptId");
        workUnitId=ClaimAuthorities.req(workUnitId,"workUnitId");
        if(attemptNo<1)throw new IllegalArgumentException("attemptNo");
        recoveryId=ClaimAuthorities.req(recoveryId,"recoveryId");
        if(fenceEpoch<1)throw new IllegalArgumentException("fenceEpoch");
        runtimeIdentity=ClaimAuthorities.req(runtimeIdentity,"runtimeIdentity");
        if(startedAt==null)throw new IllegalArgumentException("startedAt");
    }
}
