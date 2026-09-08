package org.systemmaster.continuity;

public final class CheckpointAuthorities {
    private CheckpointAuthorities() {}
    public interface WorkIdentityAuthority { boolean exists(String workUnitId); }
    public interface ExecutionFenceAuthority { boolean isCurrent(String workUnitId,String attemptId,long fenceEpoch); }
    public interface CompatibilityAuthority { CompatibilityStanding assess(CheckpointManifest manifest); }
    public interface RetentionAuthority { RetentionDisposition disposition(String contentDigest,String checkpointId); }
    public enum CompatibilityStanding { COMPATIBLE, INCOMPATIBLE, UNKNOWN }
    public enum RetentionDisposition { DELETE_ELIGIBLE, HOLD, UNKNOWN }
}
