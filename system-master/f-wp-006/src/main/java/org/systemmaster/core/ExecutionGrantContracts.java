package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

public final class ExecutionGrantContracts {
    private ExecutionGrantContracts() {}

    public enum Standing { CURRENT, REVOKED, UNKNOWN }
    public enum RequirementStanding { SATISFIED, UNSATISFIED, UNKNOWN }
    public enum WindowStanding { OPEN, NOT_APPLICABLE, OVERRIDE_ACCEPTED, CLOSED, UNKNOWN }

    public record ApprovalRef(String obligationId, String approvalId, String decisionDigest,
            Instant expiresAt, boolean current) {
        public ApprovalRef {
            requireText(obligationId, "obligationId");
            requireText(approvalId, "approvalId");
            requireText(decisionDigest, "decisionDigest");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
        }
    }

    public record EligibilitySnapshot(
            String changeId,
            long revision,
            String targetDigest,
            long impactAssessmentVersion,
            long recoveryPlanVersion,
            String policyDigest,
            String executorPrincipalRef,
            String action,
            Set<String> targetRefs,
            Set<String> mandatoryApprovalObligations,
            List<ApprovalRef> approvals,
            Map<String, RequirementStanding> prerequisites,
            WindowStanding windowStanding,
            Standing policyStanding,
            Standing authorizationStanding,
            long authorizationRevocationEpoch,
            String recoveryEligibilityDigest,
            Instant evaluatedAt,
            String snapshotDigest) {
        public EligibilitySnapshot {
            requireText(changeId, "changeId");
            if (revision < 1) throw new IllegalArgumentException("INVALID_REVISION");
            requireText(targetDigest, "targetDigest");
            if (impactAssessmentVersion < 1) throw new IllegalArgumentException("INVALID_IMPACT_VERSION");
            if (recoveryPlanVersion < 1) throw new IllegalArgumentException("INVALID_RECOVERY_VERSION");
            requireText(policyDigest, "policyDigest");
            requireText(executorPrincipalRef, "executorPrincipalRef");
            requireText(action, "action");
            targetRefs = Set.copyOf(Objects.requireNonNull(targetRefs, "targetRefs"));
            mandatoryApprovalObligations = Set.copyOf(Objects.requireNonNull(mandatoryApprovalObligations, "mandatoryApprovalObligations"));
            approvals = List.copyOf(Objects.requireNonNull(approvals, "approvals"));
            prerequisites = Map.copyOf(Objects.requireNonNull(prerequisites, "prerequisites"));
            windowStanding = Objects.requireNonNull(windowStanding, "windowStanding");
            policyStanding = Objects.requireNonNull(policyStanding, "policyStanding");
            authorizationStanding = Objects.requireNonNull(authorizationStanding, "authorizationStanding");
            if (authorizationRevocationEpoch < 0) throw new IllegalArgumentException("INVALID_REVOCATION_EPOCH");
            requireText(recoveryEligibilityDigest, "recoveryEligibilityDigest");
            evaluatedAt = Objects.requireNonNull(evaluatedAt, "evaluatedAt");
            String computed = digestSnapshot(changeId, revision, targetDigest, impactAssessmentVersion,
                    recoveryPlanVersion, policyDigest, executorPrincipalRef, action, targetRefs,
                    mandatoryApprovalObligations, approvals, prerequisites, windowStanding, policyStanding,
                    authorizationStanding, authorizationRevocationEpoch, recoveryEligibilityDigest, evaluatedAt);
            if (snapshotDigest == null || snapshotDigest.isBlank()) snapshotDigest = computed;
            if (!snapshotDigest.equals(computed)) throw new IllegalArgumentException("SNAPSHOT_DIGEST_MISMATCH");
        }
    }

    public record ExecutionGrant(
            String grantId,
            String changeId,
            long revision,
            String targetDigest,
            String snapshotDigest,
            String executorPrincipalRef,
            String action,
            Set<String> targetRefs,
            long authorizationRevocationEpoch,
            Instant issuedAt,
            Instant expiresAt,
            boolean nonTransferable,
            String grantDigest) {
        public ExecutionGrant {
            requireText(grantId, "grantId");
            requireText(changeId, "changeId");
            if (revision < 1) throw new IllegalArgumentException("INVALID_REVISION");
            requireText(targetDigest, "targetDigest");
            requireText(snapshotDigest, "snapshotDigest");
            requireText(executorPrincipalRef, "executorPrincipalRef");
            requireText(action, "action");
            targetRefs = Set.copyOf(Objects.requireNonNull(targetRefs, "targetRefs"));
            issuedAt = Objects.requireNonNull(issuedAt, "issuedAt");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            if (!issuedAt.isBefore(expiresAt)) throw new IllegalArgumentException("INVALID_GRANT_WINDOW");
            if (!nonTransferable) throw new IllegalArgumentException("GRANT_MUST_BE_NON_TRANSFERABLE");
            String computed = digestGrant(grantId, changeId, revision, targetDigest, snapshotDigest,
                    executorPrincipalRef, action, targetRefs, authorizationRevocationEpoch, issuedAt, expiresAt);
            if (grantDigest == null || grantDigest.isBlank()) grantDigest = computed;
            if (!grantDigest.equals(computed)) throw new IllegalArgumentException("GRANT_DIGEST_MISMATCH");
        }
    }

    public static String digestSnapshot(EligibilitySnapshot s) {
        return digestSnapshot(s.changeId(), s.revision(), s.targetDigest(), s.impactAssessmentVersion(),
                s.recoveryPlanVersion(), s.policyDigest(), s.executorPrincipalRef(), s.action(), s.targetRefs(),
                s.mandatoryApprovalObligations(), s.approvals(), s.prerequisites(), s.windowStanding(),
                s.policyStanding(), s.authorizationStanding(), s.authorizationRevocationEpoch(),
                s.recoveryEligibilityDigest(), s.evaluatedAt());
    }

    private static String digestSnapshot(String changeId, long revision, String targetDigest,
            long impactVersion, long recoveryVersion, String policyDigest, String principal, String action,
            Set<String> targets, Set<String> mandatory, List<ApprovalRef> approvals,
            Map<String, RequirementStanding> prerequisites, WindowStanding windowStanding,
            Standing policyStanding, Standing authorizationStanding, long revocationEpoch,
            String recoveryEligibilityDigest, Instant evaluatedAt) {
        List<String> approvalRows = new ArrayList<>();
        for (ApprovalRef a : approvals) approvalRows.add(a.obligationId()+":"+a.approvalId()+":"+a.decisionDigest()+":"+a.expiresAt()+":"+a.current());
        Collections.sort(approvalRows);
        List<String> prereqRows = new ArrayList<>();
        prerequisites.forEach((k,v) -> prereqRows.add(k+":"+v));
        Collections.sort(prereqRows);
        return sha256("FWP006-SNAPSHOT-V1|change="+changeId+"|rev="+revision+"|target="+targetDigest
                +"|impact="+impactVersion+"|recovery="+recoveryVersion+"|policy="+policyDigest
                +"|principal="+principal+"|action="+action+"|targets="+String.join(",", new TreeSet<>(targets))
                +"|mandatory="+String.join(",", new TreeSet<>(mandatory))+"|approvals="+String.join(";", approvalRows)
                +"|prereqs="+String.join(";", prereqRows)+"|window="+windowStanding+"|policyStanding="+policyStanding
                +"|authStanding="+authorizationStanding+"|authEpoch="+revocationEpoch
                +"|recoveryEligibility="+recoveryEligibilityDigest+"|evaluatedAt="+evaluatedAt);
    }

    private static String digestGrant(String grantId, String changeId, long revision, String targetDigest,
            String snapshotDigest, String principal, String action, Set<String> targets,
            long revocationEpoch, Instant issuedAt, Instant expiresAt) {
        return sha256("FWP006-GRANT-V1|grant="+grantId+"|change="+changeId+"|rev="+revision+"|target="+targetDigest
                +"|snapshot="+snapshotDigest+"|principal="+principal+"|action="+action
                +"|targets="+String.join(",", new TreeSet<>(targets))+"|authEpoch="+revocationEpoch
                +"|issuedAt="+issuedAt+"|expiresAt="+expiresAt);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:"+name);
        return value;
    }
}
