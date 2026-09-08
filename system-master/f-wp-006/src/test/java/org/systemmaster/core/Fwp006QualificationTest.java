package org.systemmaster.core;

import java.time.*;
import java.util.*;
import static org.systemmaster.core.ExecutionGrantContracts.*;

public final class Fwp006QualificationTest {
    private static int tests = 0;
    private static final Instant NOW = Instant.parse("2026-09-08T02:20:00Z");

    public static void main(String[] args) {
        ExecutionGrantIssuer issuer = new ExecutionGrantIssuer();
        EligibilitySnapshot good = goodSnapshot();
        ExecutionGrant grant = issuer.issue(good, NOW, Duration.ofMinutes(15));
        check(grant.nonTransferable(), "non-transferable");
        check(grant.changeId().equals("CHG-1"), "change bound");
        check(grant.revision() == 7, "revision bound");
        check(grant.targetDigest().equals("target-digest-7"), "target bound");
        check(grant.snapshotDigest().equals(good.snapshotDigest()), "snapshot bound");
        check(grant.executorPrincipalRef().equals("principal:exec"), "principal bound");
        check(grant.action().equals("CHANGE_EXECUTE"), "action bound");
        check(grant.targetRefs().equals(Set.of("svc:A","db:B")), "target scope bound");
        check(issuer.validateForUse(grant, good, "principal:exec", "CHANGE_EXECUTE", Set.of("svc:A","db:B"), 11, NOW.plusSeconds(5)).valid(), "valid use");

        denyIssue(issuer, mutate(good, Standing.UNKNOWN, good.policyStanding(), good.windowStanding(), good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations()), "unknown auth");
        denyIssue(issuer, mutate(good, Standing.REVOKED, good.policyStanding(), good.windowStanding(), good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations()), "revoked auth");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), Standing.UNKNOWN, good.windowStanding(), good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations()), "unknown policy");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), Standing.REVOKED, good.windowStanding(), good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations()), "revoked policy");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), WindowStanding.CLOSED, good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations()), "closed window");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), WindowStanding.UNKNOWN, good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations()), "unknown window");
        var unknownPre = new LinkedHashMap<>(good.prerequisites()); unknownPre.put("RECOVERY", RequirementStanding.UNKNOWN);
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), good.windowStanding(), unknownPre, good.approvals(), good.mandatoryApprovalObligations()), "unknown prereq");
        var badPre = new LinkedHashMap<>(good.prerequisites()); badPre.put("RECOVERY", RequirementStanding.UNSATISFIED);
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), good.windowStanding(), badPre, good.approvals(), good.mandatoryApprovalObligations()), "unsatisfied prereq");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), good.windowStanding(), good.prerequisites(), List.of(), good.mandatoryApprovalObligations()), "missing approvals");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), good.windowStanding(), good.prerequisites(), List.of(new ApprovalRef("SECURITY","APR-1","d1",NOW.minusSeconds(1),true)), Set.of("SECURITY")), "expired approval");
        denyIssue(issuer, mutate(good, good.authorizationStanding(), good.policyStanding(), good.windowStanding(), good.prerequisites(), List.of(new ApprovalRef("SECURITY","APR-1","d1",NOW.plusSeconds(60),false)), Set.of("SECURITY")), "stale approval");

        check(!issuer.validateForUse(grant, good, "principal:other", grant.action(), grant.targetRefs(), 11, NOW.plusSeconds(5)).valid(), "nontransferable principal");
        check(!issuer.validateForUse(grant, good, grant.executorPrincipalRef(), "CHANGE_ROLLBACK", grant.targetRefs(), 11, NOW.plusSeconds(5)).valid(), "action scope");
        check(!issuer.validateForUse(grant, good, grant.executorPrincipalRef(), grant.action(), Set.of("svc:A"), 11, NOW.plusSeconds(5)).valid(), "target scope");
        check(!issuer.validateForUse(grant, good, grant.executorPrincipalRef(), grant.action(), grant.targetRefs(), 12, NOW.plusSeconds(5)).valid(), "revocation epoch");
        check(!issuer.validateForUse(grant, good, grant.executorPrincipalRef(), grant.action(), grant.targetRefs(), 11, grant.expiresAt()).valid(), "expiry");
        check(!issuer.validateForUse(grant, null, grant.executorPrincipalRef(), grant.action(), grant.targetRefs(), 11, NOW.plusSeconds(5)).valid(), "unknown current snapshot");

        EligibilitySnapshot changedRevision = snapshot(8, "target-digest-7", good.authorizationStanding(), good.policyStanding(), good.windowStanding(), good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations(), 11);
        check(!issuer.validateForUse(grant, changedRevision, grant.executorPrincipalRef(), grant.action(), grant.targetRefs(), 11, NOW.plusSeconds(5)).valid(), "revision drift");
        EligibilitySnapshot changedTarget = snapshot(7, "target-digest-8", good.authorizationStanding(), good.policyStanding(), good.windowStanding(), good.prerequisites(), good.approvals(), good.mandatoryApprovalObligations(), 11);
        check(!issuer.validateForUse(grant, changedTarget, grant.executorPrincipalRef(), grant.action(), grant.targetRefs(), 11, NOW.plusSeconds(5)).valid(), "target drift");

        ExecutionGrant shortGrant = issuer.issue(good, NOW, Duration.ofHours(1));
        check(shortGrant.expiresAt().equals(NOW.plusSeconds(300)), "grant bounded by approval expiry");

        expect(IllegalArgumentException.class, () -> new EligibilitySnapshot("CHG-1",7,"target-digest-7",2,3,"policy-digest","principal:exec","CHANGE_EXECUTE",Set.of("svc:A"),Set.of("SECURITY"),good.approvals(),good.prerequisites(),WindowStanding.OPEN,Standing.CURRENT,Standing.CURRENT,11,"recovery-digest",NOW,"bad"), "snapshot tamper");
        expect(IllegalArgumentException.class, () -> new ExecutionGrant("g","CHG-1",7,"target","snap","p","a",Set.of("t"),1,NOW,NOW.plusSeconds(1),true,"bad"), "grant tamper");
        expect(IllegalArgumentException.class, () -> issuer.issue(good, NOW, Duration.ZERO), "zero ttl");
        expect(IllegalArgumentException.class, () -> issuer.issue(good, NOW, Duration.ofSeconds(-1)), "negative ttl");

        System.out.println("PASS F-WP-006 tests="+tests+" requirements=3");
    }

    private static EligibilitySnapshot goodSnapshot() {
        return snapshot(7, "target-digest-7", Standing.CURRENT, Standing.CURRENT, WindowStanding.OPEN,
                Map.of("RECOVERY",RequirementStanding.SATISFIED,"VERIFY_PLAN",RequirementStanding.SATISFIED),
                List.of(new ApprovalRef("SECURITY","APR-1","d1",NOW.plusSeconds(300),true), new ApprovalRef("OWNER","APR-2","d2",NOW.plusSeconds(600),true)),
                Set.of("SECURITY","OWNER"), 11);
    }

    private static EligibilitySnapshot snapshot(long revision, String targetDigest, Standing auth, Standing policy,
            WindowStanding window, Map<String,RequirementStanding> prereqs, List<ApprovalRef> approvals, Set<String> mandatory, long epoch) {
        return new EligibilitySnapshot("CHG-1",revision,targetDigest,2,3,"policy-digest","principal:exec","CHANGE_EXECUTE",
                Set.of("svc:A","db:B"),mandatory,approvals,prereqs,window,policy,auth,epoch,"recovery-digest",NOW,null);
    }

    private static EligibilitySnapshot mutate(EligibilitySnapshot base, Standing auth, Standing policy, WindowStanding window,
            Map<String,RequirementStanding> prereqs, List<ApprovalRef> approvals, Set<String> mandatory) {
        return snapshot(base.revision(), base.targetDigest(), auth, policy, window, prereqs, approvals, mandatory, base.authorizationRevocationEpoch());
    }

    private static void denyIssue(ExecutionGrantIssuer issuer, EligibilitySnapshot s, String label) {
        expect(SecurityException.class, () -> issuer.issue(s, NOW, Duration.ofMinutes(5)), label);
    }
    private static void check(boolean c, String label) { tests++; if (!c) throw new AssertionError(label); }
    private static void expect(Class<? extends Throwable> type, Runnable r, String label) {
        tests++; try { r.run(); } catch (Throwable t) { if (type.isInstance(t)) return; throw new AssertionError(label+" wrong exception "+t); } throw new AssertionError(label+" expected "+type.getSimpleName());
    }
}
