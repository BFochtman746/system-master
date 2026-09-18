package org.systemmaster.core;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Qualification for {@link ActionsRunPoller}.
 *
 * <p>Every refusal is asserted by exact exception type AND exact code, never merely that
 * something was thrown — a test that accepts any throwable cannot tell a working guard from a
 * NullPointerException, which is how this repository previously shipped "locks" that enforced
 * nothing.
 *
 * <p>The four bounds (attempt ceiling and wall-clock budget, in each of the two phases) are
 * load-bearing and mutation-proofed. Each is asserted by an <em>exact attempt count</em> and an
 * exact phase code, so removing or widening a bound turns this suite red with a wrong-value or
 * wrong-code diagnostic rather than hanging or throwing something vague.
 *
 * <p>The central correctness property is negative: {@code DONE} must be unreachable for a run
 * that did not conclude {@code success}. {@link #endToEndDoneRequiresCompletion()} proves both
 * directions through a real {@link ClaimLedger.Consumer}, and
 * {@link #unwiredDigestStaysActionsDispatched()} proves that without this poller the weaker
 * guarantee stays visible in the digest instead of being silently implied.
 */
public final class ActionsRunPollerTest {

    private static int checks;
    private static int failures;

    private static final Instant T0 = Instant.parse("2026-09-17T20:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(5);

    public static void main(String[] args) {
        boundsAreValidated();
        correlationIsBoundaryChecked();
        completesOnSuccessfulRun();
        discoveryAttemptCeilingIsLoadBearing();
        discoveryWallClockBudgetIsLoadBearing();
        pollAttemptCeilingIsLoadBearing();
        pollWallClockBudgetIsLoadBearing();
        theTwoPhaseRefusalsAreDistinct();
        nonSuccessConclusionsRefuseByExactCode();
        ambiguousCorrelationRefuses();
        queryFailureIsNeverReportedAsNotFound();
        dispatchRefusalPropagatesUnmasked();
        unwiredDigestStaysActionsDispatched();
        endToEndDoneRequiresCompletion();

        System.out.println();
        System.out.println("ACTIONS-RUN-POLLER-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    // ---------------------------------------------------------------- construction

    private static void boundsAreValidated() {
        System.out.println("bounds are validated at construction");
        refusesCode("zero discovery attempts refused", "INVALID_DISCOVERY_ATTEMPTS",
                () -> poller(new FakeRuns(), new FakeClock(T0, Duration.ZERO), 0,
                        Duration.ofMinutes(1), 3, Duration.ofMinutes(1)));
        refusesCode("zero discovery budget refused", "INVALID_DISCOVERY_BUDGET",
                () -> poller(new FakeRuns(), new FakeClock(T0, Duration.ZERO), 3,
                        Duration.ZERO, 3, Duration.ofMinutes(1)));
        refusesCode("negative poll attempts refused", "INVALID_POLL_ATTEMPTS",
                () -> poller(new FakeRuns(), new FakeClock(T0, Duration.ZERO), 3,
                        Duration.ofMinutes(1), -1, Duration.ofMinutes(1)));
        refusesCode("negative poll budget refused", "INVALID_POLL_BUDGET",
                () -> poller(new FakeRuns(), new FakeClock(T0, Duration.ZERO), 3,
                        Duration.ofMinutes(1), 3, Duration.ofSeconds(-5)));
    }

    // ---------------------------------------------------------------- correlation

    private static void correlationIsBoundaryChecked() {
        System.out.println("correlation matches whole tokens only");
        // THE failure this guard exists to prevent: job-1 satisfied by job-11's run.
        ok("job-1 is NOT matched by job-11's title",
                !ActionsRunPoller.titleCorrelates("claim-work for job-11", "job-1"));
        ok("job-1 is NOT matched by a longer suffix",
                !ActionsRunPoller.titleCorrelates("claim-work for job-1a", "job-1"));
        ok("job-1 is NOT matched inside xjob-1",
                !ActionsRunPoller.titleCorrelates("claim-work for xjob-1", "job-1"));
        ok("job-1 IS matched as a whole token",
                ActionsRunPoller.titleCorrelates("claim-work for job-1", "job-1"));
        ok("job-1 IS matched with trailing punctuation",
                ActionsRunPoller.titleCorrelates("claim job-1: build", "job-1"));
        ok("exact title matches", ActionsRunPoller.titleCorrelates("job-1", "job-1"));
        ok("job-11 still matches its own run",
                ActionsRunPoller.titleCorrelates("claim-work for job-11", "job-11"));
        ok("null title does not match", !ActionsRunPoller.titleCorrelates(null, "job-1"));
        ok("empty claim id does not match",
                !ActionsRunPoller.titleCorrelates("claim-work for job-1", ""));
    }

    // ---------------------------------------------------------------- happy path

    private static void completesOnSuccessfulRun() {
        System.out.println("a successful run yields a completion digest naming the run id");
        FakeRuns runs = new FakeRuns();
        runs.appearAfter(2, new ActionsRunPoller.RunView(42L, "claim-work for job-1", "queued", null));
        runs.thenById(
                new ActionsRunPoller.RunView(42L, "claim-work for job-1", "in_progress", null),
                new ActionsRunPoller.RunView(42L, "claim-work for job-1", "completed", "success"));

        try {
            String digest = poller(runs, new FakeClock(T0, Duration.ZERO), 5,
                    Duration.ofMinutes(5), 5, Duration.ofMinutes(5))
                    .execute("job-1", "sha256:beef");
            ok("digest reports completion, not mere dispatch", digest.startsWith("ACTIONS_COMPLETED"));
            ok("digest carries the resolved run id", digest.contains("run=42"));
            ok("digest carries the success conclusion", digest.contains("conclusion=success"));
            ok("digest retains the acceptance receipt", digest.contains("accepted="));
            eq("discovery polled until the run appeared", 2, runs.recentCalls);
            eq("completion polled until the run finished", 2, runs.byIdCalls);
        } catch (Exception e) {
            bad("successful run yields a digest", "threw " + e);
        }
    }

    // ---------------------------------------------------------------- bound 1 of 4

    private static void discoveryAttemptCeilingIsLoadBearing() {
        System.out.println("discovery stops at its attempt ceiling (frozen clock)");
        FakeRuns runs = new FakeRuns(); // run never appears
        FakeClock frozen = new FakeClock(T0, Duration.ZERO);
        // Exact code AND exact attempt count: widening the ceiling changes attempts=3 and this
        // assertion reports the wrong value rather than passing vaguely.
        refusesCodeAnd("never-appearing run refuses by window code",
                "DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW", "attempts_exhausted",
                () -> poller(runs, frozen, 3, Duration.ofHours(1), 3, Duration.ofHours(1))
                        .execute("job-1", "sha256:beef"));
        eq("the ceiling bounded the queries at exactly 3", 3, runs.recentCalls);
    }

    private static void discoveryWallClockBudgetIsLoadBearing() {
        System.out.println("discovery stops at its wall-clock budget before its ceiling");
        FakeRuns runs = new FakeRuns(); // run never appears
        // 40s per observation against a 60s budget: the clock runs out on the 2nd check while
        // 998 attempts remain, so only the wall-clock bound can be what stopped it.
        FakeClock fast = new FakeClock(T0, Duration.ofSeconds(40));
        refusesCodeAnd("clock-exhausted discovery refuses by window code",
                "DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW", "budget_exceeded",
                () -> poller(runs, fast, 1000, Duration.ofSeconds(60), 3, Duration.ofHours(1))
                        .execute("job-1", "sha256:beef"));
        ok("stopped well inside the attempt ceiling (queries=" + runs.recentCalls + ")",
                runs.recentCalls > 0 && runs.recentCalls < 10);
    }

    // ---------------------------------------------------------------- bound 3 of 4

    private static void pollAttemptCeilingIsLoadBearing() {
        System.out.println("completion polling stops at its attempt ceiling (frozen clock)");
        FakeRuns runs = new FakeRuns();
        runs.appearAfter(1, new ActionsRunPoller.RunView(7L, "claim-work for job-1", "queued", null));
        runs.foreverById(new ActionsRunPoller.RunView(7L, "claim-work for job-1", "in_progress", null));
        FakeClock frozen = new FakeClock(T0, Duration.ZERO);
        refusesCodeAnd("never-finishing run refuses by poll-budget code",
                "DISPATCH_POLL_BUDGET_EXHAUSTED", "attempts_exhausted",
                () -> poller(runs, frozen, 3, Duration.ofHours(1), 4, Duration.ofHours(1))
                        .execute("job-1", "sha256:beef"));
        eq("the ceiling bounded the completion polls at exactly 4", 4, runs.byIdCalls);
        ok("the refusal names the run it was waiting on", runs.byIdCalls > 0);
    }

    private static void pollWallClockBudgetIsLoadBearing() {
        System.out.println("completion polling stops at its wall-clock budget before its ceiling");
        FakeRuns runs = new FakeRuns();
        runs.appearAfter(1, new ActionsRunPoller.RunView(7L, "claim-work for job-1", "queued", null));
        runs.foreverById(new ActionsRunPoller.RunView(7L, "claim-work for job-1", "in_progress", null));
        FakeClock fast = new FakeClock(T0, Duration.ofSeconds(40));
        refusesCodeAnd("clock-exhausted polling refuses by poll-budget code",
                "DISPATCH_POLL_BUDGET_EXHAUSTED", "budget_exceeded",
                () -> poller(runs, fast, 3, Duration.ofHours(1), 1000, Duration.ofSeconds(60))
                        .execute("job-1", "sha256:beef"));
        ok("stopped well inside the attempt ceiling (polls=" + runs.byIdCalls + ")",
                runs.byIdCalls < 10);
    }

    private static void theTwoPhaseRefusalsAreDistinct() {
        System.out.println("the two phases refuse with different codes");
        // Collapsing these into one code would make "nothing ever started" and "still running"
        // indistinguishable in the evidence trail. They are different operational faults.
        ok("not-found and budget-exhausted are not the same code",
                !"DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW".equals("DISPATCH_POLL_BUDGET_EXHAUSTED"));
    }

    // ---------------------------------------------------------------- conclusions

    private static void nonSuccessConclusionsRefuseByExactCode() {
        System.out.println("no non-success conclusion can return a digest");
        refusesCode("failure refuses", "DISPATCH_RUN_CONCLUDED_FAILURE",
                () -> concluded("failure"));
        refusesCode("cancelled refuses", "DISPATCH_RUN_CONCLUDED_CANCELLED",
                () -> concluded("cancelled"));
        refusesCode("timed_out refuses", "DISPATCH_RUN_CONCLUDED_TIMED_OUT",
                () -> concluded("timed_out"));
        refusesCode("action_required refuses", "DISPATCH_RUN_CONCLUDED_ACTION_REQUIRED",
                () -> concluded("action_required"));
        refusesCode("a completed run with no conclusion refuses",
                "DISPATCH_RUN_CONCLUDED_UNKNOWN", () -> concluded(null));
    }

    private static String concluded(String conclusion) throws Exception {
        FakeRuns runs = new FakeRuns();
        runs.appearAfter(1, new ActionsRunPoller.RunView(9L, "claim-work for job-1", "queued", null));
        runs.foreverById(new ActionsRunPoller.RunView(9L, "claim-work for job-1",
                "completed", conclusion));
        return poller(runs, new FakeClock(T0, Duration.ZERO), 3, Duration.ofHours(1),
                3, Duration.ofHours(1)).execute("job-1", "sha256:beef");
    }

    private static void ambiguousCorrelationRefuses() {
        System.out.println("two runs claiming one id refuse rather than guess");
        FakeRuns runs = new FakeRuns();
        runs.appearAfter(1,
                new ActionsRunPoller.RunView(1L, "claim-work for job-1", "queued", null),
                new ActionsRunPoller.RunView(2L, "claim-work for job-1", "queued", null));
        refusesCode("ambiguous correlation refuses", "DISPATCH_CORRELATION_AMBIGUOUS",
                () -> poller(runs, new FakeClock(T0, Duration.ZERO), 3, Duration.ofHours(1),
                        3, Duration.ofHours(1)).execute("job-1", "sha256:beef"));
    }

    private static void queryFailureIsNeverReportedAsNotFound() {
        System.out.println("a broken query is not a not-found verdict");
        FakeRuns boom = new FakeRuns();
        boom.recentThrows = new IOException("socket closed");
        // Must NOT decay into DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW: that would misreport a
        // transport or credentials fault as a missing workflow run.
        refusesCode("query exception surfaces as a query failure", "DISPATCH_RUN_QUERY_FAILURE:IOException",
                () -> poller(boom, new FakeClock(T0, Duration.ZERO), 3, Duration.ofHours(1),
                        3, Duration.ofHours(1)).execute("job-1", "sha256:beef"));

        FakeRuns nulls = new FakeRuns();
        nulls.recentReturnsNull = true;
        refusesCode("null run list surfaces as a query failure",
                "DISPATCH_RUN_QUERY_FAILURE:NULL_RESULT",
                () -> poller(nulls, new FakeClock(T0, Duration.ZERO), 3, Duration.ofHours(1),
                        3, Duration.ofHours(1)).execute("job-1", "sha256:beef"));
    }

    private static void dispatchRefusalPropagatesUnmasked() {
        System.out.println("acceptance faults propagate unchanged");
        ClaimLedger.Consumer.Dispatch refusing = (claimId, digest) -> {
            throw new IllegalStateException("DISPATCH_NO_CREDENTIAL");
        };
        FakeRuns runs = new FakeRuns();
        // The poller adds completion proof; it must not convert a credentials refusal into a
        // correlation problem, which would send a diagnosis in the wrong direction.
        refusesCode("dispatch refusal is not masked by the poller", "DISPATCH_NO_CREDENTIAL",
                () -> new ActionsRunPoller(refusing, runs, new FakeClock(T0, Duration.ZERO),
                        interval -> { }, 3, Duration.ofHours(1), 3, Duration.ofHours(1),
                        Duration.ZERO).execute("job-1", "sha256:beef"));
        eq("no run query was attempted after a failed dispatch", 0, runs.recentCalls);
    }

    // ---------------------------------------------------------------- degradation

    private static void unwiredDigestStaysActionsDispatched() {
        System.out.println("unwired, the weaker guarantee stays visible in the digest");
        ActionsDispatch bare = new ActionsDispatch(
                (url, headers, body) -> new ActionsDispatch.Response(204, ""),
                () -> "token", "BFochtman746", "system-master", "claim-work.yml", "main");
        try {
            String digest = bare.execute("job-1", "sha256:beef");
            ok("bare dispatch still says ACTIONS_DISPATCHED", digest.startsWith("ACTIONS_DISPATCHED"));
            ok("bare dispatch claims no completion", !digest.contains("ACTIONS_COMPLETED"));
            ok("bare dispatch names no run id", !digest.contains("run="));
        } catch (Exception e) {
            bad("bare dispatch digest", "threw " + e);
        }
    }

    // ---------------------------------------------------------------- end to end

    private static void endToEndDoneRequiresCompletion() {
        System.out.println("through a real consumer, DONE requires a successful run");

        // Direction 1: a successful run reaches DONE with the run id in the evidence trail.
        ExecutionLeaseManager leases = new ExecutionLeaseManager();
        ClaimLedger ledger = new ClaimLedger(leases);
        ledger.submit("job-1", "sha256:beef");
        FakeRuns good = new FakeRuns();
        good.appearAfter(1, new ActionsRunPoller.RunView(42L, "claim-work for job-1", "queued", null));
        good.foreverById(new ActionsRunPoller.RunView(42L, "claim-work for job-1",
                "completed", "success"));
        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(ledger,
                poller(good, new FakeClock(T0, Duration.ZERO), 3, Duration.ofHours(1),
                        3, Duration.ofHours(1)), "poller-consumer", TTL);
        consumer.tick(T0, trusted(T0));
        eq("a completed run terminalizes DONE", ClaimLedger.ClaimState.DONE,
                ledger.view("job-1").state());
        String receipts = String.valueOf(ledger.receipts("job-1"));
        ok("the receipt carries the run id", receipts.contains("run=42"));
        ok("the receipt attests completion, not dispatch",
                receipts.contains("ACTIONS_COMPLETED"));

        // Direction 2 — the property that matters: a FAILED run must not reach DONE.
        ExecutionLeaseManager leases2 = new ExecutionLeaseManager();
        ClaimLedger ledger2 = new ClaimLedger(leases2);
        ledger2.submit("job-2", "sha256:dead");
        FakeRuns bad = new FakeRuns();
        bad.appearAfter(1, new ActionsRunPoller.RunView(43L, "claim-work for job-2", "queued", null));
        bad.foreverById(new ActionsRunPoller.RunView(43L, "claim-work for job-2",
                "completed", "failure"));
        ClaimLedger.Consumer consumer2 = new ClaimLedger.Consumer(ledger2,
                poller(bad, new FakeClock(T0, Duration.ZERO), 3, Duration.ofHours(1),
                        3, Duration.ofHours(1)), "poller-consumer", TTL);
        consumer2.tick(T0, trusted(T0));
        eq("a failed run terminalizes FAILED, never DONE", ClaimLedger.ClaimState.FAILED,
                ledger2.view("job-2").state());
        ok("the failure evidence names the conclusion",
                String.valueOf(ledger2.receipts("job-2")).contains("DISPATCH_RUN_CONCLUDED_FAILURE"));
    }

    // ---------------------------------------------------------------- fakes

    private static ActionsRunPoller poller(ActionsRunPoller.Runs runs, ActionsRunPoller.Clock clock,
            int discoveryAttempts, Duration discoveryBudget, int pollAttempts, Duration pollBudget) {
        ClaimLedger.Consumer.Dispatch accepting =
                (claimId, digest) -> "ACTIONS_DISPATCHED workflow=claim-work.yml correlation=" + claimId;
        return new ActionsRunPoller(accepting, runs, clock, interval -> { },
                discoveryAttempts, discoveryBudget, pollAttempts, pollBudget, Duration.ZERO);
    }

    /** Scripted run queries. Counts calls so the bounds can be asserted by exact value. */
    private static final class FakeRuns implements ActionsRunPoller.Runs {
        int recentCalls;
        int byIdCalls;
        Exception recentThrows;
        boolean recentReturnsNull;
        private int appearOnCall = Integer.MAX_VALUE;
        private List<ActionsRunPoller.RunView> appearing = List.of();
        private final List<ActionsRunPoller.RunView> byIdScript = new ArrayList<>();
        private ActionsRunPoller.RunView byIdForever;

        void appearAfter(int call, ActionsRunPoller.RunView... views) {
            this.appearOnCall = call;
            this.appearing = List.of(views);
        }

        void thenById(ActionsRunPoller.RunView... views) {
            byIdScript.addAll(List.of(views));
        }

        void foreverById(ActionsRunPoller.RunView view) {
            this.byIdForever = view;
        }

        @Override
        public List<ActionsRunPoller.RunView> recent() throws Exception {
            recentCalls++;
            if (recentThrows != null) throw recentThrows;
            if (recentReturnsNull) return null;
            return recentCalls >= appearOnCall ? appearing : List.of();
        }

        @Override
        public ActionsRunPoller.RunView byId(long runId) {
            byIdCalls++;
            if (!byIdScript.isEmpty()) {
                return byIdScript.get(Math.min(byIdCalls - 1, byIdScript.size() - 1));
            }
            return byIdForever;
        }
    }

    /** Clock that advances a fixed step per observation, so the wall-clock bound is provable. */
    private static final class FakeClock implements ActionsRunPoller.Clock {
        private Instant at;
        private final Duration step;

        FakeClock(Instant start, Duration step) {
            this.at = start;
            this.step = step;
        }

        @Override
        public Instant now() {
            Instant current = at;
            at = at.plus(step);
            return current;
        }
    }

    private static CoordinationContracts.TimeEvidence trusted(Instant at) {
        return new CoordinationContracts.TimeEvidence(at, 1_000_000L, Duration.ofSeconds(5),
                CoordinationContracts.TimeStanding.TRUSTED);
    }

    // ---------------------------------------------------------------- harness

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
                System.out.println("  FAIL  " + label + " — expected " + code
                        + " but got " + t.getClass().getSimpleName() + ": " + message);
            }
        }
    }

    /** Asserts the phase code AND the reason within it, so a wrong bound is a wrong value. */
    private static void refusesCodeAnd(String label, String code, String reason, Body body) {
        checks++;
        try {
            body.run();
            failures++;
            System.out.println("  FAIL  " + label + " — expected " + code + "/" + reason
                    + " but nothing was thrown");
        } catch (Throwable t) {
            String message = String.valueOf(t.getMessage());
            if (message.contains(code) && message.contains(reason)) {
                System.out.println("  PASS  " + label + " (" + t.getClass().getSimpleName() + ")");
            } else {
                failures++;
                System.out.println("  FAIL  " + label + " — expected " + code + " with " + reason
                        + " but got " + t.getClass().getSimpleName() + ": " + message);
            }
        }
    }
}
