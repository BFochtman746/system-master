package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable qualification for exact frozen 001C bindings I071-I074. */
public final class CourseRefreshOfflineInboundHandlerQualificationTest {
    private CourseRefreshOfflineInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        Map<String, InboundHandler> handlers = new LinkedHashMap<>();
        Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();

        CourseRefreshOfflineInboundHandlers.CourseRefreshPort refresh =
                new CourseRefreshOfflineInboundHandlers.CourseRefreshPort() {
                    @Override public Object markCourseSourceStale(
                            CourseRefreshOfflineInboundHandlers.MarkCourseSourceStaleCommand c) { return c; }
                    @Override public Object acknowledgeCourseRefresh(
                            CourseRefreshOfflineInboundHandlers.AcknowledgeCourseRefreshCommand c) { return c; }
                };
        CourseRefreshOfflineInboundHandlers.CurriculumOfflinePackagePlannerPort offline =
                new CourseRefreshOfflineInboundHandlers.CurriculumOfflinePackagePlannerPort() {
                    @Override public Object requestOfflinePackage(
                            CourseRefreshOfflineInboundHandlers.RequestOfflinePackageCommand c) { return c; }
                    @Override public Object revokeOfflinePackage(
                            CourseRefreshOfflineInboundHandlers.RevokeOfflinePackageCommand c) { return c; }
                };

        CourseRefreshOfflineInboundHandlers.registerAll((d, h) -> {
            check(!handlers.containsKey(d.interfaceId()), "duplicate registration " + d.interfaceId());
            descriptors.put(d.interfaceId(), d);
            handlers.put(d.interfaceId(), h);
        }, refresh, offline);

        check(handlers.size() == 4, "expected 4 exact local registrations");
        check(!handlers.containsKey("I075"), "I075 must remain CORE-owned and unregistered by Learning");
        checkRoute(descriptors, "I071", "MarkCourseSourceStale", "CourseRefreshService");
        checkRoute(descriptors, "I072", "AcknowledgeCourseRefresh", "CourseRefreshService");
        checkRoute(descriptors, "I073", "RequestOfflinePackage", "CurriculumOfflinePackagePlanner");
        checkRoute(descriptors, "I074", "RevokeOfflinePackage", "CurriculumOfflinePackagePlanner");

        check(descriptors.get("I071").semanticPayloadFields().equals(
                List.of("source_ref", "affected_claim_refs", "observed_at", "operation_id")),
                "I071 payload signature drift");
        check(descriptors.get("I071").typedFailures().equals(List.of("ValidationError")),
                "I071 typed-failure drift");
        check(descriptors.get("I071").concurrencyRule().contains("Append/versioned"),
                "I071 append/versioned fence missing");
        check(descriptors.get("I071").concurrencyRule().contains("never silent activation"),
                "I071 refresh-recommendation boundary missing");

        check(descriptors.get("I072").semanticPayloadFields().equals(
                List.of("diff_ref", "decision", "client_operation_id")),
                "I072 payload signature drift");
        check(descriptors.get("I072").typedFailures().equals(List.of("VersionConflict")),
                "I072 typed-failure drift");
        check(descriptors.get("I072").concurrencyRule().contains("Diff immutable"),
                "I072 immutable-diff fence missing");
        check(descriptors.get("I072").concurrencyRule().contains("does not silently activate"),
                "I072 no-silent-activation fence missing");

        check(descriptors.get("I073").semanticPayloadFields().equals(
                List.of("curriculum_version", "content_scope", "device_capability_ref", "job_request_id")),
                "I073 payload signature drift");
        check(descriptors.get("I073").typedFailures().equals(
                List.of("RightsPolicyUnknown", "AccessibilityAlternativeMissing")),
                "I073 typed-failure drift");
        check(descriptors.get("I073").concurrencyRule().contains("version pinned"),
                "I073 version-pinning fence missing");
        check(descriptors.get("I073").concurrencyRule().contains("artifact bytes remain external"),
                "I073 external-artifact-authority fence missing");

        check(descriptors.get("I074").semanticPayloadFields().equals(
                List.of("package_ref", "reason", "client_operation_id")),
                "I074 payload signature drift");
        check(descriptors.get("I074").typedFailures().equals(List.of("DependencyUnavailable")),
                "I074 typed-failure drift");
        check(descriptors.get("I074").concurrencyRule().contains("Package versioned"),
                "I074 package-version fence missing");
        check(descriptors.get("I074").concurrencyRule().contains("file/cache authority remains external"),
                "I074 external-cache-authority fence missing");

        var c071 = new CourseRefreshOfflineInboundHandlers.MarkCourseSourceStaleCommand(
                "source-ref", List.of("claim-a", "claim-b"), "2026-09-15T22:55:00Z", "op-71");
        var c072 = new CourseRefreshOfflineInboundHandlers.AcknowledgeCourseRefreshCommand(
                "diff-ref", "POSTPONE", "op-72");
        var c073 = new CourseRefreshOfflineInboundHandlers.RequestOfflinePackageCommand(
                "curriculum-v5", "COURSE_REQUIRED_CONTENT", "device-capability-ref", "job-request-73");
        var c074 = new CourseRefreshOfflineInboundHandlers.RevokeOfflinePackageCommand(
                "package-ref", "rights changed", "op-74");

        check(handlers.get("I071").handle(envelope(descriptors.get("I071"), c071, true)) == c071,
                "I071 typed payload identity not preserved");
        check(handlers.get("I072").handle(envelope(descriptors.get("I072"), c072, true)) == c072,
                "I072 typed payload identity not preserved");
        check(handlers.get("I073").handle(envelope(descriptors.get("I073"), c073, true)) == c073,
                "I073 typed payload identity not preserved");
        check(handlers.get("I074").handle(envelope(descriptors.get("I074"), c074, true)) == c074,
                "I074 typed payload identity not preserved");

        expectFailure(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> handlers.get("I071").handle(envelope(descriptors.get("I071"), c071, false)));
        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handlers.get("I072").handle(new InboundEnvelope("I072", "AcknowledgeCourseRefresh",
                        "SYSTEM_MASTER/LEARNING", "LRN-CMD-PORT-001", "principal", true, c072)));
        expectFailure(HandlerFailureCode.INVALID_PAYLOAD,
                () -> handlers.get("I073").handle(envelope(descriptors.get("I073"), "wrong-payload", true)));

        expectIllegalArgument(() -> new CourseRefreshOfflineInboundHandlers.MarkCourseSourceStaleCommand(
                null, List.of("claim"), "time", "op"));
        expectIllegalArgument(() -> new CourseRefreshOfflineInboundHandlers.AcknowledgeCourseRefreshCommand(
                "diff", null, "op"));
        expectIllegalArgument(() -> new CourseRefreshOfflineInboundHandlers.RequestOfflinePackageCommand(
                "curriculum", "scope", null, "job"));
        expectIllegalArgument(() -> new CourseRefreshOfflineInboundHandlers.RevokeOfflinePackageCommand(
                "package", null, "op"));

        RuntimeException domainFailure = new RuntimeException("domain-failure-identity");
        Map<String, InboundHandler> failing = new LinkedHashMap<>();
        CourseRefreshOfflineInboundHandlers.CourseRefreshPort failingRefresh =
                new CourseRefreshOfflineInboundHandlers.CourseRefreshPort() {
                    @Override public Object markCourseSourceStale(
                            CourseRefreshOfflineInboundHandlers.MarkCourseSourceStaleCommand c) {
                        throw domainFailure;
                    }
                    @Override public Object acknowledgeCourseRefresh(
                            CourseRefreshOfflineInboundHandlers.AcknowledgeCourseRefreshCommand c) { return c; }
                };
        CourseRefreshOfflineInboundHandlers.registerAll((d, h) -> failing.put(d.interfaceId(), h),
                failingRefresh, offline);
        try {
            failing.get("I071").handle(envelope(descriptors.get("I071"), c071, true));
            throw new AssertionError("expected domain failure");
        } catch (RuntimeException ex) {
            check(ex == domainFailure, "domain failure identity must propagate unchanged");
        }

        System.out.println("PASS CourseRefreshOfflineInboundHandlerQualificationTest routes=4 core_boundary=I075 production_bound=0");
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
