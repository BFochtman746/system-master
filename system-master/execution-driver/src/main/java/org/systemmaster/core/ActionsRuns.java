package org.systemmaster.core;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * The production {@link ActionsRunPoller.Runs}: answers the poller's run queries from the real
 * GitHub Actions API. Until this existed the poller's query seam had test fakes only, so
 * completion proof could not be wired to anything real.
 *
 * <p>WHY A SEPARATE READER SEAM RATHER THAN EXTENDING {@code Transport}.
 * {@link ActionsDispatch.Transport} declares exactly one abstract method and
 * {@link ActionsDispatch#httpTransport()} returns it as a lambda. Adding a {@code get} to that
 * interface stops it being a functional interface and breaks that lambda at compile time. So
 * "reuse the transport" is honoured as reuse of the <em>vocabulary and construction</em> — the
 * same {@link ActionsDispatch.Response} record, the same {@link ActionsDispatch.Credentials}
 * token source, the same header set, the same connect/request timeouts, the same
 * refusal-code-per-fault discipline — with a second single-method seam for GET. One HTTP idiom,
 * two verbs; not a second HTTP stack.
 *
 * <p>WHY THE CREATED-AT FLOOR IS LOAD-BEARING, NOT A TIDY DEFAULT. A real read of this
 * repository's run history found completed runs already titled with claim ids in the correlating
 * shape, e.g. {@code claim:durability-003-live-35035058758-1 dispatch:af66fb49-...}. Correlation
 * is by title, so an unbounded query lets a months-old completed run satisfy a claim dispatched
 * seconds ago. Two ways that hurts, both bad: the stale run and the fresh run both match and the
 * poller refuses {@code DISPATCH_CORRELATION_AMBIGUOUS}, or the stale run alone matches and the
 * claim terminalizes on an outcome from another day. {@code per_page} does not help — it bounds
 * how many runs are returned, not how old they are. So every query carries a floor of
 * {@code now - lookback}, applied twice: as a {@code created=>=} filter so the API does the work,
 * and again on the parsed {@code created_at} of every row, because a filter that is silently
 * ignored upstream must not become a silently unbounded window here. The qualification proves a
 * stale row is dropped and that removing the floor resurrects it.
 *
 * <p>FAILS LOUDLY, NEVER SILENTLY. {@code RUNS_NO_CREDENTIAL} when no token is present, and it
 * is thrown before any request is attempted; {@code RUNS_MISCONFIGURED_*} for missing
 * coordinates; {@code RUNS_REJECTED_<http>} when the API refuses; {@code RUNS_TRANSPORT_FAILURE}
 * when the call cannot be made; {@code RUNS_MALFORMED_RESPONSE} when the body is not the shape
 * this class requires. Each is a distinct operational fault, and the poller wraps any of them as
 * {@code DISPATCH_RUN_QUERY_FAILURE} — never as a not-found verdict, which would misreport a
 * broken credential as "the run never started".
 */
public final class ActionsRuns implements ActionsRunPoller.Runs {

    /** The GET seam. Separate from {@link ActionsDispatch.Transport} for the reason above. */
    public interface Reader {
        ActionsDispatch.Response get(String url, Map<String, String> headers) throws Exception;
    }

    private static final String API = "https://api.github.com";

    private final Reader reader;
    private final ActionsDispatch.Credentials credentials;
    private final ActionsRunPoller.Clock clock;
    private final String owner;
    private final String repo;
    private final String workflowFile;
    private final Duration lookback;
    private final int perPage;

    public ActionsRuns(Reader reader, ActionsDispatch.Credentials credentials,
            ActionsRunPoller.Clock clock, String owner, String repo, String workflowFile,
            Duration lookback, int perPage) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.owner = norm(owner);
        this.repo = norm(repo);
        this.workflowFile = norm(workflowFile);
        this.lookback = Objects.requireNonNull(lookback, "lookback");
        if (lookback.isZero() || lookback.isNegative()) {
            throw new IllegalArgumentException("INVALID_LOOKBACK");
        }
        if (perPage <= 0 || perPage > 100) throw new IllegalArgumentException("INVALID_PER_PAGE");
        this.perPage = perPage;
    }

    /**
     * Builds a runs query from the ambient environment, mirroring
     * {@link ActionsDispatch#fromEnvironment} so the driver configures both the same way.
     * Coordinates are not validated here: a missing one becomes a specific refusal at query
     * time, where it lands in a claim's evidence trail instead of crashing the runner.
     */
    public static ActionsRuns fromEnvironment(Reader reader, ActionsRunPoller.Clock clock,
            Duration lookback, int perPage) {
        String slug = env("GITHUB_REPOSITORY", "");
        String owner = "";
        String repo = "";
        int slash = slug.indexOf('/');
        if (slash > 0 && slash < slug.length() - 1) {
            owner = slug.substring(0, slash);
            repo = slug.substring(slash + 1);
        }
        ActionsDispatch.Credentials creds = () -> {
            String t = env("GITHUB_TOKEN", "");
            return t.isEmpty() ? env("GH_TOKEN", "") : t;
        };
        return new ActionsRuns(reader, creds, clock, owner, repo,
                env("CLAIM_WORK_WORKFLOW", "claim-work.yml"), lookback, perPage);
    }

    /** The real reader. Same client construction and timeouts as the dispatch transport. */
    public static Reader httpReader() {
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
            return new ActionsDispatch.Response(r.statusCode(), r.body());
        };
    }

    /** Visible for the qualification: the exact URL a recent() query would request. */
    String recentUrl(Instant floor) {
        return API + "/repos/" + owner + "/" + repo + "/actions/workflows/" + workflowFile
                + "/runs?event=workflow_dispatch&per_page=" + perPage
                + "&created=" + enc(">=" + floor);
    }

    @Override
    public List<ActionsRunPoller.RunView> recent() throws Exception {
        Instant floor = clock.now().minus(lookback);
        String body = query(recentUrl(floor));

        Object parsed = MiniJson.parse(body);
        if (!(parsed instanceof Map<?, ?> root)) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:NOT_AN_OBJECT");
        }
        Object runsNode = root.get("workflow_runs");
        if (!(runsNode instanceof List<?> rows)) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:NO_WORKFLOW_RUNS_ARRAY");
        }

        List<ActionsRunPoller.RunView> out = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> run)) {
                throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:ROW_NOT_AN_OBJECT");
            }
            // The floor again, on the row itself. An upstream filter that is ignored, renamed or
            // silently dropped must not widen this window without the suite noticing.
            Instant createdAt = createdAt(run);
            if (createdAt.isBefore(floor)) continue;
            out.add(view(run));
        }
        return out;
    }

    @Override
    public ActionsRunPoller.RunView byId(long runId) throws Exception {
        String body = query(API + "/repos/" + owner + "/" + repo + "/actions/runs/" + runId);
        Object parsed = MiniJson.parse(body);
        if (!(parsed instanceof Map<?, ?> run)) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:NOT_AN_OBJECT");
        }
        return view(run);
    }

    private String query(String url) throws Exception {
        if (owner.isEmpty() || repo.isEmpty()) {
            throw new IllegalStateException("RUNS_MISCONFIGURED_REPOSITORY");
        }
        if (workflowFile.isEmpty()) throw new IllegalStateException("RUNS_MISCONFIGURED_WORKFLOW");

        // Before any request: a missing credential is its own fault and must not be reported as
        // a transport problem or, worse, as an empty result set.
        String token = credentials.token();
        if (token == null || token.isBlank()) throw new IllegalStateException("RUNS_NO_CREDENTIAL");

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/vnd.github+json");
        headers.put("Authorization", "Bearer " + token);
        headers.put("X-GitHub-Api-Version", "2022-11-28");

        ActionsDispatch.Response response;
        try {
            response = reader.get(url, headers);
        } catch (Exception transportFailure) {
            throw new IllegalStateException("RUNS_TRANSPORT_FAILURE:"
                    + transportFailure.getClass().getSimpleName(), transportFailure);
        }
        if (response == null) throw new IllegalStateException("RUNS_TRANSPORT_FAILURE:NO_RESPONSE");
        if (response.status() != 200) {
            throw new IllegalStateException("RUNS_REJECTED_" + response.status());
        }
        if (response.body() == null || response.body().isBlank()) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:EMPTY_BODY");
        }
        return response.body();
    }

    private static ActionsRunPoller.RunView view(Map<?, ?> run) {
        Object id = run.get("id");
        if (!(id instanceof Long runId)) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:RUN_ID_NOT_AN_INTEGER");
        }
        Object title = run.get("display_title");
        if (!(title instanceof String titleText)) {
            // Correlation is by title. A row without one cannot be matched, and treating that as
            // an empty title would make it silently unmatchable instead of visibly wrong.
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:NO_DISPLAY_TITLE");
        }
        Object status = run.get("status");
        if (!(status instanceof String statusText)) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:NO_STATUS");
        }
        Object conclusion = run.get("conclusion");
        String conclusionText = conclusion == null ? null
                : conclusion instanceof String s ? s
                : conclusion.toString();
        return new ActionsRunPoller.RunView(runId, titleText, statusText, conclusionText);
    }

    private static Instant createdAt(Map<?, ?> run) {
        Object created = run.get("created_at");
        if (!(created instanceof String text) || text.isBlank()) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:NO_CREATED_AT");
        }
        try {
            return Instant.parse(text);
        } catch (DateTimeParseException bad) {
            throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:UNPARSEABLE_CREATED_AT:"
                    + text, bad);
        }
    }

    private static String enc(String raw) {
        StringBuilder out = new StringBuilder(raw.length() + 8);
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            boolean unreserved = Character.isLetterOrDigit(c)
                    || c == '-' || c == '_' || c == '.' || c == '~';
            if (unreserved) out.append(c);
            else out.append('%').append(String.format("%02X", (int) c));
        }
        return out.toString();
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim();
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? fallback : v.trim();
    }

    /**
     * A deliberately small JSON reader for the handful of fields completion depends on.
     *
     * <p>Why hand-written: this module has no JSON dependency and adding one to read four fields
     * is a larger change than this. Why a real scanner rather than regex or {@code indexOf}: run
     * titles contain brackets and can contain quotes and escapes, so substring extraction would
     * mis-read exactly the field correlation depends on. Anything it cannot parse raises, so a
     * surprising body becomes {@code RUNS_MALFORMED_RESPONSE} rather than a wrong value.
     */
    static final class MiniJson {

        private final String src;
        private int at;

        private MiniJson(String src) {
            this.src = src;
        }

        static Object parse(String text) {
            MiniJson p = new MiniJson(text);
            p.ws();
            Object value = p.value();
            p.ws();
            if (p.at != text.length()) {
                throw new IllegalStateException("RUNS_MALFORMED_RESPONSE:TRAILING_INPUT_AT:" + p.at);
            }
            return value;
        }

        private Object value() {
            if (at >= src.length()) throw bad("UNEXPECTED_END");
            char c = src.charAt(at);
            return switch (c) {
                case '{' -> object();
                case '[' -> array();
                case '"' -> string();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                default -> number();
            };
        }

        private Map<String, Object> object() {
            expect('{');
            Map<String, Object> out = new LinkedHashMap<>();
            ws();
            if (peek() == '}') {
                at++;
                return out;
            }
            while (true) {
                ws();
                String key = string();
                ws();
                expect(':');
                ws();
                out.put(key, value());
                ws();
                char c = next();
                if (c == '}') return out;
                if (c != ',') throw bad("EXPECTED_COMMA_OR_BRACE_AT:" + (at - 1));
            }
        }

        private List<Object> array() {
            expect('[');
            List<Object> out = new ArrayList<>();
            ws();
            if (peek() == ']') {
                at++;
                return out;
            }
            while (true) {
                ws();
                out.add(value());
                ws();
                char c = next();
                if (c == ']') return out;
                if (c != ',') throw bad("EXPECTED_COMMA_OR_BRACKET_AT:" + (at - 1));
            }
        }

        private String string() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (true) {
                if (at >= src.length()) throw bad("UNTERMINATED_STRING");
                char c = src.charAt(at++);
                if (c == '"') return out.toString();
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                if (at >= src.length()) throw bad("UNTERMINATED_ESCAPE");
                char e = src.charAt(at++);
                switch (e) {
                    case '"' -> out.append('"');
                    case '\\' -> out.append('\\');
                    case '/' -> out.append('/');
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'n' -> out.append('\n');
                    case 'r' -> out.append('\r');
                    case 't' -> out.append('\t');
                    case 'u' -> {
                        if (at + 4 > src.length()) throw bad("TRUNCATED_UNICODE_ESCAPE");
                        out.append((char) Integer.parseInt(src.substring(at, at + 4), 16));
                        at += 4;
                    }
                    default -> throw bad("UNKNOWN_ESCAPE:" + e);
                }
            }
        }

        private Object number() {
            int start = at;
            if (peek() == '-') at++;
            boolean floating = false;
            while (at < src.length()) {
                char c = src.charAt(at);
                if (Character.isDigit(c)) {
                    at++;
                } else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                    floating = true;
                    at++;
                } else {
                    break;
                }
            }
            String text = src.substring(start, at);
            if (text.isEmpty() || text.equals("-")) throw bad("NOT_A_NUMBER_AT:" + start);
            try {
                // Run ids are integers and are compared as such; keeping them Long avoids any
                // float rounding on an identifier.
                return floating ? (Object) Double.parseDouble(text) : (Object) Long.parseLong(text);
            } catch (NumberFormatException nfe) {
                throw bad("NOT_A_NUMBER:" + text);
            }
        }

        private Object literal(String word, Object result) {
            if (!src.startsWith(word, at)) throw bad("EXPECTED_LITERAL:" + word + "_AT:" + at);
            at += word.length();
            return result;
        }

        private void ws() {
            while (at < src.length()) {
                char c = src.charAt(at);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') at++;
                else break;
            }
        }

        private char peek() {
            if (at >= src.length()) throw bad("UNEXPECTED_END");
            return src.charAt(at);
        }

        private char next() {
            if (at >= src.length()) throw bad("UNEXPECTED_END");
            return src.charAt(at++);
        }

        private void expect(char c) {
            if (at >= src.length() || src.charAt(at) != c) {
                throw bad("EXPECTED:" + c + "_AT:" + at);
            }
            at++;
        }

        private IllegalStateException bad(String detail) {
            return new IllegalStateException("RUNS_MALFORMED_RESPONSE:" + detail);
        }
    }
}
