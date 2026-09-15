package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/**
 * Exact current-authority LEARNING inbound bindings for I009-I016-L.
 *
 * <p>This tranche owns Learning practice, self-assessment, assessment-attempt and
 * remediation-need semantics only. CORE continues to own global ingress/routing
 * and generic persistence/transaction mechanics. Shared evidence, Curriculum,
 * accessibility and other peer authorities are consumed only through their
 * declared boundaries.
 */
public final class PracticeAssessmentInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String CAPABILITY_BINDING = "C18 LEARNING";
    public static final String PORT = "LRN-CMD-PORT-001";

    public static final RouteDescriptor I009 = new RouteDescriptor(
            "I009",
            InterfaceType.COMMAND,
            "RecordPracticeResponse",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "PracticeAttemptService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I009",
            "QO-IF-I009",
            List.of("attempt_id", "item_version", "response", "assistance", "timestamp", "operation_id"),
            List.of("DuplicateOperationConflict", "VersionConflict", "ValidationError"),
            true,
            "Replay-safe; expected attempt version");

    public static final RouteDescriptor I010 = new RouteDescriptor(
            "I010",
            InterfaceType.COMMAND,
            "RequestHint",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "PracticeAttemptService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I010",
            "QO-IF-I010",
            List.of("attempt_id", "item_id", "hint_level", "operation_id"),
            List.of("OverrideNotPermitted", "DependencyUnavailable"),
            true,
            "Expected attempt version if persisted");

    public static final RouteDescriptor I011 = new RouteDescriptor(
            "I011",
            InterfaceType.COMMAND,
            "SubmitSelfConfidence",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "LearnerSelfAssessmentService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I011",
            "QO-IF-I011",
            List.of("context_ref", "confidence_scale_value", "operation_id"),
            List.of("ValidationError"),
            true,
            "Append-only semantic observation");

    public static final RouteDescriptor I012 = new RouteDescriptor(
            "I012",
            InterfaceType.COMMAND,
            "StartAssessmentAttempt",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "AssessmentAttemptService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I012",
            "QO-IF-I012",
            List.of("assessment_id", "blueprint_version", "mode", "accommodations", "operation_id"),
            List.of(
                    "OfflineNotAllowedForAssessmentMode",
                    "AccessibilityAlternativeMissing",
                    "DependencyUnavailable"),
            true,
            "Atomic creation; one op -> one attempt");

    public static final RouteDescriptor I013 = new RouteDescriptor(
            "I013",
            InterfaceType.COMMAND,
            "SaveAssessmentResponse",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "LearningIntegrationAdapter",
            "MASTER_CORE_ROUTE_MANIFEST_001::I013",
            "QO-IF-I013",
            List.of("attempt_id", "expected_version", "item_id", "response", "operation_id"),
            List.of("VersionConflict", "DuplicateOperationConflict", "InvalidState"),
            true,
            "Expected-version; deterministic conflict");

    public static final RouteDescriptor I014 = new RouteDescriptor(
            "I014",
            InterfaceType.COMMAND,
            "SubmitAssessmentAttempt",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "AssessmentAttemptService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I014",
            "QO-IF-I014",
            List.of("attempt_id", "expected_version", "operation_id"),
            List.of(
                    "DuplicateOperationConflict",
                    "VersionConflict",
                    "AssessmentIntegrityUnknown",
                    "InvalidState"),
            true,
            "Atomic compare-and-set");

    public static final RouteDescriptor I015 = new RouteDescriptor(
            "I015",
            InterfaceType.COMMAND,
            "InvalidateAssessmentAttempt",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "AssessmentAttemptService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I015",
            "QO-IF-I015",
            List.of("attempt_id", "reason_code", "evidence_refs", "operation_id"),
            List.of("OverrideNotPermitted", "VersionConflict"),
            true,
            "Expected-version / policy serialization");

    /**
     * I016-L is the frozen Learning half of the historical compound I016 contract.
     * Curriculum instructional planning is separate I016-C and is not owned here.
     */
    public static final RouteDescriptor I016_L = new RouteDescriptor(
            "I016-L",
            InterfaceType.COMMAND,
            "CreateRemediationNeed",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            "RemediationNeedService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I016-L",
            "QO-IF-I016-L",
            List.of(
                    "goal_id",
                    "learner_ref",
                    "skill_or_criterion_refs",
                    "evidence_refs",
                    "diagnosis_reason_codes",
                    "client_operation_id"),
            List.of(
                    "InsufficientEvidence",
                    "VersionConflict",
                    "DuplicateOperationConflict",
                    "DependencyUnavailable"),
            true,
            "Expected version on mutable learner remediation state");

    private PracticeAssessmentInboundHandlers() {}

    public record RecordPracticeResponseCommand(
            Object attemptId,
            Object itemVersion,
            Object response,
            Object assistance,
            Object timestamp,
            Object operationId) {
        public RecordPracticeResponseCommand {
            attemptId = required(attemptId, "attempt_id");
            itemVersion = required(itemVersion, "item_version");
            response = required(response, "response");
            assistance = required(assistance, "assistance");
            timestamp = required(timestamp, "timestamp");
            operationId = required(operationId, "operation_id");
        }
    }

    public record RequestHintCommand(
            Object attemptId,
            Object itemId,
            Object hintLevel,
            Object operationId) {
        public RequestHintCommand {
            attemptId = required(attemptId, "attempt_id");
            itemId = required(itemId, "item_id");
            hintLevel = required(hintLevel, "hint_level");
            operationId = required(operationId, "operation_id");
        }
    }

    public record SubmitSelfConfidenceCommand(
            Object contextRef,
            Object confidenceScaleValue,
            Object operationId) {
        public SubmitSelfConfidenceCommand {
            contextRef = required(contextRef, "context_ref");
            confidenceScaleValue = required(confidenceScaleValue, "confidence_scale_value");
            operationId = required(operationId, "operation_id");
        }
    }

    public record StartAssessmentAttemptCommand(
            Object assessmentId,
            Object blueprintVersion,
            Object mode,
            Object accommodations,
            Object operationId) {
        public StartAssessmentAttemptCommand {
            assessmentId = required(assessmentId, "assessment_id");
            blueprintVersion = required(blueprintVersion, "blueprint_version");
            mode = required(mode, "mode");
            accommodations = required(accommodations, "accommodations");
            operationId = required(operationId, "operation_id");
        }
    }

    public record SaveAssessmentResponseCommand(
            Object attemptId,
            Object expectedVersion,
            Object itemId,
            Object response,
            Object operationId) {
        public SaveAssessmentResponseCommand {
            attemptId = required(attemptId, "attempt_id");
            expectedVersion = required(expectedVersion, "expected_version");
            itemId = required(itemId, "item_id");
            response = required(response, "response");
            operationId = required(operationId, "operation_id");
        }
    }

    public record SubmitAssessmentAttemptCommand(
            Object attemptId,
            Object expectedVersion,
            Object operationId) {
        public SubmitAssessmentAttemptCommand {
            attemptId = required(attemptId, "attempt_id");
            expectedVersion = required(expectedVersion, "expected_version");
            operationId = required(operationId, "operation_id");
        }
    }

    public record InvalidateAssessmentAttemptCommand(
            Object attemptId,
            Object reasonCode,
            Object evidenceRefs,
            Object operationId) {
        public InvalidateAssessmentAttemptCommand {
            attemptId = required(attemptId, "attempt_id");
            reasonCode = required(reasonCode, "reason_code");
            evidenceRefs = required(evidenceRefs, "evidence_refs");
            operationId = required(operationId, "operation_id");
        }
    }

    public record CreateRemediationNeedCommand(
            Object goalId,
            Object learnerRef,
            Object skillOrCriterionRefs,
            Object evidenceRefs,
            Object diagnosisReasonCodes,
            Object clientOperationId) {
        public CreateRemediationNeedCommand {
            goalId = required(goalId, "goal_id");
            learnerRef = required(learnerRef, "learner_ref");
            skillOrCriterionRefs = required(skillOrCriterionRefs, "skill_or_criterion_refs");
            evidenceRefs = required(evidenceRefs, "evidence_refs");
            diagnosisReasonCodes = required(diagnosisReasonCodes, "diagnosis_reason_codes");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public interface PracticeAttemptServicePort {
        Object recordPracticeResponse(RecordPracticeResponseCommand command) throws Exception;
        Object requestHint(RequestHintCommand command) throws Exception;
    }

    public interface LearnerSelfAssessmentServicePort {
        Object submitSelfConfidence(SubmitSelfConfidenceCommand command) throws Exception;
    }

    public interface AssessmentAttemptServicePort {
        Object startAssessmentAttempt(StartAssessmentAttemptCommand command) throws Exception;
        Object submitAssessmentAttempt(SubmitAssessmentAttemptCommand command) throws Exception;
        Object invalidateAssessmentAttempt(InvalidateAssessmentAttemptCommand command) throws Exception;
    }

    public interface LearningIntegrationAdapterPort {
        Object saveAssessmentResponse(SaveAssessmentResponseCommand command) throws Exception;
    }

    public interface RemediationNeedServicePort {
        Object createRemediationNeed(CreateRemediationNeedCommand command) throws Exception;
    }

    public static void registerAll(
            RegistrationSink sink,
            PracticeAttemptServicePort practiceAttemptService,
            LearnerSelfAssessmentServicePort learnerSelfAssessmentService,
            AssessmentAttemptServicePort assessmentAttemptService,
            LearningIntegrationAdapterPort learningIntegrationAdapter,
            RemediationNeedServicePort remediationNeedService) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(practiceAttemptService, "practiceAttemptService");
        Objects.requireNonNull(learnerSelfAssessmentService, "learnerSelfAssessmentService");
        Objects.requireNonNull(assessmentAttemptService, "assessmentAttemptService");
        Objects.requireNonNull(learningIntegrationAdapter, "learningIntegrationAdapter");
        Objects.requireNonNull(remediationNeedService, "remediationNeedService");

        sink.register(I009, envelope -> practiceAttemptService.recordPracticeResponse(
                payload(envelope, I009, RecordPracticeResponseCommand.class)));
        sink.register(I010, envelope -> practiceAttemptService.requestHint(
                payload(envelope, I010, RequestHintCommand.class)));
        sink.register(I011, envelope -> learnerSelfAssessmentService.submitSelfConfidence(
                payload(envelope, I011, SubmitSelfConfidenceCommand.class)));
        sink.register(I012, envelope -> assessmentAttemptService.startAssessmentAttempt(
                payload(envelope, I012, StartAssessmentAttemptCommand.class)));
        sink.register(I013, envelope -> learningIntegrationAdapter.saveAssessmentResponse(
                payload(envelope, I013, SaveAssessmentResponseCommand.class)));
        sink.register(I014, envelope -> assessmentAttemptService.submitAssessmentAttempt(
                payload(envelope, I014, SubmitAssessmentAttemptCommand.class)));
        sink.register(I015, envelope -> assessmentAttemptService.invalidateAssessmentAttempt(
                payload(envelope, I015, InvalidateAssessmentAttemptCommand.class)));
        sink.register(I016_L, envelope -> remediationNeedService.createRemediationNeed(
                payload(envelope, I016_L, CreateRemediationNeedCommand.class)));
    }

    private static <T> T payload(
            InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String semanticName) {
        return InboundBindingContracts.requiredField(value, semanticName);
    }
}
