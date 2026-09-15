package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.learning.binding.AdaptiveCurriculumDeckInboundHandlers.*;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable qualification for the six local rows in denominator slice I016-C..I023. */
public final class AdaptiveCurriculumDeckInboundHandlerQualificationTest {
    private AdaptiveCurriculumDeckInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        routeParityAndPeerBoundaryAreExact();
        ownerPortAndAuthorizationFailClosed();
        typedPayloadsForwardWithoutReinterpretation();
        frozenI016CContractCannotNarrow();
        queryRemainsReadOnlyMetadata();
        domainFailureIdentityIsPreserved();
        System.out.println("PASS AdaptiveCurriculumDeckInboundHandlerQualificationTest I016-C-I023-local");
    }

    private static void routeParityAndPeerBoundaryAreExact() {
        Ports ports = new Ports();
        Sink sink = registered(ports);
        equal(6, sink.handlers.size(), "local registration count");
        assertRoute(sink, AdaptiveCurriculumDeckInboundHandlers.I016_C, "RequestRemediationPlan", "RemediationPlanService", "CUR-CMD-PORT-001");
        assertRoute(sink, AdaptiveCurriculumDeckInboundHandlers.I017, "OverrideNextAction", "AdaptiveDecisionService", "LRN-CMD-PORT-001");
        assertRoute(sink, AdaptiveCurriculumDeckInboundHandlers.I018, "RequestMaintenancePlan", "MaintenanceService", "LRN-CMD-PORT-001");
        assertRoute(sink, AdaptiveCurriculumDeckInboundHandlers.I019, "ImportCompetencyFramework", "SkillCriterionRegistry", "CUR-CMD-PORT-001");
        assertRoute(sink, AdaptiveCurriculumDeckInboundHandlers.I020, "AttachExternalLearningResource", "CurriculumResearchOrchestrator", "CUR-CMD-PORT-001");
        assertRoute(sink, AdaptiveCurriculumDeckInboundHandlers.I023, "GetLearningDeck", "LearningIntegrationAdapter", "LRN-QRY-PORT-001");
        if (sink.handlers.containsKey("I021") || sink.handlers.containsKey("I022")) {
            fail("CORE-owned I021/I022 must not be registered as Learning handlers");
        }
    }

    private static void ownerPortAndAuthorizationFailClosed() throws Exception {
        Ports ports = new Ports();
        Sink sink = registered(ports);
        var cmd = new OverrideNextActionCommand("rec-1", "continue", null, "op-17");
        expect(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> sink.handlers.get("I017").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I017, false, cmd)));
        expect(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> sink.handlers.get("I017").handle(new InboundEnvelope(
                        "I017", "OverrideNextAction", "SYSTEM_MASTER/CORE", "LRN-CMD-PORT-001",
                        "principal-1", true, cmd)));
        equal(0, ports.calls, "failed guards must not delegate");
    }

    private static void typedPayloadsForwardWithoutReinterpretation() throws Exception {
        Ports ports = new Ports();
        Sink sink = registered(ports);
        var remediation = remediation();
        sink.handlers.get("I016-C").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I016_C, true, remediation));
        same(remediation, ports.last, "I016-C payload identity");

        var override = new OverrideNextActionCommand("rec-1", "continue", "because", "op-17");
        sink.handlers.get("I017").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I017, true, override));
        same(override, ports.last, "I017 payload identity");

        var maintenance = new RequestMaintenancePlanCommand("goal-1", "P30D", "op-18");
        sink.handlers.get("I018").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I018, true, maintenance));
        same(maintenance, ports.last, "I018 payload identity");

        var framework = new ImportCompetencyFrameworkCommand("fw-1", Map.of("mode", "strict"), "op-19");
        sink.handlers.get("I019").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I019, true, framework));
        same(framework, ports.last, "I019 payload identity");

        var resource = new AttachExternalLearningResourceCommand(
                "lesson-1", "resource-1", "rights-1", List.of("captions"), "op-20");
        sink.handlers.get("I020").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I020, true, resource));
        same(resource, ports.last, "I020 payload identity");

        var deck = new GetLearningDeckQuery("goal-1");
        sink.handlers.get("I023").handle(envelope(AdaptiveCurriculumDeckInboundHandlers.I023, true, deck));
        same(deck, ports.last, "I023 payload identity");
    }

    private static void frozenI016CContractCannotNarrow() {
        equal(List.of("remediation_need_ref", "curriculum_version_ref", "criterion_refs", "instructional_constraints", "client_operation_id"),
                AdaptiveCurriculumDeckInboundHandlers.I016_C.semanticPayloadFields(), "I016-C frozen fields");
        equal(List.of("RemediationNeedStale", "CurriculumVersionMismatch", "CriterionUnknown", "ValidationError", "DependencyUnavailable"),
                AdaptiveCurriculumDeckInboundHandlers.I016_C.typedFailures(), "I016-C frozen failures");
        try {
            new RequestRemediationPlanCommand("need-1", "cv-1", null, Map.of(), "op-16c");
            fail("criterion_refs must remain required");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("criterion_refs")) fail("wrong required-field failure");
        }
    }

    private static void queryRemainsReadOnlyMetadata() {
        if (AdaptiveCurriculumDeckInboundHandlers.I023.idempotencyRequired()) {
            fail("I023 query must not claim mutating idempotency");
        }
        equal("Snapshot/version tagged; read only", AdaptiveCurriculumDeckInboundHandlers.I023.concurrencyRule(), "I023 read rule");
    }

    private static void domainFailureIdentityIsPreserved() throws Exception {
        Ports ports = new Ports();
        Sink sink = registered(ports);
        SentinelFailure sentinel = new SentinelFailure();
        ports.failure = sentinel;
        try {
            sink.handlers.get("I020").handle(envelope(
                    AdaptiveCurriculumDeckInboundHandlers.I020, true,
                    new AttachExternalLearningResourceCommand("lesson-1", "r", "rights", List.of("alt"), "op")));
            fail("expected domain failure");
        } catch (SentinelFailure actual) {
            same(sentinel, actual, "domain failure identity");
        }
    }

    private static RequestRemediationPlanCommand remediation() {
        return new RequestRemediationPlanCommand(
                "need-1", "curriculum-v1", List.of("criterion-1"), Map.of("max_minutes", 20), "op-16c");
    }

    private static Sink registered(Ports ports) {
        Sink sink = new Sink();
        AdaptiveCurriculumDeckInboundHandlers.registerAll(sink, ports, ports, ports, ports, ports, ports);
        return sink;
    }

    private static InboundEnvelope envelope(RouteDescriptor d, boolean authorized, Object payload) {
        return new InboundEnvelope(d.interfaceId(), d.route(), d.ownerPath(), d.port(), "principal-1", authorized, payload);
    }

    private static void assertRoute(Sink sink, RouteDescriptor d, String route, String component, String port) {
        RouteDescriptor actual = sink.descriptors.get(d.interfaceId());
        if (actual == null) fail("missing " + d.interfaceId());
        equal(route, actual.route(), d.interfaceId() + " route");
        equal("SYSTEM_MASTER/LEARNING", actual.ownerPath(), d.interfaceId() + " owner path");
        equal(component, actual.targetComponent(), d.interfaceId() + " component");
        equal(port, actual.port(), d.interfaceId() + " port");
    }

    private static void expect(HandlerFailureCode code, Throwing action) throws Exception {
        try { action.run(); fail("expected handler failure"); }
        catch (HandlerContractException e) { equal(code, e.code(), "handler failure code"); }
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) fail(label + ": expected " + expected + " got " + actual);
    }
    private static void same(Object expected, Object actual, String label) {
        if (expected != actual) fail(label + ": expected identical object");
    }
    private static void fail(String message) { throw new AssertionError(message); }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }

    private static final class Sink implements RegistrationSink {
        final Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();
        final Map<String, InboundHandler> handlers = new LinkedHashMap<>();
        public void register(RouteDescriptor descriptor, InboundHandler handler) {
            if (descriptors.putIfAbsent(descriptor.interfaceId(), descriptor) != null) fail("duplicate " + descriptor.interfaceId());
            handlers.put(descriptor.interfaceId(), handler);
        }
    }

    private static final class Ports implements RemediationPlanServicePort, AdaptiveDecisionServicePort,
            MaintenanceServicePort, SkillCriterionRegistryPort, CurriculumResearchOrchestratorPort, LearningDeckQueryPort {
        int calls; Object last; Exception failure;
        private Object record(Object value) throws Exception {
            calls++; last = value; if (failure != null) throw failure; return value;
        }
        public Object requestRemediationPlan(RequestRemediationPlanCommand c) throws Exception { return record(c); }
        public Object overrideNextAction(OverrideNextActionCommand c) throws Exception { return record(c); }
        public Object requestMaintenancePlan(RequestMaintenancePlanCommand c) throws Exception { return record(c); }
        public Object importCompetencyFramework(ImportCompetencyFrameworkCommand c) throws Exception { return record(c); }
        public Object attachExternalLearningResource(AttachExternalLearningResourceCommand c) throws Exception { return record(c); }
        public Object getLearningDeck(GetLearningDeckQuery q) throws Exception { return record(q); }
    }

    private static final class SentinelFailure extends Exception { private static final long serialVersionUID = 1L; }
}
