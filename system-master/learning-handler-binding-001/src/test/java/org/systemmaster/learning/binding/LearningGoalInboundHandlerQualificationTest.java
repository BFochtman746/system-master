package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;
import org.systemmaster.learning.binding.LearningGoalInboundHandlers.LearningGoalControllerPort;

/** Portable exact-subject qualification for the I001-I004 local binding seam. */
public final class LearningGoalInboundHandlerQualificationTest {
    private LearningGoalInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        routeParityAndFrozenMetadataAreExact();
        unauthorizedAndMismatchedRoutesFailClosedBeforeDelegation();
        typedSemanticPayloadIsForwardedWithoutReinterpretation();
        wrongSemanticPayloadTypeFailsClosed();
        requiredSemanticFieldsFailClosedAtConstruction();
        domainFailureIdentityIsPreserved();
        System.out.println("PASS LearningGoalInboundHandlerQualificationTest I001-I004");
    }

    private static void routeParityAndFrozenMetadataAreExact() {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        equal(4, sink.handlers.size(), "exact registration count");
        assertRoute(sink, LearningGoalInboundHandlers.I001, "CreateLearningGoal");
        assertRoute(sink, LearningGoalInboundHandlers.I002, "UpdateLearningGoal");
        assertRoute(sink, LearningGoalInboundHandlers.I003, "PauseLearningGoal");
        assertRoute(sink, LearningGoalInboundHandlers.I004, "ResumeLearningGoal");
        equal(
                java.util.List.of("client_operation_id", "title", "objective", "horizon", "priority"),
                LearningGoalInboundHandlers.I001.semanticPayloadFields(),
                "I001 frozen payload fields");
        equal(
                java.util.List.of("VersionConflict", "ValidationError"),
                LearningGoalInboundHandlers.I002.typedFailures(),
                "I002 typed failures");
    }

    private static void unauthorizedAndMismatchedRoutesFailClosedBeforeDelegation() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        InboundHandler create = sink.handlers.get("I001");
        var command = createCommand();

        expectHandlerFailure(
                HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> create.handle(envelope(LearningGoalInboundHandlers.I001, false, command)),
                "unauthorized command");
        equal(0, controller.calls, "unauthorized route must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> create.handle(new InboundEnvelope(
                        "I001",
                        "CreateLearningGoal",
                        "SYSTEM_MASTER/CORE",
                        LearningGoalInboundHandlers.PORT,
                        "principal-1",
                        true,
                        command)),
                "wrong owner");
        equal(0, controller.calls, "wrong-owner route must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> create.handle(new InboundEnvelope(
                        "I001",
                        "WrongRoute",
                        LearningGoalInboundHandlers.OWNER_PATH,
                        LearningGoalInboundHandlers.PORT,
                        "principal-1",
                        true,
                        command)),
                "wrong route");
        equal(0, controller.calls, "wrong-route request must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> create.handle(new InboundEnvelope(
                        "I001",
                        "CreateLearningGoal",
                        LearningGoalInboundHandlers.OWNER_PATH,
                        "CUR-CMD-PORT-001",
                        "principal-1",
                        true,
                        command)),
                "wrong port");
        equal(0, controller.calls, "wrong-port route must not delegate");
    }

    private static void typedSemanticPayloadIsForwardedWithoutReinterpretation() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);

        var create = createCommand();
        sink.handlers.get("I001").handle(envelope(LearningGoalInboundHandlers.I001, true, create));
        same(create, controller.lastCommand, "I001 semantic command identity");
        equal("create", controller.lastMethod, "I001 method");

        var update = new LearningGoalInboundHandlers.UpdateLearningGoalCommand(
                "goal-1", 7L, Map.of("title", "revised"), "op-2");
        sink.handlers.get("I002").handle(envelope(LearningGoalInboundHandlers.I002, true, update));
        same(update, controller.lastCommand, "I002 semantic command identity");
        equal("update", controller.lastMethod, "I002 method");

        var pause = new LearningGoalInboundHandlers.PauseLearningGoalCommand("goal-1", 8L, "op-3");
        sink.handlers.get("I003").handle(envelope(LearningGoalInboundHandlers.I003, true, pause));
        same(pause, controller.lastCommand, "I003 semantic command identity");
        equal("pause", controller.lastMethod, "I003 method");

        var resume = new LearningGoalInboundHandlers.ResumeLearningGoalCommand("goal-1", 9L, "op-4");
        sink.handlers.get("I004").handle(envelope(LearningGoalInboundHandlers.I004, true, resume));
        same(resume, controller.lastCommand, "I004 semantic command identity");
        equal("resume", controller.lastMethod, "I004 method");
    }

    private static void wrongSemanticPayloadTypeFailsClosed() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        var wrong = new LearningGoalInboundHandlers.PauseLearningGoalCommand("goal-1", 1L, "op-x");
        expectHandlerFailure(
                HandlerFailureCode.INVALID_PAYLOAD,
                () -> sink.handlers.get("I001").handle(
                        envelope(LearningGoalInboundHandlers.I001, true, wrong)),
                "wrong semantic payload type");
        equal(0, controller.calls, "wrong payload type must not delegate");
    }

    private static void requiredSemanticFieldsFailClosedAtConstruction() {
        try {
            new LearningGoalInboundHandlers.CreateLearningGoalCommand(
                    "op", "title", null, "30d", "HIGH");
            fail("expected required semantic field failure");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("objective")) {
                fail("required-field failure did not identify objective");
            }
        }
    }

    private static void domainFailureIdentityIsPreserved() throws Exception {
        RecordingController controller = new RecordingController();
        RecordingSink sink = registered(controller);
        SentinelDomainFailure sentinel = new SentinelDomainFailure("VersionConflict");
        controller.failure = sentinel;
        var update = new LearningGoalInboundHandlers.UpdateLearningGoalCommand(
                "goal-1", 4L, Map.of("objective", "x"), "op-failure");
        try {
            sink.handlers.get("I002").handle(envelope(LearningGoalInboundHandlers.I002, true, update));
            fail("expected domain failure");
        } catch (SentinelDomainFailure actual) {
            same(sentinel, actual, "domain failure object must be preserved");
        }
    }

    private static LearningGoalInboundHandlers.CreateLearningGoalCommand createCommand() {
        return new LearningGoalInboundHandlers.CreateLearningGoalCommand(
                "op-1", "Learn X", "Master X", "30d", "HIGH");
    }

    private static RecordingSink registered(RecordingController controller) {
        RecordingSink sink = new RecordingSink();
        LearningGoalInboundHandlers.registerAll(sink, controller);
        return sink;
    }

    private static InboundEnvelope envelope(
            RouteDescriptor descriptor, boolean authorized, Object payload) {
        return new InboundEnvelope(
                descriptor.interfaceId(),
                descriptor.route(),
                descriptor.ownerPath(),
                descriptor.port(),
                "principal-1",
                authorized,
                payload);
    }

    private static void assertRoute(RecordingSink sink, RouteDescriptor expected, String route) {
        RouteDescriptor actual = sink.descriptors.get(expected.interfaceId());
        if (actual == null) {
            fail("missing registration " + expected.interfaceId());
        }
        equal(route, actual.route(), expected.interfaceId() + " route");
        equal(LearningGoalInboundHandlers.OWNER_PATH, actual.ownerPath(), expected.interfaceId() + " owner");
        equal(LearningGoalInboundHandlers.PORT, actual.port(), expected.interfaceId() + " port");
        equal(LearningGoalInboundHandlers.TARGET_COMPONENT, actual.targetComponent(), expected.interfaceId() + " component");
        equal(
                "MASTER_CORE_ROUTE_MANIFEST_001::" + expected.interfaceId(),
                actual.contractIdentity(),
                expected.interfaceId() + " contract identity");
        equal("QO-IF-" + expected.interfaceId(), actual.testObligationId(), expected.interfaceId() + " test obligation");
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

    private static final class RecordingSink implements RegistrationSink {
        private final Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();
        private final Map<String, InboundHandler> handlers = new LinkedHashMap<>();

        @Override
        public void register(RouteDescriptor descriptor, InboundHandler handler) {
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
