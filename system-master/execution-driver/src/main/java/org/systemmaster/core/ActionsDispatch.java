package org.systemmaster.core;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * The production {@link ClaimLedger.Consumer.Dispatch}: posts a claim's delegated work to
 * GitHub Actions via {@code workflow_dispatch}.
 *
 * <p>WHAT THE RECEIPT ATTESTS. {@code workflow_dispatch} answers {@code 204 No Content}:
 * it returns no run id. A successful return proves only that Actions accepted the dispatch.
 * The caller must publish DISPATCHED and then use {@link ActionsRunPoller} to resolve the
 * run to a terminal conclusion before DONE is permitted.
 *
 * <p>CORRELATION. A unique {@code dispatch_id} is generated before the POST, sent as a
 * workflow input, and returned in the dispatch receipt. claim-work.yml places the same id
 * in its run-name. The completion poller therefore correlates by an exact identity chosen
 * before dispatch instead of by timestamps or substring matching.
 */
public final class ActionsDispatch implements ClaimLedger.Consumer.Dispatch {

    /** Minimal HTTP response shape; keeps the transport seam free of the JDK client type. */
    public record Response(int status, String body) { }

    /** HTTP seam used by production and deterministic qualification. */
    public interface Transport {
        Response post(String url, Map<String, String> headers, String body) throws Exception;
    }

    /** Token source, separate from transport so a missing credential has its own code. */
    public interface Credentials {
        String token();
    }

    /** Generates the dispatch identity before workflow_dispatch is sent. */
    public interface DispatchIdSource {
        String next();
    }

    private static final String API = "https://api.github.com";
    private static final String DISPATCH_ID_PREFIX = "dispatch_id=";

    private final Transport transport;
    private final Credentials credentials;
    private final DispatchIdSource dispatchIds;
    private final String owner;
    private final String repo;
    private final String workflowFile;
    private final String ref;

    public ActionsDispatch(Transport transport, Credentials credentials,
            String owner, String repo, String workflowFile, String ref) {
        this(transport, credentials, () -> UUID.randomUUID().toString(),
                owner, repo, workflowFile, ref);
    }

    public ActionsDispatch(Transport transport, Credentials credentials,
            DispatchIdSource dispatchIds, String owner, String repo, String workflowFile, String ref) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.dispatchIds = Objects.requireNonNull(dispatchIds, "dispatchIds");
        this.owner = norm(owner);
        this.repo = norm(repo);
        this.workflowFile = norm(workflowFile);
        this.ref = norm(ref);
    }

    /** Builds the production dispatch from the GitHub Actions environment. */
    public static ActionsDispatch fromEnvironment(Transport transport) {
        RepoCoordinates coordinates = repoCoordinates();
        Credentials creds = ActionsDispatch::ambientToken;
        return new ActionsDispatch(transport, creds, coordinates.owner(), coordinates.repo(),
                env("CLAIM_WORK_WORKFLOW", "claim-work.yml"),
                env("CLAIM_WORK_REF", "main"));
    }

    /** The real POST transport. */
    public static Transport httpTransport() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        return (url, headers, body) -> {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            for (Map.Entry<String, String> h : headers.entrySet()) {
                b = b.header(h.getKey(), h.getValue());
            }
            HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
            return new Response(r.statusCode(), r.body());
        };
    }

    @Override
    public String execute(String claimId, String payloadDigest) throws Exception {
        if (claimId == null || claimId.isBlank()) throw new IllegalArgumentException("MISSING_CLAIM_ID");
        if (payloadDigest == null || payloadDigest.isBlank()) {
            throw new IllegalArgumentException("MISSING_PAYLOAD_DIGEST");
        }
        if (owner.isEmpty() || repo.isEmpty()) {
            throw new IllegalStateException("DISPATCH_MISCONFIGURED_REPOSITORY");
        }
        if (workflowFile.isEmpty()) throw new IllegalStateException("DISPATCH_MISCONFIGURED_WORKFLOW");
        if (ref.isEmpty()) throw new IllegalStateException("DISPATCH_MISCONFIGURED_REF");

        String token = credentials.token();
        if (token == null || token.isBlank()) throw new IllegalStateException("DISPATCH_NO_CREDENTIAL");

        // Load-bearing ordering: identity exists before the POST. The durability packet will
        // persist this prepared identity before transport so a crash around HTTP 204 can be
        // reconciled without guessing whether a second dispatch is safe.
        String dispatchId = norm(dispatchIds.next());
        if (!validDispatchId(dispatchId)) throw new IllegalStateException("DISPATCH_INVALID_ID");

        String url = API + "/repos/" + owner + "/" + repo
                + "/actions/workflows/" + workflowFile + "/dispatches";
        String body = "{\"ref\":\"" + esc(ref) + "\",\"inputs\":{"
                + "\"claim_id\":\"" + esc(claimId) + "\","
                + "\"payload_digest\":\"" + esc(payloadDigest) + "\","
                + "\"dispatch_id\":\"" + esc(dispatchId) + "\"}}";

        Map<String, String> headers = headers(token);
        Response response;
        try {
            response = transport.post(url, headers, body);
        } catch (Exception transportFailure) {
            throw new IllegalStateException("DISPATCH_TRANSPORT_FAILURE:"
                    + transportFailure.getClass().getSimpleName(), transportFailure);
        }
        if (response == null) throw new IllegalStateException("DISPATCH_TRANSPORT_FAILURE:NO_RESPONSE");
        if (response.status() != 204) {
            throw new IllegalStateException("DISPATCH_REJECTED_" + response.status());
        }
        return "ACTIONS_DISPATCHED workflow=" + workflowFile + " ref=" + ref
                + " correlation=" + claimId + " " + DISPATCH_ID_PREFIX + dispatchId;
    }

    /** Extracts the pre-dispatch identity from a successful dispatch receipt. */
    static String dispatchIdFromReceipt(String receipt) {
        if (receipt == null || !receipt.startsWith("ACTIONS_DISPATCHED ")) {
            throw new IllegalArgumentException("INVALID_DISPATCH_RECEIPT");
        }
        int start = receipt.indexOf(DISPATCH_ID_PREFIX);
        if (start < 0) throw new IllegalArgumentException("DISPATCH_RECEIPT_MISSING_ID");
        start += DISPATCH_ID_PREFIX.length();
        int end = receipt.indexOf(' ', start);
        String id = end < 0 ? receipt.substring(start) : receipt.substring(start, end);
        if (!validDispatchId(id)) throw new IllegalArgumentException("DISPATCH_RECEIPT_INVALID_ID");
        return id;
    }

    static Map<String, String> headers(String token) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/vnd.github+json");
        headers.put("Authorization", "Bearer " + token);
        headers.put("X-GitHub-Api-Version", "2022-11-28");
        headers.put("Content-Type", "application/json");
        return headers;
    }

    static String ambientToken() {
        String t = env("GITHUB_TOKEN", "");
        return t.isEmpty() ? env("GH_TOKEN", "") : t;
    }

    static RepoCoordinates repoCoordinates() {
        String slug = env("GITHUB_REPOSITORY", "");
        String owner = "";
        String repo = "";
        int slash = slug.indexOf('/');
        if (slash > 0 && slash < slug.length() - 1) {
            owner = slug.substring(0, slash);
            repo = slug.substring(slash + 1);
        }
        return new RepoCoordinates(owner, repo);
    }

    record RepoCoordinates(String owner, String repo) { }

    private static boolean validDispatchId(String id) {
        if (id == null || id.isBlank() || id.length() > 128) return false;
        for (int i = 0; i < id.length(); i++) {
            char c = id.charAt(i);
            if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z')
                    && !(c >= '0' && c <= '9') && c != '.' && c != '_' && c != '-') {
                return false;
            }
        }
        return true;
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim();
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? fallback : v.trim();
    }

    private static String esc(String s) {
        StringBuilder out = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.toString();
    }
}
