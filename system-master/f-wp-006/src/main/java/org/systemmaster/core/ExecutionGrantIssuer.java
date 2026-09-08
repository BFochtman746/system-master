package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import static org.systemmaster.core.ExecutionGrantContracts.*;

public final class ExecutionGrantIssuer {
    public record ValidationResult(boolean valid, List<String> reasons) {
        public ValidationResult { reasons = List.copyOf(reasons); }
    }

    public ExecutionGrant issue(EligibilitySnapshot snapshot, Instant now, Duration ttl) {
        Objects.requireNonNull(snapshot, "snapshot");
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(ttl, "ttl");
        if (ttl.isZero() || ttl.isNegative()) throw new IllegalArgumentException("INVALID_GRANT_TTL");
        ValidationResult eligibility = evaluateEligibility(snapshot, now);
        if (!eligibility.valid()) throw new SecurityException("EXECUTION_INELIGIBLE:" + String.join(",", eligibility.reasons()));
        Instant expires = now.plus(ttl);
        Instant earliestApprovalExpiry = snapshot.approvals().stream().map(ApprovalRef::expiresAt).min(Comparator.naturalOrder()).orElse(expires);
        if (earliestApprovalExpiry.isBefore(expires)) expires = earliestApprovalExpiry;
        if (!now.isBefore(expires)) throw new SecurityException("NO_POSITIVE_GRANT_LIFETIME");
        String grantId = UUID.randomUUID().toString();
        return new ExecutionGrant(grantId, snapshot.changeId(), snapshot.revision(), snapshot.targetDigest(),
                snapshot.snapshotDigest(), snapshot.executorPrincipalRef(), snapshot.action(), snapshot.targetRefs(),
                snapshot.authorizationRevocationEpoch(), now, expires, true, null);
    }

    public ValidationResult evaluateEligibility(EligibilitySnapshot snapshot, Instant now) {
        List<String> reasons = new ArrayList<>();
        if (!snapshot.snapshotDigest().equals(digestSnapshot(snapshot))) reasons.add("SNAPSHOT_DIGEST_STALE");
        if (snapshot.authorizationStanding() != Standing.CURRENT) reasons.add("AUTHORIZATION_NOT_CURRENT");
        if (snapshot.policyStanding() != Standing.CURRENT) reasons.add("POLICY_NOT_CURRENT");
        if (!(snapshot.windowStanding() == WindowStanding.OPEN
                || snapshot.windowStanding() == WindowStanding.NOT_APPLICABLE
                || snapshot.windowStanding() == WindowStanding.OVERRIDE_ACCEPTED)) reasons.add("WINDOW_NOT_ELIGIBLE");
        for (var e : snapshot.prerequisites().entrySet()) {
            if (e.getValue() != RequirementStanding.SATISFIED) reasons.add("PREREQUISITE_"+e.getKey()+"_"+e.getValue());
        }
        Map<String, ApprovalRef> current = new HashMap<>();
        for (ApprovalRef a : snapshot.approvals()) {
            if (a.current() && now.isBefore(a.expiresAt())) current.put(a.obligationId(), a);
        }
        for (String obligation : snapshot.mandatoryApprovalObligations()) {
            if (!current.containsKey(obligation)) reasons.add("MANDATORY_APPROVAL_MISSING:"+obligation);
        }
        return new ValidationResult(reasons.isEmpty(), reasons);
    }

    public ValidationResult validateForUse(ExecutionGrant grant, EligibilitySnapshot currentSnapshot,
            String presentedPrincipalRef, String presentedAction, Set<String> presentedTargets,
            long currentAuthorizationRevocationEpoch, Instant now) {
        List<String> reasons = new ArrayList<>();
        if (grant == null) return new ValidationResult(false, List.of("GRANT_MISSING"));
        if (!now.isBefore(grant.expiresAt())) reasons.add("GRANT_EXPIRED");
        if (!grant.nonTransferable()) reasons.add("TRANSFERABLE_GRANT_FORBIDDEN");
        if (!grant.executorPrincipalRef().equals(presentedPrincipalRef)) reasons.add("PRINCIPAL_MISMATCH");
        if (!grant.action().equals(presentedAction)) reasons.add("ACTION_MISMATCH");
        if (!grant.targetRefs().equals(Set.copyOf(presentedTargets))) reasons.add("TARGET_SCOPE_MISMATCH");
        if (currentAuthorizationRevocationEpoch != grant.authorizationRevocationEpoch()) reasons.add("AUTHORIZATION_REVOKED_OR_CHANGED");
        if (currentSnapshot == null) reasons.add("CURRENT_SNAPSHOT_UNKNOWN");
        else {
            if (!currentSnapshot.snapshotDigest().equals(grant.snapshotDigest())) reasons.add("SNAPSHOT_CHANGED");
            if (!currentSnapshot.changeId().equals(grant.changeId()) || currentSnapshot.revision() != grant.revision()) reasons.add("CHANGE_REVISION_CHANGED");
            if (!currentSnapshot.targetDigest().equals(grant.targetDigest())) reasons.add("TARGET_DIGEST_CHANGED");
            ValidationResult currentEligibility = evaluateEligibility(currentSnapshot, now);
            if (!currentEligibility.valid()) reasons.addAll(currentEligibility.reasons());
        }
        return new ValidationResult(reasons.isEmpty(), reasons);
    }
}
