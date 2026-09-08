package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Objects;

public final class ClaimAuthorities {
    private ClaimAuthorities() {}

    public interface RecoveryStateAuthority {
        RecoveryStanding standing(String recoveryId);
    }
    public interface ExecutorEligibilityAuthority {
        Decision eligibility(String executorRef, String recoveryId);
    }
    public interface ResourceAdmissionAuthority {
        Decision admission(String executorRef, String recoveryId);
    }
    public interface AuthoritativeTime {
        Instant now();
    }

    public enum Decision { ALLOW, DENY, UNKNOWN }

    public record RecoveryStanding(long version, boolean claimable, String workUnitId) {
        public RecoveryStanding {
            if (version < 1) throw new IllegalArgumentException("version must be >= 1");
            workUnitId = req(workUnitId, "workUnitId");
        }
    }

    static String req(String value, String name) {
        Objects.requireNonNull(value, name);
        String v=value.trim();
        if(v.isEmpty()) throw new IllegalArgumentException(name+" is required");
        return v;
    }
}
