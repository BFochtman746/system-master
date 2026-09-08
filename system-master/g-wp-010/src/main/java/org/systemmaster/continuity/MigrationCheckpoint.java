package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Objects;

public record MigrationCheckpoint(
        String migrationId,String sourceCheckpointId,String migrationContractVersion,String targetVersion,
        long cursor,String accumulatedDigest,String lastChunkDigest,State state,String targetCheckpointId,String targetPayloadDigest,
        Instant updatedAt,long version) {
    public MigrationCheckpoint {
        migrationId=req(migrationId);sourceCheckpointId=req(sourceCheckpointId);migrationContractVersion=req(migrationContractVersion);targetVersion=req(targetVersion);
        if(cursor<0)throw new IllegalArgumentException("cursor");accumulatedDigest=req(accumulatedDigest);lastChunkDigest=norm(lastChunkDigest);state=Objects.requireNonNull(state);targetCheckpointId=norm(targetCheckpointId);targetPayloadDigest=norm(targetPayloadDigest);updatedAt=Objects.requireNonNull(updatedAt);if(version<1)throw new IllegalArgumentException("version");
        if(cursor>0&&lastChunkDigest==null)throw new IllegalArgumentException("lastChunkDigest required");
        if(state==State.COMPLETED&&(targetCheckpointId==null||targetPayloadDigest==null))throw new IllegalArgumentException("completed target required");
    }
    public enum State { IN_PROGRESS, COMPLETED, FAILED, QUARANTINED }
    private static String req(String v){String x=norm(v);if(x==null)throw new IllegalArgumentException("required");return x;}private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
