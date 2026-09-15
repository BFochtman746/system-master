package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable qualification for exact frozen 001C bindings I063-I065. */
public final class AssessmentPoolItemLifecycleInboundHandlerQualificationTest {
    private AssessmentPoolItemLifecycleInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        Map<String, InboundHandler> handlers = new LinkedHashMap<>();
        Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();

        AssessmentPoolItemLifecycleInboundHandlers.AssessmentBlueprintPort blueprintPort = c -> c;
        AssessmentPoolItemLifecycleInboundHandlers.AssessmentItemLifecyclePort itemLifecyclePort = c -> c;
        AssessmentPoolItemLifecycleInboundHandlers.LearningIntegrationPort learningIntegrationPort = c -> c;

        AssessmentPoolItemLifecycleInboundHandlers.registerAll((d, h) -> {
            check(!handlers.containsKey(d.interfaceId()), "duplicate registration " + d.interfaceId());
            descriptors.put(d.interfaceId(), d);
            handlers.put(d.interfaceId(), h);
        }, blueprintPort, itemLifecyclePort, learningIntegrationPort);

        check(handlers.size() == 3, "expected 3 exact local registrations");
        checkRoute(descriptors, "I063", "RequestAssessmentPoolGeneration", "CUR-CMD-PORT-001",
                "AssessmentBlueprintService", "C07 CURRICULUM");
        checkRoute(descriptors, "I064", "RetireAssessmentItem", "CUR-CMD-PORT-001",
                "AssessmentItemLifecycleService", "C07 CURRICULUM");
        checkRoute(descriptors, "I065", "RecordItemExposure", "LRN-CMD-PORT-001",
                "LearningIntegrationAdapter", "C18 LEARNING");

        check(descriptors.get("I063").semanticPayloadFields().equals(
                List.of("blueprint_id", "target_pool_spec", "job_request_id")), "I063 payload signature drift");
        check(descriptors.get("I063").typedFailures().equals(
                List.of("DependencyUnavailable", "ContentRiskNeedsHumanReview")), "I063 typed-failure drift");
        check(descriptors.get("I063").concurrencyRule().contains("generic job execution remains CORE-owned"),
                "I063 CORE job-authority fence missing");

        check(descriptors.get("I064").semanticPayloadFields().equals(
                List.of("item_id", "expected_version", "reason", "client_operation_id")), "I064 payload signature drift");
        check(descriptors.get("I064").typedFailures().equals(List.of("VersionConflict")), "I064 typed-failure drift");
        check(descriptors.get("I064").concurrencyRule().contains("historic attempts retain their pinned item version"),
                "I064 historical-attempt fence missing");

        check(descriptors.get("I065").semanticPayloadFields().equals(
                List.of("item_family_ref", "item_ref", "exposure_type", "attempt_ref", "timestamp", "operation_id")),
                "I065 payload signature drift");
        check(descriptors.get("I065").typedFailures().equals(List.of("DuplicateOperationConflict")),
                "I065 typed-failure drift");
        check(descriptors.get("I065").concurrencyRule().contains("activity alone is not mastery"),
                "I065 no-mastery-from-activity fence missing");

        var c063 = new AssessmentPoolItemLifecycleInboundHandlers.RequestAssessmentPoolGenerationCommand(
                "blueprint", "pool-spec", "job-request");
        check(handlers.get("I063").handle(envelope(descriptors.get("I063"), c063, true)) == c063,
                "I063 typed payload identity not preserved");

        var c064 = new AssessmentPoolItemLifecycleInboundHandlers.RetireAssessmentItemCommand(
                "item", "v1", "retire-reason", "op-64");
        check(handlers.get("I064").handle(envelope(descriptors.get("I064"), c064, true)) == c064,
                "I064 typed payload identity not preserved");

        var c065 = new AssessmentPoolItemLifecycleInboundHandlers.RecordItemExposureCommand(
                "family", "item", "PRACTICE", "attempt", "timestamp", "op-65");
        check(handlers.get("I065").handle(envelope(descriptors.get("I065"), c065, true)) == c065,
                "I065 typed payload identity not preserved");

        expectFailure(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> handlers.get("I063").handle(envelope(descriptors.get("I063"), c063, false)));
        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handlers.get("I064").handle(new InboundEnvelope("I064", "RetireAssessmentItem",
                        "SYSTEM_MASTER/LEARNING", "LRN-CMD-PORT-001", "principal", true, c064)));
        expectFailure(HandlerFailureCode.INVALID_PAYLOAD,
                () -> handlers.get("I065").handle(envelope(descriptors.get("I065"), "wrong-payload", true)));

        expectIllegalArgument(() -> new AssessmentPoolItemLifecycleInboundHandlers.RequestAssessmentPoolGenerationCommand(
                null, "pool", "job"));
        expectIllegalArgument(() -> new AssessmentPoolItemLifecycleInboundHandlers.RetireAssessmentItemCommand(
                "item", null, "reason", "op"));
        expectIllegalArgument(() -> new AssessmentPoolItemLifecycleInboundHandlers.RecordItemExposureCommand(
                "family", "item", "type", "attempt", null, "op"));

        RuntimeException domainFailure = new RuntimeException("domain-failure-identity");
        Map<String, InboundHandler> failing = new LinkedHashMap<>();
        AssessmentPoolItemLifecycleInboundHandlers.registerAll((d, h) -> failing.put(d.interfaceId(), h),
                c -> { throw domainFailure; }, itemLifecyclePort, learningIntegrationPort);
        try {
            failing.get("I063").handle(envelope(descriptors.get("I063"), c063, true));
            throw new AssertionError("expected domain failure");
        } catch (RuntimeException ex) {
            check(ex == domainFailure, "domain failure identity must propagate unchanged");
        }

        System.out.println("PASS AssessmentPoolItemLifecycleInboundHandlerQualificationTest routes=3 production_bound=0");
    }

    private static InboundEnvelope envelope(RouteDescriptor d, Object payload, boolean authorized) {
        return new InboundEnvelope(d.interfaceId(), d.route(), d.ownerPath(), d.port(), "principal", authorized, payload);
    }

    private static void checkRoute(Map<String, RouteDescriptor> ds, String id, String route,
            String port, String component, String capabilityBinding) {
        RouteDescriptor d = ds.get(id);
        check(d != null, "missing " + id);
        check(d.route().equals(route), id + " route drift");
        check(d.port().equals(port), id + " port drift");
        check(d.targetComponent().equals(component), id + " component drift");
        check(d.ownerPath().equals("SYSTEM_MASTER/LEARNING"), id + " owner-path drift");
        check(d.capabilityBinding().equals(capabilityBinding), id + " capability-binding drift");
        check(d.contractIdentity().equals("MASTER_CORE_ROUTE_MANIFEST_001::" + id), id + " contract identity drift");
        check(d.testObligationId().equals("QO-IF-" + id), id + " test-obligation drift");
        check(d.idempotencyRequired(), id + " must remain idempotent");
    }

    private static void expectFailure(HandlerFailureCode code, Throwing action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected handler failure " + code);
        } catch (HandlerContractException ex) {
            check(ex.code() == code, "wrong handler failure code");
        }
    }

    private static void expectIllegalArgument(Throwing action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }
}
