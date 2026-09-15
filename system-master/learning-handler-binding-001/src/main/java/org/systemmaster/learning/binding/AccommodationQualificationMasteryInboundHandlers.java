package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/**
 * Exact frozen 001C local Learning bindings for I076, I077 and I088.
 *
 * <p>I075 ReconcileOfflineJournal remains CORE-owned shared sync reconciliation and is
 * intentionally not registered, implemented, simulated or claimed here.
 */
public final class AccommodationQualificationMasteryInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String LEARNING_BINDING = "C18 LEARNING";
    public static final String LRN_COMMAND_PORT = "LRN-CMD-PORT-001";
    public static final String LRN_QUERY_PORT = "LRN-QRY-PORT-001";

    public static final RouteDescriptor I076 = new RouteDescriptor(
            "I076", InterfaceType.COMMAND, "AttachAccommodationReference", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "LearningIntegrationAdapter",
            "MASTER_CORE_ROUTE_MANIFEST_001::I076", "QO-IF-I076",
            List.of("learning_goal_or_attempt_ref", "external_profile_ref", "scope", "client_operation_id"),
            List.of("DependencyUnavailable"), true,
            "Expected-version where stateful; Learning binds an external accommodation reference for policy use without owning the global accessibility/disability profile");

    public static final RouteDescriptor I077 = new RouteDescriptor(
            "I077", InterfaceType.COMMAND, "RequestQualificationEvidencePackaging", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "QualificationEvidenceService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I077", "QO-IF-I077",
            List.of("skill_refs", "intended_recipient", "purpose", "policy_version", "job_request_id"),
            List.of("QualificationExportNotAuthorized", "InsufficientEvidence"), true,
            "Evidence versions pinned; explicit scoped disclosure authorization required; requests evidence packaging conditions/limits and never returns an eligibility or qualification decision");

    public static final RouteDescriptor I088 = new RouteDescriptor(
            "I088", InterfaceType.QUERY, "GetMasteryEvidenceMatrix", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "MasteryProjectionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I088", "QO-IF-I088",
            List.of("skill_ref", "projection_version optional"),
            List.of("NotFound"), false,
            "Read-only consistent Learning snapshot; zero writes/outbox; returns criteria, gates, evidence, admissibility, freshness and coverage without qualification side effects");

    private AccommodationQualificationMasteryInboundHandlers() {}

    public record AttachAccommodationReferenceCommand(
            Object learningGoalOrAttemptRef,
            Object externalProfileRef,
            Object scope,
            Object clientOperationId) {
        public AttachAccommodationReferenceCommand {
            learningGoalOrAttemptRef = required(learningGoalOrAttemptRef, "learning_goal_or_attempt_ref");
            externalProfileRef = required(externalProfileRef, "external_profile_ref");
            scope = required(scope, "scope");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public record RequestQualificationEvidencePackagingCommand(
            Object skillRefs,
            Object intendedRecipient,
            Object purpose,
            Object policyVersion,
            Object jobRequestId) {
        public RequestQualificationEvidencePackagingCommand {
            skillRefs = required(skillRefs, "skill_refs");
            intendedRecipient = required(intendedRecipient, "intended_recipient");
            purpose = required(purpose, "purpose");
            policyVersion = required(policyVersion, "policy_version");
            jobRequestId = required(jobRequestId, "job_request_id");
        }
    }

    public record GetMasteryEvidenceMatrixQuery(Object skillRef, Object projectionVersionOptional) {
        public GetMasteryEvidenceMatrixQuery {
            skillRef = required(skillRef, "skill_ref");
        }
    }

    public interface LearningIntegrationPort {
        Object attachAccommodationReference(AttachAccommodationReferenceCommand command) throws Exception;
    }

    public interface QualificationEvidencePort {
        Object requestQualificationEvidencePackaging(RequestQualificationEvidencePackagingCommand command) throws Exception;
    }

    public interface MasteryProjectionPort {
        Object getMasteryEvidenceMatrix(GetMasteryEvidenceMatrixQuery query) throws Exception;
    }

    public static void registerAll(
            RegistrationSink sink,
            LearningIntegrationPort learningIntegration,
            QualificationEvidencePort qualificationEvidence,
            MasteryProjectionPort masteryProjection) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(learningIntegration, "learningIntegration");
        Objects.requireNonNull(qualificationEvidence, "qualificationEvidence");
        Objects.requireNonNull(masteryProjection, "masteryProjection");

        sink.register(I076, envelope -> learningIntegration.attachAccommodationReference(
                payload(envelope, I076, AttachAccommodationReferenceCommand.class)));
        sink.register(I077, envelope -> qualificationEvidence.requestQualificationEvidencePackaging(
                payload(envelope, I077, RequestQualificationEvidencePackagingCommand.class)));
        sink.register(I088, envelope -> masteryProjection.getMasteryEvidenceMatrix(
                payload(envelope, I088, GetMasteryEvidenceMatrixQuery.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }

    private static <T> T required(T value, String semanticName) {
        return InboundBindingContracts.requiredField(value, semanticName);
    }
}
