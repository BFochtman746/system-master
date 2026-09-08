package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record CompatibilityAssessment(
        String checkpointId,
        String sourceIdentityDigest,
        String targetIdentityDigest,
        Standing standing,
        List<String> reasons,
        String approvedRuntimeRef,
        String migrationContractVersion,
        Instant assessedAt,
        String assessmentDigest) {
    public CompatibilityAssessment {
        checkpointId=req(checkpointId); sourceIdentityDigest=req(sourceIdentityDigest); targetIdentityDigest=req(targetIdentityDigest);
        standing=Objects.requireNonNull(standing); reasons=List.copyOf(reasons==null?List.of():reasons); approvedRuntimeRef=norm(approvedRuntimeRef);migrationContractVersion=norm(migrationContractVersion);
        assessedAt=Objects.requireNonNull(assessedAt); assessmentDigest=req(assessmentDigest);
    }
    public enum Standing { COMPATIBLE, MIGRATION_REQUIRED, OLDER_RUNTIME_REQUIRED, RESTART_REQUIRED, MANUAL, INCOMPATIBLE }
    private static String req(String v){String x=norm(v);if(x==null)throw new IllegalArgumentException("required");return x;} private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
