package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Exact frozen 001C local bindings for I071-I074. I075 remains CORE-owned. */
public final class CourseRefreshOfflineInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String CUR_COMMAND_PORT = "CUR-CMD-PORT-001";

    public static final RouteDescriptor I071 = new RouteDescriptor(
            "I071", InterfaceType.COMMAND, "MarkCourseSourceStale", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CourseRefreshService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I071", "QO-IF-I071",
            List.of("source_ref", "affected_claim_refs", "observed_at", "operation_id"),
            List.of("ValidationError"), true,
            "Append/versioned; staleness may trigger a refresh recommendation but never silent activation");

    public static final RouteDescriptor I072 = new RouteDescriptor(
            "I072", InterfaceType.COMMAND, "AcknowledgeCourseRefresh", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CourseRefreshService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I072", "QO-IF-I072",
            List.of("diff_ref", "decision", "client_operation_id"),
            List.of("VersionConflict"), true,
            "Diff immutable; acknowledgement records accept/postpone/reject and does not silently activate");

    public static final RouteDescriptor I073 = new RouteDescriptor(
            "I073", InterfaceType.COMMAND, "RequestOfflinePackage", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CurriculumOfflinePackagePlanner",
            "MASTER_CORE_ROUTE_MANIFEST_001::I073", "QO-IF-I073",
            List.of("curriculum_version", "content_scope", "device_capability_ref", "job_request_id"),
            List.of("RightsPolicyUnknown", "AccessibilityAlternativeMissing"), true,
            "Curriculum version pinned; Learning requests assembly while artifact bytes remain external");

    public static final RouteDescriptor I074 = new RouteDescriptor(
            "I074", InterfaceType.COMMAND, "RevokeOfflinePackage", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CurriculumOfflinePackagePlanner",
            "MASTER_CORE_ROUTE_MANIFEST_001::I074", "QO-IF-I074",
            List.of("package_ref", "reason", "client_operation_id"),
            List.of("DependencyUnavailable"), true,
            "Package versioned; Learning revokes eligibility and requests invalidation while file/cache authority remains external");

    private CourseRefreshOfflineInboundHandlers() {}

    public record MarkCourseSourceStaleCommand(Object sourceRef, Object affectedClaimRefs,
            Object observedAt, Object operationId) {
        public MarkCourseSourceStaleCommand {
            sourceRef = required(sourceRef, "source_ref");
            affectedClaimRefs = required(affectedClaimRefs, "affected_claim_refs");
            observedAt = required(observedAt, "observed_at");
            operationId = required(operationId, "operation_id");
        }
    }

    public record AcknowledgeCourseRefreshCommand(Object diffRef, Object decision, Object clientOperationId) {
        public AcknowledgeCourseRefreshCommand {
            diffRef = required(diffRef, "diff_ref");
            decision = required(decision, "decision");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record RequestOfflinePackageCommand(Object curriculumVersion, Object contentScope,
            Object deviceCapabilityRef, Object jobRequestId) {
        public RequestOfflinePackageCommand {
            curriculumVersion = required(curriculumVersion, "curriculum_version");
            contentScope = required(contentScope, "content_scope");
            deviceCapabilityRef = required(deviceCapabilityRef, "device_capability_ref");
            jobRequestId = required(jobRequestId, "job_request_id");
        }
    }

    public record RevokeOfflinePackageCommand(Object packageRef, Object reason, Object clientOperationId) {
        public RevokeOfflinePackageCommand {
            packageRef = required(packageRef, "package_ref");
            reason = required(reason, "reason");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public interface CourseRefreshPort {
        Object markCourseSourceStale(MarkCourseSourceStaleCommand command) throws Exception;
        Object acknowledgeCourseRefresh(AcknowledgeCourseRefreshCommand command) throws Exception;
    }

    public interface CurriculumOfflinePackagePlannerPort {
        Object requestOfflinePackage(RequestOfflinePackageCommand command) throws Exception;
        Object revokeOfflinePackage(RevokeOfflinePackageCommand command) throws Exception;
    }

    public static void registerAll(RegistrationSink sink, CourseRefreshPort courseRefresh,
            CurriculumOfflinePackagePlannerPort offlinePackagePlanner) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(courseRefresh, "courseRefresh");
        Objects.requireNonNull(offlinePackagePlanner, "offlinePackagePlanner");

        sink.register(I071, e -> courseRefresh.markCourseSourceStale(
                payload(e, I071, MarkCourseSourceStaleCommand.class)));
        sink.register(I072, e -> courseRefresh.acknowledgeCourseRefresh(
                payload(e, I072, AcknowledgeCourseRefreshCommand.class)));
        sink.register(I073, e -> offlinePackagePlanner.requestOfflinePackage(
                payload(e, I073, RequestOfflinePackageCommand.class)));
        sink.register(I074, e -> offlinePackagePlanner.revokeOfflinePackage(
                payload(e, I074, RevokeOfflinePackageCommand.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String name) {
        return InboundBindingContracts.requiredField(value, name);
    }
}
