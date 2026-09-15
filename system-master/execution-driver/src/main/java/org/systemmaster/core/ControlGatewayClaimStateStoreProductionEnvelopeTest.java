package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/** Regression for production-sized GitHub contents envelopes used by the claim-state authority reader. */
public final class ControlGatewayClaimStateStoreProductionEnvelopeTest {
    private static final String STATE_HEAD = "1".repeat(40);
    private static final String AUTHORITY_HEAD = "2".repeat(40);
    private static final String SUBJECT = "3".repeat(40);
    private static final String PACKET = "4".repeat(64);

    public static void main(String[] args) throws Exception {
        FakeTransport http = new FakeTransport();
        ControlGatewayClaimStateStore store = new ControlGatewayClaimStateStore(http, () -> "token", "owner", "repo",
                "second-shift/execution-state", "execution/claims/state",
                "control-gateway-state/active-work/second-shift-dispatch-durability-003",
                "control-gateway-production-writer.yml", "main", "SECOND_SHIFT_CLAIM_STATE_WRITE",
                1, 0L);

        store.verifyStateRef();
        if (http.postCalls != 0) throw new AssertionError("authority verification must not mutate state");
        System.out.println("CONTROL-GATEWAY-CLAIM-STATE-PRODUCTION-ENVELOPE RESULT: PASS");
    }

    private static final class FakeTransport implements ControlGatewayClaimStateStore.Transport {
        int postCalls;

        @Override
        public ControlGatewayClaimStateStore.Response get(String url, Map<String, String> headers) {
            if (url.contains("/git/ref/heads/control-gateway-state/active-work/second-shift-dispatch-durability-003")) {
                return ref(AUTHORITY_HEAD);
            }
            if (url.contains("/git/ref/heads/second-shift/execution-state")) return ref(STATE_HEAD);
            if (url.contains("/contents/control-gateway-state/active-work/head.json")) {
                return productionSizedContent(authorityJson());
            }
            return new ControlGatewayClaimStateStore.Response(404, "{}");
        }

        @Override
        public ControlGatewayClaimStateStore.Response post(String url, Map<String, String> headers, String body) {
            postCalls++;
            throw new AssertionError("authority verification must never POST");
        }

        private static ControlGatewayClaimStateStore.Response ref(String sha) {
            return new ControlGatewayClaimStateStore.Response(200,
                    "{\"ref\":\"refs/heads/x\",\"object\":{\"sha\":\"" + sha + "\",\"type\":\"commit\"}}");
        }

        private static ControlGatewayClaimStateStore.Response productionSizedContent(String text) {
            String encoded = Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
            String padding = "x".repeat(200_000);
            return new ControlGatewayClaimStateStore.Response(200,
                    "{\"sha\":\"authority-blob\",\"padding\":\"" + padding
                            + "\",\"encoding\":\"base64\",\"content\":\"" + encoded + "\"}");
        }

        private static String authorityJson() {
            return "{\"packet\":{"
                    + "\"allowed_paths_or_effects\":{\"effects\":[\"SECOND_SHIFT_CLAIM_STATE_WRITE\"],\"paths\":[\"execution/claims/state/**\"]},"
                    + "\"authoritative_subject\":{\"algorithm\":\"sha1\",\"oid\":\"" + SUBJECT + "\"},"
                    + "\"authority_epoch\":1,\"branch_or_ref\":\"second-shift/execution-state\","
                    + "\"current_operation\":{\"operation_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY-003\","
                    + "\"predecessor_receipt_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTHORITY-BOOTSTRAP\",\"state\":\"ACTIVE\"},"
                    + "\"github_admission_state\":\"ADMITTED\",\"mission_version\":\"SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0\","
                    + "\"protocol_version\":\"control-gateway.active-work.v1\",\"qualification_state\":\"PASSED\","
                    + "\"repository\":\"owner/repo\",\"workstream_id\":\"SECOND-SHIFT-DISPATCH-DURABILITY\"},"
                    + "\"packet_digest\":\"" + PACKET + "\"}";
        }
    }
}
