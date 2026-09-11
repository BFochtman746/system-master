package org.systemmaster.integration.documents;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;

/**
 * System Master integration adapter for the Documents-owned reference-only service contract.
 *
 * This adapter coordinates request/response/event transport only. DOCUMENTS remains the
 * semantic owner of document mechanics and System Master never receives raw document,
 * manuscript, learner, or programming-source bytes through this seam.
 */
public final class DocumentsServiceAdapter {
    public static final String SERVICE_OWNER_SYSTEM_ID = "DOCUMENTS";
    public static final int SCHEMA_VERSION = 1;

    private static final Set<String> ACTIVE_CALLERS = Set.of(
            "SYSTEM_MASTER", "CORE", "LEARNING", "BOOK", "DOCUMENTS");
    private static final Set<String> FORBIDDEN_OPTION_FIELDS = Set.of(
            "raw_bytes", "content_bytes", "payload_base64", "manuscript_text",
            "canonical_manuscript_state", "story_bible_state", "learner_state",
            "programming_source_bytes");

    public enum Operation {
        INTAKE, INSPECT_STRUCTURE, CONVERT, PRESERVE, RENDER, EXPORT, ARTIFACT_HANDOFF
    }

    public enum Status { ACCEPTED, SUCCEEDED, FAILED, BLOCKED }

    public enum EventType {
        DOCUMENT_SERVICE_ACCEPTED,
        DOCUMENT_SERVICE_SUCCEEDED,
        DOCUMENT_SERVICE_FAILED,
        DOCUMENT_SERVICE_BLOCKED
    }

    public record ArtifactRef(String artifactId, String digestSha256) {
        public ArtifactRef {
            required(artifactId, "artifactId");
            checkDigest(digestSha256, "digestSha256");
        }
    }

    public record ServiceError(String code, String errorClass, boolean retryable) {
        public ServiceError {
            required(code, "code");
            required(errorClass, "errorClass");
        }
    }

    public record Request(
            int schemaVersion,
            String requestId,
            Operation operation,
            ArtifactRef inputArtifact,
            String targetFormat,
            Map<String, String> options,
            String idempotencyKey,
            String correlationId,
            String callerSystemId) {
        public Request {
            if (schemaVersion != SCHEMA_VERSION) throw new IllegalArgumentException("schemaVersion");
            required(requestId, "requestId");
            Objects.requireNonNull(operation, "operation");
            Objects.requireNonNull(inputArtifact, "inputArtifact");
            required(idempotencyKey, "idempotencyKey");
            required(correlationId, "correlationId");
            required(callerSystemId, "callerSystemId");
            if (!ACTIVE_CALLERS.contains(callerSystemId)) {
                throw new IllegalArgumentException("callerSystemId_not_current_active_system");
            }
            TreeMap<String, String> normalized = new TreeMap<>();
            if (options != null) {
                for (Map.Entry<String, String> entry : options.entrySet()) {
                    required(entry.getKey(), "optionKey");
                    if (FORBIDDEN_OPTION_FIELDS.contains(entry.getKey())) {
                        throw new IllegalArgumentException("FORBIDDEN_FIELD:options." + entry.getKey());
                    }
                    if (entry.getValue() == null) throw new IllegalArgumentException("optionValue");
                    normalized.put(entry.getKey(), entry.getValue());
                }
            }
            options = Map.copyOf(normalized);
        }

        public String semanticDigest() {
            StringBuilder b = new StringBuilder();
            b.append(schemaVersion).append('|')
                    .append(operation).append('|')
                    .append(inputArtifact.artifactId()).append('|')
                    .append(inputArtifact.digestSha256()).append('|')
                    .append(String.valueOf(targetFormat)).append('|')
                    .append(idempotencyKey).append('|')
                    .append(callerSystemId);
            new TreeMap<>(options).forEach((k, v) -> b.append('|').append(k).append('=').append(v));
            return sha256(b.toString());
        }
    }

    public record Response(
            int schemaVersion,
            String requestId,
            String correlationId,
            Status status,
            List<ArtifactRef> outputArtifacts,
            ServiceError error,
            List<String> evidenceRefs) {
        public Response {
            if (schemaVersion != SCHEMA_VERSION) throw new IllegalArgumentException("schemaVersion");
            required(requestId, "requestId");
            required(correlationId, "correlationId");
            Objects.requireNonNull(status, "status");
            outputArtifacts = outputArtifacts == null ? List.of() : List.copyOf(outputArtifacts);
            evidenceRefs = evidenceRefs == null ? List.of() : List.copyOf(evidenceRefs);
            for (String ref : evidenceRefs) required(ref, "evidenceRef");
            if (status == Status.SUCCEEDED && outputArtifacts.isEmpty()) {
                throw new IllegalArgumentException("success_requires_output_artifact");
            }
            if ((status == Status.FAILED || status == Status.BLOCKED) && error == null) {
                throw new IllegalArgumentException("failed_or_blocked_requires_error");
            }
            if ((status == Status.ACCEPTED || status == Status.SUCCEEDED) && error != null) {
                throw new IllegalArgumentException("non_failure_must_not_carry_error");
            }
        }
    }

    public record Event(
            int schemaVersion,
            String eventId,
            EventType eventType,
            String requestId,
            String correlationId,
            int sequence,
            List<String> evidenceRefs) {
        public Event {
            if (schemaVersion != SCHEMA_VERSION) throw new IllegalArgumentException("schemaVersion");
            required(eventId, "eventId");
            Objects.requireNonNull(eventType, "eventType");
            required(requestId, "requestId");
            required(correlationId, "correlationId");
            if (sequence < 1) throw new IllegalArgumentException("sequence");
            evidenceRefs = evidenceRefs == null ? List.of() : List.copyOf(evidenceRefs);
        }
    }

    public record Invocation(
            String serviceOwnerSystemId,
            String semanticRequestDigest,
            boolean replay,
            boolean productionAuthorized,
            Response response,
            List<Event> events) {
        public Invocation {
            if (!SERVICE_OWNER_SYSTEM_ID.equals(serviceOwnerSystemId)) {
                throw new IllegalArgumentException("service_owner_must_remain_documents");
            }
            checkDigest(semanticRequestDigest, "semanticRequestDigest");
            if (productionAuthorized) throw new IllegalArgumentException("production_authority_not_granted");
            Objects.requireNonNull(response, "response");
            events = List.copyOf(events);
        }
    }

    public interface DocumentsServicePort {
        Response execute(Request request);
    }

    private record Outcome(Status status, List<ArtifactRef> outputs, ServiceError error, List<String> evidenceRefs) {}

    private final DocumentsServicePort port;
    private final Map<String, String> semanticDigestsByIdempotencyKey = new HashMap<>();
    private final Map<String, Outcome> outcomesByIdempotencyKey = new HashMap<>();

    public DocumentsServiceAdapter(DocumentsServicePort port) {
        this.port = Objects.requireNonNull(port, "port");
    }

    public synchronized Invocation invoke(Request request) {
        Objects.requireNonNull(request, "request");
        String semanticDigest = request.semanticDigest();
        String priorDigest = semanticDigestsByIdempotencyKey.get(request.idempotencyKey());
        if (priorDigest != null && !priorDigest.equals(semanticDigest)) {
            throw new IllegalStateException("IDEMPOTENCY_CONFLICT");
        }

        Outcome outcome = outcomesByIdempotencyKey.get(request.idempotencyKey());
        boolean replay = outcome != null;
        if (!replay) {
            semanticDigestsByIdempotencyKey.put(request.idempotencyKey(), semanticDigest);
            Response serviceResponse;
            try {
                serviceResponse = port.execute(request);
                validateResponseBinding(serviceResponse, request);
            } catch (RuntimeException failure) {
                serviceResponse = blocked(
                        request,
                        "DOCUMENTS_SERVICE_PROTOCOL_OR_TRANSPORT_FAILURE",
                        "DOCUMENTS_ADAPTER_BOUNDARY",
                        true,
                        List.of("evidence://documents-adapter/fail-closed/" + semanticDigest));
            }
            outcome = new Outcome(
                    serviceResponse.status(),
                    serviceResponse.outputArtifacts(),
                    serviceResponse.error(),
                    serviceResponse.evidenceRefs());
            outcomesByIdempotencyKey.put(request.idempotencyKey(), outcome);
        }

        Response response = new Response(
                SCHEMA_VERSION,
                request.requestId(),
                request.correlationId(),
                outcome.status(),
                outcome.outputs(),
                outcome.error(),
                outcome.evidenceRefs());
        List<Event> events = eventsFor(request, response);
        return new Invocation(
                SERVICE_OWNER_SYSTEM_ID,
                semanticDigest,
                replay,
                false,
                response,
                events);
    }

    private static void validateResponseBinding(Response response, Request request) {
        Objects.requireNonNull(response, "response");
        if (!request.requestId().equals(response.requestId())) {
            throw new IllegalStateException("DOCUMENTS_RESPONSE_REQUEST_ID_MISMATCH");
        }
        if (!request.correlationId().equals(response.correlationId())) {
            throw new IllegalStateException("DOCUMENTS_RESPONSE_CORRELATION_ID_MISMATCH");
        }
    }

    private static Response blocked(
            Request request,
            String code,
            String errorClass,
            boolean retryable,
            List<String> evidenceRefs) {
        return new Response(
                SCHEMA_VERSION,
                request.requestId(),
                request.correlationId(),
                Status.BLOCKED,
                List.of(),
                new ServiceError(code, errorClass, retryable),
                evidenceRefs);
    }

    private static List<Event> eventsFor(Request request, Response response) {
        List<Event> events = new ArrayList<>();
        events.add(event(request, EventType.DOCUMENT_SERVICE_ACCEPTED, 1, List.of()));
        if (response.status() == Status.ACCEPTED) return List.copyOf(events);
        EventType terminal = switch (response.status()) {
            case SUCCEEDED -> EventType.DOCUMENT_SERVICE_SUCCEEDED;
            case FAILED -> EventType.DOCUMENT_SERVICE_FAILED;
            case BLOCKED -> EventType.DOCUMENT_SERVICE_BLOCKED;
            case ACCEPTED -> throw new IllegalStateException("unreachable");
        };
        events.add(event(request, terminal, 2, response.evidenceRefs()));
        return List.copyOf(events);
    }

    private static Event event(Request request, EventType type, int sequence, List<String> evidenceRefs) {
        String eventId = "evt-" + sha256(request.requestId() + "|" + request.correlationId() + "|" + type + "|" + sequence).substring(0, 24);
        return new Event(SCHEMA_VERSION, eventId, type, request.requestId(), request.correlationId(), sequence, evidenceRefs);
    }

    private static void required(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name);
    }

    private static void checkDigest(String value, String name) {
        required(value, name);
        if (!value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + "_sha256");
    }

    public static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
