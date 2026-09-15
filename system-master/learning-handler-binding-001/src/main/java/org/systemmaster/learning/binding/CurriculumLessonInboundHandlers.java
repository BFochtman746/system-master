package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Exact current-authority LEARNING/CURRICULUM inbound bindings for I005-I008. */
public final class CurriculumLessonInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String LEARNING_BINDING = "C18 LEARNING";
    public static final String CUR_PORT = "CUR-CMD-PORT-001";
    public static final String LRN_PORT = "LRN-CMD-PORT-001";

    public static final RouteDescriptor I005 = new RouteDescriptor(
            "I005",
            InterfaceType.COMMAND,
            "RequestCurriculumGeneration",
            OWNER_PATH,
            CURRICULUM_BINDING,
            CUR_PORT,
            "CurriculumCompiler",
            "MASTER_CORE_ROUTE_MANIFEST_001::I005",
            "QO-IF-I005",
            List.of("goal_id", "constraints", "source policy", "accessibility needs", "client_operation_id"),
            List.of("DependencyUnavailable", "RightsMetadataMissing", "ValidationError"),
            true,
            "One active equivalent request per policy");

    public static final RouteDescriptor I006 = new RouteDescriptor(
            "I006",
            InterfaceType.COMMAND,
            "ActivateCurriculumVersion",
            OWNER_PATH,
            CURRICULUM_BINDING,
            CUR_PORT,
            "CurriculumVersionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I006",
            "QO-IF-I006",
            List.of("curriculum_id", "version", "expected_goal_version", "client_operation_id"),
            List.of(
                    "VersionConflict",
                    "AccessibilityAlternativeMissing",
                    "RightsMetadataMissing",
                    "SourceFreshnessInsufficient"),
            true,
            "Atomic expected-version update");

    public static final RouteDescriptor I007 = new RouteDescriptor(
            "I007",
            InterfaceType.COMMAND,
            "RequestCourseRefresh",
            OWNER_PATH,
            CURRICULUM_BINDING,
            CUR_PORT,
            "CourseRefreshService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I007",
            "QO-IF-I007",
            List.of("curriculum_id", "reason", "source policy", "client_operation_id"),
            List.of("DependencyUnavailable", "SourceFreshnessInsufficient"),
            true,
            "Deduplicate equivalent active request");

    public static final RouteDescriptor I008 = new RouteDescriptor(
            "I008",
            InterfaceType.COMMAND,
            "StartLesson",
            OWNER_PATH,
            LEARNING_BINDING,
            LRN_PORT,
            "LearningIntegrationAdapter",
            "MASTER_CORE_ROUTE_MANIFEST_001::I008",
            "QO-IF-I008",
            List.of("lesson_id", "version", "client_operation_id"),
            List.of("VersionConflict", "DependencyUnavailable"),
            true,
            "Single latest session projection; preserve attempts");

    private CurriculumLessonInboundHandlers() {}

    public record RequestCurriculumGenerationCommand(
            Object goalId,
            Object constraints,
            Object sourcePolicy,
            Object accessibilityNeeds,
            Object clientOperationId) {
        public RequestCurriculumGenerationCommand {
            goalId = InboundBindingContracts.requiredField(goalId, "goal_id");
            constraints = InboundBindingContracts.requiredField(constraints, "constraints");
            sourcePolicy = InboundBindingContracts.requiredField(sourcePolicy, "source policy");
            accessibilityNeeds = InboundBindingContracts.requiredField(
                    accessibilityNeeds, "accessibility needs");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    public record ActivateCurriculumVersionCommand(
            Object curriculumId,
            Object version,
            Object expectedGoalVersion,
            Object clientOperationId) {
        public ActivateCurriculumVersionCommand {
            curriculumId = InboundBindingContracts.requiredField(curriculumId, "curriculum_id");
            version = InboundBindingContracts.requiredField(version, "version");
            expectedGoalVersion = InboundBindingContracts.requiredField(
                    expectedGoalVersion, "expected_goal_version");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    public record RequestCourseRefreshCommand(
            Object curriculumId,
            Object reason,
            Object sourcePolicy,
            Object clientOperationId) {
        public RequestCourseRefreshCommand {
            curriculumId = InboundBindingContracts.requiredField(curriculumId, "curriculum_id");
            reason = InboundBindingContracts.requiredField(reason, "reason");
            sourcePolicy = InboundBindingContracts.requiredField(sourcePolicy, "source policy");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    public record StartLessonCommand(
            Object lessonId,
            Object version,
            Object clientOperationId) {
        public StartLessonCommand {
            lessonId = InboundBindingContracts.requiredField(lessonId, "lesson_id");
            version = InboundBindingContracts.requiredField(version, "version");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    public interface CurriculumCompilerPort {
        Object requestCurriculumGeneration(RequestCurriculumGenerationCommand command) throws Exception;
    }

    public interface CurriculumVersionServicePort {
        Object activateCurriculumVersion(ActivateCurriculumVersionCommand command) throws Exception;
    }

    public interface CourseRefreshServicePort {
        Object requestCourseRefresh(RequestCourseRefreshCommand command) throws Exception;
    }

    public interface LearningIntegrationAdapterPort {
        Object startLesson(StartLessonCommand command) throws Exception;
    }

    /**
     * Registers exactly I005-I008. Generic job creation, shared rights/research
     * authorities, route dispatch and persistence mechanics remain with their
     * current owners; these handlers only delegate LEARNING-owned semantics.
     */
    public static void registerAll(
            RegistrationSink sink,
            CurriculumCompilerPort curriculumCompiler,
            CurriculumVersionServicePort curriculumVersionService,
            CourseRefreshServicePort courseRefreshService,
            LearningIntegrationAdapterPort learningIntegrationAdapter) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(curriculumCompiler, "curriculumCompiler");
        Objects.requireNonNull(curriculumVersionService, "curriculumVersionService");
        Objects.requireNonNull(courseRefreshService, "courseRefreshService");
        Objects.requireNonNull(learningIntegrationAdapter, "learningIntegrationAdapter");

        sink.register(I005, envelope -> curriculumCompiler.requestCurriculumGeneration(
                payload(envelope, I005, RequestCurriculumGenerationCommand.class)));
        sink.register(I006, envelope -> curriculumVersionService.activateCurriculumVersion(
                payload(envelope, I006, ActivateCurriculumVersionCommand.class)));
        sink.register(I007, envelope -> courseRefreshService.requestCourseRefresh(
                payload(envelope, I007, RequestCourseRefreshCommand.class)));
        sink.register(I008, envelope -> learningIntegrationAdapter.startLesson(
                payload(envelope, I008, StartLessonCommand.class)));
    }

    private static <T> T payload(
            InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }
}
