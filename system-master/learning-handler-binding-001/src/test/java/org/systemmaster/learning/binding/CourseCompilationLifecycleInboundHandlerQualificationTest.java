package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable qualification for exact frozen 001C bindings I066-I070. */
public final class CourseCompilationLifecycleInboundHandlerQualificationTest {
    private CourseCompilationLifecycleInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        Map<String, InboundHandler> handlers = new LinkedHashMap<>();
        Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();

        CourseCompilationLifecycleInboundHandlers.CurriculumResearchOrchestratorPort orchestrator =
                new CourseCompilationLifecycleInboundHandlers.CurriculumResearchOrchestratorPort() {
                    @Override public Object requestCourseCompilation(
                            CourseCompilationLifecycleInboundHandlers.RequestCourseCompilationCommand c) { return c; }
                    @Override public Object approveCourseActivation(
                            CourseCompilationLifecycleInboundHandlers.ApproveCourseActivationCommand c) { return c; }
                    @Override public Object rejectCourseDraft(
                            CourseCompilationLifecycleInboundHandlers.RejectCourseDraftCommand c) { return c; }
                };
        CourseCompilationLifecycleInboundHandlers.CourseValidationPort validation = c -> c;
        CourseCompilationLifecycleInboundHandlers.CourseRefreshPort refresh = c -> c;

        CourseCompilationLifecycleInboundHandlers.registerAll((d, h) -> {
            check(!handlers.containsKey(d.interfaceId()), "duplicate registration " + d.interfaceId());
            descriptors.put(d.interfaceId(), d);
            handlers.put(d.interfaceId(), h);
        }, orchestrator, validation, refresh);

        check(handlers.size() == 5, "expected 5 exact local registrations");
        checkRoute(descriptors, "I066", "RequestCourseCompilation", "CurriculumResearchOrchestrator");
        checkRoute(descriptors, "I067", "ValidateCourseDraft", "CourseValidationService");
        checkRoute(descriptors, "I068", "ApproveCourseActivation", "CurriculumResearchOrchestrator");
        checkRoute(descriptors, "I069", "RejectCourseDraft", "CurriculumResearchOrchestrator");
        checkRoute(descriptors, "I070", "RequestCourseRefreshDiff", "CourseRefreshService");

        check(descriptors.get("I066").semanticPayloadFields().equals(
                List.of("goal_id", "compiler_policy_version", "requested_modalities", "job_request_id")),
                "I066 payload signature drift");
        check(descriptors.get("I066").typedFailures().equals(
                List.of("SourceFreshnessInsufficient", "DependencyUnavailable")), "I066 typed-failure drift");
        check(descriptors.get("I066").concurrencyRule().contains("generic job authority owns lifecycle"),
                "I066 CORE job-lifecycle ownership fence missing");

        check(descriptors.get("I067").semanticPayloadFields().equals(
                List.of("curriculum_version", "validation_policy_version", "client_operation_id")),
                "I067 payload signature drift");
        check(descriptors.get("I067").typedFailures().equals(
                List.of("SourceContradictionUnresolved", "AccessibilityAlternativeMissing", "RightsMetadataMissing")),
                "I067 typed-failure drift");
        check(descriptors.get("I067").concurrencyRule().contains("repeatable by version"),
                "I067 repeatable-version validation fence missing");

        check(descriptors.get("I068").semanticPayloadFields().equals(
                List.of("curriculum_version", "validation_report_ref", "expected_goal_version", "client_operation_id")),
                "I068 payload signature drift");
        check(descriptors.get("I068").typedFailures().equals(
                List.of("CourseActivationBlocked", "VersionConflict")), "I068 typed-failure drift");
        check(descriptors.get("I068").concurrencyRule().contains("explicit user approval"),
                "I068 explicit-approval fence missing");

        check(descriptors.get("I069").semanticPayloadFields().equals(
                List.of("curriculum_version", "reason", "client_operation_id")), "I069 payload signature drift");
        check(descriptors.get("I069").typedFailures().equals(List.of("InvalidState")), "I069 typed-failure drift");
        check(descriptors.get("I069").concurrencyRule().contains("does not delete research artifacts"),
                "I069 artifact-preservation fence missing");

        check(descriptors.get("I070").semanticPayloadFields().equals(
                List.of("active_curriculum_id", "proposed_version", "client_operation_id")),
                "I070 payload signature drift");
        check(descriptors.get("I070").typedFailures().equals(List.of("DependencyUnavailable")),
                "I070 typed-failure drift");
        check(descriptors.get("I070").concurrencyRule().contains("no activation side effect"),
                "I070 no-activation-side-effect fence missing");

        var c066 = new CourseCompilationLifecycleInboundHandlers.RequestCourseCompilationCommand(
                "goal", "compiler-policy-v1", List.of("TEXT", "AUDIO"), "job-request-66");
        var c067 = new CourseCompilationLifecycleInboundHandlers.ValidateCourseDraftCommand(
                "curriculum-v1", "validation-v1", "op-67");
        var c068 = new CourseCompilationLifecycleInboundHandlers.ApproveCourseActivationCommand(
                "curriculum-v1", "validation-report", "goal-v3", "op-68");
        var c069 = new CourseCompilationLifecycleInboundHandlers.RejectCourseDraftCommand(
                "curriculum-v2", "needs revision", "op-69");
        var c070 = new CourseCompilationLifecycleInboundHandlers.RequestCourseRefreshDiffCommand(
                "curriculum-active", "curriculum-proposed", "op-70");

        check(handlers.get("I066").handle(envelope(descriptors.get("I066"), c066, true)) == c066,
                "I066 typed payload identity not preserved");
        check(handlers.get("I067").handle(envelope(descriptors.get("I067"), c067, true)) == c067,
                "I067 typed payload identity not preserved");
        check(handlers.get("I068").handle(envelope(descriptors.get("I068"), c068, true)) == c068,
                "I068 typed payload identity not preserved");
        check(handlers.get("I069").handle(envelope(descriptors.get("I069"), c069, true)) == c069,
                "I069 typed payload identity not preserved");
        check(handlers.get("I070").handle(envelope(descriptors.get("I070"), c070, true)) == c070,
                "I070 typed payload identity not preserved");

        expectFailure(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> handlers.get("I066").handle(envelope(descriptors.get("I066"), c066, false)));
        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handlers.get("I067").handle(new InboundEnvelope("I067", "ValidateCourseDraft",
                        "SYSTEM_MASTER/LEARNING", "LRN-CMD-PORT-001", "principal", true, c067)));
        expectFailure(HandlerFailureCode.INVALID_PAYLOAD,
                () -> handlers.get("I070").handle(envelope(descriptors.get("I070"), "wrong-payload", true)));

        expectIllegalArgument(() -> new CourseCompilationLifecycleInboundHandlers.RequestCourseCompilationCommand(
                null, "policy", List.of("TEXT"), "job"));
        expectIllegalArgument(() -> new CourseCompilationLifecycleInboundHandlers.ValidateCourseDraftCommand(
                "curriculum", null, "op"));
        expectIllegalArgument(() -> new CourseCompilationLifecycleInboundHandlers.ApproveCourseActivationCommand(
                "curriculum", "report", null, "op"));
        expectIllegalArgument(() -> new CourseCompilationLifecycleInboundHandlers.RejectCourseDraftCommand(
                "curriculum", null, "op"));
        expectIllegalArgument(() -> new CourseCompilationLifecycleInboundHandlers.RequestCourseRefreshDiffCommand(
                "active", null, "op"));

        RuntimeException domainFailure = new RuntimeException("domain-failure-identity");
        Map<String, InboundHandler> failing = new LinkedHashMap<>();
        CourseCompilationLifecycleInboundHandlers.CurriculumResearchOrchestratorPort failingOrchestrator =
                new CourseCompilationLifecycleInboundHandlers.CurriculumResearchOrchestratorPort() {
                    @Override public Object requestCourseCompilation(
                            CourseCompilationLifecycleInboundHandlers.RequestCourseCompilationCommand c) {
                        throw domainFailure;
                    }
                    @Override public Object approveCourseActivation(
                            CourseCompilationLifecycleInboundHandlers.ApproveCourseActivationCommand c) { return c; }
                    @Override public Object rejectCourseDraft(
                            CourseCompilationLifecycleInboundHandlers.RejectCourseDraftCommand c) { return c; }
                };
        CourseCompilationLifecycleInboundHandlers.registerAll((d, h) -> failing.put(d.interfaceId(), h),
                failingOrchestrator, validation, refresh);
        try {
            failing.get("I066").handle(envelope(descriptors.get("I066"), c066, true));
            throw new AssertionError("expected domain failure");
        } catch (RuntimeException ex) {
            check(ex == domainFailure, "domain failure identity must propagate unchanged");
        }

        System.out.println("PASS CourseCompilationLifecycleInboundHandlerQualificationTest routes=5 production_bound=0");
    }

    private static InboundEnvelope envelope(RouteDescriptor d, Object payload, boolean authorized) {
        return new InboundEnvelope(d.interfaceId(), d.route(), d.ownerPath(), d.port(), "principal", authorized, payload);
    }

    private static void checkRoute(Map<String, RouteDescriptor> ds, String id, String route, String component) {
        RouteDescriptor d = ds.get(id);
        check(d != null, "missing " + id);
        check(d.route().equals(route), id + " route drift");
        check(d.port().equals("CUR-CMD-PORT-001"), id + " port drift");
        check(d.targetComponent().equals(component), id + " component drift");
        check(d.ownerPath().equals("SYSTEM_MASTER/LEARNING"), id + " owner-path drift");
        check(d.capabilityBinding().equals("C07 CURRICULUM"), id + " capability-binding drift");
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
