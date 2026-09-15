package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;

/** Qualification for dispatch identity and GitHub Actions completion truth. */
public final class ActionsRunPollerTest {

    private static int checks;
    private static int failures;
    private static final Instant T0 = Instant.parse("2026-09-15T03:00:00Z");

    public static void main(String[] args) {
        dispatchIdentityExistsBeforePost();
        exactCorrelationDistinguishesJob1FromJob11();
        nonSuccessConclusionFails();
        duplicateExactCorrelationFailsClosed();
        discoveryAttemptCeilingFailsWithSpecificCode();
        discoveryClockBudgetFailsAtBoundary();
        completionAttemptCeilingFailsWithSpecificCode();
        completionClockBudgetFailsAtBoundary();
        successConclusionBeforeCompletedIsNotSuccess();

        System.out.println();
        System.out.println("ACTIONS-RUN-POLLER-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static void dispatchIdentityExistsBeforePost() {
        boolean[] idCreated = { false };
        String[] bodySeen = { null };
        ActionsDispatch.DispatchIdSource ids = () -> {
            idCreated[0] = true;
            return "dispatch-A";
        };
        ActionsDispatch.Transport post = (url, headers, body) -> {
            ok("dispatch id exists before POST", idCreated[0]);
            bodySeen[0] = body;
            return new ActionsDispatch.Response(204, "");
        };
        ActionsDispatch dispatch = new ActionsDispatch(post, () -> "token", ids,
                "o", "r", "claim-work.yml", "main");
        try {
            String receipt = dispatch.execute("job-1", "payload-1");
            ok("dispatch body carries dispatch_id",
                    bodySeen[0] != null && bodySeen[0].contains("\"dispatch_id\":\"dispatch-A\""));
            eq("dispatch receipt carries exact id", "dispatch-A",
                    ActionsDispatch.dispatchIdFromReceipt(receipt));
        } catch (Exception e) {
            bad("dispatch identity", e.toString());
        }
    }

    /** MUTATION TARGET: substring/prefix correlation makes this choose run 11 or ambiguous. */
    private static void exactCorrelationDistinguishesJob1FromJob11() {
        StubTransport transport = new StubTransport();
        transport.add(200, runs(
                run(11, ActionsRunPoller.runTitle("job-11", "d-11"), "queued", null),
                run(1, ActionsRunPoller.runTitle("job-1", "d-1"), "in_progress", null)));
        transport.add(200, run(1, ActionsRunPoller.runTitle("job-1", "d-1"),
                "completed", "success"));

        FakeTime time = new FakeTime(T0);
        ActionsRunPoller poller = poller(transport,
                bounds(1, Duration.ofMinutes(1), 1, Duration.ofMinutes(1)), time);
        try {
            String evidence = poller.await("job-1", "payload", receipt("job-1", "d-1"));
            ok("exact correlation completion evidence has selected run",
                    evidence.contains("run_id=1") && evidence.contains("dispatch_id=d-1"));
            eq("exact correlation performs one discovery and one run fetch", 2, transport.urls.size());
            ok("job-1 did not resolve to job-11 run",
                    transport.urls.get(1).endsWith("/actions/runs/1"));
        } catch (Exception e) {
            bad("exact correlation", e.toString());
        }
    }

    private static void nonSuccessConclusionFails() {
        StubTransport transport = new StubTransport();
        transport.add(200, runs(run(7, ActionsRunPoller.runTitle("job-7", "d-7"),
                "in_progress", null)));
        transport.add(200, run(7, ActionsRunPoller.runTitle("job-7", "d-7"),
                "completed", "failure"));
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller poller = poller(transport,
                bounds(1, Duration.ofMinutes(1), 1, Duration.ofMinutes(1)), time);
        refuses("completed non-success is failure", "DISPATCH_RUN_NON_SUCCESS:failure",
                () -> poller.await("job-7", "payload", receipt("job-7", "d-7")));
    }

    private static void duplicateExactCorrelationFailsClosed() {
        String title = ActionsRunPoller.runTitle("job-3", "d-3");
        StubTransport transport = new StubTransport();
        transport.add(200, runs(
                run(31, title, "queued", null),
                run(32, title, "queued", null)));
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller poller = poller(transport,
                bounds(1, Duration.ofMinutes(1), 1, Duration.ofMinutes(1)), time);
        refuses("duplicate exact correlation fails closed", "DISPATCH_RUN_AMBIGUOUS",
                () -> poller.await("job-3", "payload", receipt("job-3", "d-3")));
        eq("ambiguous discovery never polls either candidate", 1, transport.urls.size());
    }

    /** MUTATION TARGET: changing <= to < or adding an extra attempt makes GET count 3. */
    private static void discoveryAttemptCeilingFailsWithSpecificCode() {
        StubTransport transport = new StubTransport();
        transport.add(200, runs());
        transport.add(200, runs());
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller poller = poller(transport,
                bounds(2, Duration.ofHours(1), 1, Duration.ofMinutes(1)), time);
        refuses("discovery attempt ceiling", "DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW",
                () -> poller.await("job-4", "payload", receipt("job-4", "d-4")));
        eq("discovery stops on exact attempt ceiling", 2, transport.urls.size());
    }

    /** MUTATION TARGET: deadline comparison must stop at, not only after, the boundary. */
    private static void discoveryClockBudgetFailsAtBoundary() {
        StubTransport transport = new StubTransport();
        transport.add(200, runs());
        transport.add(200, runs());
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller.Bounds b = new ActionsRunPoller.Bounds(
                9, Duration.ofSeconds(5), 1, Duration.ofMinutes(1), Duration.ofSeconds(5));
        ActionsRunPoller poller = poller(transport, b, time);
        refuses("discovery wall clock boundary", "DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW",
                () -> poller.await("job-5", "payload", receipt("job-5", "d-5")));
        eq("discovery performs no request after exact deadline", 2, transport.urls.size());
        eq("fake clock lands exactly on deadline", T0.plusSeconds(5), time.now());
    }

    /** MUTATION TARGET: deleting/decrementing completion attempt check makes an extra GET. */
    private static void completionAttemptCeilingFailsWithSpecificCode() {
        String title = ActionsRunPoller.runTitle("job-6", "d-6");
        StubTransport transport = new StubTransport();
        transport.add(200, runs(run(6, title, "queued", null)));
        transport.add(200, run(6, title, "queued", null));
        transport.add(200, run(6, title, "in_progress", null));
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller poller = poller(transport,
                bounds(1, Duration.ofMinutes(1), 2, Duration.ofHours(1)), time);
        refuses("completion attempt ceiling", "DISPATCH_POLL_BUDGET_EXHAUSTED",
                () -> poller.await("job-6", "payload", receipt("job-6", "d-6")));
        eq("completion stops on exact attempt ceiling", 3, transport.urls.size());
    }

    /** MUTATION TARGET: completion wall-clock budget must independently stop polling. */
    private static void completionClockBudgetFailsAtBoundary() {
        String title = ActionsRunPoller.runTitle("job-9", "d-9");
        StubTransport transport = new StubTransport();
        transport.add(200, runs(run(9, title, "queued", null)));
        transport.add(200, run(9, title, "queued", null));
        transport.add(200, run(9, title, "in_progress", null));
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller.Bounds b = new ActionsRunPoller.Bounds(
                1, Duration.ofMinutes(1), 9, Duration.ofSeconds(5), Duration.ofSeconds(5));
        ActionsRunPoller poller = poller(transport, b, time);
        refuses("completion wall clock boundary", "DISPATCH_POLL_BUDGET_EXHAUSTED",
                () -> poller.await("job-9", "payload", receipt("job-9", "d-9")));
        eq("completion performs no request after exact deadline", 3, transport.urls.size());
        eq("completion fake clock lands exactly on deadline", T0.plusSeconds(5), time.now());
    }

    /** MUTATION TARGET: conclusion=success must never override status!=completed. */
    private static void successConclusionBeforeCompletedIsNotSuccess() {
        String title = ActionsRunPoller.runTitle("job-8", "d-8");
        StubTransport transport = new StubTransport();
        transport.add(200, runs(run(8, title, "queued", null)));
        transport.add(200, run(8, title, "in_progress", "success"));
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller poller = poller(transport,
                bounds(1, Duration.ofMinutes(1), 1, Duration.ofMinutes(1)), time);
        refuses("success before completed is not terminal success",
                "DISPATCH_POLL_BUDGET_EXHAUSTED",
                () -> poller.await("job-8", "payload", receipt("job-8", "d-8")));
    }

    private static ActionsRunPoller poller(StubTransport transport,
            ActionsRunPoller.Bounds bounds, FakeTime time) {
        return new ActionsRunPoller(transport, () -> "token",
                "o", "r", "claim-work.yml", "main", bounds, time, time);
    }

    private static ActionsRunPoller.Bounds bounds(int discoveryAttempts, Duration discoveryBudget,
            int completionAttempts, Duration completionBudget) {
        return new ActionsRunPoller.Bounds(discoveryAttempts, discoveryBudget,
                completionAttempts, completionBudget, Duration.ofSeconds(1));
    }

    private static String receipt(String claim, String dispatchId) {
        return "ACTIONS_DISPATCHED workflow=claim-work.yml ref=main correlation=" + claim
                + " dispatch_id=" + dispatchId;
    }

    private static String runs(String... runObjects) {
        return "{\"workflow_runs\":[" + String.join(",", runObjects) + "]}";
    }

    private static String run(long id, String title, String status, String conclusion) {
        return "{\"id\":" + id
                + ",\"display_title\":\"" + title + "\""
                + ",\"status\":\"" + status + "\""
                + ",\"conclusion\":" + (conclusion == null ? "null" : "\"" + conclusion + "\"")
                + "}";
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }

    private static void refuses(String label, String exactMessage, Throwing action) {
        try {
            action.run();
            bad(label, "accepted; expected " + exactMessage);
        } catch (Exception e) {
            eq(label + " exact code", exactMessage, e.getMessage());
        }
    }

    private static void ok(String label, boolean value) {
        checks++;
        if (!value) badAlreadyCounted(label, "condition was false");
    }

    private static void eq(String label, Object expected, Object actual) {
        checks++;
        if (!java.util.Objects.equals(expected, actual)) {
            badAlreadyCounted(label, "expected=" + expected + " actual=" + actual);
        }
    }

    private static void bad(String label, String detail) {
        checks++;
        badAlreadyCounted(label, detail);
    }

    private static void badAlreadyCounted(String label, String detail) {
        failures++;
        System.out.println("FAIL " + label + " :: " + detail);
    }

    private static final class StubTransport implements ActionsRunPoller.Transport {
        private final Deque<ActionsRunPoller.Response> responses = new ArrayDeque<>();
        final List<String> urls = new ArrayList<>();

        void add(int status, String body) {
            responses.addLast(new ActionsRunPoller.Response(status, body));
        }

        @Override
        public ActionsRunPoller.Response get(String url, Map<String, String> headers) {
            urls.add(url);
            if (responses.isEmpty()) {
                throw new AssertionError("unexpected GET " + url);
            }
            return responses.removeFirst();
        }
    }

    private static final class FakeTime implements ActionsRunPoller.Clock, ActionsRunPoller.Sleeper {
        private Instant now;

        FakeTime(Instant now) {
            this.now = now;
        }

        @Override
        public Instant now() {
            return now;
        }

        @Override
        public void sleep(Duration duration) {
            now = now.plus(duration);
        }
    }
}
