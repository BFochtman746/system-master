package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Exact current-authority local Learning/Curriculum bindings for denominator rows I016-C through I023. */
public final class AdaptiveCurriculumDeckInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String LEARNING_BINDING = "C18 LEARNING";
    public static final String CUR_PORT = "CUR-CMD-PORT-001";
    public static final String LRN_PORT = "LRN-CMD-PORT-001";
    public static final String LRN_QUERY_PORT = "LRN-QRY-PORT-001";

    public static final RouteDescriptor I016_C = new RouteDescriptor(
            "I016-C", InterfaceType.COMMAND, "RequestRemediationPlan", OWNER_PATH,
            CURRICULUM_BINDING, CUR_PORT, "RemediationPlanService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I016-C", "QO-IF-I016-C",
            List.of("remediation_need_ref", "curriculum_version_ref", "criterion_refs", "instructional_constraints", "client_operation_id"),
            List.of("RemediationNeedStale", "CurriculumVersionMismatch", "CriterionUnknown", "ValidationError", "DependencyUnavailable"),
            true, "Curriculum expected-version/successor semantics");

    public static final RouteDescriptor I017 = new RouteDescriptor(
            "I017", InterfaceType.COMMAND, "OverrideNextAction", OWNER_PATH,
            LEARNING_BINDING, LRN_PORT, "AdaptiveDecisionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I017", "QO-IF-I017",
            List.of("recommendation_id", "selected_action", "rationale_optional", "operation_id"),
            List.of("OverrideNotPermitted", "VersionConflict"), true,
            "Expected recommendation/policy version");

    public static final RouteDescriptor I018 = new RouteDescriptor(
            "I018", InterfaceType.COMMAND, "RequestMaintenancePlan", OWNER_PATH,
            LEARNING_BINDING, LRN_PORT, "MaintenanceService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I018", "QO-IF-I018",
            List.of("goal_id", "retention_horizon", "operation_id"),
            List.of("InsufficientEvidence", "DependencyUnavailable"), true,
            "Policy-version aware");

    public static final RouteDescriptor I019 = new RouteDescriptor(
            "I019", InterfaceType.COMMAND, "ImportCompetencyFramework", OWNER_PATH,
            CURRICULUM_BINDING, CUR_PORT, "SkillCriterionRegistry",
            "MASTER_CORE_ROUTE_MANIFEST_001::I019", "QO-IF-I019",
            List.of("external_framework_ref", "mapping_policy", "operation_id"),
            List.of("DependencyUnavailable", "ValidationError"), true,
            "Import version pinned");

    public static final RouteDescriptor I020 = new RouteDescriptor(
            "I020", InterfaceType.COMMAND, "AttachExternalLearningResource", OWNER_PATH,
            CURRICULUM_BINDING, CUR_PORT, "CurriculumResearchOrchestrator",
            "MASTER_CORE_ROUTE_MANIFEST_001::I020", "QO-IF-I020",
            List.of("lesson_id", "resource_ref", "rights_ref", "accessibility_refs", "operation_id"),
            List.of("RightsMetadataMissing", "AccessibilityAlternativeMissing", "VersionConflict"), true,
            "Expected version");

    public static final RouteDescriptor I023 = new RouteDescriptor(
            "I023", InterfaceType.QUERY, "GetLearningDeck", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "LearningIntegrationAdapter",
            "MASTER_CORE_ROUTE_MANIFEST_001::I023", "QO-IF-I023",
            List.of("goal_id or active context"),
            List.of("ProjectionStale", "DependencyUnavailable"), false,
            "Snapshot/version tagged; read only");

    private AdaptiveCurriculumDeckInboundHandlers() {}

    public record RequestRemediationPlanCommand(Object remediationNeedRef, Object curriculumVersionRef,
            Object criterionRefs, Object instructionalConstraints, Object clientOperationId) {
        public RequestRemediationPlanCommand {
            remediationNeedRef = required(remediationNeedRef, "remediation_need_ref");
            curriculumVersionRef = required(curriculumVersionRef, "curriculum_version_ref");
            criterionRefs = required(criterionRefs, "criterion_refs");
            instructionalConstraints = required(instructionalConstraints, "instructional_constraints");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record OverrideNextActionCommand(Object recommendationId, Object selectedAction,
            Object rationaleOptional, Object operationId) {
        public OverrideNextActionCommand {
            recommendationId = required(recommendationId, "recommendation_id");
            selectedAction = required(selectedAction, "selected_action");
            operationId = required(operationId, "operation_id");
        }
    }

    public record RequestMaintenancePlanCommand(Object goalId, Object retentionHorizon, Object operationId) {
        public RequestMaintenancePlanCommand {
            goalId = required(goalId, "goal_id");
            retentionHorizon = required(retentionHorizon, "retention_horizon");
            operationId = required(operationId, "operation_id");
        }
    }

    public record ImportCompetencyFrameworkCommand(Object externalFrameworkRef, Object mappingPolicy, Object operationId) {
        public ImportCompetencyFrameworkCommand {
            externalFrameworkRef = required(externalFrameworkRef, "external_framework_ref");
            mappingPolicy = required(mappingPolicy, "mapping_policy");
            operationId = required(operationId, "operation_id");
        }
    }

    public record AttachExternalLearningResourceCommand(Object lessonId, Object resourceRef, Object rightsRef,
            Object accessibilityRefs, Object operationId) {
        public AttachExternalLearningResourceCommand {
            lessonId = required(lessonId, "lesson_id");
            resourceRef = required(resourceRef, "resource_ref");
            rightsRef = required(rightsRef, "rights_ref");
            accessibilityRefs = required(accessibilityRefs, "accessibility_refs");
            operationId = required(operationId, "operation_id");
        }
    }

    /** goalOrActiveContext deliberately stays semantic/transport-neutral because 001C permits either form. */
    public record GetLearningDeckQuery(Object goalOrActiveContext) {
        public GetLearningDeckQuery {
            goalOrActiveContext = required(goalOrActiveContext, "goal_id or active context");
        }
    }

    public interface RemediationPlanServicePort {
        Object requestRemediationPlan(RequestRemediationPlanCommand command) throws Exception;
    }
    public interface AdaptiveDecisionServicePort {
        Object overrideNextAction(OverrideNextActionCommand command) throws Exception;
    }
    public interface MaintenanceServicePort {
        Object requestMaintenancePlan(RequestMaintenancePlanCommand command) throws Exception;
    }
    public interface SkillCriterionRegistryPort {
        Object importCompetencyFramework(ImportCompetencyFrameworkCommand command) throws Exception;
    }
    public interface CurriculumResearchOrchestratorPort {
        Object attachExternalLearningResource(AttachExternalLearningResourceCommand command) throws Exception;
    }
    public interface LearningDeckQueryPort {
        Object getLearningDeck(GetLearningDeckQuery query) throws Exception;
    }

    /**
     * Registers only the six LEARNING/CURRICULUM-owned rows in denominator positions I016-C..I023.
     * I021 CancelLearningJob and I022 ResumeLearningJob are intentionally absent: CORE owns the
     * canonical durable-job handlers and Learning may only consume them through a dependency adapter.
     */
    public static void registerAll(
            RegistrationSink sink,
            RemediationPlanServicePort remediationPlanService,
            AdaptiveDecisionServicePort adaptiveDecisionService,
            MaintenanceServicePort maintenanceService,
            SkillCriterionRegistryPort skillCriterionRegistry,
            CurriculumResearchOrchestratorPort curriculumResearchOrchestrator,
            LearningDeckQueryPort learningDeckQuery) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(remediationPlanService, "remediationPlanService");
        Objects.requireNonNull(adaptiveDecisionService, "adaptiveDecisionService");
        Objects.requireNonNull(maintenanceService, "maintenanceService");
        Objects.requireNonNull(skillCriterionRegistry, "skillCriterionRegistry");
        Objects.requireNonNull(curriculumResearchOrchestrator, "curriculumResearchOrchestrator");
        Objects.requireNonNull(learningDeckQuery, "learningDeckQuery");

        sink.register(I016_C, envelope -> remediationPlanService.requestRemediationPlan(
                payload(envelope, I016_C, RequestRemediationPlanCommand.class)));
        sink.register(I017, envelope -> adaptiveDecisionService.overrideNextAction(
                payload(envelope, I017, OverrideNextActionCommand.class)));
        sink.register(I018, envelope -> maintenanceService.requestMaintenancePlan(
                payload(envelope, I018, RequestMaintenancePlanCommand.class)));
        sink.register(I019, envelope -> skillCriterionRegistry.importCompetencyFramework(
                payload(envelope, I019, ImportCompetencyFrameworkCommand.class)));
        sink.register(I020, envelope -> curriculumResearchOrchestrator.attachExternalLearningResource(
                payload(envelope, I020, AttachExternalLearningResourceCommand.class)));
        sink.register(I023, envelope -> learningDeckQuery.getLearningDeck(
                payload(envelope, I023, GetLearningDeckQuery.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String semanticName) {
        return InboundBindingContracts.requiredField(value, semanticName);
    }
}
