package org.systemmaster.continuity;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public final class ContinuityPolicyRegistry {
    public record Policy(String continuityClass, Duration checkpointInterval, int retryBudget, int maxConcurrentRecoveries,
                         int maxQueueDepth, long maxHistoryBytes, Duration admissionBackoff) {
        public Policy {
            continuityClass=RecoveryAuthorizationGate.req(continuityClass,"continuityClass");
            if(checkpointInterval==null||checkpointInterval.isNegative()||checkpointInterval.isZero())throw new IllegalArgumentException("class-specific checkpoint interval required");
            if(retryBudget<0||maxConcurrentRecoveries<1||maxQueueDepth<1||maxHistoryBytes<1||admissionBackoff==null||admissionBackoff.isNegative())throw new IllegalArgumentException("invalid continuity policy bounds");
        }
    }
    private final Map<String,Policy> policies=new ConcurrentHashMap<>();
    public Policy registerContinuityPolicy(Policy policy){Policy p=policy;policies.put(p.continuityClass(),p);return p;}
    public Optional<Policy> getContinuityPolicy(String continuityClass){return Optional.ofNullable(policies.get(RecoveryAuthorizationGate.req(continuityClass,"continuityClass")));}
}
