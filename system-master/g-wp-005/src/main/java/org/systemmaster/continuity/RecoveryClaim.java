package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Objects;

public record RecoveryClaim(
        String recoveryClaimId,
        String recoveryId,
        String workUnitId,
        long claimEpoch,
        String claimantExecutorRef,
        Instant leaseUntil,
        long fenceEpoch,
        Instant claimedAt,
        Instant renewedAt,
        Instant releasedAt,
        long version) {
    public RecoveryClaim {
        recoveryClaimId=ClaimAuthorities.req(recoveryClaimId,"recoveryClaimId");
        recoveryId=ClaimAuthorities.req(recoveryId,"recoveryId");
        workUnitId=ClaimAuthorities.req(workUnitId,"workUnitId");
        if(claimEpoch<1) throw new IllegalArgumentException("claimEpoch");
        claimantExecutorRef=ClaimAuthorities.req(claimantExecutorRef,"claimantExecutorRef");
        leaseUntil=Objects.requireNonNull(leaseUntil,"leaseUntil");
        if(fenceEpoch<1) throw new IllegalArgumentException("fenceEpoch");
        claimedAt=Objects.requireNonNull(claimedAt,"claimedAt");
        if(renewedAt==null) renewedAt=claimedAt;
        if(version<1) throw new IllegalArgumentException("version");
    }
    public boolean released(){return releasedAt!=null;}
    public boolean activeAt(Instant now){return !released() && leaseUntil.isAfter(now);}
}
