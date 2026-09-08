package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

/** Immutable F-WP-009 recovery eligibility contracts. */
public final class RecoveryEligibilityContracts {
    private RecoveryEligibilityContracts() {}

    public enum Standing { ELIGIBLE, PROHIBITED, UNKNOWN }
    public enum Compatibility { COMPATIBLE, INCOMPATIBLE, UNKNOWN }
    public enum RecoveryKind { ROLLBACK, RESTORE, ROLL_FORWARD }
    public enum Disposition { ALLOW_ROLLBACK_OR_RESTORE, REQUIRE_ROLL_FORWARD, BLOCK_UNKNOWN, BLOCK_INCOMPATIBLE }

    public record RecoveryTarget(
            String changeId,
            long changeRevision,
            String targetDigest,
            String recoveryPlanDigest,
            String historicalReleaseDigest,
            String historicalSchemaDigest,
            String historicalDataContractDigest) {
        public RecoveryTarget {
            require(changeId, "changeId");
            if (changeRevision < 0) throw new IllegalArgumentException("changeRevision");
            requireDigest(targetDigest, "targetDigest");
            requireDigest(recoveryPlanDigest, "recoveryPlanDigest");
            requireDigest(historicalReleaseDigest, "historicalReleaseDigest");
            requireDigest(historicalSchemaDigest, "historicalSchemaDigest");
            requireDigest(historicalDataContractDigest, "historicalDataContractDigest");
        }
        public String digest() {
            return sha256(changeId + "|" + changeRevision + "|" + targetDigest + "|" + recoveryPlanDigest + "|" +
                    historicalReleaseDigest + "|" + historicalSchemaDigest + "|" + historicalDataContractDigest);
        }
    }

    /** Current specialist-owned recovery eligibility facts. F-WP-009 consumes; it does not own these standings. */
    public record CurrentEligibilitySnapshot(
            String snapshotId,
            long snapshotRevision,
            Instant observedAt,
            String semanticOwnerSetDigest,
            Standing securityStanding,
            Standing keyStanding,
            Standing credentialStanding,
            Standing policyStanding,
            Standing providerStanding,
            Standing releaseStanding,
            Compatibility schemaCompatibility,
            Compatibility dataCompatibility,
            String currentReleaseDigest,
            String currentSchemaDigest,
            String currentDataContractDigest,
            String sourceEvidenceDigest) {
        public CurrentEligibilitySnapshot {
            require(snapshotId, "snapshotId");
            if (snapshotRevision < 0) throw new IllegalArgumentException("snapshotRevision");
            Objects.requireNonNull(observedAt, "observedAt");
            requireDigest(semanticOwnerSetDigest, "semanticOwnerSetDigest");
            Objects.requireNonNull(securityStanding, "securityStanding");
            Objects.requireNonNull(keyStanding, "keyStanding");
            Objects.requireNonNull(credentialStanding, "credentialStanding");
            Objects.requireNonNull(policyStanding, "policyStanding");
            Objects.requireNonNull(providerStanding, "providerStanding");
            Objects.requireNonNull(releaseStanding, "releaseStanding");
            Objects.requireNonNull(schemaCompatibility, "schemaCompatibility");
            Objects.requireNonNull(dataCompatibility, "dataCompatibility");
            requireDigest(currentReleaseDigest, "currentReleaseDigest");
            requireDigest(currentSchemaDigest, "currentSchemaDigest");
            requireDigest(currentDataContractDigest, "currentDataContractDigest");
            requireDigest(sourceEvidenceDigest, "sourceEvidenceDigest");
        }
        public String digest() {
            return sha256(snapshotId + "|" + snapshotRevision + "|" + observedAt + "|" + semanticOwnerSetDigest + "|" +
                    securityStanding + "|" + keyStanding + "|" + credentialStanding + "|" + policyStanding + "|" +
                    providerStanding + "|" + releaseStanding + "|" + schemaCompatibility + "|" + dataCompatibility + "|" +
                    currentReleaseDigest + "|" + currentSchemaDigest + "|" + currentDataContractDigest + "|" + sourceEvidenceDigest);
        }
    }

    public record RollForwardPlan(
            String planId,
            String changeId,
            long baseRevision,
            String scopeDigest,
            String authorityDigest,
            String evidenceDigest,
            String targetDigest,
            String migrationPlanDigest,
            Instant authorizedAt) {
        public RollForwardPlan {
            require(planId, "planId"); require(changeId, "changeId");
            if (baseRevision < 0) throw new IllegalArgumentException("baseRevision");
            requireDigest(scopeDigest, "scopeDigest"); requireDigest(authorityDigest, "authorityDigest");
            requireDigest(evidenceDigest, "evidenceDigest"); requireDigest(targetDigest, "targetDigest");
            requireDigest(migrationPlanDigest, "migrationPlanDigest"); Objects.requireNonNull(authorizedAt, "authorizedAt");
        }
        public String digest() {
            return sha256(planId + "|" + changeId + "|" + baseRevision + "|" + scopeDigest + "|" + authorityDigest + "|" +
                    evidenceDigest + "|" + targetDigest + "|" + migrationPlanDigest + "|" + authorizedAt);
        }
    }

    public record RecoveryDecision(
            RecoveryKind requestedKind,
            Disposition disposition,
            String targetDigest,
            String eligibilitySnapshotDigest,
            String decisionReason,
            String decisionDigest) {
        public RecoveryDecision {
            Objects.requireNonNull(requestedKind, "requestedKind");
            Objects.requireNonNull(disposition, "disposition");
            requireDigest(targetDigest, "targetDigest"); requireDigest(eligibilitySnapshotDigest, "eligibilitySnapshotDigest");
            require(decisionReason, "decisionReason"); requireDigest(decisionDigest, "decisionDigest");
        }
    }

    static String decisionDigest(RecoveryKind kind, Disposition disposition, RecoveryTarget target, CurrentEligibilitySnapshot snapshot, String reason) {
        return sha256(kind + "|" + disposition + "|" + target.digest() + "|" + snapshot.digest() + "|" + reason);
    }

    static void require(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name);
    }
    static void requireDigest(String value, String name) {
        require(value, name);
        if (!value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + "_sha256");
    }
    static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
