package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.learning.binding.LearningGoalInboundHandlers.CommandEnvelope;
import org.systemmaster.learning.binding.LearningGoalInboundHandlers.HandlerContractException;
import org.systemmaster.learning.binding.LearningGoalInboundHandlers.HandlerFailureCode;
import org.systemmaster.learning.binding.LearningGoalInboundHandlers.InboundCommandHandler;
import org.systemmaster.learning.binding.LearningGoalInboundHandlers.LearningGoalControllerPort;
import org.systemmaster.learning.binding.LearningGoalInboundHandlers.RouteDescriptor;

/**
 * Portable first-tranche qualification for I001-I004.
 *
 * <p>This proves route parity, exact owner/port enforcement, authorization denial,
 * exact payload forwarding, and non-translation of domain failures. It does not
 * claim production UoW/PostgreSQL/Master Core installation; those gates remain open.
 */
public final class LearningGoalInboundHandlerQualificationTest {
    private LearningGoalInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        routeParityIsExactAndComplete();
        unauthorizedAndMismatchedRoutesFailClosedBeforeDelegation();
        exactPayloadsAreForwardedWithoutFieldReinterpretation();
        invalidPayloadFailsClosedBeforeDelegation();
        domainFailureIdentityIsPreserved();
        System.out.println("PASS LearningGoalInboundHandlerQualificationTest I001-I004");
    }

    private static void routeParityIsExactAndComplete() {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        equal(4, sink.handlers.size(), "exact registration count");
        assertRoute(sink, "I001", "CreateLearningGoal");
        assertRoute(sink, "I002", "UpdateLearningGoal");
        assertRoute(sink, "I003", "PauseLearningGoal");
        assertRoute(sink, "I004", "ResumeLearningGoal");
    }

    private static void unauthorizedAndMismatchedRoutesFailClosedBeforeDelegation() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        InboundCommandHandler create = sink.handlers.get("I001");

        expectHandlerFailure(
                HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> create.handle(envelope(
                        "I001",
                        LearningGoalInboundHandlers.OWNER_PATH,
                        LearningGoalInboundHandlers.PORT,
                        false,
                        createPayload())),
                "unauthorized command");
        equal(0, controller.calls, "unauthorized route must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> create.handle(envelope(
                        "I001",
                        "SYSTEM_MASTER/CORE",
                        LearningGoalInboundHandlers.PORT,
                        true,
                        createPayload())),
                "wrong owner");
        equal(0, controller.calls, "wrong-owner route must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> create.handle(envelope(
                        "I001",
                        LearningGoalInboundHandlers.OWNER_PATH,
                        "CUR-CMD-PORT-001",
                        true,
                        createPayload())),
                "wrong port");
        equal(0, controller.calls, "wrong-port route must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> create.handle(envelope(
                        "I002",
                        LearningGoalInboundHandlers.OWNER_PATH,
                        LearningGoalInboundHandlers.PORT,
                        true,
                        createPayload())),
                "wrong interface");
        equal(0, controller.calls, "wrong-interface route must not delegate");
    }

    private static void exactPayloadsAreForwardedWithoutFieldReinterpretation() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);

        Map<String, Object> createPayload = createPayload();
        sink.handlers.get("I001").handle(envelope("I001", true, createPayload));
        equal("create", controller.lastMethod, "I001 method");
        var create = (LearningGoalInboundHandlers.CreateLearningGoalCommand) controller.lastCommand;
        same(createPayload.get("client_operation_id"), create.clientOperationId(), "I001 operation id");
        same(createPayload.get("title"), create.title(), "I001 title");
        same(createPayload.get("objective"), create.objective(), "I001 objective");
        same(createPayload.get("horizon"), create.horizon(), "I001 horizon");
        same(createPayload.get("priority"), create.priority(), "I001 priority");

        Map<String, Object> updatePayload = map(
                "goal_id", "goal-1",
                "expected_version", 7L,
                "patch", Map.of("title", "revised"),
                "client_operation_id", "op-2");
        sink.handlers.get("I002").handle(envelope("I002", true, updatePayload));
        equal("update", controller.lastMethod, "I002 method");
        var update = (LearningGoalInboundHandlers.UpdateLearningGoalCommand) controller.lastCommand;
        same(updatePayload.get("goal_id"), update.goalId(), "I002 goal_id");
        same(updatePayload.get("expected_version"), update.expectedVersion(), "I002 expected_version");
        same(updatePayload.get("patch"), update.patch(), "I002 patch");
        same(updatePayload.get("client_operation_id"), update.clientOperationId(), "I002 operation id");

        Map<String, Object> pausePayload = map(
                "goal_id", "goal-1",
                "expected_version", 8L,
                "client_operation_id", "op-3");
        sink.handlers.get("I003").handle(envelope("I003", true, pausePayload));
        equal("pause", controller.lastMethod, "I003 method");
        var pause = (LearningGoalInboundHandlers.PauseLearningGoalCommand) controller.lastCommand;
        same(pausePayload.get("expected_version"), pause.expectedVersion(), "I003 expected_version");
        same(pausePayload.get("client_operation_id"), pause.clientOperationId(), "I003 operation id");

        Map<String, Object> resumePayload = map(
                "goal_id", "goal-1",
                "expected_version", 9L,
                "client_operation_id", "op-4");
        sink.handlers.get("I004").handle(envelope("I004", true, resumePayload));
        equal("resume", controller.lastMethod, "I004 method");
        var resume = (LearningGoalInboundHandlers.ResumeLearningGoalCommand) controller.lastCommand;
        same(resumePayload.get("expected_version"), resume.expectedVersion(), "I004 expected_version");
        same(resumePayload.get("client_operation_id"), resume.clientOperationId(), "I004 operation id");
    }

    private static void invalidPayloadFailsClosedBeforeDelegation() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        Map<String, Object> missingPriority = new LinkedHashMap<>(createPayload());
        missingPriority.remove("priority");
        expectHandlerFailure(
                HandlerFailureCode.INVALID_PAYLOAD,
                () -> sink.handlers.get("I001").handle(envelope("I001", true, missingPriority)),
                "missing exact field");
        equal(0, controller.calls, "invalid payload must not delegate");

        Map<String, Object> extraField = new LinkedHashMap<>(createPayload());
        extraField.put("silent_extra", "not allowed");
        expectHandlerFailure(
                HandlerFailureCode.INVALID_PAYLOAD,
                () -> sink.handlers.get("I001").handle(envelope("I001", true, extraField)),
                "extra field");
        equal(0, controller.calls, "extra payload field must not delegate");
    }

    private static void domainFailureIdentityIsPreserved() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        SentinelDomainFailure sentinel = new SentinelDomainFailure("VersionConflict");
        controller.failure = sentinel;
        try {
            sink.handlers.get("I002").handle(envelope("I002", true, map(
                    "goal_id", "goal-1",
                    "expected_version", 4L,
                    "patch", Map.of("objective", "x"),
                    "client_operation_id", "op-failure")));
            fail("expected domain failure");
        } catch (SentinelDomainFailure actual) {
            same(sentinel, actual, "domain failure object must be preserved");
        }
    }

    private static RecordingSink registered(RecordingController controller) {
        RecordingSink sink = new RecordingSink();
        LearningGoalInboundHandlers.registerAll(sink, controller);
        return sink;
    }

    private static void assertRoute(RecordingSink sink, String interfaceId, String route) {
        RouteDescriptor descriptor = sink.descriptors.get(interfaceId);
        if (descriptor == null) {
            fail("missing registration " + interfaceId);
        }
        equal(route, descriptor.route(), interfaceId + " route");
        equal(LearningGoalInboundHandlers.OWNER_PATH, descriptor.ownerPath(), interfaceId + " owner");
        equal(LearningGoalInboundHandlers.PORT, descriptor.port(), interfaceId + " port");
        equal(LearningGoalInboundHandlers.TARGET_COMPONENT, descriptor.targetComponent(), interfaceId + " component");
    }

    private static CommandEnvelope envelope(String interfaceId, boolean authorized, Map<String, Object> payload) {
        return envelope(
                interfaceId,
                LearningGoalInboundHandlers.OWNER_PATH,
                LearningGoalInboundHandlers.PORT,
                authorized,
                payload);
    }

    private static CommandEnvelope envelope(
            String interfaceId,
            String owner,
            String port,
            boolean authorized,
            Map<String, Object> payload) {
        return new CommandEnvelope(interfaceId, owner, port, "principal-1", authorized, payload);
    }

    private static Map<String, Object> createPayload() {
        return map(
                "client_operation_id", "op-1",
                "title", "Learn X",
                "objective", "Master X",
                "horizon", "30d",
                "priority", "HIGH");
    }

    private static Map<String, Object> map(Object... entries) {
        if ((entries.length & 1) != 0) {
            throw new IllegalArgumentException("entries must be key/value pairs");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < entries.length; i += 2) {
            result.put((String) entries[i], entries[i + 1]);
        }
        return result;
    }

    private static void expectHandlerFailure(
            HandlerFailureCode code, ThrowingAction action, String label) throws Exception {
        try {
            action.run();
            fail("expected handler failure: " + label);
        } catch (HandlerContractException e) {
            equal(code, e.code(), label + " code");
        }
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) {
            fail(label + ": expected " + expected + " but got " + actual);
        }
    }

    private static void same(Object expected, Object actual, String label) {
        if (expected != actual) {
            fail(label + ": expected identical object");
        }
    }

    private static void fail(String message) {
        throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface ThrowingAction {
        void run() throws Exception;
    }

    private static final class RecordingSink implements LearningGoalInboundHandlers.RegistrationSink {
        private final Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();
        private final Map<String, InboundCommandHandler> handlers = new LinkedHashMap<>();

        @Override
        public void register(RouteDescriptor descriptor, InboundCommandHandler handler) {
            if (descriptors.putIfAbsent(descriptor.interfaceId(), descriptor) != null) {
                fail("duplicate interface registration " + descriptor.interfaceId());
            }
            handlers.put(descriptor.interfaceId(), Objects.requireNonNull(handler, "handler"));
        }
    }

    private static final class RecordingController implements LearningGoalControllerPort {
        private int calls;
        private String lastMethod;
        private Object lastCommand;
        private Exception failure;

        private Object record(String method, Object command) throws Exception {
            calls++;
            lastMethod = method;
            lastCommand = command;
            if (failure != null) {
                throw failure;
            }
            return method + "-ok";
        }

        @Override
        public Object createLearningGoal(LearningGoalInboundHandlers.CreateLearningGoalCommand command) throws Exception {
            return record("create", command);
        }

        @Override
        public Object updateLearningGoal(LearningGoalInboundHandlers.UpdateLearningGoalCommand command) throws Exception {
            return record("update", command);
        }

        @Override
        public Object pauseLearningGoal(LearningGoalInboundHandlers.PauseLearningGoalCommand command) throws Exception {
            return record("pause", command);
        }

        @Override
        public Object resumeLearningGoal(LearningGoalInboundHandlers.ResumeLearningGoalCommand command) throws Exception {
            return record("resume", command);
        }
    }

    private static final class SentinelDomainFailure extends Exception {
        private static final long serialVersionUID = 1L;

        private SentinelDomainFailure(String message) {
            super(message);
        }
    }
}
