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

/**
 * The production {@link ClaimLedger.Consumer.Dispatch}: posts a claim's delegated work to
 * GitHub Actions via {@code workflow_dispatch}.
 *
 * <p>WHY ACTIONS. The architecture decision for this repository was to use GitHub Actions
 * as the executor rather than write an in-process Java worker: the tree already runs 48
 * workflows and thousands of lines of CI scripting that do real execution with auth,
 * scheduling, retries and durable evidence artifacts. This class is the seam between the
 * claim lifecycle and that executor, and it is deliberately the only place that knows
 * execution happens over HTTP.
 *
 * <p>WHAT THE RECEIPT ACTUALLY ATTESTS — READ THIS BEFORE TRUSTING A DONE CLAIM.
 * {@code workflow_dispatch} answers {@code 204 No Content}: it returns no body and no run
 * id. So a successful dispatch proves the work was <em>accepted by Actions</em>, not that
 * it finished. The receipt digest says {@code ACTIONS_DISPATCHED} for exactly that reason,
 * and the claim id is passed as a workflow input so the resulting run is correlatable.
 * Closing that gap — polling the dispatched run to completion before terminalizing DONE —
 * is not implemented here and is recorded as outstanding in SYSTEM-MAP.md rather than
 * quietly implied by a green claim.
 *
 * <p>FAILS LOUDLY, NEVER SILENTLY. Every refusal carries a specific code:
 * {@code DISPATCH_NO_CREDENTIAL} when no token is present (the ordinary case outside CI),
 * {@code DISPATCH_MISCONFIGURED_*} for missing coordinates, {@code DISPATCH_REJECTED_<http>}
 * when Actions refuses, {@code DISPATCH_TRANSPORT_FAILURE} when the call cannot be made.
 * A dispatch that cannot run must never look like a claim with nothing to do — the
 * consumer records the refusal as evidence and terminalizes the claim FAILED.
 */
public final class ActionsDispatch implements ClaimLedger.Consumer.Dispatch {

    /** Minimal HTTP response shape; keeps the transport seam free of the JDK client type. */
    public record Response(int status, String body) { }

    /**
     * The HTTP seam. Injected so the qualification can prove every refusal code and the
     * exact request shape without network access, which the build sandbox does not have.
     */
    public interface Transport {
        Response post(String url, Map<String, String> headers, String body) throws Exception;
    }

    /** Token source, separate from the transport so a missing credential is its own proof. */
    public interface Credentials {
        String token();
    }

    private static final String API = "https://api.github.com";

    private final Transport transport;
    private final Credentials credentials;
    private final String owner;
    private final String repo;
    private final String workflowFile;
    private final String ref;

    public ActionsDispatch(Transport transport, Credentials credentials,
            String owner, String repo, String workflowFile, String ref) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.owner = norm(owner);
        this.repo = norm(repo);
        this.workflowFile = norm(workflowFile);
        this.ref = norm(ref);
    }

    /**
     * Builds a dispatch from the ambient environment, which is how the scheduled driver
     * constructs it. Coordinates are not validated here: a missing one becomes a specific
     * refusal at execute time, where it lands in a claim's evidence trail instead of
     * crashing the runner before anything is recorded.
     */
    public static ActionsDispatch fromEnvironment(Transport transport) {
        String slug = env("GITHUB_REPOSITORY", "");
        String owner = "";
        String repo = "";
        int slash = slug.indexOf('/');
        if (slash > 0 && slash < slug.length() - 1) {
            owner = slug.substring(0, slash);
            repo = slug.substring(slash + 1);
        }
        Credentials creds = () -> {
            String t = env("GITHUB_TOKEN", "");
            return t.isEmpty() ? env("GH_TOKEN", "") : t;
        };
        return new ActionsDispatch(transport, creds, owner, repo,
                env("CLAIM_WORK_WORKFLOW", "claim-work.yml"),
                env("CLAIM_WORK_REF", "main"));
    }

    /** The real transport. Not exercised by the qualification: the sandbox has no network. */
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

        String url = API + "/repos/" + owner + "/" + repo
                + "/actions/workflows/" + workflowFile + "/dispatches";
        String body = "{\"ref\":\"" + esc(ref) + "\",\"inputs\":{"
                + "\"claim_id\":\"" + esc(claimId) + "\","
                + "\"payload_digest\":\"" + esc(payloadDigest) + "\"}}";

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/vnd.github+json");
        headers.put("Authorization", "Bearer " + token);
        headers.put("X-GitHub-Api-Version", "2022-11-28");
        headers.put("Content-Type", "application/json");

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
                + " correlation=" + claimId;
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
