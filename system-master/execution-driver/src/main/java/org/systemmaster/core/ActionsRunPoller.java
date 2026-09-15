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

/** Resolves one exact workflow_dispatch identity and reconciles its terminal run. */
public final class ActionsRunPoller implements ClaimLedger.Consumer.Completion {

    public record Response(int status, String body) { }
    public interface Transport { Response get(String url, Map<String, String> headers) throws Exception; }
    public interface Clock { Instant now(); }
    public interface Sleeper { void sleep(Duration duration) throws Exception; }

    public record Bounds(int discoveryAttempts, Duration discoveryBudget,
            int completionAttempts, Duration completionBudget, Duration pollInterval) {
        public Bounds {
            if (discoveryAttempts < 1) throw new IllegalArgumentException("INVALID_DISCOVERY_ATTEMPTS");
            if (completionAttempts < 1) throw new IllegalArgumentException("INVALID_COMPLETION_ATTEMPTS");
            requirePositive(discoveryBudget, "INVALID_DISCOVERY_BUDGET");
            requirePositive(completionBudget, "INVALID_COMPLETION_BUDGET");
            Objects.requireNonNull(pollInterval, "pollInterval");
            if (pollInterval.isNegative() || pollInterval.isZero()) throw new IllegalArgumentException("INVALID_POLL_INTERVAL");
        }
        public static Bounds production() {
            return new Bounds(24, Duration.ofMinutes(2), 192, Duration.ofMinutes(16), Duration.ofSeconds(5));
        }
        private static void requirePositive(Duration d, String code) {
            Objects.requireNonNull(d, code);
            if (d.isNegative() || d.isZero()) throw new IllegalArgumentException(code);
        }
    }

    public record Discovery(boolean found, long runId) {
        public Discovery {
            if (found && runId < 1) throw new IllegalArgumentException("INVALID_RUN_ID");
            if (!found && runId != 0) throw new IllegalArgumentException("NOT_FOUND_HAS_RUN_ID");
        }
        public static Discovery found(long id) { return new Discovery(true, id); }
        public static Discovery notFound() { return new Discovery(false, 0); }
    }

    public record Completion(long runId, String status, String conclusion, String evidenceDigest) { }
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
        ActionsDispatch.RepoCoordinates c = ActionsDispatch.repoCoordinates();
        return new ActionsRunPoller(transport, ActionsDispatch::ambientToken,
                c.owner(), c.repo(), env("CLAIM_WORK_WORKFLOW", "claim-work.yml"),
                env("CLAIM_WORK_REF", "main"), Bounds.production(), Instant::now,
                duration -> Thread.sleep(Math.max(1L, duration.toMillis())));
    }

    public static Transport httpTransport() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
        return (url, headers) -> {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).GET();
            for (Map.Entry<String, String> h : headers.entrySet()) b.header(h.getKey(), h.getValue());
            HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
            return new Response(r.statusCode(), r.body());
        };
    }

    /** Bounded exact-title discovery. NOT_FOUND is data, never permission to redispatch. */
    public Discovery discover(String claimId, String dispatchId) throws Exception {
        requireText(claimId, "CLAIM_ID");
        requireText(dispatchId, "DISPATCH_ID");
        requireConfigured();
        Map<String, String> headers = authenticatedHeaders();
        try {
            return Discovery.found(discoverRun(runTitle(claimId, dispatchId), headers));
        } catch (IllegalStateException e) {
            if ("DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW".equals(e.getMessage())) return Discovery.notFound();
            throw e;
        }
    }

    /** Reconciles a persisted run id and verifies it still carries the exact title. */
    public Completion reconcile(String claimId, String dispatchId, long runId) throws Exception {
        requireText(claimId, "CLAIM_ID");
        requireText(dispatchId, "DISPATCH_ID");
        if (runId < 1) throw new IllegalArgumentException("INVALID_RUN_ID");
        requireConfigured();
        Map<String, String> headers = authenticatedHeaders();
        RunSnapshot terminal = awaitTerminal(runId, runTitle(claimId, dispatchId), headers);
        String conclusion = terminal.conclusion();
        if (conclusion == null || conclusion.isBlank()) throw new IllegalStateException("DISPATCH_RUN_MISSING_CONCLUSION");
        return new Completion(terminal.id(), terminal.status(), conclusion,
                "ACTIONS_COMPLETED run_id=" + terminal.id() + " conclusion=" + conclusion
                        + " dispatch_id=" + dispatchId);
    }

    @Override
    public String await(String claimId, String payloadDigest, String dispatchReceiptDigest) throws Exception {
        requireText(payloadDigest, "PAYLOAD_DIGEST");
        String dispatchId = ActionsDispatch.dispatchIdFromReceipt(dispatchReceiptDigest);
        Discovery d = discover(claimId, dispatchId);
        if (!d.found()) throw new IllegalStateException("DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW");
        Completion c = reconcile(claimId, dispatchId, d.runId());
        if (!"success".equals(c.conclusion())) throw new IllegalStateException("DISPATCH_RUN_NON_SUCCESS:" + c.conclusion());
        return c.evidenceDigest();
    }

    static String runTitle(String claimId, String dispatchId) {
        requireText(claimId, "CLAIM_ID");
        requireText(dispatchId, "DISPATCH_ID");
        return "claim:" + claimId + " dispatch:" + dispatchId;
    }

    private long discoverRun(String expectedTitle, Map<String, String> headers) throws Exception {
        Instant deadline = clock.now().plus(bounds.discoveryBudget());
        String url = API + "/repos/" + owner + "/" + repo + "/actions/workflows/" + path(workflowFile)
                + "/runs?event=workflow_dispatch&branch=" + query(ref) + "&per_page=100";
        for (int attempt = 1; attempt <= bounds.discoveryAttempts(); attempt++) {
            Response response = get(url, headers, "DISPATCH_RUN_DISCOVERY");
            List<RunSnapshot> exact = new ArrayList<>();
            for (RunSnapshot run : parseWorkflowRuns(response.body())) {
                if (expectedTitle.equals(run.displayTitle())) exact.add(run);
            }
            if (exact.size() > 1) throw new IllegalStateException("DISPATCH_RUN_AMBIGUOUS");
            if (exact.size() == 1) return exact.get(0).id();
            if (attempt == bounds.discoveryAttempts() || !clock.now().isBefore(deadline)) break;
            sleepWithin(deadline);
        }
        throw new IllegalStateException("DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW");
    }

    private RunSnapshot awaitTerminal(long runId, String expectedTitle, Map<String, String> headers) throws Exception {
        Instant deadline = clock.now().plus(bounds.completionBudget());
        String url = API + "/repos/" + owner + "/" + repo + "/actions/runs/" + runId;
        for (int attempt = 1; attempt <= bounds.completionAttempts(); attempt++) {
            Response response = get(url, headers, "DISPATCH_RUN_POLL");
            RunSnapshot run = parseRun(response.body());
            if (run.id() != runId) throw new IllegalStateException("DISPATCH_RUN_ID_MISMATCH");
            if (!expectedTitle.equals(run.displayTitle())) throw new IllegalStateException("DISPATCH_RUN_CORRELATION_MISMATCH");
            if ("completed".equals(run.status())) return run;
            if (attempt == bounds.completionAttempts() || !clock.now().isBefore(deadline)) break;
            sleepWithin(deadline);
        }
        throw new IllegalStateException("DISPATCH_POLL_BUDGET_EXHAUSTED");
    }

    private Map<String, String> authenticatedHeaders() {
        String token = credentials.token();
        if (token == null || token.isBlank()) throw new IllegalStateException("DISPATCH_POLL_NO_CREDENTIAL");
        return ActionsDispatch.headers(token.trim());
    }

    private Response get(String url, Map<String, String> headers, String phase) throws Exception {
        Response response;
        try { response = transport.get(url, headers); }
        catch (Exception e) { throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:" + e.getClass().getSimpleName(), e); }
        if (response == null) throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:NO_RESPONSE");
        if (response.status() != 200) throw new IllegalStateException(phase + "_REJECTED_" + response.status());
        if (response.body() == null || response.body().isBlank()) throw new IllegalStateException(phase + "_INVALID_RESPONSE");
        return response;
    }

    private void sleepWithin(Instant deadline) throws Exception {
        Duration remaining = Duration.between(clock.now(), deadline);
        if (remaining.isNegative() || remaining.isZero()) return;
        sleeper.sleep(remaining.compareTo(bounds.pollInterval()) < 0 ? remaining : bounds.pollInterval());
    }

    private void requireConfigured() {
        if (owner.isEmpty() || repo.isEmpty()) throw new IllegalStateException("DISPATCH_POLL_MISCONFIGURED_REPOSITORY");
        if (workflowFile.isEmpty()) throw new IllegalStateException("DISPATCH_POLL_MISCONFIGURED_WORKFLOW");
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
            if (objectEnd < 0 || objectEnd > end) throw new IllegalStateException("DISPATCH_RUN_DISCOVERY_INVALID_RESPONSE");
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
        try { id = Long.parseLong(idText); }
        catch (Exception e) { throw new IllegalStateException("DISPATCH_RUN_INVALID_ID", e); }
        if (id < 1 || title == null || status == null) throw new IllegalStateException("DISPATCH_RUN_INVALID_RESPONSE");
        return new RunSnapshot(id, title, status, conclusion);
    }

    private static String field(String json, String name, boolean numberOnly) {
        String prefix = "\\\"" + Pattern.quote(name) + "\\\"\\s*:\\s*";
        Pattern p = numberOnly ? Pattern.compile(prefix + "(-?[0-9]+)")
                : Pattern.compile(prefix + "(?:\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"|(null))");
        Matcher m = p.matcher(json);
        if (!m.find()) return null;
        if (numberOnly) return m.group(1);
        if (m.group(2) != null) return null;
        return unescape(m.group(1));
    }

    private static int matching(String s, int start, char open, char close) {
        int depth = 0; boolean inString = false; boolean escaped = false;
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
            else if (c == close && --depth == 0) return i;
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
                case 'b' -> out.append('\b'); case 'f' -> out.append('\f'); case 'n' -> out.append('\n');
                case 'r' -> out.append('\r'); case 't' -> out.append('\t');
                case 'u' -> {
                    if (i + 4 >= s.length()) throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON");
                    try { out.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16)); }
                    catch (NumberFormatException e2) { throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON", e2); }
                    i += 4;
                }
                default -> throw new IllegalStateException("DISPATCH_RUN_INVALID_JSON");
            }
        }
        return out.toString();
    }

    private static String path(String value) { return query(value); }
    private static String query(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20"); }
    private static String norm(String value) { return value == null ? "" : value.trim(); }
    private static String env(String key, String fallback) {
        String value = System.getenv(key); return value == null || value.isBlank() ? fallback : value.trim();
    }
    private static void requireText(String value, String code) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("MISSING_" + code);
    }
}
