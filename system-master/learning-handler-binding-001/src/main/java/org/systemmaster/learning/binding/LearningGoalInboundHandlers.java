package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Current-authority Learning-owned inbound binding seam for the first exact
 * LEARNING-63-INBOUND-PRODUCTION-HANDLER-BINDING-001 tranche.
 *
 * <p>This class deliberately does not implement Master Core routing and does not
 * implement physical persistence. It publishes exact Learning route registrations
 * and thin handlers. Master Core owns route lookup/dispatch; the Learning runtime
 * port owns Learning semantics and its DATA/Foundation-backed unit of work.
 */
public final class LearningGoalInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String PORT = "LRN-CMD-PORT-001";
    public static final String TARGET_COMPONENT = "LearningGoalController";

    public static final RouteDescriptor I001 =
            new RouteDescriptor("I001", "CreateLearningGoal", OWNER_PATH, PORT, TARGET_COMPONENT);
    public static final RouteDescriptor I002 =
            new RouteDescriptor("I002", "UpdateLearningGoal", OWNER_PATH, PORT, TARGET_COMPONENT);
    public static final RouteDescriptor I003 =
            new RouteDescriptor("I003", "PauseLearningGoal", OWNER_PATH, PORT, TARGET_COMPONENT);
    public static final RouteDescriptor I004 =
            new RouteDescriptor("I004", "ResumeLearningGoal", OWNER_PATH, PORT, TARGET_COMPONENT);

    private static final Set<String> I001_FIELDS = Set.of(
            "client_operation_id", "title", "objective", "horizon", "priority");
    private static final Set<String> I002_FIELDS = Set.of(
            "goal_id", "expected_version", "patch", "client_operation_id");
    private static final Set<String> I003_I004_FIELDS = Set.of(
            "goal_id", "expected_version", "client_operation_id");

    private LearningGoalInboundHandlers() {}

    public record RouteDescriptor(
            String interfaceId,
            String route,
            String ownerPath,
            String port,
            String targetComponent) {
        public RouteDescriptor {
            interfaceId = requiredText(interfaceId, "interfaceId");
            route = requiredText(route, "route");
            ownerPath = requiredText(ownerPath, "ownerPath");
            port = requiredText(port, "port");
            targetComponent = requiredText(targetComponent, "targetComponent");
        }
    }

    /**
     * Transport-neutral envelope supplied by the Master Core ingress adapter.
     * Learning validates exact route scope and authorization before delegation.
     */
    public record CommandEnvelope(
            String interfaceId,
            String ownerPath,
            String port,
            String principalId,
            boolean authorized,
            Map<String, Object> payload) {
        public CommandEnvelope {
            payload = payload == null ? Map.of() : Map.copyOf(payload);
        }
    }

    /** Exact 001C payload names; values remain transport-neutral. */
    public record CreateLearningGoalCommand(
            Object clientOperationId,
            Object title,
            Object objective,
            Object horizon,
            Object priority) {}

    /** Exact 001C payload names; expectedVersion is forwarded without reinterpretation. */
    public record UpdateLearningGoalCommand(
            Object goalId,
            Object expectedVersion,
            Object patch,
            Object clientOperationId) {}

    public record PauseLearningGoalCommand(
            Object goalId,
            Object expectedVersion,
            Object clientOperationId) {}

    public record ResumeLearningGoalCommand(
            Object goalId,
            Object expectedVersion,
            Object clientOperationId) {}

    @FunctionalInterface
    public interface InboundCommandHandler {
        Object handle(CommandEnvelope envelope) throws Exception;
    }

    /**
     * Implemented by Master Core. Learning supplies registrations but never owns
     * route lookup, global dispatch, or shared gateway authority.
     */
    public interface RegistrationSink {
        void register(RouteDescriptor descriptor, InboundCommandHandler handler);
    }

    /**
     * Learning-owned semantic port. A production implementation must execute local
     * mutations through the canonical atomic unit-of-work/idempotency/outbox path.
     * Exceptions thrown by this port are intentionally not translated here, so the
     * declared typed domain failure identity reaches Master Core unchanged.
     */
    public interface LearningGoalControllerPort {
        Object createLearningGoal(CreateLearningGoalCommand command) throws Exception;
        Object updateLearningGoal(UpdateLearningGoalCommand command) throws Exception;
        Object pauseLearningGoal(PauseLearningGoalCommand command) throws Exception;
        Object resumeLearningGoal(ResumeLearningGoalCommand command) throws Exception;
    }

    public enum HandlerFailureCode {
        AUTHORIZATION_DENIED,
        ROUTE_SCOPE_MISMATCH,
        INVALID_PAYLOAD
    }

    /** Handler-level fail-closed failure; never used to remap a domain failure. */
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
     * Materializes exactly four Learning-owned registrations. Duplicate-route policy
     * remains a Master Core responsibility of the supplied registration sink.
     */
    public static void registerAll(RegistrationSink sink, LearningGoalControllerPort controller) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(controller, "controller");
        sink.register(I001, envelope -> handleCreate(envelope, controller));
        sink.register(I002, envelope -> handleUpdate(envelope, controller));
        sink.register(I003, envelope -> handlePause(envelope, controller));
        sink.register(I004, envelope -> handleResume(envelope, controller));
    }

    private static Object handleCreate(
            CommandEnvelope envelope, LearningGoalControllerPort controller) throws Exception {
        Map<String, Object> p = validatedPayload(envelope, I001, I001_FIELDS);
        return controller.createLearningGoal(new CreateLearningGoalCommand(
                p.get("client_operation_id"),
                p.get("title"),
                p.get("objective"),
                p.get("horizon"),
                p.get("priority")));
    }

    private static Object handleUpdate(
            CommandEnvelope envelope, LearningGoalControllerPort controller) throws Exception {
        Map<String, Object> p = validatedPayload(envelope, I002, I002_FIELDS);
        return controller.updateLearningGoal(new UpdateLearningGoalCommand(
                p.get("goal_id"),
                p.get("expected_version"),
                p.get("patch"),
                p.get("client_operation_id")));
    }

    private static Object handlePause(
            CommandEnvelope envelope, LearningGoalControllerPort controller) throws Exception {
        Map<String, Object> p = validatedPayload(envelope, I003, I003_I004_FIELDS);
        return controller.pauseLearningGoal(new PauseLearningGoalCommand(
                p.get("goal_id"),
                p.get("expected_version"),
                p.get("client_operation_id")));
    }

    private static Object handleResume(
            CommandEnvelope envelope, LearningGoalControllerPort controller) throws Exception {
        Map<String, Object> p = validatedPayload(envelope, I004, I003_I004_FIELDS);
        return controller.resumeLearningGoal(new ResumeLearningGoalCommand(
                p.get("goal_id"),
                p.get("expected_version"),
                p.get("client_operation_id")));
    }

    private static Map<String, Object> validatedPayload(
            CommandEnvelope envelope,
            RouteDescriptor expected,
            Set<String> exactFields) throws HandlerContractException {
        validateEnvelope(envelope, expected);
        Map<String, Object> payload = envelope.payload();
        if (!payload.keySet().equals(exactFields)) {
            throw new HandlerContractException(
                    HandlerFailureCode.INVALID_PAYLOAD,
                    expected.interfaceId() + " requires exact payload fields " + exactFields);
        }
        for (String field : exactFields) {
            if (payload.get(field) == null) {
                throw new HandlerContractException(
                        HandlerFailureCode.INVALID_PAYLOAD,
                        expected.interfaceId() + " requires non-null field " + field);
            }
        }
        return new LinkedHashMap<>(payload);
    }

    private static void validateEnvelope(CommandEnvelope envelope, RouteDescriptor expected)
            throws HandlerContractException {
        if (envelope == null) {
            throw new HandlerContractException(
                    HandlerFailureCode.INVALID_PAYLOAD, "command envelope is required");
        }
        if (!expected.interfaceId().equals(envelope.interfaceId())
                || !expected.ownerPath().equals(envelope.ownerPath())
                || !expected.port().equals(envelope.port())) {
            throw new HandlerContractException(
                    HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                    "route must match exact interface + owner + port");
        }
        if (!envelope.authorized()
                || envelope.principalId() == null
                || envelope.principalId().isBlank()) {
            throw new HandlerContractException(
                    HandlerFailureCode.AUTHORIZATION_DENIED,
                    "authorized principal is required before Learning mutation");
        }
    }

    private static String requiredText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value;
    }
}
