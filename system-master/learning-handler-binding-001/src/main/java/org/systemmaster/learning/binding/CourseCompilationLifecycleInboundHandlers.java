package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Exact frozen 001C local bindings for I066-I070. */
public final class CourseCompilationLifecycleInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String CUR_COMMAND_PORT = "CUR-CMD-PORT-001";

    public static final RouteDescriptor I066 = new RouteDescriptor(
            "I066", InterfaceType.COMMAND, "RequestCourseCompilation", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CurriculumResearchOrchestrator",
            "MASTER_CORE_ROUTE_MANIFEST_001::I066", "QO-IF-I066",
            List.of("goal_id", "compiler_policy_version", "requested_modalities", "job_request_id"),
            List.of("SourceFreshnessInsufficient", "DependencyUnavailable"), true,
            "Goal version pinned; generic job authority owns lifecycle");

    public static final RouteDescriptor I067 = new RouteDescriptor(
            "I067", InterfaceType.COMMAND, "ValidateCourseDraft", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CourseValidationService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I067", "QO-IF-I067",
            List.of("curriculum_version", "validation_policy_version", "client_operation_id"),
            List.of("SourceContradictionUnresolved", "AccessibilityAlternativeMissing", "RightsMetadataMissing"), true,
            "Curriculum version immutable during run; validation is repeatable by version");

    public static final RouteDescriptor I068 = new RouteDescriptor(
            "I068", InterfaceType.COMMAND, "ApproveCourseActivation", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CurriculumResearchOrchestrator",
            "MASTER_CORE_ROUTE_MANIFEST_001::I068", "QO-IF-I068",
            List.of("curriculum_version", "validation_report_ref", "expected_goal_version", "client_operation_id"),
            List.of("CourseActivationBlocked", "VersionConflict"), true,
            "Expected goal version; explicit user approval is required before activation");

    public static final RouteDescriptor I069 = new RouteDescriptor(
            "I069", InterfaceType.COMMAND, "RejectCourseDraft", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CurriculumResearchOrchestrator",
            "MASTER_CORE_ROUTE_MANIFEST_001::I069", "QO-IF-I069",
            List.of("curriculum_version", "reason", "client_operation_id"),
            List.of("InvalidState"), true,
            "Versioned rejection; rejecting a draft does not delete research artifacts");

    public static final RouteDescriptor I070 = new RouteDescriptor(
            "I070", InterfaceType.COMMAND, "RequestCourseRefreshDiff", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "CourseRefreshService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I070", "QO-IF-I070",
            List.of("active_curriculum_id", "proposed_version", "client_operation_id"),
            List.of("DependencyUnavailable"), true,
            "Both versions pinned; refresh-diff request has no activation side effect");

    private CourseCompilationLifecycleInboundHandlers() {}

    public record RequestCourseCompilationCommand(Object goalId, Object compilerPolicyVersion,
            Object requestedModalities, Object jobRequestId) {
        public RequestCourseCompilationCommand {
            goalId = required(goalId, "goal_id");
            compilerPolicyVersion = required(compilerPolicyVersion, "compiler_policy_version");
            requestedModalities = required(requestedModalities, "requested_modalities");
            jobRequestId = required(jobRequestId, "job_request_id");
        }
    }

    public record ValidateCourseDraftCommand(Object curriculumVersion, Object validationPolicyVersion,
            Object clientOperationId) {
        public ValidateCourseDraftCommand {
            curriculumVersion = required(curriculumVersion, "curriculum_version");
            validationPolicyVersion = required(validationPolicyVersion, "validation_policy_version");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record ApproveCourseActivationCommand(Object curriculumVersion, Object validationReportRef,
            Object expectedGoalVersion, Object clientOperationId) {
        public ApproveCourseActivationCommand {
            curriculumVersion = required(curriculumVersion, "curriculum_version");
            validationReportRef = required(validationReportRef, "validation_report_ref");
            expectedGoalVersion = required(expectedGoalVersion, "expected_goal_version");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record RejectCourseDraftCommand(Object curriculumVersion, Object reason, Object clientOperationId) {
        public RejectCourseDraftCommand {
            curriculumVersion = required(curriculumVersion, "curriculum_version");
            reason = required(reason, "reason");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record RequestCourseRefreshDiffCommand(Object activeCurriculumId, Object proposedVersion,
            Object clientOperationId) {
        public RequestCourseRefreshDiffCommand {
            activeCurriculumId = required(activeCurriculumId, "active_curriculum_id");
            proposedVersion = required(proposedVersion, "proposed_version");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public interface CurriculumResearchOrchestratorPort {
        Object requestCourseCompilation(RequestCourseCompilationCommand command) throws Exception;
        Object approveCourseActivation(ApproveCourseActivationCommand command) throws Exception;
        Object rejectCourseDraft(RejectCourseDraftCommand command) throws Exception;
    }

    public interface CourseValidationPort {
        Object validateCourseDraft(ValidateCourseDraftCommand command) throws Exception;
    }

    public interface CourseRefreshPort {
        Object requestCourseRefreshDiff(RequestCourseRefreshDiffCommand command) throws Exception;
    }

    public static void registerAll(RegistrationSink sink,
            CurriculumResearchOrchestratorPort curriculumResearchOrchestrator,
            CourseValidationPort courseValidation,
            CourseRefreshPort courseRefresh) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(curriculumResearchOrchestrator, "curriculumResearchOrchestrator");
        Objects.requireNonNull(courseValidation, "courseValidation");
        Objects.requireNonNull(courseRefresh, "courseRefresh");

        sink.register(I066, e -> curriculumResearchOrchestrator.requestCourseCompilation(
                payload(e, I066, RequestCourseCompilationCommand.class)));
        sink.register(I067, e -> courseValidation.validateCourseDraft(
                payload(e, I067, ValidateCourseDraftCommand.class)));
        sink.register(I068, e -> curriculumResearchOrchestrator.approveCourseActivation(
                payload(e, I068, ApproveCourseActivationCommand.class)));
        sink.register(I069, e -> curriculumResearchOrchestrator.rejectCourseDraft(
                payload(e, I069, RejectCourseDraftCommand.class)));
        sink.register(I070, e -> courseRefresh.requestCourseRefreshDiff(
                payload(e, I070, RequestCourseRefreshDiffCommand.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String name) {
        return InboundBindingContracts.requiredField(value, name);
    }
}
