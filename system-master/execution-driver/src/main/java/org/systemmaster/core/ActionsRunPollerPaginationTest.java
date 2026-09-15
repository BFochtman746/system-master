package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;

/** Focused qualification for paginated exact workflow-run discovery. */
public final class ActionsRunPollerPaginationTest {

    private static int checks;
    private static int failures;
    private static final Instant T0 = Instant.parse("2026-09-15T16:00:00Z");

    public static void main(String[] args) {
        findsExactRunOnSecondPage();
        duplicateExactAcrossPagesFailsClosed();

        System.out.println();
        System.out.println("ACTIONS-RUN-POLLER-PAGINATION-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static void findsExactRunOnSecondPage() {
        String claim = "job-page-2";
        String dispatch = "dispatch-page-2";
        String title = ActionsRunPoller.runTitle(claim, dispatch);
        StubTransport transport = new StubTransport();
        transport.add(200, runs(fullNonMatchingPage("noise-a")));
        transport.add(200, runs(run(777, title, "in_progress", null)));
        transport.add(200, run(777, title, "completed", "success"));

        ActionsRunPoller poller = poller(transport);
        try {
            String evidence = poller.await(claim, "payload", receipt(claim, dispatch));
            ok("second-page exact run is reconciled", evidence.contains("run_id=777"));
            eq("two discovery pages plus exact completion fetch", 3, transport.urls.size());
            ok("page one requested explicitly", transport.urls.get(0).contains("per_page=100&page=1"));
            ok("page two requested explicitly", transport.urls.get(1).contains("per_page=100&page=2"));
            ok("completion fetch uses exact discovered run", transport.urls.get(2).endsWith("/actions/runs/777"));
        } catch (Exception e) {
            bad("second-page exact discovery", e.toString());
        }
    }

    private static void duplicateExactAcrossPagesFailsClosed() {
        String claim = "job-duplicate-pages";
        String dispatch = "dispatch-duplicate-pages";
        String title = ActionsRunPoller.runTitle(claim, dispatch);
        String[] pageOne = fullNonMatchingPage("noise-b");
        pageOne[37] = run(810, title, "queued", null);

        StubTransport transport = new StubTransport();
        transport.add(200, runs(pageOne));
        transport.add(200, runs(run(811, title, "queued", null)));

        ActionsRunPoller poller = poller(transport);
        refuses("duplicate exact title across pages fails closed", "DISPATCH_RUN_AMBIGUOUS",
                () -> poller.await(claim, "payload", receipt(claim, dispatch)));
        eq("duplicate across pages never enters completion polling", 2, transport.urls.size());
        ok("duplicate scan reached page two", transport.urls.get(1).contains("page=2"));
    }

    private static ActionsRunPoller poller(StubTransport transport) {
        FakeTime time = new FakeTime(T0);
        ActionsRunPoller.Bounds bounds = new ActionsRunPoller.Bounds(
                1, Duration.ofMinutes(1), 1, Duration.ofMinutes(1), Duration.ofSeconds(1));
        return new ActionsRunPoller(transport, () -> "token",
                "o", "r", "claim-work.yml", "main", bounds, time, time);
    }

    private static String[] fullNonMatchingPage(String prefix) {
        String[] page = new String[100];
        for (int i = 0; i < page.length; i++) {
            page[i] = run(1000 + i, ActionsRunPoller.runTitle(prefix + "-" + i, "d-" + i),
                    "completed", "success");
        }
        return page;
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
            if (responses.isEmpty()) throw new AssertionError("unexpected GET " + url);
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
