package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class CheckpointCoordinator {
    private final CheckpointStore store;
    private final CheckpointAuthorities.WorkIdentityAuthority workAuthority;
    private final CheckpointAuthorities.ExecutionFenceAuthority fenceAuthority;

    public CheckpointCoordinator(Path root,CheckpointAuthorities.WorkIdentityAuthority workAuthority,CheckpointAuthorities.ExecutionFenceAuthority fenceAuthority){
        this.store=new CheckpointStore(root);this.workAuthority=Objects.requireNonNull(workAuthority);this.fenceAuthority=Objects.requireNonNull(fenceAuthority);
    }
    public CheckpointPayloadRef storePayload(byte[] bytes,String encryptionRef,String classification,String custodian){return store.putPayload(bytes,encryptionRef,classification,custodian);}

    public CheckpointResult recordCheckpoint(Request r){
        Objects.requireNonNull(r);String work=CheckpointPayloadRef.req(r.workUnitId(),"workUnitId");
        if(!workAuthority.exists(work))throw new CheckpointRejectedException("unknown work unit");
        if(!r.semanticBoundaryDeclared())throw new CheckpointRejectedException("unsafe checkpoint boundary");
        if(!fenceAuthority.isCurrent(work,r.attemptId(),r.fenceEpoch()))throw new StaleFenceException("stale execution fence");
        if(r.checkpointSeq()<1)throw new CheckpointRejectedException("checkpoint sequence must be >= 1");
        if(r.payloadRef()==null||!store.payloadDurableAndValid(r.payloadRef()))throw new InvalidPayloadException("payload is not durable and digest verified");

        CheckpointManifest priorSame=store.byWorkSeq(work,r.checkpointSeq()).orElse(null);
        String parent=store.latest(work).map(CheckpointManifest::checkpointId).orElse(null);
        if(priorSame!=null)parent=priorSame.parentCheckpointRef();
        CheckpointManifest candidate=build(r,parent);
        if(priorSame!=null){if(priorSame.manifestDigest().equals(candidate.manifestDigest()))return new CheckpointResult(priorSame,true);throw new CheckpointRejectedException("same sequence different checkpoint content");}
        CheckpointManifest latest=store.latest(work).orElse(null);
        if(latest!=null){
            if(r.checkpointSeq()<=latest.checkpointSeq())throw new CheckpointRejectedException("checkpoint sequence not monotonic");
            if(r.decisionHistoryWatermark()<latest.decisionHistoryWatermark()||r.externalEffectWatermark()<latest.externalEffectWatermark())throw new CheckpointRejectedException("checkpoint watermarks not monotonic");
        }
        try{var c=store.commit(candidate);return new CheckpointResult(c.manifest(),c.idempotentExisting());}
        catch(CheckpointStore.CheckpointConflictException e){throw new CheckpointRejectedException(e.getMessage());}
    }

    private static CheckpointManifest build(Request r,String parent){
        String manifestBody=String.join("|",r.workUnitId(),Long.toString(r.checkpointSeq()),r.checkpointKind(),r.semanticBoundaryId(),r.payloadRef().contentDigest(),r.schemaVersion(),r.runtimeContractVersion(),Long.toString(r.decisionHistoryWatermark()),Long.toString(r.externalEffectWatermark()),r.attemptId(),Long.toString(r.fenceEpoch()),String.join(",",r.compatibilityRequirements()),parent==null?"":parent);
        String digest=CheckpointStore.sha256(manifestBody);String id="checkpoint-"+CheckpointStore.sha256(r.workUnitId()+"|"+r.checkpointSeq()+"|"+digest).substring(0,24);
        return new CheckpointManifest(id,r.workUnitId(),r.checkpointSeq(),r.checkpointKind(),r.semanticBoundaryId(),r.payloadRef().artifactRef(),r.payloadRef().contentDigest(),r.schemaVersion(),r.runtimeContractVersion(),r.decisionHistoryWatermark(),r.externalEffectWatermark(),r.attemptId(),r.fenceEpoch(),Instant.now(),r.compatibilityRequirements(),parent,digest);
    }

    CheckpointStore store(){return store;}
    public record Request(String workUnitId,String attemptId,long fenceEpoch,long checkpointSeq,String checkpointKind,String semanticBoundaryId,boolean semanticBoundaryDeclared,CheckpointPayloadRef payloadRef,String schemaVersion,String runtimeContractVersion,long decisionHistoryWatermark,long externalEffectWatermark,List<String> compatibilityRequirements){public Request{compatibilityRequirements=List.copyOf(compatibilityRequirements==null?List.of():compatibilityRequirements);}}
    public record CheckpointResult(CheckpointManifest manifest,boolean idempotentExisting){}
    public static class CheckpointRejectedException extends RuntimeException{public CheckpointRejectedException(String m){super(m);}}
    public static final class StaleFenceException extends CheckpointRejectedException{public StaleFenceException(String m){super(m);}}
    public static final class InvalidPayloadException extends CheckpointRejectedException{public InvalidPayloadException(String m){super(m);}}
}
