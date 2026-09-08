package org.systemmaster.core;

import static org.systemmaster.core.RecoveryEligibilityContracts.*;
import java.time.Instant;
import java.util.Objects;

/**
 * F-WP-009 bounded recovery coordinator.
 * Historical state identifies a candidate only. Current specialist-owned eligibility always decides consequential recovery.
 */
public final class RecoveryCoordinator {

    public RecoveryDecision evaluateRollbackOrRestore(RecoveryKind kind, RecoveryTarget target, CurrentEligibilitySnapshot current) {
        Objects.requireNonNull(kind, "kind"); Objects.requireNonNull(target, "target"); Objects.requireNonNull(current, "current");
        if (kind == RecoveryKind.ROLL_FORWARD) throw new IllegalArgumentException("ROLL_FORWARD_REQUIRES_PLAN");

        if (isUnknown(current)) {
            return decision(kind, Disposition.BLOCK_UNKNOWN, target, current,
                    "CURRENT_CRITICAL_RECOVERY_ELIGIBILITY_UNKNOWN");
        }
        if (isProhibited(current)) {
            return decision(kind, Disposition.REQUIRE_ROLL_FORWARD, target, current,
                    "CURRENT_PROHIBITION_DOMINATES_HISTORICAL_TARGET");
        }
        if (current.schemaCompatibility() == Compatibility.INCOMPATIBLE || current.dataCompatibility() == Compatibility.INCOMPATIBLE) {
            return decision(kind, Disposition.BLOCK_INCOMPATIBLE, target, current,
                    "CURRENT_SCHEMA_OR_DATA_COMPATIBILITY_INCOMPATIBLE");
        }
        return decision(kind, Disposition.ALLOW_ROLLBACK_OR_RESTORE, target, current,
                "CURRENT_ELIGIBILITY_REEVALUATED_AND_SATISFIED");
    }

    public RecoveryExecution authorizeRollbackOrRestore(
            RecoveryDecision decision,
            RecoveryTarget target,
            CurrentEligibilitySnapshot currentAtAuthorization) {
        Objects.requireNonNull(decision, "decision"); Objects.requireNonNull(target, "target"); Objects.requireNonNull(currentAtAuthorization, "currentAtAuthorization");
        if (decision.requestedKind() == RecoveryKind.ROLL_FORWARD) throw new IllegalArgumentException("WRONG_RECOVERY_KIND");
        if (decision.disposition() != Disposition.ALLOW_ROLLBACK_OR_RESTORE) throw new IllegalStateException("RECOVERY_NOT_ELIGIBLE:" + decision.disposition());
        if (!decision.targetDigest().equals(target.digest())) throw new IllegalStateException("STALE_OR_DIFFERENT_RECOVERY_TARGET");
        if (!decision.eligibilitySnapshotDigest().equals(currentAtAuthorization.digest())) throw new IllegalStateException("ELIGIBILITY_SNAPSHOT_CHANGED_REEVALUATE");
        RecoveryDecision rechecked = evaluateRollbackOrRestore(decision.requestedKind(), target, currentAtAuthorization);
        if (rechecked.disposition() != Disposition.ALLOW_ROLLBACK_OR_RESTORE) throw new IllegalStateException("CURRENT_ELIGIBILITY_CHANGED");
        return new RecoveryExecution(decision.requestedKind(), target.digest(), currentAtAuthorization.digest(), decision.decisionDigest(), Instant.now());
    }

    /** Roll-forward is a first-class governed recovery action with exact scope, authority, evidence and migration identity. */
    public RecoveryExecution authorizeRollForward(RollForwardPlan plan, CurrentEligibilitySnapshot currentAtAuthorization) {
        Objects.requireNonNull(plan, "plan"); Objects.requireNonNull(currentAtAuthorization, "currentAtAuthorization");
        if (isUnknown(currentAtAuthorization)) throw new IllegalStateException("ROLL_FORWARD_ELIGIBILITY_UNKNOWN");
        if (isProhibited(currentAtAuthorization)) throw new IllegalStateException("ROLL_FORWARD_CURRENT_PROHIBITION");
        if (currentAtAuthorization.schemaCompatibility() != Compatibility.COMPATIBLE || currentAtAuthorization.dataCompatibility() != Compatibility.COMPATIBLE)
            throw new IllegalStateException("ROLL_FORWARD_COMPATIBILITY_NOT_PROVEN");
        String authorizationDigest = RecoveryEligibilityContracts.sha256(plan.digest() + "|" + currentAtAuthorization.digest() + "|ROLL_FORWARD");
        return new RecoveryExecution(RecoveryKind.ROLL_FORWARD, plan.targetDigest(), currentAtAuthorization.digest(), authorizationDigest, Instant.now());
    }

    private static boolean isUnknown(CurrentEligibilitySnapshot c) {
        return c.securityStanding() == Standing.UNKNOWN || c.keyStanding() == Standing.UNKNOWN || c.credentialStanding() == Standing.UNKNOWN ||
                c.policyStanding() == Standing.UNKNOWN || c.providerStanding() == Standing.UNKNOWN || c.releaseStanding() == Standing.UNKNOWN ||
                c.schemaCompatibility() == Compatibility.UNKNOWN || c.dataCompatibility() == Compatibility.UNKNOWN;
    }
    private static boolean isProhibited(CurrentEligibilitySnapshot c) {
        return c.securityStanding() == Standing.PROHIBITED || c.keyStanding() == Standing.PROHIBITED || c.credentialStanding() == Standing.PROHIBITED ||
                c.policyStanding() == Standing.PROHIBITED || c.providerStanding() == Standing.PROHIBITED || c.releaseStanding() == Standing.PROHIBITED;
    }
    private static RecoveryDecision decision(RecoveryKind kind, Disposition disposition, RecoveryTarget target, CurrentEligibilitySnapshot current, String reason) {
        String digest = RecoveryEligibilityContracts.decisionDigest(kind, disposition, target, current, reason);
        return new RecoveryDecision(kind, disposition, target.digest(), current.digest(), reason, digest);
    }

    public record RecoveryExecution(
            RecoveryKind kind,
            String targetDigest,
            String eligibilitySnapshotDigest,
            String authorizationDigest,
            Instant authorizedAt) {
        public RecoveryExecution {
            Objects.requireNonNull(kind, "kind");
            RecoveryEligibilityContracts.requireDigest(targetDigest, "targetDigest");
            RecoveryEligibilityContracts.requireDigest(eligibilitySnapshotDigest, "eligibilitySnapshotDigest");
            RecoveryEligibilityContracts.requireDigest(authorizationDigest, "authorizationDigest");
            Objects.requireNonNull(authorizedAt, "authorizedAt");
        }
    }
}
