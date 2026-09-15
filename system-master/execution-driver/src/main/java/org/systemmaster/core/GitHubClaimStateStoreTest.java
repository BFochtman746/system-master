package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

/** Qualification for GitHub Contents CAS persistence and corruption handling. */
public final class GitHubClaimStateStoreTest {
    private static int checks;
    private static int failures;
    private static final Instant T0 = Instant.parse("2026-09-15T03:00:00Z");

    public static void main(String[] args) throws Exception {
        createLoadAndCasUpdate();
        staleShaIsCasConflict();
        rejectedCreate409FailsClosed();
        rejectedUpdate409FailsClosed();
        rejected422FailsClosed();
        corruptPayloadFailsClosed();
        missingStateRefFailsClosed();
        claimIdCannotEscapeStateRoot();
        System.out.println();
        System.out.println("GITHUB-CLAIM-STATE-STORE checks=" + checks + " failures=" + failures);
        if (failures > 0) { System.out.println("RESULT: FAIL"); System.exit(1); }
        System.out.println("RESULT: PASS");
    }

    private static void createLoadAndCasUpdate() throws Exception {
        FakeTransport http = new FakeTransport(); GitHubClaimStateStore store = store(http); store.verifyStateRef();
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready("job/unsafe name", "sha256:p", T0);
        DurableDispatchCoordinator.Versioned v1 = store.save(null, ready);
        ok("create returns content SHA revision", v1.revision().startsWith("blob-"));
        DurableDispatchCoordinator.Versioned loaded = store.load("job/unsafe name");
        eq("load restores exact state JSON", ready, loaded.record()); eq("load revision matches create", v1.revision(), loaded.revision());
        DurableDispatchCoordinator.ClaimRecord claimed = ready.claimed("consumer", "fence", T0);
        DurableDispatchCoordinator.Versioned v2 = store.save(v1.revision(), claimed);
        ok("CAS update advances revision", !v1.revision().equals(v2.revision())); eq("updated record reloads", claimed, store.load("job/unsafe name").record());
    }

    private static void staleShaIsCasConflict() throws Exception {
        FakeTransport http = new FakeTransport(); GitHubClaimStateStore store = store(http);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready("job-2", "sha256:p2", T0);
        DurableDispatchCoordinator.Versioned v1 = store.save(null, ready);
        store.save(v1.revision(), ready.claimed("c", "f", T0));
        refuses("stale blob SHA loses CAS", DurableDispatchCoordinator.CasConflictException.class, "STATE_CAS_CONFLICT", () -> store.save(v1.revision(), ready));
    }

    private static void rejectedCreate409FailsClosed() {
        FakeTransport http = new FakeTransport(); http.forcedPutStatus = 409; GitHubClaimStateStore store = store(http);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready("job-create-rejected", "sha256:p", T0);
        refuses("409 without observed winning create is write rejection", IllegalStateException.class, "STATE_STORE_WRITE_REJECTED_409", () -> store.save(null, ready));
    }

    private static void rejectedUpdate409FailsClosed() throws Exception {
        FakeTransport http = new FakeTransport(); GitHubClaimStateStore store = store(http);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready("job-update-rejected", "sha256:p", T0);
        DurableDispatchCoordinator.Versioned v1 = store.save(null, ready);
        http.forcedPutStatus = 409;
        refuses("409 with unchanged observed revision is write rejection", IllegalStateException.class, "STATE_STORE_WRITE_REJECTED_409", () -> store.save(v1.revision(), ready.claimed("c", "f", T0)));
    }

    private static void rejected422FailsClosed() {
        FakeTransport http = new FakeTransport(); http.forcedPutStatus = 422; GitHubClaimStateStore store = store(http);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready("job-422-rejected", "sha256:p", T0);
        refuses("422 is never guessed to be CAS", IllegalStateException.class, "STATE_STORE_WRITE_REJECTED_422", () -> store.save(null, ready));
    }

    private static void corruptPayloadFailsClosed() throws Exception {
        FakeTransport http = new FakeTransport(); GitHubClaimStateStore store = store(http);
        store.save(null, DurableDispatchCoordinator.ClaimRecord.ready("job-3", "sha256:p3", T0));
        http.content = Base64.getEncoder().encodeToString("{bad-json".getBytes(StandardCharsets.UTF_8));
        refusesPrefix("corrupt JSON fails closed", IllegalStateException.class, "STATE_CORRUPT", () -> store.load("job-3"));
        http.content = "%%%not-base64%%%";
        refusesPrefix("corrupt base64 fails closed", IllegalStateException.class, "STATE_STORE_CORRUPT_BASE64", () -> store.load("job-3"));
    }

    private static void missingStateRefFailsClosed() {
        FakeTransport http = new FakeTransport(); http.refExists = false; GitHubClaimStateStore store = store(http);
        refuses("missing state branch is not treated as empty state", IllegalStateException.class, "STATE_STORE_REF_REJECTED_404", store::verifyStateRef);
    }

    private static void claimIdCannotEscapeStateRoot() throws Exception {
        FakeTransport http = new FakeTransport(); GitHubClaimStateStore store = store(http);
        store.save(null, DurableDispatchCoordinator.ClaimRecord.ready("../../governance/x", "sha256:p", T0));
        ok("claim id is hashed into state filename", http.lastPutUrl.contains("/execution/claims/state/"));
        ok("raw traversal never appears in URL", !http.lastPutUrl.contains("..") && !http.lastPutUrl.contains("governance/x"));
    }

    private static GitHubClaimStateStore store(FakeTransport http) {
        return new GitHubClaimStateStore(http, () -> "token", "owner", "repo", "second-shift/execution-state", "execution/claims/state");
    }

    private static final class FakeTransport implements GitHubClaimStateStore.Transport {
        boolean refExists = true; String revision; String content; String lastPutUrl; int sequence; Integer forcedPutStatus;
        public GitHubClaimStateStore.Response get(String url, Map<String, String> headers) {
            if (url.contains("/git/ref/heads/")) return new GitHubClaimStateStore.Response(refExists ? 200 : 404, refExists ? "{\"ref\":\"refs/heads/second-shift/execution-state\"}" : "{}");
            if (revision == null) return new GitHubClaimStateStore.Response(404, "{}");
            return new GitHubClaimStateStore.Response(200, "{\"sha\":\"" + revision + "\",\"encoding\":\"base64\",\"content\":\"" + content + "\"}");
        }
        public GitHubClaimStateStore.Response put(String url, Map<String, String> headers, String body) {
            lastPutUrl = url;
            if (forcedPutStatus != null) return new GitHubClaimStateStore.Response(forcedPutStatus, "{}");
            String expected = jsonString(body, "sha");
            if (revision == null) { if (expected != null) return new GitHubClaimStateStore.Response(409, "{}"); }
            else if (expected == null || !revision.equals(expected)) return new GitHubClaimStateStore.Response(409, "{}");
            content = jsonString(body, "content"); revision = "blob-" + (++sequence); int status = sequence == 1 ? 201 : 200;
            return new GitHubClaimStateStore.Response(status, "{\"content\":{\"sha\":\"" + revision + "\"},\"commit\":{\"sha\":\"commit-" + sequence + "\"}}");
        }
        private static String jsonString(String json, String key) {
            String needle = "\"" + key + "\":\""; int start = json.indexOf(needle); if (start < 0) return null;
            start += needle.length(); int end = json.indexOf('"', start); return end < 0 ? null : json.substring(start, end);
        }
    }

    private interface Checked { void run() throws Exception; }
    private static void refuses(String label, Class<? extends Throwable> type, String code, Checked body) {
        checks++; try { body.run(); failures++; System.out.println("  FAIL  " + label + " (no exception)"); }
        catch (Throwable t) { if (type.isInstance(t) && code.equals(t.getMessage())) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label + " actual=" + t); } }
    }
    private static void refusesPrefix(String label, Class<? extends Throwable> type, String code, Checked body) {
        checks++; try { body.run(); failures++; System.out.println("  FAIL  " + label + " (no exception)"); }
        catch (Throwable t) { if (type.isInstance(t) && t.getMessage() != null && t.getMessage().startsWith(code)) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label + " actual=" + t); } }
    }
    private static void ok(String label, boolean condition) { checks++; if (condition) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label); } }
    private static void eq(String label, Object expected, Object actual) { checks++; if (expected == null ? actual == null : expected.equals(actual)) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label + " expected=" + expected + " actual=" + actual); } }
}
