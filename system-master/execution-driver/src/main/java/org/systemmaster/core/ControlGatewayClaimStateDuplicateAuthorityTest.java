package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

/** Adversarial qualification for duplicate-key ambiguity in protected authority JSON. */
public final class ControlGatewayClaimStateDuplicateAuthorityTest {
    private static final String STATE_HEAD = "1".repeat(40);
    private static final String AUTHORITY_HEAD = "2".repeat(40);
    private static final String SUBJECT = "3".repeat(40);
    private static final String PACKET = "4".repeat(64);
    private static int checks;
    private static int failures;

    public static void main(String[] args) {
        duplicateTopLevelPacketKeyFailsClosedBeforeMutation();
        escapedEquivalentNestedKeyFailsClosedBeforeMutation();

        System.out.println();
        System.out.println("CONTROL-GATEWAY-DUPLICATE-AUTHORITY checks=" + checks + " failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static void duplicateTopLevelPacketKeyFailsClosedBeforeMutation() {
        FakeTransport http = new FakeTransport();
        http.packetSuffix = ",\"protocol_version\":\"control-gateway.active-work.v0\"";
        refusesBeforeMutation("duplicate packet protocol fails closed", http);
    }

    private static void escapedEquivalentNestedKeyFailsClosedBeforeMutation() {
        FakeTransport http = new FakeTransport();
        http.operationSuffix = ",\"st\\u0061te\":\"BLOCKED\"";
        refusesBeforeMutation("escaped-equivalent nested state key fails closed", http);
    }

    private static void refusesBeforeMutation(String label, FakeTransport http) {
        ControlGatewayClaimStateStore store = store(http);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready(
                "duplicate-authority-job", "sha256:payload", Instant.parse("2026-09-15T17:00:00Z"));
        checks++;
        try {
            store.save(null, ready);
            failures++;
            System.out.println("  FAIL  " + label + " (no exception)");
        } catch (Throwable t) {
            if (t instanceof IllegalStateException
                    && "STATE_AUTHORITY_DUPLICATE_JSON_KEY".equals(t.getMessage())) {
                System.out.println("  PASS  " + label);
            } else {
                failures++;
                System.out.println("  FAIL  " + label + " actual=" + t);
            }
        }
        eq(label + " before writer POST", 0, http.postCalls);
    }

    private static ControlGatewayClaimStateStore store(FakeTransport http) {
        return new ControlGatewayClaimStateStore(http, () -> "token", "owner", "repo",
                "second-shift/execution-state", "execution/claims/state",
                "control-gateway-state/active-work/second-shift-dispatch-durability-003",
                "control-gateway-production-writer.yml", "main", "SECOND_SHIFT_CLAIM_STATE_WRITE",
                1, 0L);
    }

    private static final class FakeTransport implements ControlGatewayClaimStateStore.Transport {
        String packetSuffix = "";
        String operationSuffix = "";
        int postCalls;

        @Override
        public ControlGatewayClaimStateStore.Response get(String url, Map<String, String> headers) {
            if (url.contains("/git/ref/heads/control-gateway-state/active-work/second-shift-dispatch-durability-003")) {
                return ref(AUTHORITY_HEAD);
            }
            if (url.contains("/git/ref/heads/second-shift/execution-state")) return ref(STATE_HEAD);
            if (url.contains("/contents/execution/claims/state/")) return response(404, "{}");
            if (url.contains("/contents/control-gateway-state/active-work/head.json")) {
                return content("authority-blob", authorityJson());
            }
            return response(404, "{}");
        }

        @Override
        public ControlGatewayClaimStateStore.Response post(
                String url, Map<String, String> headers, String body) {
            postCalls++;
            return response(204, "");
        }

        private ControlGatewayClaimStateStore.Response ref(String sha) {
            return response(200, "{\"ref\":\"refs/heads/x\",\"object\":{\"sha\":\""
                    + sha + "\",\"type\":\"commit\"}}");
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
                    + "\"state\":\"ACTIVE\"" + operationSuffix + "},"
                    + "\"github_admission_state\":\"ADMITTED\","
                    + "\"mission_version\":\"SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0\","
                    + "\"protocol_version\":\"control-gateway.active-work.v1\"" + packetSuffix + ","
                    + "\"qualification_state\":\"PASSED\",\"repository\":\"owner/repo\","
                    + "\"workstream_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY\"},"
                    + "\"packet_digest\":\"" + PACKET + "\"}";
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
