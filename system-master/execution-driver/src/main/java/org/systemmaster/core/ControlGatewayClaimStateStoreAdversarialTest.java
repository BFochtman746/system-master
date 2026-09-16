package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

/** Adversarial production-state-store qualification beyond the happy-path writer receipt. */
public final class ControlGatewayClaimStateStoreAdversarialTest {
    private static final String STATE_HEAD = "1".repeat(40);
    private static final String AUTHORITY_HEAD = "2".repeat(40);
    private static final String SUBJECT = "3".repeat(40);
    private static final String PACKET = "4".repeat(64);
    private static final String MUTATION_HEAD = "5".repeat(40);
    private static final String LATEST_HEAD = "6".repeat(40);
    private static final Instant T0 = Instant.parse("2026-09-15T17:30:00Z");
    private static int checks;
    private static int failures;

    public static void main(String[] args) throws Exception {
        matchingMutationIdWithWrongBytesFailsClosed();
        acceptedDispatchWithoutObservedResultFailsClosed();
        deeperHistoryExactMutationWithSameLatestBytesReconciles();
        deeperHistoryExactMutationWithCompetingLatestBytesIsCasConflict();

        System.out.println();
        System.out.println("CONTROL-GATEWAY-CLAIM-STATE-ADVERSARIAL checks=" + checks + " failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static void matchingMutationIdWithWrongBytesFailsClosed() {
        String claimId = "wrong-bytes-job";
        DurableDispatchCoordinator.ClaimRecord desired = ready(claimId, "sha256:desired");
        DurableDispatchCoordinator.ClaimRecord wrong = ready(claimId, "sha256:wrong");
        FakeTransport http = new FakeTransport(Mode.WRONG_BYTES);
        http.mutationJson = wrong.toJson();
        ControlGatewayClaimStateStore store = store(http, 1);

        refuses("matching mutation id with wrong persisted bytes fails closed",
                IllegalStateException.class, "STATE_WRITER_RESULT_CONTENT_MISMATCH",
                () -> store.save(null, desired));
        eq("wrong-byte result dispatches once", 1, http.postCalls);
    }

    private static void acceptedDispatchWithoutObservedResultFailsClosed() {
        String claimId = "accepted-no-result-job";
        DurableDispatchCoordinator.ClaimRecord desired = ready(claimId, "sha256:desired");
        FakeTransport http = new FakeTransport(Mode.ACCEPT_NO_MOVE);
        ControlGatewayClaimStateStore store = store(http, 2);

        refuses("accepted dispatch without state publication is bounded fail-closed",
                IllegalStateException.class, "STATE_WRITER_RESULT_NOT_OBSERVED",
                () -> store.save(null, desired));
        eq("accepted-no-result never redispatches", 1, http.postCalls);
    }

    private static void deeperHistoryExactMutationWithSameLatestBytesReconciles() throws Exception {
        String claimId = "deep-history-same-job";
        DurableDispatchCoordinator.ClaimRecord desired = ready(claimId, "sha256:desired");
        FakeTransport http = new FakeTransport(Mode.DEEP_SAME);
        http.mutationJson = desired.toJson();
        http.latestJson = desired.toJson();
        ControlGatewayClaimStateStore store = store(http, 1);

        DurableDispatchCoordinator.Versioned saved = store.save(null, desired);
        eq("deep exact mutation returns unchanged latest record", desired, saved.record());
        eq("deep exact mutation returns latest blob revision", "blob-latest", saved.revision());
        eq("deep exact mutation dispatches once", 1, http.postCalls);
        eq("deep exact mutation traverses latest and mutation commits", 2, http.commitReads);
    }

    private static void deeperHistoryExactMutationWithCompetingLatestBytesIsCasConflict() {
        String claimId = "deep-history-race-job";
        DurableDispatchCoordinator.ClaimRecord desired = ready(claimId, "sha256:desired");
        DurableDispatchCoordinator.ClaimRecord competing = ready(claimId, "sha256:competing");
        FakeTransport http = new FakeTransport(Mode.DEEP_CHANGED);
        http.mutationJson = desired.toJson();
        http.latestJson = competing.toJson();
        ControlGatewayClaimStateStore store = store(http, 1);

        refuses("deep exact mutation followed by competing latest bytes is CAS loss",
                DurableDispatchCoordinator.CasConflictException.class, "STATE_CAS_CONFLICT",
                () -> store.save(null, desired));
        eq("deep competing latest bytes never redispatch", 1, http.postCalls);
        eq("deep competing path traverses latest and mutation commits", 2, http.commitReads);
    }

    private static DurableDispatchCoordinator.ClaimRecord ready(String claimId, String digest) {
        return DurableDispatchCoordinator.ClaimRecord.ready(claimId, digest, T0);
    }

    private static ControlGatewayClaimStateStore store(FakeTransport http, int polls) {
        return new ControlGatewayClaimStateStore(http, () -> "token", "owner", "repo",
                "second-shift/execution-state", "execution/claims/state",
                "control-gateway-state/active-work/second-shift-dispatch-durability-003",
                "control-gateway-production-writer.yml", "main", "SECOND_SHIFT_CLAIM_STATE_WRITE",
                polls, 0L);
    }

    private enum Mode { WRONG_BYTES, ACCEPT_NO_MOVE, DEEP_SAME, DEEP_CHANGED }

    private static final class FakeTransport implements ControlGatewayClaimStateStore.Transport {
        final Mode mode;
        String stateHead = STATE_HEAD;
        String mutationId;
        String mutationJson;
        String latestJson;
        int postCalls;
        int commitReads;

        FakeTransport(Mode mode) {
            this.mode = mode;
        }

        @Override
        public ControlGatewayClaimStateStore.Response get(String url, Map<String, String> headers) {
            if (url.contains("/git/ref/heads/control-gateway-state/active-work/second-shift-dispatch-durability-003")) {
                return ref(AUTHORITY_HEAD);
            }
            if (url.contains("/git/ref/heads/second-shift/execution-state")) return ref(stateHead);
            if (url.contains("/contents/control-gateway-state/active-work/head.json")) {
                return content("authority-blob", authorityJson());
            }
            if (url.contains("/git/commits/" + LATEST_HEAD)) {
                commitReads++;
                return commit(LATEST_HEAD, "later competing state movement", MUTATION_HEAD);
            }
            if (url.contains("/git/commits/" + MUTATION_HEAD)) {
                commitReads++;
                return commit(MUTATION_HEAD,
                        "claim state\n\nControl-Gateway-Mutation: " + mutationId, STATE_HEAD);
            }
            if (url.contains("/contents/execution/claims/state/")) {
                if (url.contains("ref=" + MUTATION_HEAD) && mutationJson != null) {
                    return content("blob-mutation", mutationJson);
                }
                if (url.contains("ref=" + LATEST_HEAD) && latestJson != null) {
                    return content("blob-latest", latestJson);
                }
                return response(404, "{}");
            }
            return response(404, "{}");
        }

        @Override
        public ControlGatewayClaimStateStore.Response post(
                String url, Map<String, String> headers, String body) {
            postCalls++;
            mutationId = between(body, "\\\"mutation_id\\\":\\\"", "\\\"");
            if (mutationId == null) throw new IllegalStateException("TEST_MUTATION_ID_MISSING");
            switch (mode) {
                case ACCEPT_NO_MOVE -> { }
                case WRONG_BYTES -> stateHead = MUTATION_HEAD;
                case DEEP_SAME, DEEP_CHANGED -> stateHead = LATEST_HEAD;
            }
            return response(204, "");
        }

        private ControlGatewayClaimStateStore.Response ref(String sha) {
            return response(200, "{\"ref\":\"refs/heads/x\",\"object\":{\"sha\":\""
                    + sha + "\",\"type\":\"commit\"}}");
        }

        private ControlGatewayClaimStateStore.Response commit(String sha, String message, String parent) {
            return response(200, "{\"sha\":\"" + sha + "\",\"message\":\"" + escape(message)
                    + "\",\"parents\":[{\"sha\":\"" + parent + "\"}]}");
        }

        private ControlGatewayClaimStateStore.Response content(String sha, String text) {
            String encoded = Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
            return response(200, "{\"sha\":\"" + sha
                    + "\",\"encoding\":\"base64\",\"content\":\"" + encoded + "\"}");
        }

        private ControlGatewayClaimStateStore.Response response(int status, String body) {
            return new ControlGatewayClaimStateStore.Response(status, body);
        }

        private String authorityJson() {
            return "{\"packet\":{"
                    + "\"allowed_paths_or_effects\":{\"effects\":[\"SECOND_SHIFT_CLAIM_STATE_WRITE\"],"
                    + "\"paths\":[\"execution/claims/state/**\"]},"
                    + "\"authoritative_subject\":{\"algorithm\":\"sha1\",\"oid\":\"" + SUBJECT + "\"},"
                    + "\"authority_epoch\":1,\"branch_or_ref\":\"second-shift/execution-state\","
                    + "\"current_operation\":{\"operation_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY-003\","
                    + "\"predecessor_receipt_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTHORITY-BOOTSTRAP\","
                    + "\"state\":\"ACTIVE\"},"
                    + "\"github_admission_state\":\"ADMITTED\","
                    + "\"mission_version\":\"SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0\","
                    + "\"protocol_version\":\"control-gateway.active-work.v1\","
                    + "\"qualification_state\":\"PASSED\",\"repository\":\"owner/repo\","
                    + "\"workstream_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY\"},"
                    + "\"packet_digest\":\"" + PACKET + "\"}";
        }

        private static String escape(String value) {
            return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        }

        private static String between(String value, String prefix, String suffix) {
            int start = value.indexOf(prefix);
            if (start < 0) return null;
            start += prefix.length();
            int end = value.indexOf(suffix, start);
            return end < 0 ? null : value.substring(start, end);
        }
    }

    private interface Checked { void run() throws Exception; }

    private static void refuses(String label, Class<? extends Throwable> type, String code, Checked body) {
        checks++;
        try {
            body.run();
            failures++;
            System.out.println("  FAIL  " + label + " (no exception)");
        } catch (Throwable t) {
            if (type.isInstance(t) && code.equals(t.getMessage())) {
                System.out.println("  PASS  " + label);
            } else {
                failures++;
                System.out.println("  FAIL  " + label + " actual=" + t);
            }
        }
    }

    private static void eq(String label, Object expected, Object actual) {
        checks++;
        if (expected == null ? actual == null : expected.equals(actual)) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label + " expected=" + expected + " actual=" + actual);
        }
    }
}
