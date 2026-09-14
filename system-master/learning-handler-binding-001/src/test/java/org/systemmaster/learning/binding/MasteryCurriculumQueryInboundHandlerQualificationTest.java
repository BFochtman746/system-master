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
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.AdaptiveDecisionQueryPort;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.AssessmentAttemptQueryPort;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.CourseRefreshQueryPort;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.CurriculumCompilerQueryPort;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.ExplainMasteryQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.GetAssessmentAttemptQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.GetCourseFreshnessQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.GetCurriculumQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.GetMaintenanceQueueQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.GetNextActionQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.GetSkillMasteryQuery;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.MaintenanceQueryPort;
import org.systemmaster.learning.binding.MasteryCurriculumQueryInboundHandlers.MasteryProjectionServicePort;

/** Portable exact-subject qualification for local read-only query seams I024-I030. */
public final class MasteryCurriculumQueryInboundHandlerQualificationTest {
    private MasteryCurriculumQueryInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        exactSevenLocalQueriesAreRegistered();
        i031CoreJobProjectionIsNotRegisteredLocally();
        readOnlyAndFrozenMetadataAreExact();
        ownerPortAndAuthorizationMismatchesFailClosed();
        typedQueriesForwardWithoutReinterpretation();
        optionalFieldsRemainOptionalAndRequiredFieldsFailClosed();
        wrongPayloadTypeFailsClosed();
        domainFailureIdentityIsPreserved();
        System.out.println("PASS MasteryCurriculumQueryInboundHandlerQualificationTest I024-I030");
    }

    private static void exactSevenLocalQueriesAreRegistered() {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        equal(7, sink.handlers.size(), "exact local query registration count");
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I024, "GetSkillMastery", "MasteryProjectionService", MasteryCurriculumQueryInboundHandlers.LRN_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.LEARNING_BINDING);
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I025, "ExplainMastery", "MasteryProjectionService", MasteryCurriculumQueryInboundHandlers.LRN_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.LEARNING_BINDING);
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I026, "GetNextAction", "AdaptiveDecisionService", MasteryCurriculumQueryInboundHandlers.LRN_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.LEARNING_BINDING);
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I027, "GetCurriculum", "CurriculumCompiler", MasteryCurriculumQueryInboundHandlers.CUR_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.CURRICULUM_BINDING);
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I028, "GetAssessmentAttempt", "AssessmentAttemptService", MasteryCurriculumQueryInboundHandlers.LRN_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.LEARNING_BINDING);
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I029, "GetCourseFreshness", "CourseRefreshService", MasteryCurriculumQueryInboundHandlers.CUR_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.CURRICULUM_BINDING);
        assertRoute(sink, MasteryCurriculumQueryInboundHandlers.I030, "GetMaintenanceQueue", "MaintenanceService", MasteryCurriculumQueryInboundHandlers.LRN_QUERY_PORT, MasteryCurriculumQueryInboundHandlers.LEARNING_BINDING);
    }

    private static void i031CoreJobProjectionIsNotRegisteredLocally() {
        RecordingSink sink = registered(new RecordingPorts());
        if (sink.handlers.containsKey("I031") || sink.descriptors.containsKey("I031")) {
            fail("I031 GetLearningJobProjection must remain CORE/shared durable-job authority");
        }
    }

    private static void readOnlyAndFrozenMetadataAreExact() {
        List<RouteDescriptor> routes = List.of(
                MasteryCurriculumQueryInboundHandlers.I024,
                MasteryCurriculumQueryInboundHandlers.I025,
                MasteryCurriculumQueryInboundHandlers.I026,
                MasteryCurriculumQueryInboundHandlers.I027,
                MasteryCurriculumQueryInboundHandlers.I028,
                MasteryCurriculumQueryInboundHandlers.I029,
                MasteryCurriculumQueryInboundHandlers.I030);
        for (RouteDescriptor route : routes) {
            if (route.idempotencyRequired()) {
                fail(route.interfaceId() + " is read-only and must not be marked replay-mutating/idempotency-required");
            }
            if (!route.concurrencyRule().toLowerCase().contains("read-only")
                    || !route.concurrencyRule().toLowerCase().contains("zero writes/outbox")) {
                fail(route.interfaceId() + " must retain explicit read-only zero-write semantics");
            }
        }
        equal(List.of("skill_ids", "as_of_optional"), MasteryCurriculumQueryInboundHandlers.I024.semanticPayloadFields(), "I024 payload");
        equal(List.of("InsufficientEvidence", "ProjectionStale"), MasteryCurriculumQueryInboundHandlers.I024.typedFailures(), "I024 failures");
        if (!MasteryCurriculumQueryInboundHandlers.I024.concurrencyRule().contains("does not return a qualification decision")) {
            fail("I024 must preserve no-qualification-decision semantic fence");
        }
        equal(List.of("curriculum_id", "version optional"), MasteryCurriculumQueryInboundHandlers.I027.semanticPayloadFields(), "I027 payload");
        equal(List.of("SourceFreshnessInsufficient", "DependencyUnavailable"), MasteryCurriculumQueryInboundHandlers.I029.typedFailures(), "I029 failures");
    }

    private static void ownerPortAndAuthorizationMismatchesFailClosed() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        InboundHandler handler = sink.handlers.get("I024");
        GetSkillMasteryQuery query = new GetSkillMasteryQuery(List.of("skill-1"), null);

        expectFailure(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> handler.handle(envelope(MasteryCurriculumQueryInboundHandlers.I024, false, query)),
                "I024 unauthorized");
        equal(0, ports.calls, "unauthorized query must not delegate");

        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handler.handle(new InboundEnvelope(
                        "I024", "GetSkillMastery", "SYSTEM_MASTER/CORE",
                        MasteryCurriculumQueryInboundHandlers.LRN_QUERY_PORT,
                        "principal-1", true, query)),
                "I024 wrong owner");
        equal(0, ports.calls, "wrong-owner query must not delegate");

        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handler.handle(new InboundEnvelope(
                        "I024", "GetSkillMastery", MasteryCurriculumQueryInboundHandlers.OWNER_PATH,
                        MasteryCurriculumQueryInboundHandlers.CUR_QUERY_PORT,
                        "principal-1", true, query)),
                "I024 wrong port");
        equal(0, ports.calls, "wrong-port query must not delegate");
    }

    private static void typedQueriesForwardWithoutReinterpretation() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);

        Object[] queries = {
            new GetSkillMasteryQuery(List.of("skill-1"), "2026-09-14T18:00:00Z"),
            new ExplainMasteryQuery("projection-1"),
            new GetNextActionQuery("goal-1", Map.of("minutes", 20)),
            new GetCurriculumQuery("curriculum-1", 3L),
            new GetAssessmentAttemptQuery("attempt-1"),
            new GetCourseFreshnessQuery("curriculum-1", 3L),
            new GetMaintenanceQueueQuery("goal-1", "P30D")
        };
        String[] ids = {"I024", "I025", "I026", "I027", "I028", "I029", "I030"};
        RouteDescriptor[] descriptors = {
            MasteryCurriculumQueryInboundHandlers.I024,
            MasteryCurriculumQueryInboundHandlers.I025,
            MasteryCurriculumQueryInboundHandlers.I026,
            MasteryCurriculumQueryInboundHandlers.I027,
            MasteryCurriculumQueryInboundHandlers.I028,
            MasteryCurriculumQueryInboundHandlers.I029,
            MasteryCurriculumQueryInboundHandlers.I030
        };
        for (int i = 0; i < ids.length; i++) {
            sink.handlers.get(ids[i]).handle(envelope(descriptors[i], true, queries[i]));
            same(queries[i], ports.lastQuery, ids[i] + " semantic query identity");
        }
        equal(7, ports.calls, "all seven local queries delegated once");
    }

    private static void optionalFieldsRemainOptionalAndRequiredFieldsFailClosed() {
        new GetSkillMasteryQuery(List.of("skill-1"), null);
        new GetCurriculumQuery("curriculum-1", null);

        try {
            new GetSkillMasteryQuery(null, null);
            fail("expected skill_ids required failure");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("skill_ids")) fail("I024 required field name drift");
        }
        try {
            new GetCourseFreshnessQuery("curriculum-1", null);
            fail("expected I029 version required failure");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("version")) fail("I029 required field name drift");
        }
    }

    private static void wrongPayloadTypeFailsClosed() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        expectFailure(HandlerFailureCode.INVALID_PAYLOAD,
                () -> sink.handlers.get("I028").handle(envelope(
                        MasteryCurriculumQueryInboundHandlers.I028, true,
                        new ExplainMasteryQuery("projection-1"))),
                "I028 wrong payload type");
        equal(0, ports.calls, "wrong payload must not delegate");
    }

    private static void domainFailureIdentityIsPreserved() throws Exception {
        RecordingPorts ports = new RecordingPorts();
        RecordingSink sink = registered(ports);
        SentinelDomainFailure sentinel = new SentinelDomainFailure("ProjectionStale");
        ports.failure = sentinel;
        try {
            sink.handlers.get("I024").handle(envelope(
                    MasteryCurriculumQueryInboundHandlers.I024, true,
                    new GetSkillMasteryQuery(List.of("skill-1"), null)));
            fail("expected domain failure");
        } catch (SentinelDomainFailure actual) {
            same(sentinel, actual, "domain failure object must be preserved");
        }
    }

    private static RecordingSink registered(RecordingPorts ports) {
        RecordingSink sink = new RecordingSink();
        MasteryCurriculumQueryInboundHandlers.registerAll(sink, ports, ports, ports, ports, ports, ports);
        return sink;
    }

    private static InboundEnvelope envelope(RouteDescriptor descriptor, boolean authorized, Object payload) {
        return new InboundEnvelope(
                descriptor.interfaceId(), descriptor.route(), descriptor.ownerPath(), descriptor.port(),
                "principal-1", authorized, payload);
    }

    private static void assertRoute(RecordingSink sink, RouteDescriptor expected, String route,
            String component, String port, String capability) {
        RouteDescriptor actual = sink.descriptors.get(expected.interfaceId());
        if (actual == null) fail("missing registration " + expected.interfaceId());
        equal(route, actual.route(), expected.interfaceId() + " route");
        equal(MasteryCurriculumQueryInboundHandlers.OWNER_PATH, actual.ownerPath(), expected.interfaceId() + " owner");
        equal(port, actual.port(), expected.interfaceId() + " port");
        equal(capability, actual.capabilityBinding(), expected.interfaceId() + " capability");
        equal(component, actual.targetComponent(), expected.interfaceId() + " component");
        equal("MASTER_CORE_ROUTE_MANIFEST_001::" + expected.interfaceId(), actual.contractIdentity(), expected.interfaceId() + " contract");
        equal("QO-IF-" + expected.interfaceId(), actual.testObligationId(), expected.interfaceId() + " obligation");
    }

    private static void expectFailure(HandlerFailureCode code, ThrowingAction action, String label) throws Exception {
        try {
            action.run();
            fail("expected handler failure: " + label);
        } catch (HandlerContractException actual) {
            equal(code, actual.code(), label + " code");
        }
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) fail(label + ": expected " + expected + " but got " + actual);
    }

    private static void same(Object expected, Object actual, String label) {
        if (expected != actual) fail(label + ": expected identical object");
    }

    private static void fail(String message) {
        throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface ThrowingAction { void run() throws Exception; }

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

    private static final class RecordingPorts implements MasteryProjectionServicePort, AdaptiveDecisionQueryPort,
            CurriculumCompilerQueryPort, AssessmentAttemptQueryPort, CourseRefreshQueryPort, MaintenanceQueryPort {
        private int calls;
        private Object lastQuery;
        private Exception failure;

        private Object record(Object query) throws Exception {
            calls++;
            lastQuery = query;
            if (failure != null) throw failure;
            return query;
        }

        @Override public Object getSkillMastery(GetSkillMasteryQuery query) throws Exception { return record(query); }
        @Override public Object explainMastery(ExplainMasteryQuery query) throws Exception { return record(query); }
        @Override public Object getNextAction(GetNextActionQuery query) throws Exception { return record(query); }
        @Override public Object getCurriculum(GetCurriculumQuery query) throws Exception { return record(query); }
        @Override public Object getAssessmentAttempt(GetAssessmentAttemptQuery query) throws Exception { return record(query); }
        @Override public Object getCourseFreshness(GetCourseFreshnessQuery query) throws Exception { return record(query); }
        @Override public Object getMaintenanceQueue(GetMaintenanceQueueQuery query) throws Exception { return record(query); }
    }

    private static final class SentinelDomainFailure extends Exception {
        private static final long serialVersionUID = 1L;
        SentinelDomainFailure(String message) { super(message); }
    }
}
