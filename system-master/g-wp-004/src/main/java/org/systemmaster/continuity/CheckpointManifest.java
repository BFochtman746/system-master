package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;

public record CheckpointManifest(String checkpointId,String workUnitId,long checkpointSeq,String checkpointKind,
        String semanticBoundaryId,String payloadRef,String payloadDigest,String schemaVersion,String runtimeContractVersion,
        long decisionHistoryWatermark,long externalEffectWatermark,String sourceAttemptId,long sourceFenceEpoch,
        Instant createdAt,List<String> compatibilityRequirements,String parentCheckpointRef,String manifestDigest) {
    public CheckpointManifest {
        checkpointId=req(checkpointId,"checkpointId"); workUnitId=req(workUnitId,"workUnitId");
        if(checkpointSeq<1)throw new IllegalArgumentException("checkpointSeq"); checkpointKind=req(checkpointKind,"checkpointKind");
        semanticBoundaryId=req(semanticBoundaryId,"semanticBoundaryId"); payloadRef=req(payloadRef,"payloadRef"); payloadDigest=req(payloadDigest,"payloadDigest");
        schemaVersion=req(schemaVersion,"schemaVersion"); runtimeContractVersion=req(runtimeContractVersion,"runtimeContractVersion");
        if(decisionHistoryWatermark<0||externalEffectWatermark<0)throw new IllegalArgumentException("watermarks must be >= 0");
        sourceAttemptId=req(sourceAttemptId,"sourceAttemptId"); if(sourceFenceEpoch<1)throw new IllegalArgumentException("sourceFenceEpoch");
        createdAt=java.util.Objects.requireNonNull(createdAt,"createdAt");
        compatibilityRequirements=List.copyOf(compatibilityRequirements==null?List.of():compatibilityRequirements);
        parentCheckpointRef=CheckpointPayloadRef.norm(parentCheckpointRef); manifestDigest=req(manifestDigest,"manifestDigest");
    }
    private static String req(String v,String n){return CheckpointPayloadRef.req(v,n);}
}
