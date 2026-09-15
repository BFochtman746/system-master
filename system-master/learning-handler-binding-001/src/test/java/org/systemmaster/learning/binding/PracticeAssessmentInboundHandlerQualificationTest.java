package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.AssessmentAttemptServicePort;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.CreateRemediationNeedCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.InvalidateAssessmentAttemptCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.LearnerSelfAssessmentServicePort;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.LearningIntegrationAdapterPort;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.PracticeAttemptServicePort;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.RecordPracticeResponseCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.RemediationNeedServicePort;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.RequestHintCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.SaveAssessmentResponseCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.StartAssessmentAttemptCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.SubmitAssessmentAttemptCommand;
import org.systemmaster.learning.binding.PracticeAssessmentInboundHandlers.SubmitSelfConfidenceCommand;

/** Portable exact-subject qualification for the I009-I016-L local binding seam. */
public final class PracticeAssessmentInboundHandlerQualificationTest {
    private PracticeAssessmentInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        routeParityAndFrozenMetadataAreExact();
        ownerPortRouteAndAuthorizationMismatchesFailClosed();
        typedSemanticPayloadsAreForwardedWithoutReinterpretation();
        wrongSemanticPayloadTypeFailsClosed();
        requiredSemanticFieldsFailClosedAtConstruction();
        domainFailureIdentityIsPreserved();
        System.out.println("PASS PracticeAssessmentInboundHandlerQualificationTest I009-I016-L");
    }

    private static void routeParityAndFrozenMetadataAreExact() {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        equal(8, sink.handlers.size(), "exact registration count");

        assertRoute(sink, PracticeAssessmentInboundHandlers.I009, "RecordPracticeResponse", "PracticeAttemptService");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I010, "RequestHint", "PracticeAttemptService");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I011, "SubmitSelfConfidence", "LearnerSelfAssessmentService");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I012, "StartAssessmentAttempt", "AssessmentAttemptService");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I013, "SaveAssessmentResponse", "LearningIntegrationAdapter");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I014, "SubmitAssessmentAttempt", "AssessmentAttemptService");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I015, "InvalidateAssessmentAttempt", "AssessmentAttemptService");
        assertRoute(sink, PracticeAssessmentInboundHandlers.I016_L, "CreateRemediationNeed", "RemediationNeedService");

        equal(
                List.of("DuplicateOperationConflict", "VersionConflict", "AssessmentIntegrityUnknown", "InvalidState"),
                PracticeAssessmentInboundHandlers.I014.typedFailures(),
                "I014 typed failures");
        equal(
                List.of(
                        "goal_id",
                        "learner_ref",
                        "skill_or_criterion_refs",
                        "evidence_refs",
                        "diagnosis_reason_codes",
                        "client_operation_id"),
                PracticeAssessmentInboundHandlers.I016_L.semanticPayloadFields(),
                "I016-L frozen 001C payload fields");
        equal(
                List.of(
                        "InsufficientEvidence",
                        "VersionConflict",
                        "DuplicateOperationConflict",
                        "DependencyUnavailable"),
                PracticeAssessmentInboundHandlers.I016_L.typedFailures(),
                "I016-L frozen 001C typed failures");
    }

    private static void ownerPortRouteAndAuthorizationMismatchesFailClosed() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        InboundHandler practice = sink.handlers.get("I009");
        var practiceCommand = practiceCommand();

        expectHandlerFailure(
                HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> practice.handle(envelope(PracticeAssessmentInboundHandlers.I009, false, practiceCommand)),
                "I009 unauthorized");
        equal(0, ports.calls, "unauthorized I009 must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> practice.handle(new InboundEnvelope(
                        "I009",
                        "RecordPracticeResponse",
                        "SYSTEM_MASTER/CORE",
                        PracticeAssessmentInboundHandlers.PORT,
                        "principal-1",
                        true,
                        practiceCommand)),
                "I009 wrong owner");
        equal(0, ports.calls, "wrong-owner I009 must not delegate");

        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> practice.handle(new InboundEnvelope(
                        "I009",
                        "RecordPracticeResponse",
                        PracticeAssessmentInboundHandlers.OWNER_PATH,
                        "CUR-CMD-PORT-001",
                        "principal-1",
                        true,
                        practiceCommand)),
                "I009 wrong port");
        equal(0, ports.calls, "wrong-port I009 must not delegate");

        var remediation = remediationCommand();
        expectHandlerFailure(
                HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> sink.handlers.get("I016-L").handle(new InboundEnvelope(
                        "I016-L",
                        "RequestRemediationPlan",
                        PracticeAssessmentInboundHandlers.OWNER_PATH,
                        PracticeAssessmentInboundHandlers.PORT,
                        "principal-1",
                        true,
                        remediation)),
                "I016-L wrong route");
        equal(0, ports.calls, "wrong-route I016-L must not delegate");
    }

    private static void typedSemanticPayloadsAreForwardedWithoutReinterpretation() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);

        var practice = practiceCommand();
        sink.handlers.get("I009").handle(envelope(PracticeAssessmentInboundHandlers.I009, true, practice));
        same(practice, ports.lastCommand, "I009 semantic command identity");
        equal("recordPracticeResponse", ports.lastMethod, "I009 method");

        var hint = new RequestHintCommand("attempt-1", "item-1", 2, "op-10");
        sink.handlers.get("I010").handle(envelope(PracticeAssessmentInboundHandlers.I010, true, hint));
        same(hint, ports.lastCommand, "I010 semantic command identity");
        equal("requestHint", ports.lastMethod, "I010 method");

        var confidence = new SubmitSelfConfidenceCommand("skill-1", 4, "op-11");
        sink.handlers.get("I011").handle(envelope(PracticeAssessmentInboundHandlers.I011, true, confidence));
        same(confidence, ports.lastCommand, "I011 semantic command identity");
        equal("submitSelfConfidence", ports.lastMethod, "I011 method");

        var start = new StartAssessmentAttemptCommand(
                "assessment-1", 3L, "FORMATIVE", Map.of("captions", true), "op-12");
        sink.handlers.get("I012").handle(envelope(PracticeAssessmentInboundHandlers.I012, true, start));
        same(start, ports.lastCommand, "I012 semantic command identity");
        equal("startAssessmentAttempt", ports.lastMethod, "I012 method");

        var save = new SaveAssessmentResponseCommand("attempt-2", 5L, "item-9", "answer", "op-13");
        sink.handlers.get("I013").handle(envelope(PracticeAssessmentInboundHandlers.I013, true, save));
        same(save, ports.lastCommand, "I013 semantic command identity");
        equal("saveAssessmentResponse", ports.lastMethod, "I013 method");

        var submit = new SubmitAssessmentAttemptCommand("attempt-2", 6L, "op-14");
        sink.handlers.get("I014").handle(envelope(PracticeAssessmentInboundHandlers.I014, true, submit));
        same(submit, ports.lastCommand, "I014 semantic command identity");
        equal("submitAssessmentAttempt", ports.lastMethod, "I014 method");

        var invalidate = new InvalidateAssessmentAttemptCommand(
                "attempt-3", "INTEGRITY", List.of("evidence-1"), "op-15");
        sink.handlers.get("I015").handle(envelope(PracticeAssessmentInboundHandlers.I015, true, invalidate));
        same(invalidate, ports.lastCommand, "I015 semantic command identity");
        equal("invalidateAssessmentAttempt", ports.lastMethod, "I015 method");

        var remediation = remediationCommand();
        sink.handlers.get("I016-L").handle(envelope(PracticeAssessmentInboundHandlers.I016_L, true, remediation));
        same(remediation, ports.lastCommand, "I016-L semantic command identity");
        equal("createRemediationNeed", ports.lastMethod, "I016-L method");
    }

    private static void wrongSemanticPayloadTypeFailsClosed() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        expectHandlerFailure(
                HandlerFailureCode.INVALID_PAYLOAD,
                () -> sink.handlers.get("I014").handle(
                        envelope(PracticeAssessmentInboundHandlers.I014, true, practiceCommand())),
                "I014 wrong semantic payload type");
        equal(0, ports.calls, "wrong I014 payload must not delegate");
    }

    private static void requiredSemanticFieldsFailClosedAtConstruction() {
        try {
            new CreateRemediationNeedCommand(
                    "goal-1",
                    null,
                    List.of("criterion-1"),
                    List.of("evidence-1"),
                    List.of("weak-evidence"),
                    "op-16");
            fail("expected required learner_ref failure");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("learner_ref")) {
                fail("required-field failure did not identify learner_ref");
            }
        }

        try {
            new CreateRemediationNeedCommand(
                    "goal-1",
                    "learner-1",
                    List.of("criterion-1"),
                    List.of("evidence-1"),
                    null,
                    "op-16");
            fail("expected required diagnosis_reason_codes failure");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("diagnosis_reason_codes")) {
                fail("required-field failure did not identify diagnosis_reason_codes");
            }
        }
    }

    private static void domainFailureIdentityIsPreserved() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        SentinelDomainFailure sentinel = new SentinelDomainFailure("AssessmentIntegrityUnknown");
        ports.failure = sentinel;
        var submit = new SubmitAssessmentAttemptCommand("attempt-2", 6L, "op-failure");
        try {
            sink.handlers.get("I014").handle(envelope(PracticeAssessmentInboundHandlers.I014, true, submit));
            fail("expected domain failure");
        } catch (SentinelDomainFailure actual) {
            same(sentinel, actual, "domain failure object must be preserved");
        }
    }

    private static RecordPracticeResponseCommand practiceCommand() {
        return new RecordPracticeResponseCommand(
                "attempt-1", 2L, "answer", Map.of("hint_count", 0), "2026-09-14T17:00:00Z", "op-9");
    }

    private static CreateRemediationNeedCommand remediationCommand() {
        return new CreateRemediationNeedCommand(
                "goal-1",
                "learner-1",
                List.of("criterion-1"),
                List.of("evidence-1"),
                List.of("weak-evidence"),
                "op-16");
    }

    private static RecordingSink registered(RecordingPorts ports) {
        RecordingSink sink = new RecordingSink();
        PracticeAssessmentInboundHandlers.registerAll(sink, ports, ports, ports, ports, ports);
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
            String component) {
        RouteDescriptor actual = sink.descriptors.get(expected.interfaceId());
        if (actual == null) {
            fail("missing registration " + expected.interfaceId());
        }
        equal(route, actual.route(), expected.interfaceId() + " route");
        equal(PracticeAssessmentInboundHandlers.OWNER_PATH, actual.ownerPath(), expected.interfaceId() + " owner");
        equal(PracticeAssessmentInboundHandlers.CAPABILITY_BINDING, actual.capabilityBinding(), expected.interfaceId() + " capability");
        equal(PracticeAssessmentInboundHandlers.PORT, actual.port(), expected.interfaceId() + " port");
        equal(component, actual.targetComponent(), expected.interfaceId() + " component");
        equal(
                "MASTER_CORE_ROUTE_MANIFEST_001::" + expected.interfaceId(),
                actual.contractIdentity(),
                expected.interfaceId() + " contract identity");
        equal(
                "QO-IF-" + expected.interfaceId(),
                actual.testObligationId(),
                expected.interfaceId() + " test obligation");
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
            PracticeAttemptServicePort,
            LearnerSelfAssessmentServicePort,
            AssessmentAttemptServicePort,
            LearningIntegrationAdapterPort,
            RemediationNeedServicePort {
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
        public Object recordPracticeResponse(RecordPracticeResponseCommand command) throws Exception {
            return record("recordPracticeResponse", command);
        }

        @Override
        public Object requestHint(RequestHintCommand command) throws Exception {
            return record("requestHint", command);
        }

        @Override
        public Object submitSelfConfidence(SubmitSelfConfidenceCommand command) throws Exception {
            return record("submitSelfConfidence", command);
        }

        @Override
        public Object startAssessmentAttempt(StartAssessmentAttemptCommand command) throws Exception {
            return record("startAssessmentAttempt", command);
        }

        @Override
        public Object submitAssessmentAttempt(SubmitAssessmentAttemptCommand command) throws Exception {
            return record("submitAssessmentAttempt", command);
        }

        @Override
        public Object invalidateAssessmentAttempt(InvalidateAssessmentAttemptCommand command) throws Exception {
            return record("invalidateAssessmentAttempt", command);
        }

        @Override
        public Object saveAssessmentResponse(SaveAssessmentResponseCommand command) throws Exception {
            return record("saveAssessmentResponse", command);
        }

        @Override
        public Object createRemediationNeed(CreateRemediationNeedCommand command) throws Exception {
            return record("createRemediationNeed", command);
        }
    }

    private static final class SentinelDomainFailure extends Exception {
        private static final long serialVersionUID = 1L;

        private SentinelDomainFailure(String message) {
            super(message);
        }
    }
}
