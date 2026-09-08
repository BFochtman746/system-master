package org.systemmaster.core;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import static org.systemmaster.core.GovernanceAuthorizationContracts.*;

public final class Fwp005QualificationTest {
    private static int tests;
    private static final Instant NOW = Instant.parse("2026-09-08T02:00:00Z");

    public static void main(String[] args) {
        AuthorizationAdapter authz = new AuthorizationAdapter();
        SecretReferenceValidator secrets = new SecretReferenceValidator();
        ApprovalOrchestrator approvals = new ApprovalOrchestrator(authz);
        EmergencyChangeAuthority emergency = new EmergencyChangeAuthority(authz, secrets);

        testDistinctAuthorization(authz);
        testApprovalBindingAndSod(approvals);
        testApprovalReplayAndExpiry(approvals);
        testSecretBoundary(secrets);
        testEmergencyBounds(emergency);
        testEmergencyAdversarial(emergency);

        if (tests != 44) throw new AssertionError("expected 44 tests got " + tests);
        System.out.println("PASS F-WP-005 tests=44 requirements=6");
    }

    private static AuthorizationEvidence auth(String id, String principal, String action, Standing standing, long epoch, Instant expires) {
        return new AuthorizationEvidence(id, principal, action, "CHG-1", "O-POLICY-7", epoch, standing, NOW.minusSeconds(1), expires);
    }
    private static PrincipalLineage principal(String id, Set<String> equivalents, String... roles) {
        return new PrincipalLineage(id, equivalents, Set.of(roles), Set.of("employee"));
    }
    private static ApprovalBinding binding() {
        return new ApprovalBinding("CHG-1", 4, "target-digest-123", 3, 2, "policy-digest-789");
    }
    private static ApprovalObligation obligation(String id, boolean independent, Instant expires) {
        return new ApprovalObligation(id, "CHANGE_APPROVER", independent, expires);
    }

    private static void testDistinctAuthorization(AuthorizationAdapter a) {
        AuthorizationEvidence approve = auth("A1","p1","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(60));
        check(a.requireAuthorized(approve,"p1","CHANGE_APPROVE","CHG-1",NOW,8) == approve);
        expect(SecurityException.class, () -> a.requireAuthorized(approve,"p1","CHANGE_EXECUTE","CHG-1",NOW,8));
        expect(SecurityException.class, () -> a.requireAuthorized(approve,"p2","CHANGE_APPROVE","CHG-1",NOW,8));
        expect(SecurityException.class, () -> a.requireAuthorized(approve,"p1","CHANGE_APPROVE","CHG-X",NOW,8));
        expect(SecurityException.class, () -> a.requireAuthorized(auth("A2","p1","CHANGE_APPROVE",Standing.REVOKED,8,NOW.plusSeconds(60)),"p1","CHANGE_APPROVE","CHG-1",NOW,8));
        expect(SecurityException.class, () -> a.requireAuthorized(auth("A3","p1","CHANGE_APPROVE",Standing.UNKNOWN,8,NOW.plusSeconds(60)),"p1","CHANGE_APPROVE","CHG-1",NOW,8));
        expect(SecurityException.class, () -> a.requireAuthorized(auth("A4","p1","CHANGE_APPROVE",Standing.CURRENT,7,NOW.plusSeconds(60)),"p1","CHANGE_APPROVE","CHG-1",NOW,8));
        expect(SecurityException.class, () -> a.requireAuthorized(auth("A5","p1","CHANGE_APPROVE",Standing.CURRENT,8,NOW),"p1","CHANGE_APPROVE","CHG-1",NOW,8));
        AuthorizationEvidence execute = auth("A6","p1","CHANGE_EXECUTE",Standing.CURRENT,8,NOW.plusSeconds(60));
        a.requireDistinctActionEvidence(approve, execute); check(true);
        expect(SecurityException.class, () -> a.requireDistinctActionEvidence(approve, auth("A7","p2","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(60))));
    }

    private static void testApprovalBindingAndSod(ApprovalOrchestrator a) {
        PrincipalLineage approver = principal("approver-1", Set.of("acct-1"), "CHANGE_APPROVER");
        ApprovalDecisionHolder h = new ApprovalDecisionHolder();
        h.value = a.approve(obligation("O1", true, NOW.plusSeconds(120)), binding(), approver, "executor-1",
                auth("E1","approver-1","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(120)), NOW, 8);
        check(h.value.binding().equals(binding()));
        check(a.isCurrent(h.value, binding(), NOW.plusSeconds(30)));
        check(!a.isCurrent(h.value, new ApprovalBinding("CHG-1",5,"target-digest-123",3,2,"policy-digest-789"), NOW.plusSeconds(30)));
        check(!a.isCurrent(h.value, new ApprovalBinding("CHG-1",4,"different",3,2,"policy-digest-789"), NOW.plusSeconds(30)));
        check(!a.isCurrent(h.value, new ApprovalBinding("CHG-1",4,"target-digest-123",4,2,"policy-digest-789"), NOW.plusSeconds(30)));
        check(!a.isCurrent(h.value, new ApprovalBinding("CHG-1",4,"target-digest-123",3,3,"policy-digest-789"), NOW.plusSeconds(30)));
        expect(SecurityException.class, () -> a.approve(obligation("O2", true, NOW.plusSeconds(120)), binding(), approver, "approver-1",
                auth("E2","approver-1","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(120)), NOW,8));
        expect(SecurityException.class, () -> a.approve(obligation("O3", true, NOW.plusSeconds(120)), binding(), approver, "acct-1",
                auth("E3","approver-1","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(120)), NOW,8));
        PrincipalLineage noRole = principal("p3", Set.of(), "OBSERVER");
        expect(SecurityException.class, () -> a.approve(obligation("O4", false, NOW.plusSeconds(120)), binding(), noRole, "executor-1",
                auth("E4","p3","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(120)), NOW,8));
    }

    private static void testApprovalReplayAndExpiry(ApprovalOrchestrator a) {
        PrincipalLineage approver = principal("approver-2", Set.of(), "CHANGE_APPROVER");
        var ob = obligation("O5", false, NOW.plusSeconds(120));
        var ev = auth("E5","approver-2","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(120));
        var d1 = a.approve(ob,binding(),approver,"executor-1",ev,NOW,8);
        var d2 = a.approve(ob,binding(),approver,"executor-1",ev,NOW,8);
        check(d1 == d2);
        expect(IllegalStateException.class, () -> a.approve(ob,binding(),approver,"executor-1",
                auth("E6","approver-2","CHANGE_APPROVE",Standing.CURRENT,8,NOW.plusSeconds(120)),NOW,8));
        check(!a.isCurrent(d1,binding(),NOW.plusSeconds(121)));
        expect(SecurityException.class, () -> a.approve(obligation("O6",false,NOW),binding(),approver,"executor-1",ev,NOW,8));
        expect(IllegalArgumentException.class, () -> a.approve(obligation("O7",false,NOW.plusSeconds(60)),
                new ApprovalBinding("CHG-1",0,"x",1,1,"p"),approver,"executor-1",ev,NOW,8));
    }

    private static void testSecretBoundary(SecretReferenceValidator s) {
        SecretRef good = new SecretRef("secretref://vault/change/db-admin","DATABASE_CREDENTIAL","021P","v7",Standing.CURRENT);
        check(s.requireUsableReference(good) == good);
        expect(SecurityException.class, () -> s.requireUsableReference(new SecretRef("hunter2","PASSWORD","021P","v1",Standing.CURRENT)));
        expect(SecurityException.class, () -> s.requireUsableReference(new SecretRef("secretref://vault/x","TOKEN","021P","v1",Standing.REVOKED)));
        expect(SecurityException.class, () -> s.requireUsableReference(new SecretRef("secretref://vault/x","TOKEN","021P","v1",Standing.UNKNOWN)));
        s.rejectPlaintextSecrets("ordinary reason text"); check(true);
        expect(SecurityException.class, () -> s.rejectPlaintextSecrets("password=SuperSecret123"));
        expect(SecurityException.class, () -> s.rejectPlaintextSecrets("api_key=abcdefghijklmno"));
        expect(SecurityException.class, () -> s.rejectPlaintextSecrets("-----BEGIN PRIVATE KEY-----"));
    }

    private static void testEmergencyBounds(EmergencyChangeAuthority e) {
        PrincipalLineage p = principal("operator-1",Set.of(),"CHANGE_OPERATOR");
        SecretRef ref = new SecretRef("secretref://vault/change/emergency","BREAK_GLASS_CREDENTIAL","021P","v3",Standing.CURRENT);
        EmergencyScope scope = new EmergencyScope("CHG-1",4,Set.of("target-A"),Set.of("HALT","RECOVERY"),
                NOW.minusSeconds(5),NOW.plus(15, ChronoUnit.MINUTES),"contain active incident",true,List.of(ref));
        var grant = e.authorize(p,scope,auth("EM1","operator-1","CHANGE_EMERGENCY_AUTHORIZE",Standing.CURRENT,8,NOW.plusSeconds(60)),NOW,8);
        check(grant.principalRef().equals("operator-1"));
        check(grant.reviewObligationRef().startsWith("PCR:"));
        check(e.permits(grant,"HALT","target-A",NOW.plusSeconds(1)));
        check(!e.permits(grant,"ROLLBACK","target-A",NOW.plusSeconds(1)));
        check(!e.permits(grant,"HALT","target-B",NOW.plusSeconds(1)));
        check(!e.permits(grant,"HALT","target-A",scope.expiresAt()));
    }

    private static void testEmergencyAdversarial(EmergencyChangeAuthority e) {
        PrincipalLineage p = principal("operator-2",Set.of(),"CHANGE_OPERATOR");
        AuthorizationEvidence ok = auth("EM2","operator-2","CHANGE_EMERGENCY_AUTHORIZE",Standing.CURRENT,8,NOW.plusSeconds(60));
        expect(SecurityException.class, () -> e.authorize(p,new EmergencyScope("CHG-1",4,Set.of("t"),Set.of("EXECUTE"),NOW,NOW.plusSeconds(60),"reason",false,List.of()),ok,NOW,8));
        expect(SecurityException.class, () -> e.authorize(p,new EmergencyScope("CHG-1",4,Set.of("t"),Set.of("DROP_DATABASE"),NOW,NOW.plusSeconds(60),"reason",true,List.of()),ok,NOW,8));
        expect(SecurityException.class, () -> e.authorize(p,new EmergencyScope("CHG-1",4,Set.of("t"),Set.of("HALT"),NOW.minusSeconds(120),NOW.minusSeconds(1),"reason",true,List.of()),ok,NOW,8));
        expect(SecurityException.class, () -> e.authorize(p,new EmergencyScope("CHG-1",4,Set.of("t"),Set.of("HALT"),NOW,NOW.plusSeconds(60),"password=notallowed",true,List.of()),ok,NOW,8));
        expect(SecurityException.class, () -> e.authorize(p,new EmergencyScope("CHG-1",4,Set.of("t"),Set.of("HALT"),NOW,NOW.plusSeconds(60),"reason",true,List.of(
                new SecretRef("secretref://vault/x","TOKEN","021P","v1",Standing.REVOKED))),ok,NOW,8));
        expect(SecurityException.class, () -> e.authorize(p,new EmergencyScope("CHG-1",4,Set.of("t"),Set.of("HALT"),NOW,NOW.plusSeconds(60),"reason",true,List.of()),
                auth("EM3","operator-2","CHANGE_EMERGENCY_AUTHORIZE",Standing.REVOKED,8,NOW.plusSeconds(60)),NOW,8));
    }

    private static void check(boolean condition) { tests++; if (!condition) throw new AssertionError("check failed #" + tests); }
    private static void expect(Class<? extends Throwable> type, Runnable r) {
        tests++;
        try { r.run(); throw new AssertionError("expected " + type.getSimpleName() + " #" + tests); }
        catch (Throwable t) {
            if (t instanceof AssertionError) throw (AssertionError)t;
            if (!type.isInstance(t)) throw new AssertionError("expected " + type.getSimpleName() + " got " + t, t);
        }
    }
    private static final class ApprovalDecisionHolder { ApprovalOrchestrator.ApprovalDecision value; }
}
