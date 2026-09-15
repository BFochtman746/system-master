package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

/**
 * Transport-neutral contracts shared by the exact Learning/Curriculum inbound
 * handler bindings.
 *
 * <p>These contracts deliberately stop at the LEARNING-owned semantic boundary.
 * CORE remains owner of shared routing/dispatch and generic physical persistence
 * mechanics. A route descriptor therefore names the frozen interface and owner
 * contract without selecting HTTP/JSON/RPC encoding, a database driver, or a
 * global dispatcher implementation.
 */
public final class InboundBindingContracts {
    private InboundBindingContracts() {}

    public enum InterfaceType {
        COMMAND,
        QUERY
    }

    /**
     * Exact current-authority identity for one inbound route plus frozen semantic
     * metadata needed to qualify route parity without selecting a transport.
     */
    public record RouteDescriptor(
            String interfaceId,
            InterfaceType interfaceType,
            String route,
            String ownerPath,
            String capabilityBinding,
            String port,
            String targetComponent,
            String contractIdentity,
            String testObligationId,
            List<String> semanticPayloadFields,
            List<String> typedFailures,
            boolean idempotencyRequired,
            String concurrencyRule) {
        public RouteDescriptor {
            interfaceId = requiredText(interfaceId, "interfaceId");
            interfaceType = Objects.requireNonNull(interfaceType, "interfaceType");
            route = requiredText(route, "route");
            ownerPath = requiredText(ownerPath, "ownerPath");
            capabilityBinding = requiredText(capabilityBinding, "capabilityBinding");
            port = requiredText(port, "port");
            targetComponent = requiredText(targetComponent, "targetComponent");
            contractIdentity = requiredText(contractIdentity, "contractIdentity");
            testObligationId = requiredText(testObligationId, "testObligationId");
            semanticPayloadFields = List.copyOf(Objects.requireNonNull(
                    semanticPayloadFields, "semanticPayloadFields"));
            typedFailures = List.copyOf(Objects.requireNonNull(typedFailures, "typedFailures"));
            concurrencyRule = requiredText(concurrencyRule, "concurrencyRule");
        }
    }

    /**
     * Semantic envelope supplied after transport decoding by the CORE ingress
     * boundary. The payload is a typed command/query object owned by LEARNING.
     */
    public record InboundEnvelope(
            String interfaceId,
            String route,
            String ownerPath,
            String port,
            String principalId,
            boolean authorized,
            Object payload) {}

    @FunctionalInterface
    public interface InboundHandler {
        Object handle(InboundEnvelope envelope) throws Exception;
    }

    /**
     * Implemented by the CORE ingress integration. LEARNING publishes exact route
     * registrations but does not own global lookup/dispatch.
     */
    public interface RegistrationSink {
        void register(RouteDescriptor descriptor, InboundHandler handler);
    }

    public enum HandlerFailureCode {
        AUTHORIZATION_DENIED,
        ROUTE_SCOPE_MISMATCH,
        INVALID_PAYLOAD
    }

    /** Handler-seam failure; domain failures are never translated into this type. */
    public static final class HandlerContractException extends Exception {
        private static final long serialVersionUID = 1L;
        private final HandlerFailureCode code;

        public HandlerContractException(HandlerFailureCode code, String message) {
            super(message);
            this.code = Objects.requireNonNull(code, "code");
        }

        public HandlerFailureCode code() {
            return code;
        }
    }

    /**
     * Fails closed unless interface + route + owner + port + authority all match,
     * then returns the exact typed semantic payload without reinterpretation.
     */
    public static <T> T requirePayload(
            InboundEnvelope envelope,
            RouteDescriptor expected,
            Class<T> payloadType) throws HandlerContractException {
        Objects.requireNonNull(expected, "expected");
        Objects.requireNonNull(payloadType, "payloadType");
        if (envelope == null) {
            throw new HandlerContractException(
                    HandlerFailureCode.INVALID_PAYLOAD, "inbound envelope is required");
        }
        if (!expected.interfaceId().equals(envelope.interfaceId())
                || !expected.route().equals(envelope.route())
                || !expected.ownerPath().equals(envelope.ownerPath())
                || !expected.port().equals(envelope.port())) {
            throw new HandlerContractException(
                    HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                    "route must match exact interface + route + owner + port");
        }
        if (!envelope.authorized()
                || envelope.principalId() == null
                || envelope.principalId().isBlank()) {
            throw new HandlerContractException(
                    HandlerFailureCode.AUTHORIZATION_DENIED,
                    "authorized principal is required before LEARNING execution");
        }
        if (!payloadType.isInstance(envelope.payload())) {
            throw new HandlerContractException(
                    HandlerFailureCode.INVALID_PAYLOAD,
                    expected.interfaceId() + " requires semantic payload " + payloadType.getSimpleName());
        }
        return payloadType.cast(envelope.payload());
    }

    /** Required semantic field guard used by typed command/query records. */
    public static <T> T requiredField(T value, String semanticName) {
        if (value == null) {
            throw new IllegalArgumentException(semanticName + " is required");
        }
        return value;
    }

    private static String requiredText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value;
    }
}
