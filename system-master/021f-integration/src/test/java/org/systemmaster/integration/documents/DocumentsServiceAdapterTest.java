package org.systemmaster.integration.documents;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.systemmaster.integration.documents.DocumentsServiceAdapter.*;

public final class DocumentsServiceAdapterTest {
    private static int cases = 0;

    private static void check(boolean condition, String message) {
        cases++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expect(Class<? extends Throwable> type, Runnable action, String message) {
        cases++;
        try {
            action.run();
        } catch (Throwable t) {
            if (type.isInstance(t)) return;
            throw new AssertionError(message + ": wrong exception " + t, t);
        }
        throw new AssertionError(message + ": no exception");
    }

    private static ArtifactRef artifact(String id, String seed) {
        return new ArtifactRef(id, DocumentsServiceAdapter.sha256(seed));
    }

    private static Request request(String requestId, String correlationId, String idempotencyKey, Operation operation, String target) {
        return new Request(
                1,
                requestId,
                operation,
                artifact("artifact://input/1", "input"),
                target,
                Map.of("quality", "production"),
                idempotencyKey,
                correlationId,
                "SYSTEM_MASTER");
    }

    private static Response success(Request r) {
        return new Response(
                1,
                r.requestId(),
                r.correlationId(),
                Status.SUCCEEDED,
                List.of(artifact("artifact://output/1", "output")),
                null,
                List.of("evidence://documents/service/1"));
    }

    public static void main(String[] args) {
        Request first = request("req-001", "corr-001", "idem-001", Operation.RENDER, "application/pdf");
        Request replayRequest = request("req-002", "corr-002", "idem-001", Operation.RENDER, "application/pdf");

        check(first.semanticDigest().matches("[0-9a-f]{64}"), "semantic digest shape");
        check(first.semanticDigest().equals(replayRequest.semanticDigest()), "request/correlation are excluded from semantic identity");
        check(SERVICE_OWNER_SYSTEM_ID.equals("DOCUMENTS"), "Documents remains semantic service owner");

        AtomicInteger calls = new AtomicInteger();
        DocumentsServiceAdapter adapter = new DocumentsServiceAdapter(r -> {
            calls.incrementAndGet();
            return success(r);
        });

        Invocation one = adapter.invoke(first);
        check(!one.replay(), "first invocation is not replay");
        check(!one.productionAuthorized(), "adapter cannot grant production authority");
        check(one.serviceOwnerSystemId().equals("DOCUMENTS"), "owner remains Documents");
        check(one.response().status() == Status.SUCCEEDED, "success response preserved");
        check(one.response().requestId().equals("req-001"), "request id preserved");
        check(one.response().correlationId().equals("corr-001"), "correlation id preserved");
        check(one.response().outputArtifacts().size() == 1, "success has exact output reference");
        check(one.events().size() == 2, "accepted plus terminal event");
        check(one.events().get(0).sequence() == 1 && one.events().get(1).sequence() == 2, "event sequence is contiguous");
        check(one.events().get(1).eventType() == EventType.DOCUMENT_SERVICE_SUCCEEDED, "terminal success event");
        check(calls.get() == 1, "service executed once");

        Invocation two = adapter.invoke(replayRequest);
        check(two.replay(), "same semantic request is replay-safe");
        check(calls.get() == 1, "replay does not execute service twice");
        check(two.response().requestId().equals("req-002"), "replay response rebinds current request id");
        check(two.response().correlationId().equals("corr-002"), "replay response rebinds current correlation id");
        check(two.response().outputArtifacts().equals(one.response().outputArtifacts()), "replay preserves exact artifact identity");

        expect(IllegalStateException.class,
                () -> adapter.invoke(request("req-003", "corr-003", "idem-001", Operation.RENDER, "application/docx")),
                "changed semantics under same idempotency key must conflict");

        expect(IllegalArgumentException.class,
                () -> new Request(1, "req-x", Operation.EXPORT, artifact("artifact://input/x", "x"), "application/pdf",
                        Map.of("raw_bytes", "forbidden"), "idem-x", "corr-x", "SYSTEM_MASTER"),
                "raw bytes option must be rejected");
        expect(IllegalArgumentException.class,
                () -> new Request(1, "req-x", Operation.EXPORT, artifact("artifact://input/x", "x"), "application/pdf",
                        Map.of(), "idem-x", "corr-x", "PROSE"),
                "retired Prose cannot become a caller lane");
        expect(IllegalArgumentException.class,
                () -> new Request(1, "req-x", Operation.EXPORT, artifact("artifact://input/x", "x"), "application/pdf",
                        Map.of(), "idem-x", "corr-x", "PROGRAMMING"),
                "Programming work program cannot gain peer service authority");
        expect(IllegalArgumentException.class,
                () -> new ArtifactRef("artifact://bad", "not-a-digest"),
                "artifact digest must be exact sha256");
        expect(IllegalArgumentException.class,
                () -> new Response(1, "req", "corr", Status.SUCCEEDED, List.of(), null, List.of()),
                "success without artifact identity is forbidden");
        expect(IllegalArgumentException.class,
                () -> new Response(1, "req", "corr", Status.BLOCKED, List.of(), null, List.of()),
                "blocked response requires classified error");

        DocumentsServiceAdapter mismatch = new DocumentsServiceAdapter(r -> new Response(
                1, "wrong-request", r.correlationId(), Status.SUCCEEDED,
                List.of(artifact("artifact://output/mismatch", "mismatch")), null, List.of("evidence://mismatch")));
        Invocation mismatchResult = mismatch.invoke(request("req-m", "corr-m", "idem-m", Operation.CONVERT, "application/pdf"));
        check(mismatchResult.response().status() == Status.BLOCKED, "protocol mismatch fails closed");
        check(mismatchResult.response().error().errorClass().equals("DOCUMENTS_ADAPTER_BOUNDARY"), "protocol blocker classified");
        check(mismatchResult.events().get(1).eventType() == EventType.DOCUMENT_SERVICE_BLOCKED, "protocol blocker emits blocked event");

        DocumentsServiceAdapter throwing = new DocumentsServiceAdapter(r -> { throw new IllegalStateException("transport down"); });
        Invocation thrown = throwing.invoke(request("req-t", "corr-t", "idem-t", Operation.PRESERVE, null));
        check(thrown.response().status() == Status.BLOCKED, "transport exception fails closed");
        check(thrown.response().error().retryable(), "transport/protocol blocker is explicitly retryable");
        check(thrown.response().evidenceRefs().size() == 1, "fail-closed path preserves evidence reference");

        DocumentsServiceAdapter accepted = new DocumentsServiceAdapter(r -> new Response(
                1, r.requestId(), r.correlationId(), Status.ACCEPTED, List.of(), null, List.of("evidence://accepted")));
        Invocation acceptedResult = accepted.invoke(request("req-a", "corr-a", "idem-a", Operation.INTAKE, null));
        check(acceptedResult.response().status() == Status.ACCEPTED, "accepted state preserved");
        check(acceptedResult.events().size() == 1, "accepted-only result emits one accepted event");

        for (Operation op : Operation.values()) {
            DocumentsServiceAdapter coverage = new DocumentsServiceAdapter(DocumentsServiceAdapterTest::success);
            Invocation result = coverage.invoke(request("req-" + op, "corr-" + op, "idem-" + op, op, op == Operation.CONVERT || op == Operation.RENDER || op == Operation.EXPORT ? "application/pdf" : null));
            check(result.response().status() == Status.SUCCEEDED, "operation covered: " + op);
        }

        check(Operation.values().length == 7, "contract exposes exactly seven qualified operations");
        check(!DocumentsServiceAdapter.class.getName().toLowerCase().contains("prose"), "adapter identity does not resurrect Prose");

        System.out.println("{\"result\":\"PASS\",\"cases\":" + cases
                + ",\"operations\":7,\"service_owner\":\"DOCUMENTS\",\"reference_only\":true"
                + ",\"idempotent_replay\":true,\"idempotency_conflict_rejected\":true"
                + ",\"correlation_preserved\":true,\"classified_blocker_fail_closed\":true"
                + ",\"raw_bytes_forbidden\":true,\"retired_prose_forbidden\":true"
                + ",\"programming_peer_authority_forbidden\":true,\"r4_dependency\":false"
                + ",\"production_authorized\":false}");
    }
}
