package org.systemmaster.core;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves an accepted workflow_dispatch to exactly one GitHub Actions run and waits for
 * that run to reach a real terminal conclusion.
 *
 * <p>Correlation is exact. ActionsDispatch chooses a dispatch_id before POST and
 * claim-work.yml publishes {@code claim:<claimId> dispatch:<dispatchId>} as display_title.
 * This poller compares the entire title, so claim {@code job-1} cannot be satisfied by a
 * run for {@code job-11}. More than one exact match fails closed as ambiguous.
 *
 * <p>Discovery and completion are independently bounded by both attempt ceilings and
 * wall-clock budgets. "dispatch accepted but no run became visible" and "run found but
 * still running" are intentionally different failure codes.
 */
public final class ActionsRunPoller implements ClaimLedger.Consumer.Completion {

    public record Response(int status, String body) { }

    public interface Transport {
        Response get(String url, Map<String, String> headers) throws Exception;
    }

    public interface Clock {
        Instant now();
    }

    public interface Sleeper {
        void sleep(Duration duration) throws Exception;
    }

    public record Bounds(int discoveryAttempts, Duration discoveryBudget,
            int completionAttempts, Duration completionBudget, Duration pollInterval) {
        public Bounds {
            if (discoveryAttempts < 1) throw new IllegalArgumentException("INVALID_DISCOVERY_ATTEMPTS");
            if (completionAttempts < 1) throw new IllegalArgumentException("INVALID_COMPLETION_ATTEMPTS");
            requirePositive(discoveryBudget, "INVALID_DISCOVERY_BUDGET");
            requirePositive(completionBudget, "INVALID_COMPLETION_BUDGET");
            Objects.requireNonNull(pollInterval, "pollInterval");
            if (pollInterval.isNegative() || pollInterval.isZero()) {
                throw new IllegalArgumentException("INVALID_POLL_INTERVAL");
            }
        }

        public static Bounds production() {
            // Worst case is below claim-driver.yml's 20-minute job timeout: two minutes
            // to discover the run plus sixteen minutes to observe its terminal result.
            return new Bounds(24, Duration.ofMinutes(2),
                    192, Duration.ofMinutes(16), Duration.ofSeconds(5));
        }

        private static void requirePositive(Duration d, String code) {
            Objects.requireNonNull(d, code);
            if (d.isNegative() || d.isZero()) throw new IllegalArgumentException(code);
        }
    }

    private record RunSnapshot(long id, String displayTitle, String status, String conclusion) { }

    private static final String API = "https://api.github.com";

    private final Transport transport;
    private final ActionsDispatch.Credentials credentials;
    private final String owner;
    private final String repo;
    private final String workflowFile;
    private final String ref;
    private final Bounds bounds;
    private final Clock clock;
    private final Sleeper sleeper;

    public ActionsRunPoller(Transport transport, ActionsDispatch.Credentials credentials,
            String owner, String repo, String workflowFile, String ref, Bounds bounds,
            Clock clock, Sleeper sleeper) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.owner = norm(owner);
        this.repo = norm(repo);
        this.workflowFile = norm(workflowFile);
        this.ref = norm(ref);
        this.bounds = Objects.requireNonNull(bounds, "bounds");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.sleeper = Objects.requireNonNull(sleeper, "sleeper");
    }

    public static ActionsRunPoller fromEnvironment(Transport transport) {
        ActionsDispatch.RepoCoordinates coordinates = ActionsDispatch.repoCoordinates();
        return new ActionsRunPoller(transport, ActionsDispatch::ambientToken,
                coordinates.owner(), coordinates.repo(),
                env("CLAIM_WORK_WORKFLOW", "claim-work.yml"),
                env("CLAIM_WORK_REF", "main"), Bounds.production(),
                Instant::now, Thread::sleep);
    }

    public static Transport httpTransport() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        return (url, headers) -> {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .GET();
            for (Map.Entry<String, String> h : headers.entrySet()) {
                b = b.header(h.getKey(), h.getValue());
            }
            HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
            return new Response(r.statusCode(), r.body());
        };
    }

    @Override
    public String await(String claimId, String payloadDigest, String dispatchReceiptDigest)
            throws Exception {
        requireText(claimId, "CLAIM_ID");
        requireText(payloadDigest, "PAYLOAD_DIGEST");
        requireConfigured();

        String token = credentials.token();
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("DISPATCH_POLL_NO_CREDENTIAL");
        }
        String dispatchId = ActionsDispatch.dispatchIdFromReceipt(dispatchReceiptDigest);
        String expectedTitle = runTitle(claimId, dispatchId);
        Map<String, String> headers = ActionsDispatch.headers(token);

        long runId = discoverRun(expectedTitle, headers);
        RunSnapshot terminal = awaitTerminal(runId, headers);
        if (!"success".equals(terminal.conclusion())) {
            String conclusion = terminal.conclusion() == null ? "null" : terminal.conclusion();
            throw new IllegalStateException("DISPATCH_RUN_NON_SUCCESS:" + conclusion);
        }
        return "ACTIONS_COMPLETED run_id=" + terminal.id()
                + " conclusion=success dispatch_id=" + dispatchId;
    }

    static String runTitle(String claimId, String dispatchId) {
        requireText(claimId, "CLAIM_ID");
        requireText(dispatchId, "DISPATCH_ID");
        return "claim:" + claimId + " dispatch:" + dispatchId;
    }

    private long discoverRun(String expectedTitle, Map<String, String> headers) throws Exception {
        Instant started = clock.now();
        Instant deadline = started.plus(bounds.discoveryBudget());
        String url = API + "/repos/" + owner + "/" + repo
                + "/actions/workflows/" + path(workflowFile)
                + "/runs?event=workflow_dispatch&branch=" + query(ref) + "&per_page=100";

        for (int attempt = 1; attempt <= bounds.discoveryAttempts(); attempt++) {
            Response response = get(url, headers, "DISPATCH_RUN_DISCOVERY");
            List<RunSnapshot> exact = new ArrayList<>();
            for (RunSnapshot run : parseWorkflowRuns(response.body())) {
                if (expectedTitle.equals(run.displayTitle())) exact.add(run);
            }
            if (exact.size() > 1) throw new IllegalStateException("DISPATCH_RUN_AMBIGUOUS");
            if (exact.size() == 1) return exact.get(0).id();

            if (attempt == bounds.discoveryAttempts() || !clock.now().isBefore(deadline)) {
                break;
            }
            sleepWithin(deadline);
        }
        throw new IllegalStateException("DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW");
    }

    private RunSnapshot awaitTerminal(long runId, Map<String, String> headers) throws Exception {
        Instant started = clock.now();
        Instant deadline = started.plus(bounds.completionBudget());
        String url = API + "/repos/" + owner + "/" + repo + "/actions/runs/" + runId;

        for (int attempt = 1; attempt <= bounds.completionAttempts(); attempt++) {
            Response response = get(url, headers, "DISPATCH_RUN_POLL");
            RunSnapshot run = parseRun(response.body());
            if (run.id() != runId) throw new IllegalStateException("DISPATCH_RUN_ID_MISMATCH");
            if ("completed".equals(run.status())) return run;

            // A conclusion field alone is not completion. GitHub status is the terminal
            // gate; this prevents a stale/partial response from becoming false success.
            if (attempt == bounds.completionAttempts() || !clock.now().isBefore(deadline)) {
                break;
            }
            sleepWithin(deadline);
        }
        throw new IllegalStateException("DISPATCH_POLL_BUDGET_EXHAUSTED");
    }

    private Response get(String url, Map<String, String> headers, String phase) throws Exception {
        Response response;
        try {
            response = transport.get(url, headers);
        } catch (Exception transportFailure) {
            throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:"
                    + transportFailure.getClass().getSimpleName(), transportFailure);
        }
        if (response == null) throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:NO_RESPONSE");
        if (response.status() != 200) {
            throw new IllegalStateException(phase + "_REJECTED_" + response.status());
        }
        if (response.body() == null || response.body().isBlank()) {
            throw new IllegalStateException(phase + "_INVALID_RESPONSE");
        }
        return response;
    }

    private void sleepWithin(Instant deadline) throws Exception {
        Duration remaining = Duration.between(clock.now(), deadline);
        if (remaining.isNegative() || remaining.isZero()) return;
        sleeper.sleep(remaining.compareTo(bounds.pollInterval()) < 0
                ? remaining : bounds.pollInterval());
    }

    private void requireConfigured() {
        if (owner.isEmpty() || repo.isEmpty()) {
            throw new IllegalStateException("DISPATCH_POLL_MISCONFIGURED_REPOSITORY");
        }
        if (workflowFile.isEmpty()) {
            throw new IllegalStateException("DISPATCH_POLL_MISCONFIGURED_WORKFLOW");
        }
        if (ref.isEmpty()) throw new IllegalStateException("DISPATCH_POLL_MISCONFIGURED_REF");
    }

    private static List<RunSnapshot> parseWorkflowRuns(String json) {
        int key = json.indexOf("\"workflow_runs\"");
        if (key < 0) throw new IllegalStateException("DISPATCH_RUN_DISCOVERY_INVALID_RESPONSE");
        int start = json.indexOf('[', key);
        if (start < 0) throw new IllegalStateException("DISPATCH_RUN_DISCOVERY_INVALID_RESPONSE");
        int end = matching(json, start, '[', ']');
        if (end < 0) throw new IllegalStateException("DISPATCH_RUN_DISCOVERY_INVALID_RESPONSE");

        List<RunSnapshot> out = new ArrayList<>();
        int i = start + 1;
        while (i < end) {
            char c = json.charAt(i);
            if (Character.isWhitespace(c) || c == ',') { i++; continue; }
            if (c != '{') throw new IllegalStateException("DISPATCH_RUN_DISCOVERY_INVALID_RESPONSE");
            int objectEnd = matching(json, i, '{', '}');
            if (objectEnd < 0 || objectEnd > end) {
                throw new IllegalStateException("DISPATCH_RUN_DISCOVERY_INVALID_RESPONSE");
            }
            out.add(parseRun(json.substring(i, objectEnd + 1)));
            i = objectEnd + 1;
        }
        return out;
    }

    private static RunSnapshot parseRun(String json) {
        String idText = field(json, "id", true);
        String title = field(json, "display_title", false);
        String status = field(json, "status", false);
        String conclusion = field(json, "conclusion", false);
        long id;
        try {
            id = Long.parseLong(idText);
        } catch (NumberFormatException badId) {
            throw new IllegalStateException("DISPATCH_RUN_INVALID_ID", badId);
        }
        if (id < 1 || title == null || status == null) {
            throw new IllegalStateException("DISPATCH_RUN_INVALID_RESPONSE");
        }
        return new RunSnapshot(id, title, status, conclusion);
    }

    private static String field(String json, String name, boolean numberOnly) {
        String pattern = "\\\"" + Pattern.quote(name) + "\\\"\\s*:\\s*";
        Pattern p = numberOnly
                ? Pattern.compile(pattern + "(-?[0-9]+)")
                : Pattern.compile(pattern + "(?:\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"|(null))");
        Matcher m = p.matcher(json);
        if (!m.find()) return null;
        if (numberOnly) return m.group(1);
        if (m.group(2) != null) return null;
        return unescape(m.group(1));
    }

    private static int matching(String s, int start, char open, char close) {
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inString) {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
                continue;
            }
            if (c == '"') { inString = true; continue; }
            if (c == open) depth++;
            else if (c == close) {
                depth--;
                if (depth == 0) return i;
            }
        }
        return -1;
    }

    private static String unescape(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c != '\\') { out.append(c); continue; }
            if (++i >= s.length()) throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON");
            char e = s.charAt(i);
            switch (e) {
                case '"', '\\', '/' -> out.append(e);
                case 'b' -> out.append('\b');
                case 'f' -> out.append('\f');
                case 'n' -> out.append('\n');
                case 'r' -> out.append('\r');
                case 't' -> out.append('\t');
                case 'u' -> {
                    if (i + 4 >= s.length()) throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON");
                    try {
                        out.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                    } catch (NumberFormatException badHex) {
                        throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON", badHex);
                    }
                    i += 4;
                }
                default -> throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON");
            }
        }
        return out.toString();
    }

    private static String path(String value) {
        return query(value);
    }

    private static String query(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String norm(String value) {
        return value == null ? "" : value.trim();
    }

    private static String env(String key, String fallback) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static void requireText(String value, String code) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("MISSING_" + code);
    }
}
