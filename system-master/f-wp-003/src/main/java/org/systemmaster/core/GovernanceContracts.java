package org.systemmaster.core;

import java.time.Instant;
import java.util.Objects;

/** F-WP-003 read-only bindings to current 021N/Q/K/Y contract surfaces. */
public final class GovernanceContracts {
    private GovernanceContracts() {}

    public enum Standing { CURRENT, RESTRICTED, UNKNOWN, NOT_APPLICABLE }

    public record Snapshot(
            String privacy021nRef,
            Standing privacy021n,
            String runtimeSecurity021qRef,
            Standing runtimeSecurity021q,
            String stateConsistency021kRef,
            Standing stateConsistency021k,
            String providerGovernance021yRef,
            Standing providerGovernance021y,
            String providerRouteRef,
            Instant asOf) {
        public Snapshot {
            privacy021nRef = requireRef(privacy021nRef, "privacy021nRef");
            privacy021n = Objects.requireNonNull(privacy021n, "privacy021n");
            runtimeSecurity021qRef = requireRef(runtimeSecurity021qRef, "runtimeSecurity021qRef");
            runtimeSecurity021q = Objects.requireNonNull(runtimeSecurity021q, "runtimeSecurity021q");
            stateConsistency021kRef = requireRef(stateConsistency021kRef, "stateConsistency021kRef");
            stateConsistency021k = Objects.requireNonNull(stateConsistency021k, "stateConsistency021k");
            providerGovernance021yRef = requireRef(providerGovernance021yRef, "providerGovernance021yRef");
            providerGovernance021y = Objects.requireNonNull(providerGovernance021y, "providerGovernance021y");
            providerRouteRef = requireRef(providerRouteRef, "providerRouteRef");
            asOf = Objects.requireNonNull(asOf, "asOf");
        }
    }

    private static String requireRef(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        return value;
    }
}
