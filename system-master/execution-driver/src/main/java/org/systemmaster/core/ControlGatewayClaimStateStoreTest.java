package org.systemmaster.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

/** Qualification for the Control-Gateway-backed production claim-state writer. */
public final class ControlGatewayClaimStateStoreTest {
    private static final String STATE_HEAD = "1".repeat(40);
    private static final String AUTHORITY_HEAD = "2".repeat(40);
    private static final String SUBJECT = "3".repeat(40);
    private static final String PACKET = "4".repeat(64);
    private static final String RESULT_HEAD = "5".repeat(40);
    private static int checks;
    private static int failures;

    public static void main(String[] args) throws Exception {
        acceptedWriterDispatchReconcilesExactMutation();
        ambiguousDispatchNeverRedispatches();
        competingMutationIsCasConflict();
        missingAuthorityFailsClosedBeforeDispatch();
        wrongAuthorityProtocolFailsClosedBeforeDispatch();
        wrongAuthorityWorkstreamFailsClosedBeforeDispatch();
        wrongAuthorityRepositoryFailsClosedBeforeDispatch();
        oldShortPredecessorReceiptFailsClosedBeforeDispatch();
        broadenedPathScopeFailsClosedBeforeDispatch();
        broadenedEffectScopeFailsClosedBeforeDispatch();
        System.out.println();
        System.out.println("CONTROL-GATEWAY-CLAIM-STATE-STORE checks=" + checks + " failures=" + failures);
        if (failures > 0) { System.out.println("RESULT: FAIL"); System.exit(1); }
        System.out.println("RESULT: PASS");
    }

    private static void acceptedWriterDispatchReconcilesExactMutation() throws Exception {
        FakeTransport http = new FakeTransport();
        ControlGatewayClaimStateStore store = store(http, 2);
        store.verifyStateRef();
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready(
                "writer-job", "sha256:payload", Instant.parse("2026-09-15T06:00:00Z"));
        http.nextAppliedJson = ready.toJson();
        DurableDispatchCoordinator.Versioned saved = store.save(null, ready);
        eq("writer returns exact persisted record", ready, saved.record());
        eq("writer returns result blob revision", "blob-result", saved.revision());
        eq("writer dispatches exactly once", 1, http.postCalls);
        ok("dispatch targets main trusted writer workflow", http.lastPostUrl.endsWith("/actions/workflows/control-gateway-production-writer.yml/dispatches"));
        ok("dispatch binds dedicated authority ref", http.lastPostBody.contains("control-gateway-state/active-work/second-shift-dispatch-durability-003"));
        ok("request scopes exact claim-state path", http.lastPostBody.contains("execution/claims/state/"));
        ok("request requires dedicated state effect", http.lastPostBody.contains("SECOND_SHIFT_CLAIM_STATE_WRITE"));
    }

    private static void ambiguousDispatchNeverRedispatches() {
        FakeTransport http = new FakeTransport(); http.throwAfterPost = true;
        ControlGatewayClaimStateStore store = store(http, 1);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready(
                "uncertain-job", "sha256:p", Instant.parse("2026-09-15T06:00:00Z"));
        refuses("ambiguous dispatch fails closed without a second POST", IllegalStateException.class,
                "STATE_WRITER_DISPATCH_UNCERTAIN", () -> store.save(null, ready));
        eq("ambiguous dispatch issued one POST only", 1, http.postCalls);
    }

    private static void competingMutationIsCasConflict() {
        FakeTransport http = new FakeTransport(); http.competingMove = true;
        ControlGatewayClaimStateStore store = store(http, 1);
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready(
                "race-job", "sha256:p", Instant.parse("2026-09-15T06:00:00Z"));
        refuses("unexpected branch movement is CAS loss, not replay", DurableDispatchCoordinator.CasConflictException.class,
                "STATE_CAS_CONFLICT", () -> store.save(null, ready));
        eq("CAS race never triggers redispatch", 1, http.postCalls);
    }

    private static void missingAuthorityFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport(); http.authorityExists = false;
        ControlGatewayClaimStateStore store = store(http, 1);
        refuses("missing durable writer authority fails closed", IllegalStateException.class,
                "STATE_AUTHORITY_REF_REJECTED_404", store::verifyStateRef);
        eq("authority preflight performs no mutation", 0, http.postCalls);
    }

    private static void wrongAuthorityProtocolFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport();
        http.authorityProtocol = "control-gateway.active-work.v0";
        refusesAuthority(http, "wrong authority protocol fails closed",
                "STATE_AUTHORITY_PROTOCOL_MISMATCH");
    }

    private static void wrongAuthorityWorkstreamFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport();
        http.authorityWorkstream = "SECOND-SHIFT-OTHER-WORKSTREAM";
        refusesAuthority(http, "wrong authority workstream fails closed",
                "STATE_AUTHORITY_WORKSTREAM_MISMATCH");
    }

    private static void wrongAuthorityRepositoryFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport();
        http.authorityRepository = "other/repo";
        refusesAuthority(http, "wrong authority repository fails closed",
                "STATE_AUTHORITY_REPOSITORY_MISMATCH");
    }

    private static void oldShortPredecessorReceiptFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport();
        http.authorityPredecessorReceipt = "SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTH";
        refusesAuthority(http, "old short predecessor receipt fails closed",
                "STATE_AUTHORITY_PREDECESSOR_RECEIPT_MISMATCH");
    }

    private static void broadenedPathScopeFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport();
        http.allowedPathsJson = "[\"execution/claims/state/**\",\"execution/**\"]";
        refusesAuthority(http, "broadened authority path scope fails closed",
                "STATE_AUTHORITY_PATH_SCOPE_MISMATCH");
    }

    private static void broadenedEffectScopeFailsClosedBeforeDispatch() {
        FakeTransport http = new FakeTransport();
        http.allowedEffectsJson = "[\"SECOND_SHIFT_CLAIM_STATE_WRITE\",\"OTHER_WRITE\"]";
        refusesAuthority(http, "broadened authority effect scope fails closed",
                "STATE_AUTHORITY_EFFECT_SCOPE_MISMATCH");
    }

    private static void refusesAuthority(FakeTransport http, String label, String code) {
        ControlGatewayClaimStateStore store = store(http, 1);
        refuses(label, IllegalStateException.class, code, store::verifyStateRef);
        eq(label + " before mutation", 0, http.postCalls);
    }

    private static ControlGatewayClaimStateStore store(FakeTransport http, int polls) {
        return new ControlGatewayClaimStateStore(http, () -> "token", "owner", "repo",
                "second-shift/execution-state", "execution/claims/state",
                "control-gateway-state/active-work/second-shift-dispatch-durability-003",
                "control-gateway-production-writer.yml", "main", "SECOND_SHIFT_CLAIM_STATE_WRITE",
                polls, 0L);
    }

    private static final class FakeTransport implements ControlGatewayClaimStateStore.Transport {
        boolean authorityExists = true;
        boolean throwAfterPost;
        boolean competingMove;
        String stateHead = STATE_HEAD;
        String nextAppliedJson;
        String appliedJson;
        String appliedMutationId;
        int postCalls;
        String lastPostUrl;
        String lastPostBody;
        String authorityProtocol = "control-gateway.active-work.v1";
        String authorityWorkstream = "SECOND-SHIFT-DISPATCH-DURABILITY";
        String authorityRepository = "owner/repo";
        String authorityOperation = "SECOND-SHIFT-DISPATCH-DURABILITY-003";
        String authorityPredecessorReceipt = "SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTHORITY-BOOTSTRAP";
        String allowedPathsJson = "[\"execution/claims/state/**\"]";
        String allowedEffectsJson = "[\"SECOND_SHIFT_CLAIM_STATE_WRITE\"]";

        public ControlGatewayClaimStateStore.Response get(String url, Map<String, String> headers) {
            if (url.contains("/git/ref/heads/control-gateway-state/active-work/second-shift-dispatch-durability-003")) {
                if (!authorityExists) return response(404, "{}");
                return ref(AUTHORITY_HEAD);
            }
            if (url.contains("/git/ref/heads/second-shift/execution-state")) return ref(stateHead);
            if (url.contains("/contents/control-gateway-state/active-work/head.json")) return content("authority-blob", authorityJson());
            if (url.contains("/git/commits/" + RESULT_HEAD)) {
                String message = competingMove ? "competing writer" : "claim state\n\nControl-Gateway-Mutation: " + appliedMutationId;
                return response(200, "{\"sha\":\"" + RESULT_HEAD + "\",\"message\":\"" + escape(message)
                        + "\",\"parents\":[{\"sha\":\"" + STATE_HEAD + "\"}]}");
            }
            if (url.contains("/contents/execution/claims/state/")) {
                if (url.contains("ref=" + RESULT_HEAD) && appliedJson != null) return content("blob-result", appliedJson);
                return response(404, "{}");
            }
            return response(404, "{}");
        }

        public ControlGatewayClaimStateStore.Response post(String url, Map<String, String> headers, String body) throws Exception {
            postCalls++;
            lastPostUrl = url;
            lastPostBody = body;
            if (throwAfterPost) throw new IOException("ambiguous transport");
            if (competingMove) {
                stateHead = RESULT_HEAD;
                return response(204, "");
            }
            appliedMutationId = between(body, "\\\"mutation_id\\\":\\\"", "\\\"");
            if (appliedMutationId == null) throw new IllegalStateException("test could not parse mutation id");
            appliedJson = nextAppliedJson;
            stateHead = RESULT_HEAD;
            return response(204, "");
        }

        private ControlGatewayClaimStateStore.Response ref(String sha) {
            return response(200, "{\"ref\":\"refs/heads/x\",\"object\":{\"sha\":\"" + sha + "\",\"type\":\"commit\"}}");
        }
        private ControlGatewayClaimStateStore.Response content(String sha, String text) {
            String encoded = Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
            return response(200, "{\"sha\":\"" + sha + "\",\"encoding\":\"base64\",\"content\":\"" + encoded + "\"}");
        }
        private ControlGatewayClaimStateStore.Response response(int status, String body) {
            return new ControlGatewayClaimStateStore.Response(status, body);
        }
        private String authorityJson() {
            return "{\"packet\":{"
                    + "\"allowed_paths_or_effects\":{\"effects\":" + allowedEffectsJson + ",\"paths\":" + allowedPathsJson + "},"
                    + "\"authoritative_subject\":{\"algorithm\":\"sha1\",\"oid\":\"" + SUBJECT + "\"},"
                    + "\"authority_epoch\":1,\"branch_or_ref\":\"second-shift/execution-state\","
                    + "\"current_operation\":{\"operation_id\":\"" + authorityOperation + "\","
                    + "\"predecessor_receipt_id\":\"" + authorityPredecessorReceipt + "\",\"state\":\"ACTIVE\"},"
                    + "\"github_admission_state\":\"ADMITTED\",\"mission_version\":\"SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0\","
                    + "\"protocol_version\":\"" + authorityProtocol + "\",\"qualification_state\":\"PASSED\","
                    + "\"repository\":\"" + authorityRepository + "\",\"workstream_id\":\"" + authorityWorkstream + "\"},"
                    + "\"packet_digest\":\"" + PACKET + "\"}";
        }
        private static String escape(String value) {
            return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        }
        private static String between(String value, String prefix, String suffix) {
            int start = value.indexOf(prefix); if (start < 0) return null; start += prefix.length();
            int end = value.indexOf(suffix, start); return end < 0 ? null : value.substring(start, end);
        }
    }

    private interface Checked { void run() throws Exception; }
    private static void refuses(String label, Class<? extends Throwable> type, String code, Checked body) {
        checks++;
        try { body.run(); failures++; System.out.println("  FAIL  " + label + " (no exception)"); }
        catch (Throwable t) {
            if (type.isInstance(t) && code.equals(t.getMessage())) System.out.println("  PASS  " + label);
            else { failures++; System.out.println("  FAIL  " + label + " actual=" + t); }
        }
    }
    private static void ok(String label, boolean condition) {
        checks++; if (condition) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label); }
    }
    private static void eq(String label, Object expected, Object actual) {
        checks++;
        if (expected == null ? actual == null : expected.equals(actual)) System.out.println("  PASS  " + label);
        else { failures++; System.out.println("  FAIL  " + label + " expected=" + expected + " actual=" + actual); }
    }
}
