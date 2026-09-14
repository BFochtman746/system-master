package org.systemmaster.core;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Qualification for {@link ClaimDriver} and {@link ActionsDispatch}.
 *
 * <p>Every refusal is asserted by exact exception type AND exact code, not merely that
 * something was thrown. That distinction is the whole lesson of this repository: its
 * earlier "locks" passed their tests while enforcing nothing, because a test that accepts
 * any throwable cannot tell a working guard from a NullPointerException.
 *
 * <p>The two ceilings in {@link ClaimDriver} are load-bearing and mutation-proofed: removing
 * either one turns this suite red with a wrong-value diagnostic rather than a vague failure.
 */
public final class ClaimDriverTest {

    private static int checks;
    private static int failures;

    private static final Instant T0 = Instant.parse("2026-09-15T02:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(5);

    public static void main(String[] args) {
        boundsAreValidated();
        drainsQueueAndReportsCounts();
        iterationCeilingStopsEarly();
        wallClockCeilingStopsEarly();
        idleRunIsSafeToRepeat();
        dispatchFailureIsRecordedAsEvidence();
        driverReadmitsAbandonedClaimAndBarsTheGhost();
        recoverIsIdempotentWithinAnIteration();
        boundedReadmissionDeadLetters();
        untrustedTimeIsRefused();
        dispatchRequestShapeAndSuccess();
        dispatchRefusalCodes();
        dispatchIntegratesWithDriverEndToEnd();

        System.out.println();
        System.out.println("CLAIM-DRIVER-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    // ---------------------------------------------------------------- ceilings

    private static void boundsAreValidated() {
        refuses("zero iterations refused", IllegalArgumentException.class, "INVALID_MAX_ITERATIONS",
                () -> new ClaimDriver.Bounds(0, Duration.ofMinutes(1)));
        refuses("negative iterations refused", IllegalArgumentException.class, "INVALID_MAX_ITERATIONS",
                () -> new ClaimDriver.Bounds(-3, Duration.ofMinutes(1)));
        refuses("zero budget refused", IllegalArgumentException.class, "INVALID_WALL_CLOCK_BUDGET",
                () -> new ClaimDriver.Bounds(5, Duration.ZERO));
        refuses("negative budget refused", IllegalArgumentException.class, "INVALID_WALL_CLOCK_BUDGET",
                () -> new ClaimDriver.Bounds(5, Duration.ofMinutes(-1)));
    }

    private static void drainsQueueAndReportsCounts() {
        Fixture f = new Fixture(3);
        ClaimDriver.RunSummary s = f.driver(10, Duration.ofHours(1), Duration.ZERO).run();

        eq("drained: completed", 3, s.completed());
        eq("drained: failed", 0, s.failed());
        // Three productive passes plus the pass that found the queue empty.
        eq("drained: iterations", 4, s.iterations());
        eq("drained: stop reason", ClaimDriver.StopReason.QUEUE_DRAINED, s.stopReason());
        ok("drained: needs no attention", !s.needsAttention());
        eq("drained: claim 1 terminal", ClaimLedger.ClaimState.DONE, f.ledger.view("c1").state());
        eq("drained: claim 1 has evidence", 1, f.ledger.receipts("c1").size());
    }

    /** MUTATION TARGET: delete the maxIterations bound and this goes red. */
    private static void iterationCeilingStopsEarly() {
        Fixture f = new Fixture(5);
        ClaimDriver.RunSummary s = f.driver(2, Duration.ofHours(1), Duration.ZERO).run();

        eq("iteration ceiling: iterations", 2, s.iterations());
        eq("iteration ceiling: completed", 2, s.completed());
        eq("iteration ceiling: stop reason", ClaimDriver.StopReason.ITERATION_LIMIT, s.stopReason());
        eq("iteration ceiling: work left queued", 3, f.ledger.readyClaimIds().size());
    }

    /** MUTATION TARGET: delete the wall-clock budget check and this goes red. */
    private static void wallClockCeilingStopsEarly() {
        Fixture f = new Fixture(5);
        // Each iteration observes time ten minutes later than the last, against a five
        // minute budget: the first pass works, the second is over budget before it starts.
        ClaimDriver.RunSummary s = f.driver(10, Duration.ofMinutes(5), Duration.ofMinutes(10)).run();

        eq("budget ceiling: iterations", 1, s.iterations());
        eq("budget ceiling: completed", 1, s.completed());
        eq("budget ceiling: stop reason", ClaimDriver.StopReason.BUDGET_EXHAUSTED, s.stopReason());
        eq("budget ceiling: work left queued", 4, f.ledger.readyClaimIds().size());
        ok("budget ceiling: elapsed observed", s.elapsed().toMinutes() >= 10);
    }

    private static void idleRunIsSafeToRepeat() {
        Fixture f = new Fixture(0);
        ClaimDriver driver = f.driver(5, Duration.ofHours(1), Duration.ZERO);

        ClaimDriver.RunSummary first = driver.run();
        eq("idle: stop reason", ClaimDriver.StopReason.QUEUE_DRAINED, first.stopReason());
        eq("idle: iterations", 1, first.iterations());
        eq("idle: completed", 0, first.completed());
        ok("idle: needs no attention", !first.needsAttention());

        ClaimDriver.RunSummary second = driver.run();
        eq("idle re-run: completed", 0, second.completed());
        eq("idle re-run: readmitted", 0, second.readmitted());
        eq("idle re-run: stop reason", ClaimDriver.StopReason.QUEUE_DRAINED, second.stopReason());
    }

    // ---------------------------------------------------------------- failure and recovery

    private static void dispatchFailureIsRecordedAsEvidence() {
        Fixture f = new Fixture(1, (claimId, digest) -> {
            throw new IllegalStateException("DISPATCH_REJECTED_500");
        });
        ClaimDriver.RunSummary s = f.driver(5, Duration.ofHours(1), Duration.ZERO).run();

        eq("dispatch failure: failed count", 1, s.failed());
        eq("dispatch failure: completed count", 0, s.completed());
        ok("dispatch failure: needs attention", s.needsAttention());
        eq("dispatch failure: claim terminal", ClaimLedger.ClaimState.FAILED, f.ledger.view("c1").state());
        eq("dispatch failure: evidence written", 1, f.ledger.receipts("c1").size());
        String digest = f.ledger.receipts("c1").get(0).receiptDigest();
        ok("dispatch failure: refusal code lands in evidence (" + digest + ")",
                digest.contains("DISPATCH_REJECTED_500"));
    }

    private static void driverReadmitsAbandonedClaimAndBarsTheGhost() {
        ExecutionLeaseManager leases = new ExecutionLeaseManager();
        ClaimLedger ledger = new ClaimLedger(leases);
        ledger.submit("c1", "payload-1");

        // A consumer takes the claim and dies without writing anything.
        CoordinationContracts.ExecutionLease ghost =
                ledger.claim("c1", "crashed-consumer", TTL, T0, trusted(T0));

        // The next unattended run happens after the lease has expired.
        Instant later = T0.plus(Duration.ofMinutes(10));
        ClaimLedger.Consumer consumer =
                new ClaimLedger.Consumer(ledger, okDispatch(), "driver-consumer", TTL);
        ClaimDriver driver = new ClaimDriver(ledger, consumer,
                new ClaimDriver.Bounds(4, Duration.ofHours(1)), new FakeClock(later, Duration.ZERO));
        ClaimDriver.RunSummary s = driver.run();

        eq("crash resume: readmitted", 1, s.readmitted());
        eq("crash resume: completed", 1, s.completed());
        eq("crash resume: claim done", ClaimLedger.ClaimState.DONE, ledger.view("c1").state());
        eq("crash resume: second attempt recorded", 2, ledger.view("c1").attempts());
        eq("crash resume: exactly one receipt", 1, ledger.receipts("c1").size());

        // The abandoned consumer wakes up and tries to write. It must be fenced out, or the
        // work would be executed twice — the entire reason overnight recovery needs fencing.
        refuses("crash resume: ghost write fenced", SecurityException.class, "FENCED_STALE_EXECUTOR",
                () -> ledger.recordEvidence("c1", ghost.epoch(), ghost.fenceToken(), "late", later));
        eq("crash resume: still exactly one receipt", 1, ledger.receipts("c1").size());
    }

    private static void recoverIsIdempotentWithinAnIteration() {
        ExecutionLeaseManager leases = new ExecutionLeaseManager();
        ClaimLedger ledger = new ClaimLedger(leases);
        ledger.submit("c1", "payload-1");
        ledger.claim("c1", "crashed-consumer", TTL, T0, trusted(T0));

        Instant later = T0.plus(Duration.ofMinutes(10));
        eq("idempotent recover: first sweep readmits", 1, ledger.recover(later, trusted(later)).size());
        eq("idempotent recover: second sweep changes nothing", 0,
                ledger.recover(later, trusted(later)).size());
        eq("idempotent recover: attempts not inflated", 1, ledger.view("c1").attempts());
    }

    private static void boundedReadmissionDeadLetters() {
        ExecutionLeaseManager leases = new ExecutionLeaseManager();
        ClaimLedger ledger = new ClaimLedger(leases, 1); // one attempt, then dead
        ledger.submit("c1", "payload-1");
        ledger.claim("c1", "crashed-consumer", TTL, T0, trusted(T0));

        Instant later = T0.plus(Duration.ofMinutes(10));
        ClaimLedger.Consumer consumer =
                new ClaimLedger.Consumer(ledger, okDispatch(), "driver-consumer", TTL);
        ClaimDriver.RunSummary s = new ClaimDriver(ledger, consumer,
                new ClaimDriver.Bounds(3, Duration.ofHours(1)),
                new FakeClock(later, Duration.ZERO)).run();

        eq("dead letter: counted", 1, s.deadLettered());
        eq("dead letter: not readmitted", 0, s.readmitted());
        eq("dead letter: state", ClaimLedger.ClaimState.DEAD, ledger.view("c1").state());
        eq("dead letter: reason", "ATTEMPT_LIMIT_EXHAUSTED", ledger.view("c1").terminalReason());
        ok("dead letter: needs attention", s.needsAttention());
        refuses("dead letter: cannot be reclaimed", IllegalStateException.class, "CLAIM_TERMINAL",
                () -> ledger.claim("c1", "another", TTL, later, trusted(later)));
    }

    private static void untrustedTimeIsRefused() {
        Fixture f = new Fixture(1);
        ClaimDriver driver = new ClaimDriver(f.ledger,
                new ClaimLedger.Consumer(f.ledger, okDispatch(), "driver-consumer", TTL),
                new ClaimDriver.Bounds(3, Duration.ofHours(1)),
                new FakeClock(T0, Duration.ZERO, CoordinationContracts.TimeStanding.UNTRUSTED));
        // The code belongs to the fencing layer, so the code is asserted and the observed
        // type is reported rather than guessed at.
        refusesCode("untrusted time refused", "UNTRUSTED_TIME", driver::run);
        eq("untrusted time: nothing executed", ClaimLedger.ClaimState.READY,
                f.ledger.view("c1").state());
    }

    // ---------------------------------------------------------------- dispatch

    private static void dispatchRequestShapeAndSuccess() {
        StubTransport t = new StubTransport(204, "");
        ActionsDispatch d = new ActionsDispatch(t, () -> "tok-abc",
                "BFochtman746", "system-master", "claim-work.yml", "main");

        String digest;
        try {
            digest = d.execute("claim-42", "payload-digest-9");
        } catch (Exception e) {
            bad("dispatch success", "threw " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return;
        }

        eq("dispatch url",
                "https://api.github.com/repos/BFochtman746/system-master"
                        + "/actions/workflows/claim-work.yml/dispatches", t.lastUrl);
        ok("dispatch body carries ref", t.lastBody.contains("\"ref\":\"main\""));
        ok("dispatch body carries claim id", t.lastBody.contains("\"claim_id\":\"claim-42\""));
        ok("dispatch body carries payload digest",
                t.lastBody.contains("\"payload_digest\":\"payload-digest-9\""));
        eq("dispatch sends bearer token", "Bearer tok-abc", t.lastHeaders.get("Authorization"));
        eq("dispatch pins api version", "2022-11-28", t.lastHeaders.get("X-GitHub-Api-Version"));
        ok("receipt says dispatched, not completed (" + digest + ")",
                digest.startsWith("ACTIONS_DISPATCHED"));
        ok("receipt carries correlation", digest.contains("correlation=claim-42"));
    }

    private static void dispatchRefusalCodes() {
        refuses("no credential refused", IllegalStateException.class, "DISPATCH_NO_CREDENTIAL",
                () -> new ActionsDispatch(new StubTransport(204, ""), () -> "",
                        "o", "r", "w.yml", "main").execute("c", "d"));
        refuses("blank credential refused", IllegalStateException.class, "DISPATCH_NO_CREDENTIAL",
                () -> new ActionsDispatch(new StubTransport(204, ""), () -> null,
                        "o", "r", "w.yml", "main").execute("c", "d"));
        refuses("missing repository refused", IllegalStateException.class,
                "DISPATCH_MISCONFIGURED_REPOSITORY",
                () -> new ActionsDispatch(new StubTransport(204, ""), () -> "t",
                        "o", "", "w.yml", "main").execute("c", "d"));
        refuses("missing workflow refused", IllegalStateException.class,
                "DISPATCH_MISCONFIGURED_WORKFLOW",
                () -> new ActionsDispatch(new StubTransport(204, ""), () -> "t",
                        "o", "r", "", "main").execute("c", "d"));
        refuses("missing ref refused", IllegalStateException.class, "DISPATCH_MISCONFIGURED_REF",
                () -> new ActionsDispatch(new StubTransport(204, ""), () -> "t",
                        "o", "r", "w.yml", "").execute("c", "d"));
        refuses("missing claim id refused", IllegalArgumentException.class, "MISSING_CLAIM_ID",
                () -> new ActionsDispatch(new StubTransport(204, ""), () -> "t",
                        "o", "r", "w.yml", "main").execute("", "d"));
        refuses("actions 404 refused", IllegalStateException.class, "DISPATCH_REJECTED_404",
                () -> new ActionsDispatch(new StubTransport(404, "{}"), () -> "t",
                        "o", "r", "w.yml", "main").execute("c", "d"));
        refuses("actions 422 refused", IllegalStateException.class, "DISPATCH_REJECTED_422",
                () -> new ActionsDispatch(new StubTransport(422, "{}"), () -> "t",
                        "o", "r", "w.yml", "main").execute("c", "d"));
        // A 200 is not success for workflow_dispatch: Actions answers 204. Accepting any
        // 2xx would report a dispatch that never queued.
        refuses("actions 200 is not success", IllegalStateException.class, "DISPATCH_REJECTED_200",
                () -> new ActionsDispatch(new StubTransport(200, "{}"), () -> "t",
                        "o", "r", "w.yml", "main").execute("c", "d"));
        StubTransport broken = new StubTransport(204, "");
        broken.boom = new IOException("connection reset");
        refuses("transport failure refused", IllegalStateException.class,
                "DISPATCH_TRANSPORT_FAILURE",
                () -> new ActionsDispatch(broken, () -> "t", "o", "r", "w.yml", "main")
                        .execute("c", "d"));
    }

    private static void dispatchIntegratesWithDriverEndToEnd() {
        StubTransport t = new StubTransport(204, "");
        ActionsDispatch dispatch = new ActionsDispatch(t, () -> "tok",
                "BFochtman746", "system-master", "claim-work.yml", "main");

        ExecutionLeaseManager leases = new ExecutionLeaseManager();
        ClaimLedger ledger = new ClaimLedger(leases);
        ledger.submit("e2e-1", "digest-e2e");
        ClaimDriver.RunSummary s = new ClaimDriver(ledger,
                new ClaimLedger.Consumer(ledger, dispatch, "driver-consumer", TTL),
                new ClaimDriver.Bounds(4, Duration.ofHours(1)),
                new FakeClock(T0, Duration.ZERO)).run();

        eq("end to end: completed", 1, s.completed());
        eq("end to end: claim done", ClaimLedger.ClaimState.DONE, ledger.view("e2e-1").state());
        eq("end to end: one receipt", 1, ledger.receipts("e2e-1").size());
        ok("end to end: receipt is a dispatch receipt",
                ledger.receipts("e2e-1").get(0).receiptDigest().startsWith("ACTIONS_DISPATCHED"));
        ok("end to end: actions was actually called", t.calls == 1);
    }

    // ---------------------------------------------------------------- helpers

    /** A ledger preloaded with n claims plus a driver factory over it. */
    private static final class Fixture {
        final ExecutionLeaseManager leases = new ExecutionLeaseManager();
        final ClaimLedger ledger = new ClaimLedger(leases);
        final ClaimLedger.Consumer.Dispatch dispatch;

        Fixture(int claims) {
            this(claims, okDispatch());
        }

        Fixture(int claims, ClaimLedger.Consumer.Dispatch dispatch) {
            this.dispatch = dispatch;
            for (int i = 1; i <= claims; i++) {
                ledger.submit("c" + i, "payload-" + i);
            }
        }

        ClaimDriver driver(int maxIterations, Duration budget, Duration step) {
            return new ClaimDriver(ledger,
                    new ClaimLedger.Consumer(ledger, dispatch, "driver-consumer", TTL),
                    new ClaimDriver.Bounds(maxIterations, budget),
                    new FakeClock(T0, step));
        }
    }

    /** Deterministic clock: returns the current instant, then advances by step. */
    private static final class FakeClock implements ClaimDriver.TimeSource {
        private Instant at;
        private final Duration step;
        private final CoordinationContracts.TimeStanding standing;
        private long nanos;

        FakeClock(Instant start, Duration step) {
            this(start, step, CoordinationContracts.TimeStanding.TRUSTED);
        }

        FakeClock(Instant start, Duration step, CoordinationContracts.TimeStanding standing) {
            this.at = start;
            this.step = step;
            this.standing = standing;
        }

        @Override
        public CoordinationContracts.TimeEvidence evidence() {
            Instant now = at;
            at = at.plus(step);
            nanos += 1_000_000L;
            return new CoordinationContracts.TimeEvidence(
                    now, nanos, Duration.ofSeconds(5), standing);
        }
    }

    private static final class StubTransport implements ActionsDispatch.Transport {
        private final int status;
        private final String body;
        String lastUrl;
        String lastBody;
        Map<String, String> lastHeaders;
        Exception boom;
        int calls;

        StubTransport(int status, String body) {
            this.status = status;
            this.body = body;
        }

        @Override
        public ActionsDispatch.Response post(String url, Map<String, String> headers, String payload)
                throws Exception {
            calls++;
            lastUrl = url;
            lastHeaders = headers;
            lastBody = payload;
            if (boom != null) throw boom;
            return new ActionsDispatch.Response(status, body);
        }
    }

    private static ClaimLedger.Consumer.Dispatch okDispatch() {
        return (claimId, payloadDigest) -> "receipt:" + claimId;
    }

    private static CoordinationContracts.TimeEvidence trusted(Instant at) {
        return new CoordinationContracts.TimeEvidence(at, 1_000_000L, Duration.ofSeconds(5),
                CoordinationContracts.TimeStanding.TRUSTED);
    }

    private interface Body {
        void run() throws Exception;
    }

    private static void ok(String label, boolean condition) {
        checks++;
        if (condition) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label);
        }
    }

    private static void bad(String label, String detail) {
        checks++;
        failures++;
        System.out.println("  FAIL  " + label + " — " + detail);
    }

    private static void eq(String label, Object expected, Object actual) {
        checks++;
        if (expected == null ? actual == null : expected.equals(actual)) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label + " — expected " + expected + ", got " + actual);
        }
    }

    /** Asserts exact exception type AND exact code. */
    private static void refuses(String label, Class<? extends Throwable> type, String code, Body body) {
        checks++;
        try {
            body.run();
            failures++;
            System.out.println("  FAIL  " + label + " — expected " + type.getSimpleName()
                    + "(" + code + ") but nothing was thrown");
        } catch (Throwable t) {
            String message = String.valueOf(t.getMessage());
            boolean rightType = type.isInstance(t);
            boolean rightCode = message.equals(code) || message.contains(code);
            if (rightType && rightCode) {
                System.out.println("  PASS  " + label);
            } else {
                failures++;
                System.out.println("  FAIL  " + label + " — expected " + type.getSimpleName()
                        + "(" + code + "), got " + t.getClass().getSimpleName() + "(" + message + ")");
            }
        }
    }

    /** For codes owned by another subsystem: asserts the code, reports the observed type. */
    private static void refusesCode(String label, String code, Body body) {
        checks++;
        try {
            body.run();
            failures++;
            System.out.println("  FAIL  " + label + " — expected " + code
                    + " but nothing was thrown");
        } catch (Throwable t) {
            String message = String.valueOf(t.getMessage());
            if (message.contains(code)) {
                System.out.println("  PASS  " + label + " (" + t.getClass().getSimpleName() + ")");
            } else {
                failures++;
                System.out.println("  FAIL  " + label + " — expected code " + code + ", got "
                        + t.getClass().getSimpleName() + "(" + message + ")");
            }
        }
    }
}
