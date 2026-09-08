package org.systemmaster.core;

import static org.systemmaster.core.RecoveryEligibilityContracts.*;
import java.time.Instant;

public final class Fwp009QualificationTest {
    private static int tests = 0;
    private static final String D1 = "1111111111111111111111111111111111111111111111111111111111111111";
    private static final String D2 = "2222222222222222222222222222222222222222222222222222222222222222";
    private static final String D3 = "3333333333333333333333333333333333333333333333333333333333333333";
    private static final String D4 = "4444444444444444444444444444444444444444444444444444444444444444";
    private static final String D5 = "5555555555555555555555555555555555555555555555555555555555555555";
    private static final String D6 = "6666666666666666666666666666666666666666666666666666666666666666";
    private static final String D7 = "7777777777777777777777777777777777777777777777777777777777777777";
    private static final String D8 = "8888888888888888888888888888888888888888888888888888888888888888";
    private static final String D9 = "9999999999999999999999999999999999999999999999999999999999999999";

    public static void main(String[] args) {
        RecoveryCoordinator c = new RecoveryCoordinator();
        RecoveryTarget target = target();
        CurrentEligibilitySnapshot ok = eligibility(Standing.ELIGIBLE, Standing.ELIGIBLE, Standing.ELIGIBLE,
                Standing.ELIGIBLE, Standing.ELIGIBLE, Standing.ELIGIBLE, Compatibility.COMPATIBLE, Compatibility.COMPATIBLE, 1);

        RecoveryDecision allow = c.evaluateRollbackOrRestore(RecoveryKind.ROLLBACK, target, ok);
        eq(Disposition.ALLOW_ROLLBACK_OR_RESTORE, allow.disposition(), "eligible rollback");
        eq(target.digest(), allow.targetDigest(), "target bound");
        eq(ok.digest(), allow.eligibilitySnapshotDigest(), "snapshot bound");
        isTrue(allow.decisionDigest().matches("[0-9a-f]{64}"), "decision digest");
        eq(RecoveryKind.ROLLBACK, c.authorizeRollbackOrRestore(allow, target, ok).kind(), "rollback execution");

        RecoveryDecision restore = c.evaluateRollbackOrRestore(RecoveryKind.RESTORE, target, ok);
        eq(Disposition.ALLOW_ROLLBACK_OR_RESTORE, restore.disposition(), "eligible restore");
        eq(RecoveryKind.RESTORE, c.authorizeRollbackOrRestore(restore, target, ok).kind(), "restore execution");

        prohibited(c, target, ok, "release", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.PROHIBITED,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,2));
        prohibited(c, target, ok, "key", eligibility(Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,3));
        prohibited(c, target, ok, "credential", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,4));
        prohibited(c, target, ok, "policy", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,5));
        prohibited(c, target, ok, "provider", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,6));
        prohibited(c, target, ok, "security", eligibility(Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,7));

        unknown(c, target, "release unknown", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.UNKNOWN,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,8));
        unknown(c, target, "key unknown", eligibility(Standing.ELIGIBLE,Standing.UNKNOWN,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,9));
        unknown(c, target, "provider unknown", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.UNKNOWN,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,10));
        unknown(c, target, "schema unknown", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.UNKNOWN,Compatibility.COMPATIBLE,11));
        unknown(c, target, "data unknown", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.UNKNOWN,12));

        incompatible(c, target, "schema incompatible", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.INCOMPATIBLE,Compatibility.COMPATIBLE,13));
        incompatible(c, target, "data incompatible", eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.INCOMPATIBLE,14));

        expectThrows(() -> c.authorizeRollbackOrRestore(allow, target, eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,15)), "stale eligibility rejected");
        RecoveryTarget otherTarget = new RecoveryTarget("CHG-9", 9, D9, D2, D3, D4, D5);
        expectThrows(() -> c.authorizeRollbackOrRestore(allow, otherTarget, ok), "different target rejected");
        RecoveryDecision denied = c.evaluateRollbackOrRestore(RecoveryKind.ROLLBACK, target, eligibility(Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,16));
        expectThrows(() -> c.authorizeRollbackOrRestore(denied, target, eligibility(Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,16)), "denied decision cannot execute");

        RollForwardPlan rf = new RollForwardPlan("RF-1", "CHG-1", 7, D1, D2, D3, D4, D5, Instant.parse("2026-09-08T00:00:00Z"));
        RecoveryCoordinator.RecoveryExecution rfx = c.authorizeRollForward(rf, ok);
        eq(RecoveryKind.ROLL_FORWARD, rfx.kind(), "roll forward first class");
        eq(D4, rfx.targetDigest(), "roll forward target bound");
        eq(ok.digest(), rfx.eligibilitySnapshotDigest(), "roll forward current eligibility bound");
        isTrue(rfx.authorizationDigest().matches("[0-9a-f]{64}"), "roll forward auth digest");
        expectThrows(() -> c.authorizeRollForward(rf, eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,17)), "roll forward provider prohibited");
        expectThrows(() -> c.authorizeRollForward(rf, eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.UNKNOWN,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,18)), "roll forward release unknown");
        expectThrows(() -> c.authorizeRollForward(rf, eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.INCOMPATIBLE,Compatibility.COMPATIBLE,19)), "roll forward schema incompatible");
        expectThrows(() -> new RollForwardPlan("RF-X","CHG-1",7,"not-a-digest",D2,D3,D4,D5,Instant.now()), "roll forward exact scope required");
        expectThrows(() -> c.evaluateRollbackOrRestore(RecoveryKind.ROLL_FORWARD, target, ok), "roll forward cannot use rollback path");

        RecoveryTarget historicalRevoked = new RecoveryTarget("CHG-1", 1, D1, D2, D3, D4, D5);
        CurrentEligibilitySnapshot currentReleaseRevoked = eligibility(Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.PROHIBITED,Compatibility.COMPATIBLE, Compatibility.COMPATIBLE,20);
        eq(Disposition.REQUIRE_ROLL_FORWARD, c.evaluateRollbackOrRestore(RecoveryKind.ROLLBACK, historicalRevoked, currentReleaseRevoked).disposition(), "historical eligible release cannot resurrect revoked current release");

        CurrentEligibilitySnapshot currentKeyRevoked = eligibility(Standing.ELIGIBLE,Standing.PROHIBITED,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Standing.ELIGIBLE,Compatibility.COMPATIBLE,Compatibility.COMPATIBLE,21);
        eq(Disposition.REQUIRE_ROLL_FORWARD, c.evaluateRollbackOrRestore(RecoveryKind.RESTORE, historicalRevoked, currentKeyRevoked).disposition(), "restore cannot resurrect revoked key");

        if (tests != 40) throw new AssertionError("TEST_COUNT expected=40 actual=" + tests);
        System.out.println("PASS F-WP-009 tests=40 requirements=4");
    }

    private static RecoveryTarget target() { return new RecoveryTarget("CHG-1", 7, D1, D2, D3, D4, D5); }
    private static CurrentEligibilitySnapshot eligibility(Standing security, Standing key, Standing credential, Standing policy,
            Standing provider, Standing release, Compatibility schema, Compatibility data, long revision) {
        return new CurrentEligibilitySnapshot("ELIG-"+revision, revision, Instant.parse("2026-09-08T00:00:00Z"), D6,
                security,key,credential,policy,provider,release,schema,data,D7,D8,D9,D1);
    }
    private static void prohibited(RecoveryCoordinator c, RecoveryTarget t, CurrentEligibilitySnapshot ignored, String name, CurrentEligibilitySnapshot s) {
        RecoveryDecision d = c.evaluateRollbackOrRestore(RecoveryKind.ROLLBACK,t,s);
        eq(Disposition.REQUIRE_ROLL_FORWARD,d.disposition(),name+" prohibited");
        isTrue(d.decisionReason().contains("PROHIBITION"),name+" reason");
    }
    private static void unknown(RecoveryCoordinator c, RecoveryTarget t, String name, CurrentEligibilitySnapshot s) {
        RecoveryDecision d=c.evaluateRollbackOrRestore(RecoveryKind.ROLLBACK,t,s);
        eq(Disposition.BLOCK_UNKNOWN,d.disposition(),name);
    }
    private static void incompatible(RecoveryCoordinator c, RecoveryTarget t, String name, CurrentEligibilitySnapshot s) {
        RecoveryDecision d=c.evaluateRollbackOrRestore(RecoveryKind.ROLLBACK,t,s);
        eq(Disposition.BLOCK_INCOMPATIBLE,d.disposition(),name);
    }
    private static void eq(Object e,Object a,String m){tests++;if(!java.util.Objects.equals(e,a))throw new AssertionError(m+" expected="+e+" actual="+a);}
    private static void isTrue(boolean v,String m){tests++;if(!v)throw new AssertionError(m);}
    private static void expectThrows(Runnable r,String m){tests++;try{r.run();throw new AssertionError(m+" expected throw");}catch(AssertionError e){throw e;}catch(RuntimeException ok){}}
}
