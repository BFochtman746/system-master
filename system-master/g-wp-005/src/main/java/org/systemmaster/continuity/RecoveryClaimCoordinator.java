package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class RecoveryClaimCoordinator {
    private final RecoveryClaimStore store;
    private final ClaimAuthorities.RecoveryStateAuthority recoveryAuthority;
    private final ClaimAuthorities.ExecutorEligibilityAuthority executorAuthority;
    private final ClaimAuthorities.ResourceAdmissionAuthority admissionAuthority;
    private final ClaimAuthorities.AuthoritativeTime time;
    private final Duration leaseDuration;

    public RecoveryClaimCoordinator(Path root, ClaimAuthorities.RecoveryStateAuthority recoveryAuthority,
            ClaimAuthorities.ExecutorEligibilityAuthority executorAuthority, ClaimAuthorities.ResourceAdmissionAuthority admissionAuthority,
            ClaimAuthorities.AuthoritativeTime time, Duration leaseDuration){
        this.store=new RecoveryClaimStore(root);this.recoveryAuthority=Objects.requireNonNull(recoveryAuthority);this.executorAuthority=Objects.requireNonNull(executorAuthority);
        this.admissionAuthority=Objects.requireNonNull(admissionAuthority);this.time=Objects.requireNonNull(time);this.leaseDuration=Objects.requireNonNull(leaseDuration);
        if(leaseDuration.isZero()||leaseDuration.isNegative())throw new IllegalArgumentException("leaseDuration must be positive");
    }

    public ClaimResult claimRecovery(String recoveryId,String claimant,long expectedRecoveryVersion,String claimRequestId){
        String rid=req(recoveryId,"recoveryId"), exec=req(claimant,"claimant"), request=req(claimRequestId,"claimRequestId");
        String digest=RecoveryClaimStore.sha256(rid+"|"+exec+"|"+expectedRecoveryVersion+"|"+request);
        return store.transact(s->{
            ClaimAuthorities.RecoveryStanding standing=recoveryAuthority.standing(rid);
            if(standing.version()!=expectedRecoveryVersion)throw new StaleRecoveryVersionException(expectedRecoveryVersion,standing.version());
            if(!standing.claimable())return RecoveryClaimStore.Decision.read(ClaimResult.blocked("RECOVERY_NOT_CLAIMABLE"));
            ClaimAuthorities.Decision ed=executorAuthority.eligibility(exec,rid); if(ed!=ClaimAuthorities.Decision.ALLOW)return RecoveryClaimStore.Decision.read(ClaimResult.blocked(ed==ClaimAuthorities.Decision.DENY?"EXECUTOR_DENIED":"EXECUTOR_UNKNOWN"));
            ClaimAuthorities.Decision ad=admissionAuthority.admission(exec,rid); if(ad!=ClaimAuthorities.Decision.ALLOW)return RecoveryClaimStore.Decision.read(ClaimResult.blocked(ad==ClaimAuthorities.Decision.DENY?"RESOURCE_DENIED":"RESOURCE_UNKNOWN"));
            Instant now=time.now();
            RecoveryClaimStore.Receipt prior=s.receipts().get("claim:"+request);
            if(prior!=null){if(!prior.digest().equals(digest))throw new ClaimConflictException("claim_request_id reused with different request");return RecoveryClaimStore.Decision.read(ClaimResult.claimed(s.byId().get(prior.claimId()),true));}
            String currentId=s.currentByRecovery().get(rid); RecoveryClaim current=currentId==null?null:s.byId().get(currentId);
            if(current!=null && current.activeAt(now))return RecoveryClaimStore.Decision.read(ClaimResult.busy(current));
            long claimEpoch=s.maxClaimEpoch().getOrDefault(rid,0L)+1; long fenceEpoch=s.maxFenceEpoch().getOrDefault(standing.workUnitId(),0L)+1;
            String claimId="claim-"+RecoveryClaimStore.sha256(rid+"|"+claimEpoch+"|"+fenceEpoch).substring(0,24);
            RecoveryClaim c=new RecoveryClaim(claimId,rid,standing.workUnitId(),claimEpoch,exec,now.plus(leaseDuration),fenceEpoch,now,now,null,1);
            return RecoveryClaimStore.Decision.append(ClaimResult.claimed(c,false),RecoveryClaimStore.claimFrame(c,"claim:"+request,digest));
        });
    }

    public RecoveryClaim renewRecoveryClaim(String claimId,long fenceEpoch,long renewalSeq){
        if(renewalSeq<1)throw new IllegalArgumentException("renewalSeq"); String cid=req(claimId,"claimId"); Instant now=time.now();
        String request="renew:"+cid+":"+renewalSeq, digest=RecoveryClaimStore.sha256(cid+"|"+fenceEpoch+"|"+renewalSeq);
        return store.transact(s->{
            RecoveryClaimStore.Receipt prior=s.receipts().get(request);if(prior!=null){if(!prior.digest().equals(digest))throw new ClaimConflictException("renewal identity conflict");return RecoveryClaimStore.Decision.read(s.byId().get(cid));}
            RecoveryClaim c=must(s,cid); assertCurrent(s,c,fenceEpoch,now);
            RecoveryClaim next=new RecoveryClaim(c.recoveryClaimId(),c.recoveryId(),c.workUnitId(),c.claimEpoch(),c.claimantExecutorRef(),now.plus(leaseDuration),c.fenceEpoch(),c.claimedAt(),now,null,c.version()+1);
            return RecoveryClaimStore.Decision.append(next,RecoveryClaimStore.renewFrame(next,request,digest,renewalSeq));
        });
    }

    public ReleaseResult releaseRecoveryClaim(String claimId,long fenceEpoch,long releaseSeq,String reason){
        if(releaseSeq<1)throw new IllegalArgumentException("releaseSeq"); String cid=req(claimId,"claimId"), why=req(reason,"reason"); Instant now=time.now();
        String request="release:"+cid+":"+releaseSeq, digest=RecoveryClaimStore.sha256(cid+"|"+fenceEpoch+"|"+releaseSeq+"|"+why);
        return store.transact(s->{
            RecoveryClaimStore.Receipt prior=s.receipts().get(request);if(prior!=null){if(!prior.digest().equals(digest))throw new ClaimConflictException("release identity conflict");return RecoveryClaimStore.Decision.read(new ReleaseResult(s.byId().get(cid),true));}
            RecoveryClaim c=must(s,cid); if(c.released())return RecoveryClaimStore.Decision.read(new ReleaseResult(c,true)); assertCurrent(s,c,fenceEpoch,now);
            RecoveryClaim next=new RecoveryClaim(c.recoveryClaimId(),c.recoveryId(),c.workUnitId(),c.claimEpoch(),c.claimantExecutorRef(),c.leaseUntil(),c.fenceEpoch(),c.claimedAt(),c.renewedAt(),now,c.version()+1);
            return RecoveryClaimStore.Decision.append(new ReleaseResult(next,false),RecoveryClaimStore.releaseFrame(next,request,digest,releaseSeq,why));
        });
    }

    public void assertCurrentFence(String recoveryId,String claimId,long fenceEpoch){
        String rid=req(recoveryId,"recoveryId"),cid=req(claimId,"claimId"); Instant now=time.now(); RecoveryClaimStore.Snapshot s=store.snapshot(); RecoveryClaim c=must(s,cid);
        if(!c.recoveryId().equals(rid))throw new StaleFenceException("claim recovery mismatch"); assertCurrent(s,c,fenceEpoch,now);
    }
    public Optional<RecoveryClaim> getClaim(String claimId){return Optional.ofNullable(store.snapshot().byId().get(claimId));}
    public Optional<RecoveryClaim> currentClaim(String recoveryId){RecoveryClaimStore.Snapshot s=store.snapshot();String id=s.currentByRecovery().get(recoveryId);if(id==null)return Optional.empty();RecoveryClaim c=s.byId().get(id);return c.activeAt(time.now())?Optional.of(c):Optional.empty();}
    public boolean queueCandidateHint(String recoveryId){return recoveryAuthority.standing(recoveryId).claimable();}

    private static RecoveryClaim must(RecoveryClaimStore.Snapshot s,String cid){RecoveryClaim c=s.byId().get(cid);if(c==null)throw new ClaimConflictException("unknown claim");return c;}
    private static void assertCurrent(RecoveryClaimStore.Snapshot s,RecoveryClaim c,long fenceEpoch,Instant now){
        if(c.fenceEpoch()!=fenceEpoch)throw new StaleFenceException("stale fence epoch"); if(c.released())throw new StaleFenceException("claim released");
        if(!Objects.equals(s.currentByRecovery().get(c.recoveryId()),c.recoveryClaimId()))throw new StaleFenceException("claim superseded"); if(!c.leaseUntil().isAfter(now))throw new ExpiredClaimException("claim expired");
    }
    private static String req(String v,String n){return ClaimAuthorities.req(v,n);}

    public record ClaimResult(Status status,RecoveryClaim claim,boolean idempotentExisting,String blocker){
        static ClaimResult claimed(RecoveryClaim c,boolean i){return new ClaimResult(Status.CLAIMED,c,i,null);} static ClaimResult busy(RecoveryClaim c){return new ClaimResult(Status.BUSY,c,false,null);} static ClaimResult blocked(String b){return new ClaimResult(Status.BLOCKED,null,false,b);}
    }
    public enum Status{CLAIMED,BUSY,BLOCKED}
    public record ReleaseResult(RecoveryClaim claim,boolean idempotentExisting){}
    public static class ClaimConflictException extends RuntimeException{public ClaimConflictException(String m){super(m);}}
    public static final class StaleFenceException extends ClaimConflictException{public StaleFenceException(String m){super(m);}}
    public static final class ExpiredClaimException extends ClaimConflictException{public ExpiredClaimException(String m){super(m);}}
    public static final class StaleRecoveryVersionException extends ClaimConflictException{public final long expected,actual;public StaleRecoveryVersionException(long e,long a){super("stale recovery version expected="+e+" actual="+a);expected=e;actual=a;}}
}
