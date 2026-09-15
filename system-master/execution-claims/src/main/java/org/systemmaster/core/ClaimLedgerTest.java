package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Qualification for {@link ClaimLedger}.
 *
 * <p>Discovered and bound to the Maven test phase by QualificationBridgeTest, which runs
 * every compiled {@code *Test} class exposing {@code main(String[])}.
 *
 * <p>Every refusal is asserted by its specific code rather than by "something threw".
 * A test that only proves an exception occurred cannot tell a working guard from a
 * NullPointerException, which is precisely how the earlier "locks" in this repository
 * passed while enforcing nothing.
 */
public final class ClaimLedgerTest {

    private static int checks;
    private static int failures;
    private static long mono = 1_000L;

    private static final Duration TTL = Duration.ofMinutes(5);
    private static final Instant T0 = Instant.parse("2026-09-14T22:00:00Z");

    private static CoordinationContracts.TimeEvidence te(Instant now) {
        mono += 1_000L;
        return new CoordinationContracts.TimeEvidence(now, mono, Duration.ofMinutes(5),
                CoordinationContracts.TimeStanding.TRUSTED);
    }

    public static void main(String[] args) {
        happyPath();
        duplicateSubmitRefused();
        secondConsumerRefused();
        staleFenceRefused();
        terminalizeWithoutEvidenceRefused();
        terminalClaimCannotBeReclaimed();
        expiredLeaseWriteRefused();
        staleUnsweptClaimRefused();
        crashResumeBarrier();
        boundedReadmissionTerminalizesDead();
        untrustedTimeRefused();
        consumerTickExecutesEndToEnd();
        consumerTickRecoversAbandonedClaim();
        consumerTickRecordsFailureWithEvidence();
        consumerTickIdleReturnsNull();

        System.out.println();
        System.out.println("CLAIM-LEDGER-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    // ---------- scenarios ----------

    private static void happyPath() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        eq("submitted claim is READY", ClaimLedger.ClaimState.READY, ledger.view("c-1").state());
        eq("fresh claim has zero attempts", 0, ledger.view("c-1").attempts());

        CoordinationContracts.ExecutionLease lease = ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        eq("claimed state", ClaimLedger.ClaimState.CLAIMED, ledger.view("c-1").state());
        eq("attempt counted", 1, ledger.view("c-1").attempts());
        ok("lease epoch is positive", lease.epoch() >= 1);

        ledger.recordEvidence("c-1", lease.epoch(), lease.fenceToken(), "sha256:receipt", T0);
        eq("receipt stored", 1, ledger.receipts("c-1").size());

        ledger.terminalize("c-1", lease.epoch(), lease.fenceToken(), ClaimLedger.ClaimState.DONE, T0);
        eq("terminal DONE", ClaimLedger.ClaimState.DONE, ledger.view("c-1").state());
        eq("terminal reason", "COMPLETED", ledger.view("c-1").terminalReason());
    }

    private static void duplicateSubmitRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        refuses("duplicate submit refused", IllegalStateException.class, "CLAIM_EXISTS",
                () -> ledger.submit("c-1", "sha256:other"));
    }

    /** THE exclusion proof: ExecutionLeaseManager.acquire() would grant a second epoch. */
    private static void secondConsumerRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));

        Instant during = T0.plusSeconds(60);
        refuses("second live consumer refused", IllegalStateException.class, "CLAIM_HELD",
                () -> ledger.claim("c-1", "consumer-b", TTL, during, te(during)));
        eq("holder unchanged after refusal", "consumer-a", ledger.view("c-1").consumerRef());
    }

    private static void staleFenceRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        CoordinationContracts.ExecutionLease lease = ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        refuses("wrong fence token refused", SecurityException.class, "FENCED_STALE_EXECUTOR",
                () -> ledger.recordEvidence("c-1", lease.epoch(), "not-the-token", "sha256:r", T0));
        eq("no receipt written on refusal", 0, ledger.receipts("c-1").size());
    }

    private static void terminalizeWithoutEvidenceRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        CoordinationContracts.ExecutionLease lease = ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        refuses("terminalize without evidence refused", IllegalStateException.class, "CLAIM_NO_EVIDENCE",
                () -> ledger.terminalize("c-1", lease.epoch(), lease.fenceToken(),
                        ClaimLedger.ClaimState.DONE, T0));
        eq("claim still in execution", ClaimLedger.ClaimState.CLAIMED, ledger.view("c-1").state());
    }

    private static void terminalClaimCannotBeReclaimed() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        CoordinationContracts.ExecutionLease lease = ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        ledger.recordEvidence("c-1", lease.epoch(), lease.fenceToken(), "sha256:r", T0);
        ledger.terminalize("c-1", lease.epoch(), lease.fenceToken(), ClaimLedger.ClaimState.DONE, T0);

        Instant later = T0.plusSeconds(30);
        refuses("finished claim cannot be re-executed", IllegalStateException.class, "CLAIM_TERMINAL",
                () -> ledger.claim("c-1", "consumer-b", TTL, later, te(later)));
    }

    private static void expiredLeaseWriteRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        CoordinationContracts.ExecutionLease lease = ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        Instant after = T0.plus(Duration.ofMinutes(10));
        refuses("write after lease expiry refused", SecurityException.class, "LEASE_EXPIRED",
                () -> ledger.recordEvidence("c-1", lease.epoch(), lease.fenceToken(), "sha256:r", after));
    }

    private static void staleUnsweptClaimRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        Instant after = T0.plus(Duration.ofMinutes(10));
        refuses("takeover before readmission refused", IllegalStateException.class,
                "CLAIM_STALE_AWAITING_READMISSION",
                () -> ledger.claim("c-1", "consumer-b", TTL, after, te(after)));
        eq("attempt counter not inflated by refused takeover", 1, ledger.view("c-1").attempts());
    }

    /**
     * The barrier that matters overnight: a consumer dies mid-execution, the claim is
     * recovered and completed by another consumer, and the dead consumer's late write is
     * refused so the work is never executed twice.
     */
    private static void crashResumeBarrier() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        CoordinationContracts.ExecutionLease dead = ledger.claim("c-1", "consumer-a", TTL, T0, te(T0));
        // consumer-a is killed here, having written nothing.

        Instant after = T0.plus(Duration.ofMinutes(10));
        List<String> changed = ledger.recover(after, te(after));
        ok("recover reported the readmission", changed.contains("c-1:READY"));
        eq("abandoned claim back to READY", ClaimLedger.ClaimState.READY, ledger.view("c-1").state());

        CoordinationContracts.ExecutionLease live = ledger.claim("c-1", "consumer-b", TTL, after, te(after));
        ok("readmitted claim gets a higher epoch", live.epoch() > dead.epoch());
        eq("second attempt counted", 2, ledger.view("c-1").attempts());

        refuses("resurrected consumer's write refused", SecurityException.class, "FENCED_STALE_EXECUTOR",
                () -> ledger.recordEvidence("c-1", dead.epoch(), dead.fenceToken(), "sha256:double", after));

        ledger.recordEvidence("c-1", live.epoch(), live.fenceToken(), "sha256:once", after);
        ledger.terminalize("c-1", live.epoch(), live.fenceToken(), ClaimLedger.ClaimState.DONE, after);
        eq("completed exactly once", 1, ledger.receipts("c-1").size());
        eq("receipt belongs to the live consumer", live.epoch(), ledger.receipts("c-1").get(0).epoch());
    }

    /** The wedge guard: crashes are readmitted a bounded number of times, then DEAD. */
    private static void boundedReadmissionTerminalizesDead() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager(), 3);
        ledger.submit("c-1", "sha256:payload");

        Instant now = T0;
        for (int attempt = 1; attempt <= 3; attempt++) {
            ledger.claim("c-1", "consumer-" + attempt, TTL, now, te(now));
            eq("attempt " + attempt + " counted", attempt, ledger.view("c-1").attempts());
            now = now.plus(Duration.ofMinutes(10)); // consumer dies, lease lapses
            ledger.recover(now, te(now));
        }

        eq("claim declared DEAD after the bound", ClaimLedger.ClaimState.DEAD, ledger.view("c-1").state());
        eq("dead reason recorded", "ATTEMPT_LIMIT_EXHAUSTED", ledger.view("c-1").terminalReason());

        Instant finalNow = now;
        refuses("dead claim cannot be claimed again", IllegalStateException.class, "CLAIM_TERMINAL",
                () -> ledger.claim("c-1", "consumer-x", TTL, finalNow, te(finalNow)));
        ok("dead claim is not offered as ready", !ledger.readyClaimIds().contains("c-1"));
    }

    private static void untrustedTimeRefused() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        CoordinationContracts.TimeEvidence bad = new CoordinationContracts.TimeEvidence(
                T0, 9_999L, Duration.ofMinutes(5), CoordinationContracts.TimeStanding.UNTRUSTED);
        refuses("untrusted time refused", SecurityException.class, "UNTRUSTED_TIME",
                () -> ledger.claim("c-1", "consumer-a", TTL, T0, bad));
    }

    // ---------- consumer ----------

    private static void consumerTickExecutesEndToEnd() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger, (id, payload) -> "sha256:dispatched-" + id, "actions-runner", TTL);

        String handled = consumer.tick(T0, te(T0));
        eq("tick handled the ready claim", "c-1", handled);
        eq("claim completed by tick", ClaimLedger.ClaimState.DONE, ledger.view("c-1").state());
        eq("tick wrote one receipt", 1, ledger.receipts("c-1").size());
        eq("receipt carries dispatch digest", "sha256:dispatched-c-1",
                ledger.receipts("c-1").get(0).receiptDigest());
    }

    /** Proves recover() is genuinely wired into tick() rather than merely existing. */
    private static void consumerTickRecoversAbandonedClaim() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        ledger.claim("c-1", "consumer-crashed", TTL, T0, te(T0));

        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger, (id, payload) -> "sha256:recovered-" + id, "actions-runner", TTL);

        Instant after = T0.plus(Duration.ofMinutes(10));
        String handled = consumer.tick(after, te(after));
        eq("tick recovered and executed the abandoned claim", "c-1", handled);
        eq("abandoned claim completed", ClaimLedger.ClaimState.DONE, ledger.view("c-1").state());
        eq("recovered work ran as a second attempt", 2, ledger.view("c-1").attempts());
    }

    private static void consumerTickRecordsFailureWithEvidence() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("c-1", "sha256:payload");
        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger, (id, payload) -> { throw new IllegalStateException("DISPATCH_REJECTED"); },
                "actions-runner", TTL);

        String handled = consumer.tick(T0, te(T0));
        eq("failing dispatch still handled the claim", "c-1", handled);
        eq("claim terminalized FAILED", ClaimLedger.ClaimState.FAILED, ledger.view("c-1").state());
        eq("failure left evidence", 1, ledger.receipts("c-1").size());
        ok("failure evidence names the cause",
                ledger.receipts("c-1").get(0).receiptDigest().contains("DISPATCH_REJECTED"));
    }

    private static void consumerTickIdleReturnsNull() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger, (id, payload) -> "sha256:never", "actions-runner", TTL);
        ok("idle tick returns null", consumer.tick(T0, te(T0)) == null);
    }

    // ---------- assertions ----------

    private static void ok(String label, boolean condition) {
        checks++;
        if (condition) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label);
        }
    }

    private static void eq(String label, Object expected, Object actual) {
        checks++;
        if (expected == null ? actual == null : expected.equals(actual)) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label + "  expected=" + expected + " actual=" + actual);
        }
    }

    /** Asserts the exact refusal type AND code, so a coincidental exception cannot pass. */
    private static void refuses(String label, Class<? extends Throwable> type,
            String expectedCode, Runnable body) {
        checks++;
        try {
            body.run();
            failures++;
            System.out.println("  FAIL  " + label + "  (no refusal raised — the guard is not enforcing)");
        } catch (Throwable t) {
            boolean typeOk = type.isInstance(t);
            boolean codeOk = t.getMessage() != null && t.getMessage().contains(expectedCode);
            if (typeOk && codeOk) {
                System.out.println("  PASS  " + label + "  [" + expectedCode + "]");
            } else {
                failures++;
                System.out.println("  FAIL  " + label + "  expected " + type.getSimpleName()
                        + "/" + expectedCode + " but got " + t.getClass().getSimpleName()
                        + "/" + t.getMessage());
            }
        }
    }
}
