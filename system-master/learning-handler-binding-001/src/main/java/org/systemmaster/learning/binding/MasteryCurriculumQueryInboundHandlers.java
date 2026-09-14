package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/**
 * Exact current-authority local Learning/Curriculum read-only bindings for I024-I030.
 *
 * <p>I031 GetLearningJobProjection is intentionally not registered here. The frozen
 * authority keeps generic durable-job projection canonical in CORE/shared job authority;
 * Learning consumes that snapshot through the declared dependency adapter boundary.
 */
public final class MasteryCurriculumQueryInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String LEARNING_BINDING = "C18 LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String LRN_QUERY_PORT = "LRN-QRY-PORT-001";
    public static final String CUR_QUERY_PORT = "CUR-QRY-PORT-001";

    public static final RouteDescriptor I024 = new RouteDescriptor(
            "I024", InterfaceType.QUERY, "GetSkillMastery", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "MasteryProjectionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I024", "QO-IF-I024",
            List.of("skill_ids", "as_of_optional"),
            List.of("InsufficientEvidence", "ProjectionStale"), false,
            "Read-only consistent Learning snapshot; zero writes/outbox; does not return a qualification decision");

    public static final RouteDescriptor I025 = new RouteDescriptor(
            "I025", InterfaceType.QUERY, "ExplainMastery", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "MasteryProjectionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I025", "QO-IF-I025",
            List.of("projection_id"),
            List.of("InsufficientEvidence", "DependencyUnavailable"), false,
            "Read-only consistent Learning snapshot; zero writes/outbox");

    public static final RouteDescriptor I026 = new RouteDescriptor(
            "I026", InterfaceType.QUERY, "GetNextAction", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "AdaptiveDecisionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I026", "QO-IF-I026",
            List.of("goal_id", "session_constraints"),
            List.of("NoEligibleAction", "ProjectionStale"), false,
            "Read-only consistent Learning snapshot; zero writes/outbox");

    public static final RouteDescriptor I027 = new RouteDescriptor(
            "I027", InterfaceType.QUERY, "GetCurriculum", OWNER_PATH,
            CURRICULUM_BINDING, CUR_QUERY_PORT, "CurriculumCompiler",
            "MASTER_CORE_ROUTE_MANIFEST_001::I027", "QO-IF-I027",
            List.of("curriculum_id", "version optional"),
            List.of("DependencyUnavailable"), false,
            "Read-only consistent Curriculum snapshot; version-pinned when supplied; zero writes/outbox");

    public static final RouteDescriptor I028 = new RouteDescriptor(
            "I028", InterfaceType.QUERY, "GetAssessmentAttempt", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "AssessmentAttemptService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I028", "QO-IF-I028",
            List.of("attempt_id"),
            List.of("InvalidState", "DependencyUnavailable"), false,
            "Read-only consistent Learning snapshot; zero writes/outbox");

    public static final RouteDescriptor I029 = new RouteDescriptor(
            "I029", InterfaceType.QUERY, "GetCourseFreshness", OWNER_PATH,
            CURRICULUM_BINDING, CUR_QUERY_PORT, "CourseRefreshService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I029", "QO-IF-I029",
            List.of("curriculum_id", "version"),
            List.of("SourceFreshnessInsufficient", "DependencyUnavailable"), false,
            "Read-only consistent Curriculum snapshot; freshness is never silently assumed; zero writes/outbox");

    public static final RouteDescriptor I030 = new RouteDescriptor(
            "I030", InterfaceType.QUERY, "GetMaintenanceQueue", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "MaintenanceService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I030", "QO-IF-I030",
            List.of("goal_id", "horizon"),
            List.of("InsufficientEvidence"), false,
            "Read-only consistent Learning snapshot; zero writes/outbox");

    private MasteryCurriculumQueryInboundHandlers() {}

    public record GetSkillMasteryQuery(Object skillIds, Object asOfOptional) {
        public GetSkillMasteryQuery {
            skillIds = required(skillIds, "skill_ids");
        }
    }

    public record ExplainMasteryQuery(Object projectionId) {
        public ExplainMasteryQuery {
            projectionId = required(projectionId, "projection_id");
        }
    }

    public record GetNextActionQuery(Object goalId, Object sessionConstraints) {
        public GetNextActionQuery {
            goalId = required(goalId, "goal_id");
            sessionConstraints = required(sessionConstraints, "session_constraints");
        }
    }

    public record GetCurriculumQuery(Object curriculumId, Object versionOptional) {
        public GetCurriculumQuery {
            curriculumId = required(curriculumId, "curriculum_id");
        }
    }

    public record GetAssessmentAttemptQuery(Object attemptId) {
        public GetAssessmentAttemptQuery {
            attemptId = required(attemptId, "attempt_id");
        }
    }

    public record GetCourseFreshnessQuery(Object curriculumId, Object version) {
        public GetCourseFreshnessQuery {
            curriculumId = required(curriculumId, "curriculum_id");
            version = required(version, "version");
        }
    }

    public record GetMaintenanceQueueQuery(Object goalId, Object horizon) {
        public GetMaintenanceQueueQuery {
            goalId = required(goalId, "goal_id");
            horizon = required(horizon, "horizon");
        }
    }

    public interface MasteryProjectionServicePort {
        Object getSkillMastery(GetSkillMasteryQuery query) throws Exception;
        Object explainMastery(ExplainMasteryQuery query) throws Exception;
    }

    public interface AdaptiveDecisionQueryPort {
        Object getNextAction(GetNextActionQuery query) throws Exception;
    }

    public interface CurriculumCompilerQueryPort {
        Object getCurriculum(GetCurriculumQuery query) throws Exception;
    }

    public interface AssessmentAttemptQueryPort {
        Object getAssessmentAttempt(GetAssessmentAttemptQuery query) throws Exception;
    }

    public interface CourseRefreshQueryPort {
        Object getCourseFreshness(GetCourseFreshnessQuery query) throws Exception;
    }

    public interface MaintenanceQueryPort {
        Object getMaintenanceQueue(GetMaintenanceQueueQuery query) throws Exception;
    }

    public static void registerAll(
            RegistrationSink sink,
            MasteryProjectionServicePort masteryProjectionService,
            AdaptiveDecisionQueryPort adaptiveDecisionService,
            CurriculumCompilerQueryPort curriculumCompiler,
            AssessmentAttemptQueryPort assessmentAttemptService,
            CourseRefreshQueryPort courseRefreshService,
            MaintenanceQueryPort maintenanceService) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(masteryProjectionService, "masteryProjectionService");
        Objects.requireNonNull(adaptiveDecisionService, "adaptiveDecisionService");
        Objects.requireNonNull(curriculumCompiler, "curriculumCompiler");
        Objects.requireNonNull(assessmentAttemptService, "assessmentAttemptService");
        Objects.requireNonNull(courseRefreshService, "courseRefreshService");
        Objects.requireNonNull(maintenanceService, "maintenanceService");

        sink.register(I024, envelope -> masteryProjectionService.getSkillMastery(
                payload(envelope, I024, GetSkillMasteryQuery.class)));
        sink.register(I025, envelope -> masteryProjectionService.explainMastery(
                payload(envelope, I025, ExplainMasteryQuery.class)));
        sink.register(I026, envelope -> adaptiveDecisionService.getNextAction(
                payload(envelope, I026, GetNextActionQuery.class)));
        sink.register(I027, envelope -> curriculumCompiler.getCurriculum(
                payload(envelope, I027, GetCurriculumQuery.class)));
        sink.register(I028, envelope -> assessmentAttemptService.getAssessmentAttempt(
                payload(envelope, I028, GetAssessmentAttemptQuery.class)));
        sink.register(I029, envelope -> courseRefreshService.getCourseFreshness(
                payload(envelope, I029, GetCourseFreshnessQuery.class)));
        sink.register(I030, envelope -> maintenanceService.getMaintenanceQueue(
                payload(envelope, I030, GetMaintenanceQueueQuery.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String semanticName) {
        return InboundBindingContracts.requiredField(value, semanticName);
    }
}
