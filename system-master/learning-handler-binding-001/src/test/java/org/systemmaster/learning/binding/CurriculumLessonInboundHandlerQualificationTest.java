package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.ActivateCurriculumVersionCommand;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.CourseRefreshServicePort;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.CurriculumCompilerPort;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.CurriculumVersionServicePort;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.LearningIntegrationAdapterPort;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.RequestCourseRefreshCommand;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.RequestCurriculumGenerationCommand;
import org.systemmaster.learning.binding.CurriculumLessonInboundHandlers.StartLessonCommand;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable exact-subject qualification for the I005-I008 local binding seam. */
public final class CurriculumLessonInboundHandlerQualificationTest {
    private CurriculumLessonInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        routeParityAndFrozenMetadataAreExact();
        ownerPortAndAuthorizationMismatchesFailClosed();
        typedSemanticPayloadsAreForwardedWithoutReinterpretation();
        wrongSemanticPayloadTypeFailsClosed();
        requiredSemanticFieldsFailClosedAtConstruction();
        domainFailureIdentityIsPreserved();
        System.out.println("PASS CurriculumLessonInboundHandlerQualificationTest I005-I008");
    }

    private static void routeParityAndFrozenMetadataAreExact() {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        equal(4, sink.handlers.size(), "exact registration count");

        assertRoute(sink, CurriculumLessonInboundHandlers.I005, "RequestCurriculumGeneration", "CUR-CMD-PORT-001", "CurriculumCompiler");
        assertRoute(sink, CurriculumLessonInboundHandlers.I006, "ActivateCurriculumVersion", "CUR-CMD-PORT-001", "CurriculumVersionService");
        assertRoute(sink, CurriculumLessonInboundHandlers.I007, "RequestCourseRefresh", "CUR-CMD-PORT-001", "CourseRefreshService");
        assertRoute(sink, CurriculumLessonInboundHandlers.I008, "StartLesson", "LRN-CMD-PORT-001", "LearningIntegrationAdapter");

        equal(
                java.util.List.of("goal_id", "constraints", "source policy", "accessibility needs", "client_operation_id"),
                CurriculumLessonInboundHandlers.I005.semanticPayloadFields(),
                "I005 frozen payload fields");
        equal(
                java.util.List.of("VersionConflict", "AccessibilityAlternativeMissing", "RightsMetadataMissing", "SourceFreshnessInsufficient"),
                CurriculumLessonInboundHandlers.I006.typedFailures(),
                "I006 typed failures");
        equal("C07 CURRICULUM", CurriculumLessonInboundHandlers.I007.capabilityBinding(), "I007 capability binding");
        equal("C18 LEARNING", CurriculumLessonInboundHandlers.I008.capabilityBinding(), "I008 capability binding");
    }

    private static void ownerPortAndAuthorizationMismatchesFailClosed() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        InboundHandler generation = sink.handlers.get("I005");
        var command = generationCommand();

        expectHandlerFailure(
                HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> generation.handle(envelope(CurriculumLessonInboundHandlers.I005, false, command)),
                "I005 unauthorized");
        equal(0, ports.calls, "unauthorized I005 must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> generation.handle(new InboundEnvelope(
                        "I005",
                        "RequestCurriculumGeneration",
                        "SYSTEM_MASTER/CORE",
                        CurriculumLessonInboundHandlers.CUR_PORT,
                        "principal-1",
                        true,
                        command)),
                "I005 wrong owner");
        equal(0, ports.calls, "wrong-owner I005 must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> generation.handle(new InboundEnvelope(
                        "I005",
                        "RequestCurriculumGeneration",
                        CurriculumLessonInboundHandlers.OWNER_PATH,
                        CurriculumLessonInboundHandlers.LRN_PORT,
                        "principal-1",
                        true,
                        command)),
                "I005 wrong port");
        equal(0, ports.calls, "wrong-port I005 must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> sink.handlers.get("I008").handle(new InboundEnvelope(
                        "I008",
                        "RequestCurriculumGeneration",
                        CurriculumLessonInboundHandlers.OWNER_PATH,
                        CurriculumLessonInboundHandlers.LRN_PORT,
                        "principal-1",
                        true,
                        startLessonCommand())),
                "I008 wrong route");
        equal(0, ports.calls, "wrong-route I008 must not delegate");
    }

    private static void typedSemanticPayloadsAreForwardedWithoutReinterpretation() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);

        var generation = generationCommand();
        sink.handlers.get("I005").handle(envelope(CurriculumLessonInboundHandlers.I005, true, generation));
        same(generation, ports.lastCommand, "I005 semantic command identity");
        equal("generate", ports.lastMethod, "I005 method");

        var activate = new ActivateCurriculumVersionCommand("cur-1", 3L, 9L, "op-6");
        sink.handlers.get("I006").handle(envelope(CurriculumLessonInboundHandlers.I006, true, activate));
        same(activate, ports.lastCommand, "I006 semantic command identity");
        equal("activate", ports.lastMethod, "I006 method");

        var refresh = new RequestCourseRefreshCommand("cur-1", "freshness", "strict", "op-7");
        sink.handlers.get("I007").handle(envelope(CurriculumLessonInboundHandlers.I007, true, refresh));
        same(refresh, ports.lastCommand, "I007 semantic command identity");
        equal("refresh", ports.lastMethod, "I007 method");

        var lesson = startLessonCommand();
        sink.handlers.get("I008").handle(envelope(CurriculumLessonInboundHandlers.I008, true, lesson));
        same(lesson, ports.lastCommand, "I008 semantic command identity");
        equal("startLesson", ports.lastMethod, "I008 method");
    }

    private static void wrongSemanticPayloadTypeFailsClosed() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        expectHandlerFailure(
                HandlerFailureCode.INVALID_PAYLOAD,
                () -> sink.handlers.get("I006").handle(
                        envelope(CurriculumLessonInboundHandlers.I006, true, generationCommand())),
                "I006 wrong semantic payload type");
        equal(0, ports.calls, "wrong I006 payload must not delegate");
    }

    private static void requiredSemanticFieldsFailClosedAtConstruction() {
        try {
            new RequestCurriculumGenerationCommand("goal-1", Map.of(), null, Map.of(), "op");
            fail("expected required source policy failure");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("source policy")) {
                fail("required-field failure did not identify source policy");
            }
        }
    }

    private static void domainFailureIdentityIsPreserved() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        SentinelDomainFailure sentinel = new SentinelDomainFailure("SourceFreshnessInsufficient");
        ports.failure = sentinel;
        var refresh = new RequestCourseRefreshCommand("cur-1", "stale", "strict", "op-failure");
        try {
            sink.handlers.get("I007").handle(envelope(CurriculumLessonInboundHandlers.I007, true, refresh));
            fail("expected domain failure");
        } catch (SentinelDomainFailure actual) {
            same(sentinel, actual, "domain failure object must be preserved");
        }
    }

    private static RequestCurriculumGenerationCommand generationCommand() {
        return new RequestCurriculumGenerationCommand(
                "goal-1",
                Map.of("pace", "self-directed"),
                "strict",
                Map.of("captions", true),
                "op-5");
    }

    private static StartLessonCommand startLessonCommand() {
        return new StartLessonCommand("lesson-1", 2L, "op-8");
    }

    private static RecordingSink registered(RecordingPorts ports) {
        RecordingSink sink = new RecordingSink();
        CurriculumLessonInboundHandlers.registerAll(sink, ports, ports, ports, ports);
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

    private static void assertRoute(
            RecordingSink sink,
            RouteDescriptor expected,
            String route,
            String port,
            String component) {
        RouteDescriptor actual = sink.descriptors.get(expected.interfaceId());
        if (actual == null) {
            fail("missing registration " + expected.interfaceId());
        }
        equal(route, actual.route(), expected.interfaceId() + " route");
        equal(CurriculumLessonInboundHandlers.OWNER_PATH, actual.ownerPath(), expected.interfaceId() + " owner");
        equal(port, actual.port(), expected.interfaceId() + " port");
        equal(component, actual.targetComponent(), expected.interfaceId() + " component");
        equal(
                "MASTER_CORE_ROUTE_MANIFEST_001::" + expected.interfaceId(),
                actual.contractIdentity(),
                expected.interfaceId() + " contract identity");
        equal("QO-IF-" + expected.interfaceId(), actual.testObligationId(), expected.interfaceId() + " test obligation");
        if (!actual.idempotencyRequired()) {
            fail(expected.interfaceId() + " must preserve required idempotency metadata");
        }
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

    private static final class RecordingPorts implements
            CurriculumCompilerPort,
            CurriculumVersionServicePort,
            CourseRefreshServicePort,
            LearningIntegrationAdapterPort {
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
        public Object requestCurriculumGeneration(RequestCurriculumGenerationCommand command) throws Exception {
            return record("generate", command);
        }

        @Override
        public Object activateCurriculumVersion(ActivateCurriculumVersionCommand command) throws Exception {
            return record("activate", command);
        }

        @Override
        public Object requestCourseRefresh(RequestCourseRefreshCommand command) throws Exception {
            return record("refresh", command);
        }

        @Override
        public Object startLesson(StartLessonCommand command) throws Exception {
            return record("startLesson", command);
        }
    }

    private static final class SentinelDomainFailure extends Exception {
        private static final long serialVersionUID = 1L;

        private SentinelDomainFailure(String message) {
            super(message);
        }
    }
}
