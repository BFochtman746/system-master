package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Creates immutable impact assessments bound to one exact ChangeRevision and its external contract evidence. */
public final class ImpactAssessmentService {
    public enum Magnitude { NONE, LOW, MODERATE, HIGH, UNKNOWN }
    public enum Compatibility { COMPATIBLE, BREAKING, NOT_APPLICABLE, UNKNOWN }
    public enum Reversibility { REVERSIBLE, CONDITIONAL, IRREVERSIBLE, UNKNOWN }

    public record Input(
            Magnitude userSystemImpact,
            Magnitude dependencyImpact,
            boolean changesAccessOrDisclosure,
            boolean changesTrustBoundary,
            boolean changesCredentialBehavior,
            boolean changesLoggingBehavior,
            boolean changesDataProcessing,
            Compatibility dataCompatibility,
            Magnitude providerImpact,
            Magnitude stateConsistencyImpact,
            Magnitude recoveryImpact,
            Reversibility reversibility,
            List<String> evidenceRefs) {
        public Input {
            userSystemImpact = Objects.requireNonNull(userSystemImpact, "userSystemImpact");
            dependencyImpact = Objects.requireNonNull(dependencyImpact, "dependencyImpact");
            dataCompatibility = Objects.requireNonNull(dataCompatibility, "dataCompatibility");
            providerImpact = Objects.requireNonNull(providerImpact, "providerImpact");
            stateConsistencyImpact = Objects.requireNonNull(stateConsistencyImpact, "stateConsistencyImpact");
            recoveryImpact = Objects.requireNonNull(recoveryImpact, "recoveryImpact");
            reversibility = Objects.requireNonNull(reversibility, "reversibility");
            evidenceRefs = evidenceRefs == null ? List.of() : List.copyOf(evidenceRefs);
        }
        public boolean securityPrivacyApplicable() {
            return changesAccessOrDisclosure || changesTrustBoundary || changesCredentialBehavior
                    || changesLoggingBehavior || changesDataProcessing;
        }
    }

    public record Assessment(
            String assessmentId,
            long assessmentVersion,
            String changeId,
            long revision,
            String changeContentDigest,
            String targetDigest,
            Input input,
            GovernanceContracts.Snapshot contracts,
            boolean complete,
            List<String> gaps,
            String assessorRef,
            Instant assessedAt,
            String digest) {
        public Assessment {
            gaps = List.copyOf(gaps);
        }
    }

    private final Clock clock;

    public ImpactAssessmentService() { this(Clock.systemUTC()); }
    public ImpactAssessmentService(Clock clock) { this.clock = Objects.requireNonNull(clock, "clock"); }

    public Assessment recordAssessment(
            ChangeRegistry.ChangeRecord record,
            ChangeRegistry.ChangeRevision revision,
            Input input,
            GovernanceContracts.Snapshot contracts,
            String assessorRef) {
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(revision, "revision");
        Objects.requireNonNull(input, "input");
        Objects.requireNonNull(contracts, "contracts");
        requireText(assessorRef, "assessorRef");
        requireSameSubject(record, revision);

        ArrayList<String> gaps = new ArrayList<>();
        if (input.userSystemImpact() == Magnitude.UNKNOWN) gaps.add("USER_SYSTEM_IMPACT_UNKNOWN");
        if (input.dependencyImpact() == Magnitude.UNKNOWN) gaps.add("DEPENDENCY_IMPACT_UNKNOWN");
        if (input.dataCompatibility() == Compatibility.UNKNOWN) gaps.add("DATA_COMPATIBILITY_UNKNOWN");
        if (input.recoveryImpact() == Magnitude.UNKNOWN) gaps.add("RECOVERY_IMPACT_UNKNOWN");
        if (input.reversibility() == Reversibility.UNKNOWN) gaps.add("REVERSIBILITY_UNKNOWN");
        if (input.stateConsistencyImpact() != Magnitude.NONE
                && contracts.stateConsistency021k() == GovernanceContracts.Standing.UNKNOWN) {
            gaps.add("021K_STATE_CONSISTENCY_UNKNOWN");
        }
        if (input.providerImpact() != Magnitude.NONE
                && contracts.providerGovernance021y() == GovernanceContracts.Standing.UNKNOWN) {
            gaps.add("021Y_PROVIDER_GOVERNANCE_UNKNOWN");
        }
        if (input.securityPrivacyApplicable()) {
            if (contracts.privacy021n() == GovernanceContracts.Standing.UNKNOWN) gaps.add("021N_PRIVACY_UNKNOWN");
            if (contracts.runtimeSecurity021q() == GovernanceContracts.Standing.UNKNOWN) gaps.add("021Q_RUNTIME_SECURITY_UNKNOWN");
        }
        if (input.evidenceRefs().isEmpty()) gaps.add("ASSESSMENT_EVIDENCE_MISSING");

        Instant at = clock.instant();
        String assessmentId = UUID.randomUUID().toString();
        String canonical = canonical(record, revision, input, contracts, assessorRef, at);
        return new Assessment(assessmentId, 1L, record.changeId(), revision.revision(), revision.contentDigest(),
                revision.targetDigest(), input, contracts, gaps.isEmpty(), gaps, assessorRef, at, sha256(canonical));
    }

    private static void requireSameSubject(ChangeRegistry.ChangeRecord record, ChangeRegistry.ChangeRevision revision) {
        if (!record.changeId().equals(revision.changeId())) throw new IllegalArgumentException("CHANGE_ID_MISMATCH");
        if (record.currentRevision() != revision.revision()) throw new IllegalArgumentException("STALE_REVISION_BINDING");
        if (!record.currentRevisionDigest().equals(revision.contentDigest())) throw new IllegalArgumentException("CONTENT_DIGEST_BINDING_MISMATCH");
        if (!record.targetDigest().equals(revision.targetDigest())) throw new IllegalArgumentException("TARGET_DIGEST_BINDING_MISMATCH");
    }

    private static String canonical(ChangeRegistry.ChangeRecord record, ChangeRegistry.ChangeRevision revision,
            Input input, GovernanceContracts.Snapshot contracts, String assessor, Instant at) {
        return "FWP003-ASSESSMENT-V1|change=" + record.changeId() + "|revision=" + revision.revision()
                + "|content=" + revision.contentDigest() + "|target=" + revision.targetDigest()
                + "|user=" + input.userSystemImpact() + "|dependency=" + input.dependencyImpact()
                + "|securityPrivacy=" + input.securityPrivacyApplicable() + "|data=" + input.dataCompatibility()
                + "|provider=" + input.providerImpact() + "|state=" + input.stateConsistencyImpact()
                + "|recovery=" + input.recoveryImpact() + "|reversibility=" + input.reversibility()
                + "|n=" + contracts.privacy021n() + "|q=" + contracts.runtimeSecurity021q()
                + "|k=" + contracts.stateConsistency021k() + "|y=" + contracts.providerGovernance021y()
                + "|evidence=" + String.join(",", input.evidenceRefs()) + "|assessor=" + assessor + "|at=" + at;
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        return value;
    }
}
