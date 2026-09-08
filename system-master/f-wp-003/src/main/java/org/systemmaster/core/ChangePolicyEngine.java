package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Deterministic F-WP-003 classification and risk-tiered approval-policy engine. */
public final class ChangePolicyEngine {
    public enum ChangeType { CONFIGURATION, SOFTWARE, DATA, INFRASTRUCTURE, SECURITY, PRIVACY, PROVIDER, RECOVERY, OTHER, UNCLASSIFIED }
    public enum RiskClass { LOW, MEDIUM, HIGH, CRITICAL, UNASSESSED }
    public enum Standing { CLASSIFIED, ASSESSMENT_REQUIRED, FAIL_CLOSED }

    public record PolicyDefinition(
            String policyId,
            long version,
            Map<RiskClass, Set<String>> requiredApprovalRoles,
            String digest) {
        public PolicyDefinition {
            if (policyId == null || policyId.isBlank()) throw new IllegalArgumentException("REQUIRED:policyId");
            if (version < 1) throw new IllegalArgumentException("INVALID_POLICY_VERSION");
            EnumMap<RiskClass, Set<String>> copy = new EnumMap<>(RiskClass.class);
            for (RiskClass risk : List.of(RiskClass.LOW, RiskClass.MEDIUM, RiskClass.HIGH, RiskClass.CRITICAL)) {
                Set<String> roles = requiredApprovalRoles == null ? null : requiredApprovalRoles.get(risk);
                if (roles == null) throw new IllegalArgumentException("MISSING_POLICY_ROLE_SET:" + risk);
                copy.put(risk, Set.copyOf(roles));
            }
            requiredApprovalRoles = Map.copyOf(copy);
            String computed = digestPolicy(policyId, version, requiredApprovalRoles);
            if (digest == null || digest.isBlank()) digest = computed;
            if (!digest.equals(computed)) throw new IllegalArgumentException("POLICY_DIGEST_MISMATCH");
        }

        public static PolicyDefinition standard(String policyId, long version) {
            EnumMap<RiskClass, Set<String>> roles = new EnumMap<>(RiskClass.class);
            roles.put(RiskClass.LOW, Set.of("CHANGE_OWNER"));
            roles.put(RiskClass.MEDIUM, Set.of("CHANGE_OWNER", "DOMAIN_REVIEWER"));
            roles.put(RiskClass.HIGH, Set.of("CHANGE_OWNER", "DOMAIN_REVIEWER", "RISK_REVIEWER"));
            roles.put(RiskClass.CRITICAL, Set.of("CHANGE_OWNER", "DOMAIN_REVIEWER", "RISK_REVIEWER", "INDEPENDENT_APPROVER"));
            return new PolicyDefinition(policyId, version, roles, null);
        }
    }

    public record ClassificationDecision(
            String changeId,
            long revision,
            String contentDigest,
            String targetDigest,
            ChangeType changeType,
            RiskClass riskClass,
            Standing standing,
            String policyId,
            long policyVersion,
            String policyDigest,
            String assessmentDigest,
            List<String> reasonCodes) {
        public ClassificationDecision { reasonCodes = List.copyOf(reasonCodes); }
    }

    public record ApprovalPolicySnapshot(
            String policySnapshotId,
            String changeId,
            long revision,
            RiskClass riskClass,
            Set<String> requiredRoles,
            List<String> obligations,
            String policyDigest,
            String digest) {
        public ApprovalPolicySnapshot {
            requiredRoles = Set.copyOf(requiredRoles);
            obligations = List.copyOf(obligations);
        }
    }

    public ClassificationDecision classify(
            ChangeRegistry.ChangeRecord record,
            ChangeRegistry.ChangeRevision revision,
            ChangeType requestedType,
            ImpactAssessmentService.Assessment assessment,
            AuthorityResolver.Resolution authority,
            PolicyDefinition policy) {
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(revision, "revision");
        Objects.requireNonNull(requestedType, "requestedType");
        Objects.requireNonNull(assessment, "assessment");
        Objects.requireNonNull(authority, "authority");

        ArrayList<String> reasons = new ArrayList<>();
        if (!sameSubject(record, revision, assessment)) reasons.add("STALE_OR_MISMATCHED_ASSESSMENT");
        if (!authority.resolved()) reasons.addAll(authority.reasons());
        if (requestedType == ChangeType.UNCLASSIFIED) reasons.add("CHANGE_TYPE_REQUIRED");
        if (!assessment.complete()) reasons.addAll(assessment.gaps());
        if (policy == null) reasons.add("POLICY_UNAVAILABLE");

        boolean authorityFailure = !authority.resolved();
        boolean staleFailure = reasons.contains("STALE_OR_MISMATCHED_ASSESSMENT");
        if (authorityFailure || staleFailure) {
            return decision(record, revision, requestedType, RiskClass.UNASSESSED, Standing.FAIL_CLOSED,
                    policy, assessment, reasons);
        }
        if (requestedType == ChangeType.UNCLASSIFIED || !assessment.complete() || policy == null) {
            return decision(record, revision, requestedType, RiskClass.UNASSESSED, Standing.ASSESSMENT_REQUIRED,
                    policy, assessment, reasons);
        }

        RiskClass risk = deriveRisk(assessment);
        reasons.add("RISK_DERIVED:" + risk);
        if (assessment.contracts().privacy021n() == GovernanceContracts.Standing.RESTRICTED) reasons.add("021N_RESTRICTION_PRESENT");
        if (assessment.contracts().runtimeSecurity021q() == GovernanceContracts.Standing.RESTRICTED) reasons.add("021Q_RESTRICTION_PRESENT");
        if (assessment.contracts().providerGovernance021y() == GovernanceContracts.Standing.RESTRICTED) reasons.add("021Y_PROVIDER_RESTRICTION_PRESENT");
        return decision(record, revision, requestedType, risk, Standing.CLASSIFIED, policy, assessment, reasons);
    }

    public ApprovalPolicySnapshot evaluateApprovalPolicy(ClassificationDecision decision, PolicyDefinition policy) {
        Objects.requireNonNull(decision, "decision");
        Objects.requireNonNull(policy, "policy");
        if (decision.standing() != Standing.CLASSIFIED) throw new IllegalStateException("CLASSIFICATION_NOT_CURRENT");
        if (!decision.policyDigest().equals(policy.digest())) throw new IllegalStateException("STALE_POLICY_SNAPSHOT");
        Set<String> roles = policy.requiredApprovalRoles().get(decision.riskClass());
        ArrayList<String> obligations = new ArrayList<>();
        if (decision.riskClass().ordinal() >= RiskClass.HIGH.ordinal()) obligations.add("CURRENT_IMPACT_EVIDENCE_REQUIRED");
        if (decision.reasonCodes().contains("021N_RESTRICTION_PRESENT")) obligations.add("PRIVACY_RESTRICTION_REVIEW");
        if (decision.reasonCodes().contains("021Q_RESTRICTION_PRESENT")) obligations.add("SECURITY_BOUNDARY_REVIEW");
        if (decision.reasonCodes().contains("021Y_PROVIDER_RESTRICTION_PRESENT")) obligations.add("PROVIDER_RESTRICTION_REVIEW");
        String id = "policy-snapshot:" + decision.changeId() + ":" + decision.revision() + ":" + policy.version();
        String digest = sha256(id + "|risk=" + decision.riskClass() + "|roles=" + String.join(",", new java.util.TreeSet<>(roles))
                + "|obligations=" + String.join(",", obligations) + "|policy=" + policy.digest());
        return new ApprovalPolicySnapshot(id, decision.changeId(), decision.revision(), decision.riskClass(),
                roles, obligations, policy.digest(), digest);
    }

    private static RiskClass deriveRisk(ImpactAssessmentService.Assessment a) {
        ImpactAssessmentService.Input in = a.input();
        int score = 0;
        score += magnitudeScore(in.userSystemImpact());
        score += magnitudeScore(in.dependencyImpact());
        score += magnitudeScore(in.providerImpact());
        score += magnitudeScore(in.stateConsistencyImpact());
        score += magnitudeScore(in.recoveryImpact());
        if (in.dataCompatibility() == ImpactAssessmentService.Compatibility.BREAKING) score += 3;
        if (in.securityPrivacyApplicable()) score += 2;
        if (in.reversibility() == ImpactAssessmentService.Reversibility.CONDITIONAL) score += 1;
        if (in.reversibility() == ImpactAssessmentService.Reversibility.IRREVERSIBLE) score += 4;
        if (a.contracts().privacy021n() == GovernanceContracts.Standing.RESTRICTED) score += 2;
        if (a.contracts().runtimeSecurity021q() == GovernanceContracts.Standing.RESTRICTED) score += 2;
        if (a.contracts().providerGovernance021y() == GovernanceContracts.Standing.RESTRICTED) score += 2;
        if (score <= 2) return RiskClass.LOW;
        if (score <= 5) return RiskClass.MEDIUM;
        if (score <= 9) return RiskClass.HIGH;
        return RiskClass.CRITICAL;
    }

    private static int magnitudeScore(ImpactAssessmentService.Magnitude magnitude) {
        return switch (magnitude) {
            case NONE -> 0;
            case LOW -> 1;
            case MODERATE -> 2;
            case HIGH -> 3;
            case UNKNOWN -> 99;
        };
    }

    private static boolean sameSubject(ChangeRegistry.ChangeRecord r, ChangeRegistry.ChangeRevision v,
            ImpactAssessmentService.Assessment a) {
        return r.changeId().equals(v.changeId()) && r.changeId().equals(a.changeId())
                && r.currentRevision() == v.revision() && a.revision() == v.revision()
                && r.currentRevisionDigest().equals(v.contentDigest())
                && a.changeContentDigest().equals(v.contentDigest())
                && r.targetDigest().equals(v.targetDigest()) && a.targetDigest().equals(v.targetDigest());
    }

    private static ClassificationDecision decision(ChangeRegistry.ChangeRecord r, ChangeRegistry.ChangeRevision v,
            ChangeType type, RiskClass risk, Standing standing, PolicyDefinition policy,
            ImpactAssessmentService.Assessment assessment, List<String> reasons) {
        return new ClassificationDecision(r.changeId(), v.revision(), v.contentDigest(), v.targetDigest(), type, risk,
                standing, policy == null ? "UNAVAILABLE" : policy.policyId(), policy == null ? 0 : policy.version(),
                policy == null ? "UNAVAILABLE" : policy.digest(), assessment.digest(), reasons);
    }

    private static String digestPolicy(String id, long version, Map<RiskClass, Set<String>> roles) {
        StringBuilder sb = new StringBuilder("FWP003-POLICY-V1|id=").append(id).append("|version=").append(version);
        for (RiskClass risk : List.of(RiskClass.LOW, RiskClass.MEDIUM, RiskClass.HIGH, RiskClass.CRITICAL)) {
            sb.append('|').append(risk).append('=').append(String.join(",", new java.util.TreeSet<>(roles.get(risk))));
        }
        return sha256(sb.toString());
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
