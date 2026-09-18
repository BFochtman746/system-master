package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Qualification for {@link ActionsRuns}, the production run-query implementation.
 *
 * <p>Every check runs the real {@link ActionsRuns} against an injected reader, and the decisive
 * ones run it through the real {@link ActionsRunPoller} rather than asserting on it directly —
 * so this proves the production implementation is genuinely wired into the completion path, not
 * that a file exists which only its own test imports.
 *
 * <p>The created-at floor gets the most attention because it is the guard a real reading of this
 * repository's run history proved necessary: old completed runs already carry claim ids in the
 * correlating shape.
 */
public final class ActionsRunsTest {

    private static int checks;
    private static int failures;

    private static final Instant NOW = Instant.parse("2026-09-17T21:00:00Z");
    private static final String CLAIM = "durability-003-live-1";

    public static void main(String[] args) {
        parsesASuccessfulQuery();
        parsesTitlesContainingBracketsAndEscapes();
        staleRunIsExcludedByTheCreatedFloor();
        removingTheFloorResurrectsTheStaleRun();
        theFloorIsWhatKeepsCorrelationUnambiguous();
        missingCredentialRefusesBeforeAnyQuery();
        rejectedQuerySurfacesItsStatus();
        transportFailureIsItsOwnCode();
        malformedBodiesRefuseByExactCode();
        misconfiguredCoordinatesRefuseByExactCode();
        queryFailureNeverDecaysIntoNotFound();
        byIdReadsASingleRun();
        recentUrlCarriesEventFilterAndFloor();
        endToEndCompletionThroughTheRealPoller();

        System.out.println("ACTIONS-RUNS-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            throw new IllegalStateException("ACTIONS_RUNS_FAILURES=" + failures);
        }
        System.out.println("RESULT: PASS");
    }

    // ---------------------------------------------------------------- happy path

    private static void parsesASuccessfulQuery() {
        String body = runsBody(row(35294608748L, "Claim Work [" + CLAIM + "]",
                "completed", "\"success\"", "2026-09-17T20:59:30Z"));
        List<ActionsRunPoller.RunView> out = call(() -> runs(reader(200, body)).recent());
        ok("one row parsed", out != null && out.size() == 1);
        if (out == null || out.size() != 1) return;
        ActionsRunPoller.RunView v = out.get(0);
        ok("run id is exact (no float rounding): " + v.id(), v.id() == 35294608748L);
        ok("title parsed: " + v.title(), ("Claim Work [" + CLAIM + "]").equals(v.title()));
        ok("status parsed", "completed".equals(v.status()));
        ok("conclusion parsed", "success".equals(v.conclusion()));
        ok("real API title correlates through the real matcher",
                ActionsRunPoller.titleCorrelates(v.title(), CLAIM));
    }

    private static void parsesTitlesContainingBracketsAndEscapes() {
        // A regex or indexOf extractor mis-reads exactly this, and the field it mis-reads is the
        // one correlation depends on.
        String awkward = "Claim Work [a-1] \\\"quoted\\\" ] [";
        String body = runsBody(row(7L, awkward, "queued", "null", "2026-09-17T20:59:00Z"));
        List<ActionsRunPoller.RunView> out = call(() -> runs(reader(200, body)).recent());
        ok("awkward title survives parsing",
                out != null && out.size() == 1
                        && "Claim Work [a-1] \"quoted\" ] [".equals(out.get(0).title()));
        ok("null conclusion stays null",
                out != null && out.size() == 1 && out.get(0).conclusion() == null);
    }

    // ---------------------------------------------------------------- the floor

    private static void staleRunIsExcludedByTheCreatedFloor() {
        // Same claim id, months old -- exactly what the run history actually contains.
        String body = runsBody(
                row(1L, "Claim Work [" + CLAIM + "]", "completed", "\"success\"",
                        "2026-06-01T00:00:00Z"),
                row(2L, "Claim Work [" + CLAIM + "]", "queued", "null",
                        "2026-09-17T20:59:45Z"));
        List<ActionsRunPoller.RunView> out =
                call(() -> runs(reader(200, body)).recent());
        ok("stale row dropped, fresh row kept", out != null && out.size() == 1);
        ok("the surviving row is the fresh one",
                out != null && out.size() == 1 && out.get(0).id() == 2L);
    }

    private static void removingTheFloorResurrectsTheStaleRun() {
        // A lookback wide enough to reach the stale run IS the floor removed. If this returned
        // one row, the floor would be decorative and the check above would prove nothing.
        String body = runsBody(
                row(1L, "Claim Work [" + CLAIM + "]", "completed", "\"success\"",
                        "2026-06-01T00:00:00Z"),
                row(2L, "Claim Work [" + CLAIM + "]", "queued", "null",
                        "2026-09-17T20:59:45Z"));
        List<ActionsRunPoller.RunView> out = call(() -> new ActionsRuns(reader(200, body),
                () -> "t", () -> NOW, "o", "r", "claim-work.yml",
                Duration.ofDays(365), 50).recent());
        ok("with the window widened, the stale run comes back (floor is load-bearing)",
                out != null && out.size() == 2);
    }

    private static void theFloorIsWhatKeepsCorrelationUnambiguous() {
        // The consequence, stated as the poller sees it: two runs claiming one id is a refusal,
        // so an unbounded window turns a healthy claim into DISPATCH_CORRELATION_AMBIGUOUS.
        String body = runsBody(
                row(1L, "Claim Work [" + CLAIM + "]", "completed", "\"success\"",
                        "2026-06-01T00:00:00Z"),
                row(2L, "Claim Work [" + CLAIM + "]", "completed", "\"success\"",
                        "2026-09-17T20:59:45Z"));

        Map<Long, String> singles = Map.of(
                1L, row(1L, "Claim Work [" + CLAIM + "]", "completed", "\"success\"",
                        "2026-06-01T00:00:00Z"),
                2L, row(2L, "Claim Work [" + CLAIM + "]", "completed", "\"success\"",
                        "2026-09-17T20:59:45Z"));
        String bounded = digestOrCode(() ->
                poller(runs(routing(body, singles))).execute(CLAIM, "d"));
        ok("bounded window terminalizes on the fresh run: " + bounded,
                bounded.startsWith("ACTIONS_COMPLETED run=2 conclusion=success"));

        String unbounded = digestOrCode(() -> poller(new ActionsRuns(reader(200, body),
                () -> "t", () -> NOW, "o", "r", "claim-work.yml",
                Duration.ofDays(365), 50)).execute(CLAIM, "d"));
        ok("unbounded window refuses as ambiguous: " + unbounded,
                unbounded.startsWith("DISPATCH_CORRELATION_AMBIGUOUS"));
    }

    // ---------------------------------------------------------------- refusals

    private static void missingCredentialRefusesBeforeAnyQuery() {
        AtomicInteger calls = new AtomicInteger();
        ActionsRuns.Reader counting = (url, headers) -> {
            calls.incrementAndGet();
            return new ActionsDispatch.Response(200, runsBody());
        };
        String code = codeOf(() -> new ActionsRuns(counting, () -> "", () -> NOW,
                "o", "r", "claim-work.yml", Duration.ofMinutes(30), 50).recent());
        ok("blank token refuses RUNS_NO_CREDENTIAL: " + code, "RUNS_NO_CREDENTIAL".equals(code));
        ok("and zero queries were attempted: " + calls.get(), calls.get() == 0);

        String nullCode = codeOf(() -> new ActionsRuns(counting, () -> null, () -> NOW,
                "o", "r", "claim-work.yml", Duration.ofMinutes(30), 50).recent());
        ok("null token refuses the same way: " + nullCode, "RUNS_NO_CREDENTIAL".equals(nullCode));
        ok("still zero queries: " + calls.get(), calls.get() == 0);
    }

    private static void rejectedQuerySurfacesItsStatus() {
        ok("500 refuses RUNS_REJECTED_500",
                "RUNS_REJECTED_500".equals(codeOf(() -> runs(reader(500, "{}")).recent())));
        ok("401 refuses RUNS_REJECTED_401",
                "RUNS_REJECTED_401".equals(codeOf(() -> runs(reader(401, "{}")).recent())));
        ok("403 refuses RUNS_REJECTED_403",
                "RUNS_REJECTED_403".equals(codeOf(() -> runs(reader(403, "{}")).recent())));
    }

    private static void transportFailureIsItsOwnCode() {
        ActionsRuns.Reader broken = (url, headers) -> {
            throw new java.io.IOException("socket closed");
        };
        String code = codeOf(() -> runs(broken).recent());
        ok("transport throw is RUNS_TRANSPORT_FAILURE, not a rejection: " + code,
                code.startsWith("RUNS_TRANSPORT_FAILURE:IOException"));

        ActionsRuns.Reader nullReturning = (url, headers) -> null;
        ok("null response is its own code",
                "RUNS_TRANSPORT_FAILURE:NO_RESPONSE"
                        .equals(codeOf(() -> runs(nullReturning).recent())));
    }

    private static void malformedBodiesRefuseByExactCode() {
        ok("empty body", codeOf(() -> runs(reader(200, "   ")).recent())
                .equals("RUNS_MALFORMED_RESPONSE:EMPTY_BODY"));
        ok("array at root", codeOf(() -> runs(reader(200, "[]")).recent())
                .equals("RUNS_MALFORMED_RESPONSE:NOT_AN_OBJECT"));
        ok("no workflow_runs array", codeOf(() -> runs(reader(200, "{\"total\":0}")).recent())
                .equals("RUNS_MALFORMED_RESPONSE:NO_WORKFLOW_RUNS_ARRAY"));
        ok("truncated json", codeOf(() -> runs(reader(200, "{\"workflow_runs\":[")).recent())
                .startsWith("RUNS_MALFORMED_RESPONSE:"));
        ok("row missing display_title",
                codeOf(() -> runs(reader(200,
                        "{\"workflow_runs\":[{\"id\":1,\"status\":\"queued\","
                                + "\"created_at\":\"2026-09-17T20:59:00Z\"}]}")).recent())
                        .equals("RUNS_MALFORMED_RESPONSE:NO_DISPLAY_TITLE"));
        ok("row missing created_at (the floor's own input)",
                codeOf(() -> runs(reader(200,
                        "{\"workflow_runs\":[{\"id\":1,\"display_title\":\"x\","
                                + "\"status\":\"queued\"}]}")).recent())
                        .equals("RUNS_MALFORMED_RESPONSE:NO_CREATED_AT"));
        ok("unparseable created_at",
                codeOf(() -> runs(reader(200,
                        "{\"workflow_runs\":[{\"id\":1,\"display_title\":\"x\","
                                + "\"status\":\"queued\",\"created_at\":\"yesterday\"}]}")).recent())
                        .startsWith("RUNS_MALFORMED_RESPONSE:UNPARSEABLE_CREATED_AT"));
    }

    private static void misconfiguredCoordinatesRefuseByExactCode() {
        ok("missing repo coordinates",
                "RUNS_MISCONFIGURED_REPOSITORY".equals(codeOf(() -> new ActionsRuns(
                        reader(200, runsBody()), () -> "t", () -> NOW, "", "r",
                        "claim-work.yml", Duration.ofMinutes(30), 50).recent())));
        ok("missing workflow file",
                "RUNS_MISCONFIGURED_WORKFLOW".equals(codeOf(() -> new ActionsRuns(
                        reader(200, runsBody()), () -> "t", () -> NOW, "o", "r", "",
                        Duration.ofMinutes(30), 50).recent())));
        ok("invalid lookback rejected at construction",
                "INVALID_LOOKBACK".equals(codeOf(() -> new ActionsRuns(reader(200, runsBody()),
                        () -> "t", () -> NOW, "o", "r", "w", Duration.ZERO, 50).recent())));
        ok("invalid per_page rejected at construction",
                "INVALID_PER_PAGE".equals(codeOf(() -> new ActionsRuns(reader(200, runsBody()),
                        () -> "t", () -> NOW, "o", "r", "w", Duration.ofMinutes(1), 0).recent())));
    }

    // ------------------------------------------------- composed with the real poller

    private static void queryFailureNeverDecaysIntoNotFound() {
        // The whole point of the code: a broken credential must not be reported as "the run
        // never started", which would send someone debugging the workflow instead of the token.
        String code = digestOrCode(() -> poller(new ActionsRuns(reader(200, runsBody()),
                () -> "", () -> NOW, "o", "r", "claim-work.yml",
                Duration.ofMinutes(30), 50)).execute(CLAIM, "d"));
        ok("credential fault surfaces as query failure: " + code,
                code.startsWith("DISPATCH_RUN_QUERY_FAILURE"));
        ok("and NOT as not-found", !code.contains("NOT_FOUND_WITHIN_WINDOW"));

        String rejected = digestOrCode(() ->
                poller(runs(reader(500, "{}"))).execute(CLAIM, "d"));
        ok("rejected query surfaces as query failure: " + rejected,
                rejected.startsWith("DISPATCH_RUN_QUERY_FAILURE"));
        ok("and NOT as not-found", !rejected.contains("NOT_FOUND_WITHIN_WINDOW"));
    }

    private static void byIdReadsASingleRun() {
        String single = "{\"id\":35294611376,\"display_title\":\"Claim Work [x-1]\","
                + "\"status\":\"completed\",\"conclusion\":\"failure\","
                + "\"created_at\":\"2026-09-17T20:00:00Z\"}";
        ActionsRunPoller.RunView v = call(() -> runs(reader(200, single)).byId(35294611376L));
        ok("byId parses the run", v != null && v.id() == 35294611376L);
        ok("byId carries the conclusion", v != null && "failure".equals(v.conclusion()));
    }

    private static void recentUrlCarriesEventFilterAndFloor() {
        String url = runs(reader(200, runsBody())).recentUrl(NOW.minus(Duration.ofMinutes(30)));
        ok("targets the workflow's runs", url.contains("/actions/workflows/claim-work.yml/runs"));
        ok("filters to workflow_dispatch", url.contains("event=workflow_dispatch"));
        ok("bounds the page size", url.contains("per_page=50"));
        ok("carries an encoded created floor: " + url,
                url.contains("created=%3E%3D2026-09-17T20%3A30%3A00Z"));
    }

    private static void endToEndCompletionThroughTheRealPoller() {
        String successRow = row(99L, "Claim Work [" + CLAIM + "]", "completed",
                "\"success\"", "2026-09-17T20:59:50Z");
        String body = runsBody(successRow);
        String digest = digestOrCode(() -> poller(runs(routing(body, Map.of(99L, successRow))))
                .execute(CLAIM, "d"));
        ok("DONE digest names the run the production query found: " + digest,
                digest.startsWith("ACTIONS_COMPLETED run=99 conclusion=success"));

        String failureRow = row(98L, "Claim Work [" + CLAIM + "]", "completed",
                "\"failure\"", "2026-09-17T20:59:50Z");
        String failing = runsBody(failureRow);
        String code = digestOrCode(() -> poller(runs(routing(failing, Map.of(98L, failureRow))))
                .execute(CLAIM, "d"));
        ok("a failed run refuses by exact conclusion code: " + code,
                code.startsWith("DISPATCH_RUN_CONCLUDED_FAILURE"));
    }

    // ---------------------------------------------------------------- helpers

    private static ActionsRuns runs(ActionsRuns.Reader reader) {
        return new ActionsRuns(reader, () -> "token", () -> NOW, "o", "r", "claim-work.yml",
                Duration.ofMinutes(30), 50);
    }

    private static ActionsRunPoller poller(ActionsRunPoller.Runs runs) {
        ClaimLedger.Consumer.Dispatch inner = (claimId, digest) -> "ACTIONS_DISPATCHED";
        return new ActionsRunPoller(inner, runs, () -> NOW, interval -> { },
                3, Duration.ofMinutes(2), 3, Duration.ofMinutes(2), Duration.ZERO);
    }

    private static ActionsRuns.Reader reader(int status, String body) {
        return (url, headers) -> new ActionsDispatch.Response(status, body);
    }

    /**
     * A reader that serves both endpoints the poller uses. A single-body fake cannot: the run
     * list and a single run are different shapes, and answering byId with a list is a fake bug
     * that looks exactly like a production parse fault. Serving byId from a map keyed on run id
     * also makes the end-to-end checks stronger — the poller must ask for the run id it actually
     * correlated, because any other id answers 404.
     */
    private static ActionsRuns.Reader routing(String listBody, Map<Long, String> singles) {
        return (url, headers) -> {
            int marker = url.indexOf("/actions/runs/");
            if (marker < 0) return new ActionsDispatch.Response(200, listBody);
            long id = Long.parseLong(url.substring(marker + "/actions/runs/".length()));
            String single = singles.get(id);
            return single == null
                    ? new ActionsDispatch.Response(404, "{}")
                    : new ActionsDispatch.Response(200, single);
        };
    }

    private static String row(long id, String title, String status, String conclusionJson,
            String createdAt) {
        return "{\"id\":" + id + ",\"display_title\":\"" + title + "\",\"status\":\"" + status
                + "\",\"conclusion\":" + conclusionJson + ",\"created_at\":\"" + createdAt + "\"}";
    }

    private static String runsBody(String... rows) {
        return "{\"total_count\":" + rows.length + ",\"workflow_runs\":["
                + String.join(",", rows) + "]}";
    }

    private interface Body<T> {
        T get() throws Exception;
    }

    private static <T> T call(Body<T> body) {
        try {
            return body.get();
        } catch (Exception e) {
            failures++;
            checks++;
            System.out.println("FAIL  unexpected throw: " + e);
            return null;
        }
    }

    private static String codeOf(Body<?> body) {
        try {
            body.get();
            return "NO_THROW";
        } catch (Exception e) {
            return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        }
    }

    private static String digestOrCode(Body<String> body) {
        try {
            String v = body.get();
            return v == null ? "NULL_DIGEST" : v;
        } catch (Exception e) {
            return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        }
    }

    private static void ok(String label, boolean condition) {
        checks++;
        if (condition) {
            System.out.println("PASS  " + label);
        } else {
            failures++;
            System.out.println("FAIL  " + label);
        }
    }

    private ActionsRunsTest() { }
}
