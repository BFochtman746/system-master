package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Exact frozen 001C local bindings for I063-I065. */
public final class AssessmentPoolItemLifecycleInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String LEARNING_BINDING = "C18 LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String LRN_COMMAND_PORT = "LRN-CMD-PORT-001";
    public static final String CUR_COMMAND_PORT = "CUR-CMD-PORT-001";

    public static final RouteDescriptor I063 = new RouteDescriptor(
            "I063", InterfaceType.COMMAND, "RequestAssessmentPoolGeneration", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "AssessmentBlueprintService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I063", "QO-IF-I063",
            List.of("blueprint_id", "target_pool_spec", "job_request_id"),
            List.of("DependencyUnavailable", "ContentRiskNeedsHumanReview"), true,
            "Blueprint immutable; request identity is stable; generic job execution remains CORE-owned");

    public static final RouteDescriptor I064 = new RouteDescriptor(
            "I064", InterfaceType.COMMAND, "RetireAssessmentItem", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "AssessmentItemLifecycleService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I064", "QO-IF-I064",
            List.of("item_id", "expected_version", "reason", "client_operation_id"),
            List.of("VersionConflict"), true,
            "Expected-version retirement; historic attempts retain their pinned item version");

    public static final RouteDescriptor I065 = new RouteDescriptor(
            "I065", InterfaceType.COMMAND, "RecordItemExposure", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "LearningIntegrationAdapter",
            "MASTER_CORE_ROUTE_MANIFEST_001::I065", "QO-IF-I065",
            List.of("item_family_ref", "item_ref", "exposure_type", "attempt_ref", "timestamp", "operation_id"),
            List.of("DuplicateOperationConflict"), true,
            "Append/reconcile exposure observation; activity alone is not mastery");

    private AssessmentPoolItemLifecycleInboundHandlers() {}

    public record RequestAssessmentPoolGenerationCommand(Object blueprintId, Object targetPoolSpec, Object jobRequestId) {
        public RequestAssessmentPoolGenerationCommand {
            blueprintId = required(blueprintId, "blueprint_id");
            targetPoolSpec = required(targetPoolSpec, "target_pool_spec");
            jobRequestId = required(jobRequestId, "job_request_id");
        }
    }

    public record RetireAssessmentItemCommand(Object itemId, Object expectedVersion, Object reason, Object clientOperationId) {
        public RetireAssessmentItemCommand {
            itemId = required(itemId, "item_id");
            expectedVersion = required(expectedVersion, "expected_version");
            reason = required(reason, "reason");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record RecordItemExposureCommand(Object itemFamilyRef, Object itemRef, Object exposureType,
            Object attemptRef, Object timestamp, Object operationId) {
        public RecordItemExposureCommand {
            itemFamilyRef = required(itemFamilyRef, "item_family_ref");
            itemRef = required(itemRef, "item_ref");
            exposureType = required(exposureType, "exposure_type");
            attemptRef = required(attemptRef, "attempt_ref");
            timestamp = required(timestamp, "timestamp");
            operationId = required(operationId, "operation_id");
        }
    }

    public interface AssessmentBlueprintPort {
        Object requestAssessmentPoolGeneration(RequestAssessmentPoolGenerationCommand command) throws Exception;
    }

    public interface AssessmentItemLifecyclePort {
        Object retireAssessmentItem(RetireAssessmentItemCommand command) throws Exception;
    }

    public interface LearningIntegrationPort {
        Object recordItemExposure(RecordItemExposureCommand command) throws Exception;
    }

    public static void registerAll(RegistrationSink sink, AssessmentBlueprintPort assessmentBlueprint,
            AssessmentItemLifecyclePort assessmentItemLifecycle, LearningIntegrationPort learningIntegration) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(assessmentBlueprint, "assessmentBlueprint");
        Objects.requireNonNull(assessmentItemLifecycle, "assessmentItemLifecycle");
        Objects.requireNonNull(learningIntegration, "learningIntegration");

        sink.register(I063, e -> assessmentBlueprint.requestAssessmentPoolGeneration(
                payload(e, I063, RequestAssessmentPoolGenerationCommand.class)));
        sink.register(I064, e -> assessmentItemLifecycle.retireAssessmentItem(
                payload(e, I064, RetireAssessmentItemCommand.class)));
        sink.register(I065, e -> learningIntegration.recordItemExposure(
                payload(e, I065, RecordItemExposureCommand.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String name) {
        return InboundBindingContracts.requiredField(value, name);
    }
}
